import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Move, RotateCw, Compass } from 'lucide-react';
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

/**
 * Converts Pitch and Roll angles in degrees to a normalized plane normal vector [nx, ny, nz]
 */
function anglesToNormal(pDeg: number, rDeg: number): [number, number, number] {
  const rx = (pDeg * Math.PI) / 180;
  const ry = (rDeg * Math.PI) / 180;
  const nx = Math.cos(rx) * Math.sin(ry);
  const ny = -Math.sin(rx);
  const nz = Math.cos(rx) * Math.cos(ry);
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/**
 * Extracts Pitch and Roll angles in degrees from a normalized plane normal vector
 */
function normalToAngles(n: [number, number, number]): { pitch: number; roll: number } {
  const p = (-Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI;
  const r = (Math.atan2(n[0], n[2]) * 180) / Math.PI;
  return { pitch: p, roll: r };
}

/**
 * Creates a double-cone arrow with a central cube handle matching Bambu Studio / OrcaSlicer (Image 1 & 2)
 */
function createSlicerDoubleConeHandle(colorHex: string, axis: 'x' | 'y' | 'z'): THREE.Group {
  const group = new THREE.Group();
  const cubeGeom = new THREE.BoxGeometry(3.6, 3.6, 3.6);
  const cubeMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
  const cube = new THREE.Mesh(cubeGeom, cubeMat);
  cube.renderOrder = 9999;
  group.add(cube);

  const coneGeom = new THREE.ConeGeometry(2.2, 5.0, 16);
  const coneMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });

  const coneA = new THREE.Mesh(coneGeom, coneMat);
  const coneB = new THREE.Mesh(coneGeom, coneMat);
  coneA.renderOrder = 9999;
  coneB.renderOrder = 9999;

  if (axis === 'x') {
    coneA.rotateZ(-Math.PI / 2);
    coneA.position.set(4.2, 0, 0);
    coneB.rotateZ(Math.PI / 2);
    coneB.position.set(-4.2, 0, 0);
  } else if (axis === 'y') {
    coneA.position.set(0, 4.2, 0);
    coneB.rotateX(Math.PI);
    coneB.position.set(0, -4.2, 0);
  } else {
    coneA.rotateX(Math.PI / 2);
    coneA.position.set(0, 0, 4.2);
    coneB.rotateX(-Math.PI / 2);
    coneB.position.set(0, 0, -4.2);
  }

  group.add(coneA);
  group.add(coneB);
  return group;
}

/**
 * Builds a Bambu Studio / OrcaSlicer protractor dial with snap points (Image 2)
 * Features 8 major radial spokes (every 45°), 15° medium ticks, 5° minor ticks,
 * concentric circular guides, and green/red cube-cone handles.
 */
