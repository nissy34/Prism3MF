import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Move, RotateCw } from 'lucide-react';
import {
  FilamentInfo,
  SimplifiedMeshResult,
  CutMeshResult,
} from '../core/types';
import type { LightweightMeshInfo } from '../workers/simplifier.worker';

export type ViewportDisplayMode = 'simplified' | 'original' | 'split';

export interface ThreeViewportProps {
  meshes: LightweightMeshInfo[];
  simplifiedMeshes: SimplifiedMeshResult[];
  filaments: FilamentInfo[];
  displayMode: ViewportDisplayMode;
  showWireframe: boolean;
  highlightColorBorders: boolean;
  // Cut Splitter Props
  mode?: 'simplify' | 'cut';
  cutPlaneZ?: number;
  cutPlaneNormal?: [number, number, number];
  onCutPlaneZChange?: (z: number) => void;
  onCutPlaneNormalChange?: (norm: [number, number, number]) => void;
  cutResult?: CutMeshResult | null;
  explodedOffset?: number;
}

/**
 * Converts a hex string (#RRGGBB) into normalized [r, g, b] in linear/sRGB space
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [0.7, 0.7, 0.7];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

/**
 * Builds a non-indexed BufferGeometry with flat face normals and crisp per-triangle
 * filament colors so adjacent triangles of different paint colors never blend across edges.
 */