function createProtractorDialGroup(radius: number): THREE.Group {
  const dialGroup = new THREE.Group();

  // Outer ring (128 segments)
  const outerPoints: THREE.Vector3[] = [];
  const segments = 128;
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    outerPoints.push(new THREE.Vector3(Math.cos(th) * radius, Math.sin(th) * radius, 0));
  }
  const outerGeom = new THREE.BufferGeometry().setFromPoints(outerPoints);
  const outerMat = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const outerLine = new THREE.Line(outerGeom, outerMat);
  outerLine.renderOrder = 9999;
  dialGroup.add(outerLine);

  // Radial spoke lines and perimeter tick marks
  const tickCoords: number[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let rIn = radius * 0.94;
    let rOut = radius * 1.02;

    if (deg % 45 === 0) {
      // Major snap spoke line extending inward toward the center (Bambu Studio 45° snap points)
      rIn = radius * 0.35;
      rOut = radius * 1.08;
    } else if (deg % 15 === 0) {
      // Medium 15° snap tick
      rIn = radius * 0.88;
      rOut = radius * 1.05;
    }

    tickCoords.push(cos * rIn, sin * rIn, 0, cos * rOut, sin * rOut, 0);
  }

  const ticksGeom = new THREE.BufferGeometry();
  ticksGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tickCoords), 3));
  const ticksMat = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const ticksLines = new THREE.LineSegments(ticksGeom, ticksMat);
  ticksLines.renderOrder = 9999;
  dialGroup.add(ticksLines);

  // Inner hub guide circle
  const innerPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    innerPoints.push(new THREE.Vector3(Math.cos(th) * radius * 0.35, Math.sin(th) * radius * 0.35, 0));
  }
  const innerGeom = new THREE.BufferGeometry().setFromPoints(innerPoints);
  const innerMat = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.35,
    depthTest: false,
  });
  const innerLine = new THREE.Line(innerGeom, innerMat);
  innerLine.renderOrder = 9998;
  dialGroup.add(innerLine);

  // Top Handle: Green double-cone with central green cube (matching Image 2)
  const topHandle = createSlicerDoubleConeHandle('#22c55e', 'x');
  topHandle.position.set(0, radius * 1.05, 0);
  dialGroup.add(topHandle);

  // Side Handle: Red double-cone with central red cube (matching Image 1)
  const sideHandle = createSlicerDoubleConeHandle('#ef4444', 'y');
  sideHandle.position.set(radius * 1.05, 0, 0);
  dialGroup.add(sideHandle);

  return dialGroup;
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

  const activeGizmoPartRef = useRef<'height' | 'pitch' | 'roll' | null>(null);
  const hoveredGizmoPartRef = useRef<'height' | 'pitch' | 'roll' | null>(null);
  const [hoveredGizmoPart, setHoveredGizmoPart] = useState<'height' | 'pitch' | 'roll' | null>(null);
  const [isGizmoDragging, setIsGizmoDragging] = useState<boolean>(false);

  const cutPlaneZRef = useRef<number>(cutPlaneZ ?? 25.0);
  cutPlaneZRef.current = cutPlaneZ ?? 25.0;
  const cutPlaneNormalRef = useRef<[number, number, number]>(cutPlaneNormal);
  cutPlaneNormalRef.current = cutPlaneNormal;
  const gizmoRadiusRef = useRef<number>(36);
  const cutPlaneQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());

  const dragPlaneRef = useRef<THREE.Plane>(new THREE.Plane());
  const dragCenterRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const dragStartAnglesRef = useRef<{ pitch: number; roll: number }>({ pitch: 0, roll: 0 });
  const dragStartMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartZRef = useRef<number>(25.0);

  const gizmoHitboxesRef = useRef<{
    heightStem?: THREE.Object3D;
    pitchHandle?: THREE.Object3D;
    rollHandle?: THREE.Object3D;
    pitchRing?: THREE.Object3D;
    rollRing?: THREE.Object3D;
  }>({});

  const dialLabelRef = useRef<HTMLDivElement>(null);
  const dialAnchorRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const [dialAngleText, setDialAngleText] = useState<string>('Y: 0.00°');

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cutResultRef = useRef(cutResult);
  cutResultRef.current = cutResult;

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

    // Dedicated group for cut plane visualizer & OrcaSlicer gizmo
    const cutPlaneHelper = new THREE.Group();
    scene.add(cutPlaneHelper);
    cutPlaneHelperRef.current = cutPlaneHelper;

    // Native OrcaSlicer pointer event interaction for Cut Plane Gizmo
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getRaycastHits = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const hitboxes = gizmoHitboxesRef.current;
      const targets: { part: 'height' | 'pitch' | 'roll'; obj: THREE.Object3D }[] = [];
      if (hitboxes.heightStem) targets.push({ part: 'height', obj: hitboxes.heightStem });
      if (hitboxes.pitchHandle) targets.push({ part: 'pitch', obj: hitboxes.pitchHandle });
      if (hitboxes.rollHandle) targets.push({ part: 'roll', obj: hitboxes.rollHandle });
      if (hitboxes.pitchRing) targets.push({ part: 'pitch', obj: hitboxes.pitchRing });
      if (hitboxes.rollRing) targets.push({ part: 'roll', obj: hitboxes.rollRing });

      for (const t of targets) {
        const intersects = raycaster.intersectObject(t.obj, true);
        if (intersects.length > 0) {
          return { part: t.part, point: intersects[0].point };
        }
      }
      return null;
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (modeRef.current !== 'cut' || cutResultRef.current) return;

      const hit = getRaycastHits(e);
      if (!hit) return;

      e.stopPropagation();
      activeGizmoPartRef.current = hit.part;
      setIsGizmoDragging(true);
      controls.enabled = false;

      const currentZ = cutPlaneZRef.current;
      dragStartZRef.current = currentZ;
      dragStartMousePosRef.current = { x: e.clientX, y: e.clientY };

      const angles = normalToAngles(cutPlaneNormalRef.current);
      dragStartAnglesRef.current = angles;

      const sceneZ = currentZ - modelMinZRef.current;
      dragCenterRef.current.set(0, 0, sceneZ);

      // Define drag interaction plane
      if (hit.part === 'height') {
        const camDir = camera.getWorldDirection(new THREE.Vector3());
        let vNorm = new THREE.Vector3(camDir.x, camDir.y, 0).normalize();
        if (vNorm.lengthSq() < 0.001) vNorm = new THREE.Vector3(0, -1, 0);
        dragPlaneRef.current.setFromNormalAndCoplanarPoint(vNorm, dragCenterRef.current);
      } else {
        const norm = new THREE.Vector3(...cutPlaneNormalRef.current).normalize();
        dragPlaneRef.current.setFromNormalAndCoplanarPoint(norm, dragCenterRef.current);
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      if (modeRef.current !== 'cut' || cutResultRef.current) return;

      const activePart = activeGizmoPartRef.current;
      if (!activePart) {
        const hit = getRaycastHits(e);
        const part = hit ? hit.part : null;
        if (part !== hoveredGizmoPartRef.current) {
          hoveredGizmoPartRef.current = part;
          setHoveredGizmoPart(part);
          renderer.domElement.style.cursor = part ? 'grab' : 'default';
        }
        return;
      }

      renderer.domElement.style.cursor = 'grabbing';

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      if (activePart === 'height') {
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlaneRef.current, intersection)) {
          const rawZ = intersection.z + modelMinZRef.current;
          const minZ = modelMinZRef.current;
          const maxZ = modelMaxZRef.current;
          const clampedZ = Math.max(minZ, Math.min(maxZ, rawZ));
          const snappedZ = Math.round(clampedZ * 2) / 2; // 0.5mm snap
          onCutPlaneZChangeRef.current?.(Number(snappedZ.toFixed(2)));
          setDialAngleText(`Z: ${snappedZ.toFixed(1)} mm`);
        }
      } else if (activePart === 'pitch' || activePart === 'roll') {
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlaneRef.current, intersection)) {
          const center = dragCenterRef.current;
          const diff = intersection.clone().sub(center);
          const invQuat = cutPlaneQuatRef.current.clone().invert();
          diff.applyQuaternion(invQuat);

          const dist = Math.hypot(diff.x, diff.y);
          const currentDeg = (Math.atan2(diff.y, diff.x) * 180) / Math.PI;

          const R = gizmoRadiusRef.current;
          let snapDeg: number;
          let snapLabel = '';

          // OrcaSlicer protractor snapping rules:
          // Inside (< 0.75 R): 45° snap (the 8 major spokes)
          // Perimeter (0.75 R to 1.35 R): 5° snap (the 72 tick marks)
          // Outside (>= 1.35 R): Free continuous rotation
          if (dist < R * 0.75) {
            snapDeg = Math.round(currentDeg / 45) * 45;
            snapLabel = ' (45° Snap)';
          } else if (dist < R * 1.35) {
            snapDeg = Math.round(currentDeg / 5) * 5;
            snapLabel = ' (5° Snap)';
          } else {
            snapDeg = Number(currentDeg.toFixed(1));
            snapLabel = ' (Free)';
          }

          let newPitch = dragStartAnglesRef.current.pitch;
          let newRoll = dragStartAnglesRef.current.roll;

          if (activePart === 'roll') {
            newRoll = snapDeg;
            setDialAngleText(`Y: ${newRoll.toFixed(1)}°${snapLabel}`);
          } else {
            newPitch = snapDeg;
            setDialAngleText(`X: ${newPitch.toFixed(1)}°${snapLabel}`);
          }

          // Clamp angles to [-89, 89]
          newPitch = Math.max(-89, Math.min(89, newPitch));
          newRoll = Math.max(-89, Math.min(89, newRoll));

          const newNormal = anglesToNormal(newPitch, newRoll);
          onCutPlaneNormalChangeRef.current?.(newNormal);

          // Position the dialAnchorRef for the HUD tooltip badge
          const badgeOffset = new THREE.Vector3(
            Math.cos((snapDeg * Math.PI) / 180) * R * 1.12,
            Math.sin((snapDeg * Math.PI) / 180) * R * 1.12,
            0
          ).applyQuaternion(cutPlaneQuatRef.current);
          dialAnchorRef.current.set(
            center.x + badgeOffset.x,
            center.y + badgeOffset.y,
            center.z + badgeOffset.z
          );
        }
      }
    };

    const handlePointerUp = () => {
      if (activeGizmoPartRef.current) {
        activeGizmoPartRef.current = null;
        setIsGizmoDragging(false);
        controls.enabled = true;
        renderer.domElement.style.cursor = 'default';
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      // Bambu Studio / OrcaSlicer live angle HUD badge (Image 2)
      if (
        dialLabelRef.current &&
        modeRef.current === 'cut' &&
        !cutResultRef.current &&
        (activeGizmoPartRef.current || hoveredGizmoPartRef.current)
      ) {
        const v = dialAnchorRef.current.clone();
        v.project(camera);
        if (v.z > 1) {
          dialLabelRef.current.style.display = 'none';
        } else {
          const w = container.clientWidth;
          const h = container.clientHeight;
          const px = (v.x * 0.5 + 0.5) * w;
          const py = (-v.y * 0.5 + 0.5) * h;
          dialLabelRef.current.style.display = 'flex';
          dialLabelRef.current.style.transform = `translate(-50%, -130%) translate(${Math.round(px)}px, ${Math.round(py)}px)`;
        }
      } else if (dialLabelRef.current) {
        dialLabelRef.current.style.display = 'none';
      }

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
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Cutting Plane Visualizer Helper & OrcaSlicer 3D Drag Gizmo
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
      cutPlaneQuatRef.current.copy(quat);

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

      const R = Math.max(Math.min(boundX, boundY) * 0.44, 32);
      gizmoRadiusRef.current = R;

      // OrcaSlicer Protractor Dial with 45° spokes and 5° ticks (Image 2)
      const dial = createProtractorDialGroup(R);
      dial.position.set(0, 0, sceneZ);
      dial.quaternion.copy(quat);
      planeGroup.add(dial);

      // Height Arrow Stem (Central vertical double arrow along normal)
      const stemGroup = new THREE.Group();
      stemGroup.position.set(0, 0, sceneZ);
      stemGroup.quaternion.copy(quat);

      // Central metallic sphere
      const sphereGeom = new THREE.SphereGeometry(3.6, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: '#10b981',
        emissive: '#047857',
        roughness: 0.3,
        metalness: 0.7,
        depthTest: false,
      });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.renderOrder = 9999;
      stemGroup.add(sphere);

      // Up and Down cones for height stem
      const stemConeGeom = new THREE.ConeGeometry(2.4, 5.5, 16);
      const stemConeMat = new THREE.MeshBasicMaterial({
        color: '#10b981',
        depthTest: false,
      });
      const topCone = new THREE.Mesh(stemConeGeom, stemConeMat);
      topCone.position.set(0, 0, 12);
      topCone.rotateX(Math.PI / 2);
      topCone.renderOrder = 9999;
      stemGroup.add(topCone);

      const botCone = new THREE.Mesh(stemConeGeom, stemConeMat);
      botCone.position.set(0, 0, -12);
      botCone.rotateX(-Math.PI / 2);
      botCone.renderOrder = 9999;
      stemGroup.add(botCone);

      // Stem shaft
      const shaftGeom = new THREE.CylinderGeometry(0.9, 0.9, 20, 12);
      shaftGeom.rotateX(Math.PI / 2);
      const shaft = new THREE.Mesh(shaftGeom, stemConeMat);
      shaft.renderOrder = 9999;
      stemGroup.add(shaft);

      // Height stem invisible hitbox (cylinder)
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
      const heightHitboxGeom = new THREE.CylinderGeometry(6.0, 6.0, 32, 12);
      heightHitboxGeom.rotateX(Math.PI / 2);
      const heightHitbox = new THREE.Mesh(heightHitboxGeom, hitboxMat);
      stemGroup.add(heightHitbox);
      planeGroup.add(stemGroup);
      gizmoHitboxesRef.current.heightStem = heightHitbox;

      // Red Pitch Ring & Hitbox (X-axis rotation)
      const redRingGeom = new THREE.RingGeometry(R * 0.98, R * 1.02, 64);
      const redRingMat = new THREE.MeshBasicMaterial({
        color: '#ef4444',
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
        opacity: 0.6,
      });
      const redRing = new THREE.Mesh(redRingGeom, redRingMat);
      redRing.position.set(0, 0, sceneZ);
      redRing.quaternion.copy(quat);
      redRing.renderOrder = 9999;
      planeGroup.add(redRing);

      // Red handle at (0, R * 1.05, 0)
      const pitchHandleGroup = new THREE.Group();
      pitchHandleGroup.position.set(0, 0, sceneZ);
      pitchHandleGroup.quaternion.copy(quat);

      const redHandle = createSlicerDoubleConeHandle('#ef4444', 'x');
      redHandle.position.set(0, R * 1.05, 0);
      pitchHandleGroup.add(redHandle);

      // Hitbox for pitch handle
      const pitchHitboxGeom = new THREE.BoxGeometry(12, 12, 12);
      const pitchHitbox = new THREE.Mesh(pitchHitboxGeom, hitboxMat);
      pitchHitbox.position.set(0, R * 1.05, 0);
      pitchHandleGroup.add(pitchHitbox);

      // Pitch ring hitbox
      const pitchRingHitboxGeom = new THREE.TorusGeometry(R, 6, 8, 32);
      const pitchRingHitbox = new THREE.Mesh(pitchRingHitboxGeom, hitboxMat);
      pitchHandleGroup.add(pitchRingHitbox);

      planeGroup.add(pitchHandleGroup);
      gizmoHitboxesRef.current.pitchHandle = pitchHitbox;
      gizmoHitboxesRef.current.pitchRing = pitchRingHitbox;

      // Green Roll Ring & Hitbox (Y-axis rotation)
      const greenRingGeom = new THREE.RingGeometry(R * 0.98, R * 1.02, 64);
      const greenRingMat = new THREE.MeshBasicMaterial({
        color: '#22c55e',
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
        opacity: 0.6,
      });
      const greenRing = new THREE.Mesh(greenRingGeom, greenRingMat);
      greenRing.position.set(0, 0, sceneZ);
      greenRing.quaternion.copy(quat);
      greenRing.renderOrder = 9999;
      planeGroup.add(greenRing);

      const rollHandleGroup = new THREE.Group();
      rollHandleGroup.position.set(0, 0, sceneZ);
      rollHandleGroup.quaternion.copy(quat);

      const greenHandle = createSlicerDoubleConeHandle('#22c55e', 'y');
      greenHandle.position.set(R * 1.05, 0, 0);
      rollHandleGroup.add(greenHandle);

      const rollHitboxGeom = new THREE.BoxGeometry(12, 12, 12);
      const rollHitbox = new THREE.Mesh(rollHitboxGeom, hitboxMat);
      rollHitbox.position.set(R * 1.05, 0, 0);
      rollHandleGroup.add(rollHitbox);

      const rollRingHitboxGeom = new THREE.TorusGeometry(R, 6, 8, 32);
      const rollRingHitbox = new THREE.Mesh(rollRingHitboxGeom, hitboxMat);
      rollHandleGroup.add(rollRingHitbox);

      planeGroup.add(rollHandleGroup);
      gizmoHitboxesRef.current.rollHandle = rollHitbox;
      gizmoHitboxesRef.current.rollRing = rollRingHitbox;

      // Set initial badge position
      const defaultAnchor = new THREE.Vector3(0, R * 1.15, 0).applyQuaternion(quat);
      dialAnchorRef.current.set(defaultAnchor.x, defaultAnchor.y, sceneZ + defaultAnchor.z);
    } else {
      gizmoHitboxesRef.current = {};
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

      {/* 3D-Anchored Angle Badge for Protractor Dial (like Bambu Studio Y: 0.00 in Image 2) */}
      <div
        ref={dialLabelRef}
        style={{ display: 'none', position: 'absolute', top: 0, left: 0 }}
        className="pointer-events-none z-30 px-2 py-0.5 rounded bg-zinc-950/95 border border-zinc-700/80 shadow-2xl text-[11px] font-mono font-bold text-zinc-100 flex items-center gap-1.5 whitespace-nowrap backdrop-blur-md"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
        <span>{dialAngleText}</span>
      </div>

      {/* 3D Slicer Cut & Quick Angle Snap Bar */}
      {mode === 'cut' && !cutResult && meshes.length > 0 && (
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col items-end gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/95 border border-zinc-800 backdrop-blur-md shadow-2xl text-xs font-mono">
            <span className="text-[11px] text-zinc-400 px-1 font-sans flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              Quick Angle:
            </span>
            <button
              type="button"
              onClick={() => onCutPlaneNormalChange?.([0, 0, 1])}
              className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Snap to Flat horizontal cut (0°)"
            >
              0° Flat
            </button>
            <button
              type="button"
              onClick={() => {
                const rad = (15 * Math.PI) / 180;
                onCutPlaneNormalChange?.([0, -Math.sin(rad), Math.cos(rad)]);
              }}
              className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
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
              className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
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
              className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Flip 180°"
            >
              Flip 180°
            </button>
          </div>
          <div className="text-[10px] text-zinc-400 font-sans bg-zinc-950/85 px-2.5 py-1 rounded-md border border-zinc-800/70 shadow-lg backdrop-blur-xs">
            🎯 Drag rings to rotate (inside: 45° snap, perimeter: 5° snap, outside: free) • Drag stem for Z height
          </div>
        </div>
      )}
    </div>
  );
};