function createPaintedBufferGeometry(
  vertices: Float32Array,
  triangles: Uint32Array,
  paintStates: Uint8Array,
  defaultExtruder: number,
  filaments: FilamentInfo[]
): THREE.BufferGeometry {
  const numTris = triangles.length / 3;
  const positions = new Float32Array(numTris * 9);
  const normals = new Float32Array(numTris * 9);
  const colors = new Float32Array(numTris * 9);

  // Precompute RGB table by 1-based filament index
  const maxSlot = Math.max(filaments.length + 2, 32);
  const paletteRgb = new Float32Array(maxSlot * 3);
  for (let i = 0; i < maxSlot; i++) {
    const fil = filaments[i];
    const [r, g, b] = fil ? hexToRgb(fil.color) : [0.75, 0.78, 0.82];
    paletteRgb[(i + 1) * 3] = r;
    paletteRgb[(i + 1) * 3 + 1] = g;
    paletteRgb[(i + 1) * 3 + 2] = b;
  }

  for (let t = 0; t < numTris; t++) {
    const i0 = triangles[t * 3] * 3;
    const i1 = triangles[t * 3 + 1] * 3;
    const i2 = triangles[t * 3 + 2] * 3;

    const x0 = vertices[i0], y0 = vertices[i0 + 1], z0 = vertices[i0 + 2];
    const x1 = vertices[i1], y1 = vertices[i1 + 1], z1 = vertices[i1 + 2];
    const x2 = vertices[i2], y2 = vertices[i2 + 1], z2 = vertices[i2 + 2];

    const base = t * 9;
    positions[base] = x0;
    positions[base + 1] = y0;
    positions[base + 2] = z0;
    positions[base + 3] = x1;
    positions[base + 4] = y1;
    positions[base + 5] = z1;
    positions[base + 6] = x2;
    positions[base + 7] = y2;
    positions[base + 8] = z2;

    // Compute flat face normal
    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
    const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    normals[base] = nx;
    normals[base + 1] = ny;
    normals[base + 2] = nz;
    normals[base + 3] = nx;
    normals[base + 4] = ny;
    normals[base + 5] = nz;
    normals[base + 6] = nx;
    normals[base + 7] = ny;
    normals[base + 8] = nz;

    const rawState = paintStates[t];
    const slot = rawState > 0 ? rawState : defaultExtruder;
    const clampedSlot = Math.min(Math.max(slot, 1), maxSlot - 1);
    const cr = paletteRgb[clampedSlot * 3];
    const cg = paletteRgb[clampedSlot * 3 + 1];
    const cb = paletteRgb[clampedSlot * 3 + 2];

    colors[base] = cr;
    colors[base + 1] = cg;
    colors[base + 2] = cb;
    colors[base + 3] = cr;
    colors[base + 4] = cg;
    colors[base + 5] = cb;
    colors[base + 6] = cr;
    colors[base + 7] = cg;
    colors[base + 8] = cb;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

/**
 * Extracts line segments along paint color boundaries so users can inspect
 * how sharply the color borders are preserved.
 */
function createColorBorderLinesGeometry(
  vertices: Float32Array,
  triangles: Uint32Array,
  paintStates: Uint8Array
): THREE.BufferGeometry {
  const numTris = triangles.length / 3;
  const edgeStateMap = new Map<string, { vA: number; vB: number; state: number; diff: boolean }>();

  for (let t = 0; t < numTris; t++) {
    const v0 = triangles[t * 3];
    const v1 = triangles[t * 3 + 1];
    const v2 = triangles[t * 3 + 2];
    const st = paintStates[t];

    const pairs: [number, number][] = [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ];

    for (const [a, b] of pairs) {
      const minV = a < b ? a : b;
      const maxV = a < b ? b : a;
      const key = `${minV}_${maxV}`;
      const existing = edgeStateMap.get(key);
      if (!existing) {
        edgeStateMap.set(key, { vA: minV, vB: maxV, state: st, diff: false });
      } else if (existing.state !== st) {
        existing.diff = true;
      }
    }
  }

  const lineCoords: number[] = [];
  for (const edge of edgeStateMap.values()) {
    if (edge.diff) {
      const iA = edge.vA * 3;
      const iB = edge.vB * 3;
      lineCoords.push(
        vertices[iA],
        vertices[iA + 1],
        vertices[iA + 2],
        vertices[iB],
        vertices[iB + 1],
        vertices[iB + 2]
      );
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(lineCoords), 3)
  );
  return geom;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  meshes,
  simplifiedMeshes,
  filaments,
  displayMode,
  showWireframe,
  highlightColorBorders,
  mode = 'simplify',
  cutPlaneZ,
  cutPlaneNormal = [0, 0, 1],
  onCutPlaneZChange,
  onCutPlaneNormalChange,
  cutResult,
  explodedOffset = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const cutPlaneHelperRef = useRef<THREE.Group | null>(null);
  const lastMeshKeyRef = useRef<string>('');
  const displayModeRef = useRef<ViewportDisplayMode>(displayMode);
  displayModeRef.current = displayMode;

  const origAnchorRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const simpAnchorRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const isSplitAnchoredRef = useRef<boolean>(false);
  const origLabelRef = useRef<HTMLDivElement>(null);
  const simpLabelRef = useRef<HTMLDivElement>(null);

  // Model bounds in raw coordinates to map between raw cutPlaneZ and scene coordinates
  const modelBounds = useMemo(() => {
    let minZ = 0;
    let maxZ = 50;
    if (meshes.length > 0) {
      const verts = meshes[0].expandedVertices;
      let minVal = Infinity;
      let maxVal = -Infinity;
      for (let i = 2; i < verts.length; i += 3) {
        if (verts[i] < minVal) minVal = verts[i];
        if (verts[i] > maxVal) maxVal = verts[i];
      }
      if (Number.isFinite(minVal)) minZ = minVal;
      if (Number.isFinite(maxVal)) maxZ = maxVal;
    }
    return { minZ, maxZ };
  }, [meshes]);

  const modelMinZRef = useRef<number>(0);
  modelMinZRef.current = modelBounds.minZ;
  const modelMaxZRef = useRef<number>(50);
  modelMaxZRef.current = modelBounds.maxZ;

  const onCutPlaneZChangeRef = useRef(onCutPlaneZChange);
  onCutPlaneZChangeRef.current = onCutPlaneZChange;
  const onCutPlaneNormalChangeRef = useRef(onCutPlaneNormalChange);
  onCutPlaneNormalChangeRef.current = onCutPlaneNormalChange;

  const isDraggingGizmoRef = useRef<boolean>(false);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const gizmoAnchorRef = useRef<THREE.Group | null>(null);
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate'>('translate');
  const [rotationSnap, setRotationSnap] = useState<number>(15);

  // Initialize Three.js Scene & OrcaSlicer-style Build Plate
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#09090b');
    sceneRef.current = scene;

    // 3D printing uses Z-up coordinate system (X right, Y back, Z up)
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.5,
      5000
    );
    camera.up.set(0, 0, 1);
    camera.position.set(0, -140, 95);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 25);
    controls.update();
    controlsRef.current = controls;

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.15);
    dirLight1.position.set(100, -140, 180);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 0.65);
    dirLight2.position.set(-120, 120, 90);
    scene.add(dirLight2);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.35);
    rimLight.position.set(0, 140, -60);
    scene.add(rimLight);

    // OrcaSlicer / Bambu Studio 256x256mm Build Plate Grid on Z=0
    const plateSize = 256;
    const gridHelper = new THREE.GridHelper(
      plateSize,
      16,
      new THREE.Color('#10b981'),
      new THREE.Color('#27272a')
    );
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(0, 0, -0.05);
    scene.add(gridHelper);

    const plateGeom = new THREE.PlaneGeometry(plateSize, plateSize);
    const plateMat = new THREE.MeshBasicMaterial({
      color: '#121215',
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const plateMesh = new THREE.Mesh(plateGeom, plateMat);
    plateMesh.position.set(0, 0, -0.1);
    scene.add(plateMesh);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Dedicated group for cut plane visualizer
    const cutPlaneHelper = new THREE.Group();
    scene.add(cutPlaneHelper);
    cutPlaneHelperRef.current = cutPlaneHelper;

    // Dedicated anchor and TransformControls for dragging the cut plane with arrows
    const gizmoAnchor = new THREE.Group();
    scene.add(gizmoAnchor);
    gizmoAnchorRef.current = gizmoAnchor;

    const tControls = new TransformControls(camera, renderer.domElement);
    tControls.size = 1.15;
    tControls.setSpace('world');
    tControls.setTranslationSnap(0.5); // 0.5mm height snap
    tControls.setRotationSnap(THREE.MathUtils.degToRad(15)); // 15° rotation snap
    tControls.showX = false;
    tControls.showY = false;
    tControls.showZ = true;
    const helper = tControls.getHelper ? tControls.getHelper() : (tControls as unknown as THREE.Object3D);
    helper.traverse((child) => {
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            m.depthTest = false;
            m.depthWrite = false;
            m.transparent = true;
          });
        } else {
          mat.depthTest = false;
          mat.depthWrite = false;
          mat.transparent = true;
        }
      }
      child.renderOrder = 9999;
    });
    scene.add(helper);
    transformControlsRef.current = tControls;

    tControls.addEventListener('dragging-changed', (event) => {
      isDraggingGizmoRef.current = Boolean(event.value);
      if (controlsRef.current) {
        controlsRef.current.enabled = !event.value;
      }
    });

    tControls.addEventListener('objectChange', () => {
      if (!gizmoAnchorRef.current) return;
      if (tControls.getMode() === 'translate') {
        const sceneZ = gizmoAnchorRef.current.position.z;
        const minZ = modelMinZRef.current;
        const maxZ = modelMaxZRef.current;
        const rawZ = Math.max(minZ, Math.min(maxZ, sceneZ + minZ));
        onCutPlaneZChangeRef.current?.(Number(rawZ.toFixed(2)));
      } else if (tControls.getMode() === 'rotate') {
        const q = gizmoAnchorRef.current.quaternion;
        const norm = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
        onCutPlaneNormalChangeRef.current?.([
          Number(norm.x.toFixed(4)),
          Number(norm.y.toFixed(4)),
          Number(norm.z.toFixed(4)),
        ]);
      }
    });

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      if (isSplitAnchoredRef.current && displayModeRef.current === 'split') {
        const updateBadge = (anchor: THREE.Vector3, el: HTMLDivElement | null) => {
          if (!el || !container) return;
          const v = anchor.clone();
          v.project(camera);

          if (v.z > 1) {
            el.style.display = 'none';
            return;
          }

          const w = container.clientWidth;
          const h = container.clientHeight;
          const px = (v.x * 0.5 + 0.5) * w;
          const py = (-v.y * 0.5 + 0.5) * h;

          el.style.display = 'flex';
          el.style.transform = `translate(-50%, -100%) translate(${Math.round(px)}px, ${Math.round(py)}px)`;
        };

        updateBadge(origAnchorRef.current, origLabelRef.current);
        updateBadge(simpAnchorRef.current, simpLabelRef.current);
      } else {
        if (origLabelRef.current) origLabelRef.current.style.display = 'none';
        if (simpLabelRef.current) simpLabelRef.current.style.display = 'none';
      }
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      tControls.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update gizmo mode when toggled (Height Arrow vs Tilt Rings)
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;
    if (gizmoMode === 'translate') {
      tc.setMode('translate');
      tc.setSpace('world');
      tc.showX = false;
      tc.showY = false;
      tc.showZ = true;
    } else {
      tc.setMode('rotate');
      tc.setSpace('local');
      tc.showX = true;
      tc.showY = true;
      tc.showZ = true;
    }
  }, [gizmoMode]);

  // Update rotation snapping (15° or 45° or free)
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;
    if (rotationSnap > 0) {
      tc.setRotationSnap(THREE.MathUtils.degToRad(rotationSnap));
    } else {
      tc.setRotationSnap(null);
    }
  }, [rotationSnap]);

  // Update Cutting Plane Visualizer Helper & 3D Drag Gizmo
  useEffect(() => {
    const planeGroup = cutPlaneHelperRef.current;
    if (!planeGroup) return;

    while (planeGroup.children.length > 0) {
      const child = planeGroup.children[0];
      planeGroup.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    }

    if (mode === 'cut' && cutPlaneZ !== undefined && !cutResult) {
      // Find model footprint to scale cut plane nicely
      let boundX = 80;
      let boundY = 80;
      if (meshes.length > 0) {
        const verts = meshes[0].expandedVertices;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < verts.length; i += 3) {
          if (verts[i] < minX) minX = verts[i];
          if (verts[i] > maxX) maxX = verts[i];
          if (verts[i + 1] < minY) minY = verts[i + 1];
          if (verts[i + 1] > maxY) maxY = verts[i + 1];
        }
        boundX = Math.max((maxX - minX) * 1.45, 60);
        boundY = Math.max((maxY - minY) * 1.45, 60);
      }

      // Convert raw cutPlaneZ to 3D scene coordinates (bottom of model rests on build plate Z=0)
      const sceneZ = cutPlaneZ - modelBounds.minZ;

      // Translucent glowing emerald slicing laser plane
      const planeGeom = new THREE.PlaneGeometry(boundX, boundY);
      const planeMat = new THREE.MeshBasicMaterial({
        color: '#10b981',
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const planeMesh = new THREE.Mesh(planeGeom, planeMat);

      // Orientation quaternion matching cutPlaneNormal
      const normalVec = new THREE.Vector3(...cutPlaneNormal).normalize();
      const defaultUp = new THREE.Vector3(0, 0, 1);
      const quat = new THREE.Quaternion().setFromUnitVectors(defaultUp, normalVec);

      planeMesh.position.set(0, 0, sceneZ);
      planeMesh.quaternion.copy(quat);
      planeGroup.add(planeMesh);

      // Glowing outer border
      const edges = new THREE.EdgesGeometry(planeGeom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: '#34d399',
        linewidth: 2,
        transparent: true,
        opacity: 0.85,
      });
      const edgeLines = new THREE.LineSegments(edges, edgeMat);
      edgeLines.position.set(0, 0, sceneZ);
      edgeLines.quaternion.copy(quat);
      planeGroup.add(edgeLines);

      // Central solid metallic sphere handle (Bambu Studio / OrcaSlicer style)
      const centerSphereGeom = new THREE.SphereGeometry(4.2, 28, 28);
      const centerSphereMat = new THREE.MeshStandardMaterial({
        color: '#10b981',
        emissive: '#047857',
        roughness: 0.25,
        metalness: 0.7,
        depthTest: false,
      });
      const centerSphere = new THREE.Mesh(centerSphereGeom, centerSphereMat);
      centerSphere.renderOrder = 9998;
      centerSphere.position.set(0, 0, sceneZ);
      planeGroup.add(centerSphere);

      // Horizontal red conical arrows on the plane (Bambu Studio tilt indicators)
      const coneGeom = new THREE.ConeGeometry(2.4, 5.5, 16);
      coneGeom.rotateZ(-Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: '#ef4444',
        depthTest: false,
      });
      const rightCone = new THREE.Mesh(coneGeom, coneMat);
      rightCone.position.set(7.5, 0, 0);
      rightCone.renderOrder = 9998;

      const leftCone = new THREE.Mesh(coneGeom, coneMat);
      leftCone.rotation.z = Math.PI;
      leftCone.position.set(-7.5, 0, 0);
      leftCone.renderOrder = 9998;

      const handleGroup = new THREE.Group();
      handleGroup.position.set(0, 0, sceneZ);
      handleGroup.quaternion.copy(quat);
      handleGroup.add(rightCone);
      handleGroup.add(leftCone);
      planeGroup.add(handleGroup);

      // Attach 3D Drag Gizmo
      if (gizmoAnchorRef.current) {
        if (!isDraggingGizmoRef.current) {
          gizmoAnchorRef.current.position.set(0, 0, sceneZ);
          gizmoAnchorRef.current.quaternion.copy(quat);
        }
        if (transformControlsRef.current && !transformControlsRef.current.dragging) {
          transformControlsRef.current.attach(gizmoAnchorRef.current);
        }
      }
    } else {
      if (transformControlsRef.current) {
        transformControlsRef.current.detach();
      }
    }
  }, [mode, cutPlaneZ, cutPlaneNormal, cutResult, meshes, modelBounds.minZ]);

  // Rebuild 3D meshes when model, simplification result, or cut result changes
  useEffect(() => {
    const group = modelGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls) return;

    // Dispose previous meshes
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    }

    if (meshes.length === 0) return;

    // Mode: Cut Result Display
    if (mode === 'cut' && cutResult) {
      isSplitAnchoredRef.current = false;
      const cutGroup = new THREE.Group();

      const createPartMesh = (
        partVerts: Float32Array,
        partTris: Uint32Array,
        partPaints: Uint8Array,
        zOffset: number,
        defaultExtruder = 1
      ) => {
        const geom = createPaintedBufferGeometry(
          partVerts,
          partTris,
          partPaints,
          defaultExtruder,
          filaments
        );
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.55,
          metalness: 0.08,
          polygonOffset: showWireframe,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const meshObj = new THREE.Mesh(geom, mat);
        meshObj.position.set(0, 0, zOffset);
        cutGroup.add(meshObj);

        if (showWireframe) {
          const wireMat = new THREE.MeshBasicMaterial({
            color: '#18181b',
            wireframe: true,
            transparent: true,
            opacity: 0.35,
          });
          const wireMesh = new THREE.Mesh(geom, wireMat);
          wireMesh.position.set(0, 0, zOffset);
          cutGroup.add(wireMesh);
        }
      };

      // Upper Part A (lifted upward by explodedOffset)
      createPartMesh(
        cutResult.partA.vertices,
        cutResult.partA.triangles,
        cutResult.partA.paintStates,
        explodedOffset
      );

      // Lower Part B (shifted downward by explodedOffset)
      createPartMesh(
        cutResult.partB.vertices,
        cutResult.partB.triangles,
        cutResult.partB.paintStates,
        -explodedOffset
      );

      // Dowel Pin if present
      if (cutResult.dowelPin) {
        createPartMesh(
          cutResult.dowelPin.vertices,
          cutResult.dowelPin.triangles,
          cutResult.dowelPin.paintStates,
          0,
          2 // Contrast filament for dowel pin
        );
      }

      // Center cutGroup on build plate
      const box = new THREE.Box3().setFromObject(cutGroup);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        cutGroup.position.set(-center.x, -center.y, -box.min.z);
      }
      group.add(cutGroup);
      return;
    }

    // Mode: Simplify / Standard Display
    const buildSubGroup = (useSimplified: boolean, xOffset: number): THREE.Group => {
      const subGroup = new THREE.Group();

      for (const m of meshes) {
        const sm = simplifiedMeshes.find(
          (s) => s.modelPath === m.modelPath && s.objectId === m.objectId
        );

        const verts = useSimplified && sm ? sm.vertices : m.expandedVertices;
        const tris = useSimplified && sm ? sm.triangles : m.expandedTriangles;
        const states = useSimplified && sm ? sm.paintStates : m.expandedPaintStates;

        const geom = createPaintedBufferGeometry(
          verts,
          tris,
          states,
          m.defaultExtruder,
          filaments
        );

        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.55,
          metalness: 0.08,
          polygonOffset: showWireframe || highlightColorBorders,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });

        const meshObj = new THREE.Mesh(geom, mat);
        subGroup.add(meshObj);

        if (showWireframe) {
          const wireMat = new THREE.MeshBasicMaterial({
            color: '#18181b',
            wireframe: true,
            transparent: true,
            opacity: 0.38,
          });
          const wireMesh = new THREE.Mesh(geom, wireMat);
          subGroup.add(wireMesh);
        }

        if (highlightColorBorders) {
          const borderGeom = createColorBorderLinesGeometry(verts, tris, states);
          const borderMat = new THREE.LineBasicMaterial({
            color: '#38bdf8',
            linewidth: 2,
          });
          const borderLines = new THREE.LineSegments(borderGeom, borderMat);
          subGroup.add(borderLines);
        }
      }

      // Center XY on build plate and place bottom at Z=0
      const box = new THREE.Box3().setFromObject(subGroup);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        subGroup.position.set(-center.x + xOffset, -center.y, -box.min.z);
      }

      return subGroup;
    };

    const tempBox = new THREE.Box3();
    for (const m of meshes) {
      const verts = m.expandedVertices;
      for (let i = 0; i < verts.length; i += 3) {
        tempBox.expandByPoint(new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2]));
      }
    }
    const size = new THREE.Vector3();
    tempBox.getSize(size);
    const splitOffset = Math.max(size.x * 0.72, 32);

    if (displayMode === 'split') {
      const origGroup = buildSubGroup(false, -splitOffset);
      const simpGroup = buildSubGroup(true, splitOffset);
      group.add(origGroup);
      group.add(simpGroup);

      const origB = new THREE.Box3().setFromObject(origGroup);
      const simpB = new THREE.Box3().setFromObject(simpGroup);
      const maxZ = Math.max(origB.max.z, simpB.max.z, 20);

      origAnchorRef.current.set(-splitOffset, 0, maxZ + 8);
      simpAnchorRef.current.set(splitOffset, 0, maxZ + 8);
      isSplitAnchoredRef.current = true;

      const ringRadius = Math.max(size.x * 0.45, 18);
      const ringGeom = new THREE.RingGeometry(ringRadius * 0.9, ringRadius, 48);

      const origRingMat = new THREE.MeshBasicMaterial({
        color: '#71717a',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      });
      const origRing = new THREE.Mesh(ringGeom, origRingMat);
      origRing.position.set(-splitOffset, 0, 0.05);
      group.add(origRing);

      const simpRingMat = new THREE.MeshBasicMaterial({
        color: '#10b981',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const simpRing = new THREE.Mesh(ringGeom, simpRingMat);
      simpRing.position.set(splitOffset, 0, 0.05);
      group.add(simpRing);
    } else {
      isSplitAnchoredRef.current = false;
      if (displayMode === 'original') {
        group.add(buildSubGroup(false, 0));
      } else {
        group.add(buildSubGroup(true, 0));
      }
    }

    // Auto-frame camera on new model
    const meshKey = `${meshes.map((m) => m.name).join('|')}_${meshes[0]?.rawTriangleCount}`;
    if (meshKey !== lastMeshKeyRef.current) {
      lastMeshKeyRef.current = meshKey;
      const fullBox = new THREE.Box3().setFromObject(group);
      if (!fullBox.isEmpty()) {
        const bSize = new THREE.Vector3();
        const bCenter = new THREE.Vector3();
        fullBox.getSize(bSize);
        fullBox.getCenter(bCenter);

        const maxDim = Math.max(bSize.x, bSize.y, bSize.z, 20);
        controls.target.copy(bCenter);
        camera.position.set(
          bCenter.x - maxDim * 1.15,
          bCenter.y - maxDim * 1.35,
          bCenter.z + maxDim * 0.9
        );
        controls.update();
      }
    }
  }, [
    meshes,
    simplifiedMeshes,
    filaments,
    displayMode,
    showWireframe,
    highlightColorBorders,
    mode,
    cutResult,
    explodedOffset,
  ]);

  const totalOrigTris = meshes.reduce((acc, m) => acc + m.expandedTriangles.length / 3, 0);
  const totalSimpTris = simplifiedMeshes.reduce((acc, m) => acc + m.simplifiedTriangles, 0);
  const reductionPct =
    totalOrigTris > 0 && totalSimpTris > 0
      ? Math.max(0, Math.round((1 - totalSimpTris / totalOrigTris) * 100))
      : 0;

  return (
    <div ref={containerRef} className="relative w-full h-full select-none touch-none overflow-hidden">
      {/* 3D-Anchored Badges for Split View */}
      <div
        ref={origLabelRef}
        style={{ display: 'none', position: 'absolute', top: 0, left: 0 }}
        className="pointer-events-none z-20 px-2.5 py-1 rounded-full bg-zinc-950/90 border border-zinc-700/80 shadow-2xl text-[11px] font-medium text-zinc-200 flex items-center gap-1.5 whitespace-nowrap backdrop-blur-md"
      >
        <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
        <span>Original</span>
        <span className="font-mono text-zinc-400">({totalOrigTris.toLocaleString()} tris)</span>
      </div>

      <div
        ref={simpLabelRef}
        style={{ display: 'none', position: 'absolute', top: 0, left: 0 }}
        className="pointer-events-none z-20 px-2.5 py-1 rounded-full bg-zinc-950/90 border border-emerald-500/60 shadow-2xl shadow-emerald-500/20 text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5 whitespace-nowrap backdrop-blur-md"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        <span>Simplified</span>
        <span className="font-mono text-emerald-400 font-bold">
          ({totalSimpTris.toLocaleString()} tris • -{reductionPct}%)
        </span>
      </div>

      {/* 3D Slicer Cut & Snap Control Toolbar */}
      {mode === 'cut' && !cutResult && meshes.length > 0 && (
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col items-end gap-1.5 pointer-events-auto">
          {/* Main Gizmo & Snap Bar */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-900/95 border border-zinc-800 backdrop-blur-md shadow-2xl text-xs">
            {/* Mode: Translate vs Rotate */}
            <div className="flex items-center p-0.5 bg-zinc-950 rounded-lg border border-zinc-800/80">
              <button
                type="button"
                onClick={() => setGizmoMode('translate')}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  gizmoMode === 'translate'
                    ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Drag cut height along vertical Z arrow"
              >
                <Move className="w-3.5 h-3.5" />
                <span>Height Arrow</span>
              </button>
              <button
                type="button"
                onClick={() => setGizmoMode('rotate')}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  gizmoMode === 'rotate'
                    ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Rotate & tilt plane with 3D rotation rings and angle snap points"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Tilt Rings</span>
              </button>
            </div>

            {/* Snap Points Selector */}
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-950 rounded-lg border border-zinc-800/80 text-[11px]">
              <span className="text-[10px] text-zinc-400 px-0.5 font-medium">Snap:</span>
              <button
                type="button"
                onClick={() => setRotationSnap(15)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                  rotationSnap === 15
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Snap in 15° increments (0°, 15°, 30°, 45°, 60°, 75°, 90°)"
              >
                15°
              </button>
              <button
                type="button"
                onClick={() => setRotationSnap(45)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                  rotationSnap === 45
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Snap in 45° increments (0°, 45°, 90°)"
              >
                45°
              </button>
              <button
                type="button"
                onClick={() => setRotationSnap(0)}
                className={`px-1.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  rotationSnap === 0
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Free continuous rotation without snap points"
              >
                Free
              </button>
            </div>
          </div>

          {/* Quick Angle Snap Chips */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-950/85 border border-zinc-800/80 text-[11px] font-mono shadow-lg">
            <span className="text-[10px] text-zinc-400 px-1 font-sans">Quick Angle:</span>
            <button
              type="button"
              onClick={() => onCutPlaneNormalChange?.([0, 0, 1])}
              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Snap to Flat horizontal cut"
            >
              0° Flat
            </button>
            <button
              type="button"
              onClick={() => {
                const rad = (15 * Math.PI) / 180;
                onCutPlaneNormalChange?.([0, -Math.sin(rad), Math.cos(rad)]);
              }}
              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Snap to 15° pitch angle"
            >
              15°
            </button>
            <button
              type="button"
              onClick={() => {
                const rad = (45 * Math.PI) / 180;
                onCutPlaneNormalChange?.([0, -Math.sin(rad), Math.cos(rad)]);
              }}
              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Snap to 45° diagonal angle"
            >
              45°
            </button>
            <button
              type="button"
              onClick={() => {
                onCutPlaneNormalChange?.([
                  -cutPlaneNormal[0],
                  -cutPlaneNormal[1],
                  -cutPlaneNormal[2],
                ]);
              }}
              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Invert / Flip cutting plane normal"
            >
              Flip 180°
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
