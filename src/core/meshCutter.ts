import { ShapeUtils, Vector2 } from 'three';
import {
  CutPlaneOptions,
  CutMeshResult,
  CutPartMesh,
  CutConnectorOptions,
} from './types';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const EPSILON = 1e-5;

function dot3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return [0, 0, 1];
  return [x / len, y / len, z / len];
}

function computeBounds(verts: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  if (verts.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  let minX = verts[0], minY = verts[1], minZ = verts[2];
  let maxX = verts[0], maxY = verts[1], maxZ = verts[2];
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * Checks if a 2D point is inside a polygon.
 */
function isPointInPolygon2D(pt: [number, number], poly: [number, number][]): boolean {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes the signed area of a 2D polygon.
 * Positive = CCW, Negative = CW
 */
function polygonArea2D(poly: [number, number][]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  return area * 0.5;
}

/**
 * Computes 2D centroid of a polygon.
 */
function polygonCentroid2D(poly: [number, number][]): [number, number] {
  let cx = 0;
  let cy = 0;
  const a = polygonArea2D(poly);
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sy = 0;
    for (const p of poly) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / poly.length, sy / poly.length];
  }
  const factor = 1 / (6 * a);
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    cx += (poly[i][0] + poly[j][0]) * cross;
    cy += (poly[i][1] + poly[j][1]) * cross;
  }
  return [cx * factor, cy * factor];
}

/**
 * Slices a 3D multi-color painted mesh across an arbitrary plane,
 * preserving all exterior paint zones and optionally generating watertight
 * capped surfaces with alignment dowel sockets.
 */
export function cutPaintedMesh(
  vertices: Float32Array,
  triangles: Uint32Array,
  paintStates: Uint8Array,
  options: CutPlaneOptions
): CutMeshResult {
  const startTime = performance.now();
  const [nx, ny, nz] = normalize3(...options.planeNormal);
  // Add infinitesimal 1e-5 offset to avoid degenerate coplanar ring/vertex singularities
  const px = options.planePoint[0] + nx * 1.37e-5;
  const py = options.planePoint[1] + ny * 1.37e-5;
  const pz = options.planePoint[2] + nz * 1.37e-5;
  const capFaces = options.capFaces !== false;
  const capPaintSlot = options.capPaintSlot ?? 1;
  const connectorOpts = options.connectors;

  // Determine plane coordinate basis (U, V, N)
  let ux: number, uy: number, uz: number;
  if (Math.abs(nz) < 0.9) {
    const len = Math.hypot(-ny, nx);
    ux = -ny / len;
    uy = nx / len;
    uz = 0;
  } else {
    const len = Math.hypot(-nz, ny);
    ux = 0;
    uy = -nz / len;
    uz = ny / len;
  }
  // V = N x U
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  const toUV = (x: number, y: number, z: number): [number, number] => {
    const dx = x - px, dy = y - py, dz = z - pz;
    return [dot3(dx, dy, dz, ux, uy, uz), dot3(dx, dy, dz, vx, vy, vz)];
  };

  const to3D = (u: number, v: number, offsetN = 0): [number, number, number] => {
    return [
      px + u * ux + v * vx + offsetN * nx,
      py + u * uy + v * vy + offsetN * ny,
      pz + u * uz + v * vz + offsetN * nz,
    ];
  };

  // Pre-calculate signed distances for all vertices
  const numVerts = vertices.length / 3;
  const distances = new Float32Array(numVerts);
  for (let i = 0; i < numVerts; i++) {
    const vx = vertices[3 * i] - px;
    const vy = vertices[3 * i + 1] - py;
    const vz = vertices[3 * i + 2] - pz;
    distances[i] = dot3(vx, vy, vz, nx, ny, nz);
  }

  // Buffers for Part A and Part B
  const vertsA: number[] = [];
  const trisA: number[] = [];
  const paintsA: number[] = [];

  const vertsB: number[] = [];
  const trisB: number[] = [];
  const paintsB: number[] = [];

  // Directed cut segments on the cut plane for Part A's cap
  // Each segment is [fromU, fromV, toU, toV]
  const capSegments2D: Array<[[number, number], [number, number]]> = [];

  // Helper to add vertex to Part A
  const addVertA = (x: number, y: number, z: number): number => {
    const idx = vertsA.length / 3;
    vertsA.push(x, y, z);
    return idx;
  };

  // Helper to add vertex to Part B
  const addVertB = (x: number, y: number, z: number): number => {
    const idx = vertsB.length / 3;
    vertsB.push(x, y, z);
    return idx;
  };

  // Maps to deduplicate vertices created along cut edges
  // Key: min(vA, vB)_max(vA, vB)
  const edgeCutMapA = new Map<string, number>();
  const edgeCutMapB = new Map<string, number>();
  const edgeCutCoords = new Map<string, [number, number, number]>();

  const getCutVertex = (v1: number, v2: number): {
    pt: [number, number, number];
    idxA: number;
    idxB: number;
  } => {
    const minV = Math.min(v1, v2);
    const maxV = Math.max(v1, v2);
    const edgeKey = `${minV}_${maxV}`;

    let pt = edgeCutCoords.get(edgeKey);
    if (!pt) {
      const d1 = distances[v1];
      const d2 = distances[v2];
      const t = Math.max(0, Math.min(1, -d1 / (d2 - d1)));
      const x1 = vertices[3 * v1], y1 = vertices[3 * v1 + 1], z1 = vertices[3 * v1 + 2];
      const x2 = vertices[3 * v2], y2 = vertices[3 * v2 + 1], z2 = vertices[3 * v2 + 2];

      // Exact interpolation
      let ix = x1 + t * (x2 - x1);
      let iy = y1 + t * (y2 - y1);
      let iz = z1 + t * (z2 - z1);

      // Project onto plane to eliminate floating point error
      const distToPlane = dot3(ix - px, iy - py, iz - pz, nx, ny, nz);
      ix -= distToPlane * nx;
      iy -= distToPlane * ny;
      iz -= distToPlane * nz;

      pt = [ix, iy, iz];
      edgeCutCoords.set(edgeKey, pt);
    }

    let idxA = edgeCutMapA.get(edgeKey);
    if (idxA === undefined) {
      idxA = addVertA(pt[0], pt[1], pt[2]);
      edgeCutMapA.set(edgeKey, idxA);
    }

    let idxB = edgeCutMapB.get(edgeKey);
    if (idxB === undefined) {
      idxB = addVertB(pt[0], pt[1], pt[2]);
      edgeCutMapB.set(edgeKey, idxB);
    }

    return { pt, idxA, idxB };
  };

  // Slice each triangle
  const numTris = triangles.length / 3;
  for (let t = 0; t < numTris; t++) {
    const i0 = triangles[3 * t];
    const i1 = triangles[3 * t + 1];
    const i2 = triangles[3 * t + 2];
    const paint = paintStates[t] ?? 0;

    const d0 = distances[i0];
    const d1 = distances[i1];
    const d2 = distances[i2];

    const s0 = d0 > EPSILON ? 1 : d0 < -EPSILON ? -1 : 0;
    const s1 = d1 > EPSILON ? 1 : d1 < -EPSILON ? -1 : 0;
    const s2 = d2 > EPSILON ? 1 : d2 < -EPSILON ? -1 : 0;

    // Case 1: Entirely on side A
    if (s0 >= 0 && s1 >= 0 && s2 >= 0) {
      const a0 = addVertA(vertices[3 * i0], vertices[3 * i0 + 1], vertices[3 * i0 + 2]);
      const a1 = addVertA(vertices[3 * i1], vertices[3 * i1 + 1], vertices[3 * i1 + 2]);
      const a2 = addVertA(vertices[3 * i2], vertices[3 * i2 + 1], vertices[3 * i2 + 2]);
      trisA.push(a0, a1, a2);
      paintsA.push(paint);
      continue;
    }

    // Case 2: Entirely on side B
    if (s0 <= 0 && s1 <= 0 && s2 <= 0) {
      const b0 = addVertB(vertices[3 * i0], vertices[3 * i0 + 1], vertices[3 * i0 + 2]);
      const b1 = addVertB(vertices[3 * i1], vertices[3 * i1 + 1], vertices[3 * i1 + 2]);
      const b2 = addVertB(vertices[3 * i2], vertices[3 * i2 + 1], vertices[3 * i2 + 2]);
      trisB.push(b0, b1, b2);
      paintsB.push(paint);
      continue;
    }

    // Case 3: Triangle crosses the plane
    // Find the single vertex that is alone on one side
    const vArr = [i0, i1, i2];
    const dArr = [d0, d1, d2];
    const sArr = [s0, s1, s2];

    // Determine the isolated vertex
    let iso = 0;
    if (sArr[0] !== sArr[1] && sArr[0] !== sArr[2]) {
      iso = 0;
    } else if (sArr[1] !== sArr[0] && sArr[1] !== sArr[2]) {
      iso = 1;
    } else {
      iso = 2;
    }

    const vIso = vArr[iso];
    const vNext = vArr[(iso + 1) % 3];
    const vPrev = vArr[(iso + 2) % 3];

    const cutNext = getCutVertex(vIso, vNext);
    const cutPrev = getCutVertex(vIso, vPrev);

    const uvNext = toUV(...cutNext.pt);
    const uvPrev = toUV(...cutPrev.pt);

    if (sArr[iso] > 0) {
      // Isolated vertex is on Side A
      // Part A gets 1 triangle: (vIso, cutNext, cutPrev)
      const aIso = addVertA(vertices[3 * vIso], vertices[3 * vIso + 1], vertices[3 * vIso + 2]);
      trisA.push(aIso, cutNext.idxA, cutPrev.idxA);
      paintsA.push(paint);

      // Part B gets 2 triangles: (cutNext, vNext, vPrev) & (cutNext, vPrev, cutPrev)
      const bNext = addVertB(vertices[3 * vNext], vertices[3 * vNext + 1], vertices[3 * vNext + 2]);
      const bPrev = addVertB(vertices[3 * vPrev], vertices[3 * vPrev + 1], vertices[3 * vPrev + 2]);
      trisB.push(cutNext.idxB, bNext, bPrev);
      paintsB.push(paint);
      trisB.push(cutNext.idxB, bPrev, cutPrev.idxB);
      paintsB.push(paint);

      // Directed cut edge for cap (CCW in U,V basis): cutNext -> cutPrev
      capSegments2D.push([uvNext, uvPrev]);
    } else {
      // Isolated vertex is on Side B
      // Part B gets 1 triangle: (vIso, cutNext, cutPrev)
      const bIso = addVertB(vertices[3 * vIso], vertices[3 * vIso + 1], vertices[3 * vIso + 2]);
      trisB.push(bIso, cutNext.idxB, cutPrev.idxB);
      paintsB.push(paint);

      // Part A gets 2 triangles: (cutNext, vNext, vPrev) & (cutNext, vPrev, cutPrev)
      const aNext = addVertA(vertices[3 * vNext], vertices[3 * vNext + 1], vertices[3 * vNext + 2]);
      const aPrev = addVertA(vertices[3 * vPrev], vertices[3 * vPrev + 1], vertices[3 * vPrev + 2]);
      trisA.push(cutNext.idxA, aNext, aPrev);
      paintsA.push(paint);
      trisA.push(cutNext.idxA, aPrev, cutPrev.idxA);
      paintsA.push(paint);

      // Directed cut edge for cap (CCW in U,V basis): cutPrev -> cutNext
      capSegments2D.push([uvPrev, uvNext]);
    }
  }

  // Capping and Dowel Connector Generation
  let crossSectionArea = 0;
  let cutLoopsCount = 0;
  let connectorsCount = 0;
  let dowelPinPart: CutPartMesh | undefined;

  if (capFaces && capSegments2D.length >= 3) {
    // Chain directed segments into closed loops
    const SCALE = 1000; // 1 micron snapping
    const keyOf = (p: [number, number]) => `${Math.round(p[0] * SCALE)},${Math.round(p[1] * SCALE)}`;

    interface EdgeNode {
      to: [number, number];
      toKey: string;
    }
    const edgeMap = new Map<string, EdgeNode>();
    for (const [p1, p2] of capSegments2D) {
      const k1 = keyOf(p1);
      const k2 = keyOf(p2);
      if (k1 !== k2) {
        edgeMap.set(k1, { to: p2, toKey: k2 });
      }
    }

    const visited = new Set<string>();
    const loops: Array<[number, number][]> = [];

    for (const startKey of edgeMap.keys()) {
      if (visited.has(startKey)) continue;

      const loop: [number, number][] = [];
      let curKey = startKey;
      let safeCount = 0;

      while (curKey && !visited.has(curKey) && safeCount < edgeMap.size + 10) {
        visited.add(curKey);
        safeCount++;
        const nextNode = edgeMap.get(curKey);
        if (!nextNode) break;

        loop.push(nextNode.to);
        curKey = nextNode.toKey;
        if (curKey === startKey) {
          // Closed loop found!
          if (loop.length >= 3) {
            loops.push(loop);
          }
          break;
        }
      }
    }

    cutLoopsCount = loops.length;

    // Separate into outer contours (CCW, positive area) and inner holes (CW, negative area)
    interface ContourGroup {
      outer: [number, number][];
      holes: [number, number][][];
      area: number;
    }

    const groups: ContourGroup[] = [];
    const holeCandidates: [number, number][][] = [];

    for (const loop of loops) {
      const area = polygonArea2D(loop);
      if (Math.abs(area) < 1e-4) continue;

      if (area > 0) {
        // Outer boundary (CCW)
        groups.push({ outer: loop, holes: [], area });
        crossSectionArea += area;
      } else {
        // Hole (CW)
        holeCandidates.push(loop);
        crossSectionArea += area; // area is negative, subtracting hole
      }
    }

    // Assign each hole to its enclosing outer contour
    for (const hole of holeCandidates) {
      const samplePt = hole[0];
      let bestGroup: ContourGroup | null = null;
      let minArea = Infinity;

      for (const g of groups) {
        if (isPointInPolygon2D(samplePt, g.outer)) {
          if (g.area < minArea) {
            minArea = g.area;
            bestGroup = g;
          }
        }
      }

      if (bestGroup) {
        bestGroup.holes.push(hole);
      }
    }

    // Dowel connector options
    const connEnabled = connectorOpts?.enabled && connectorOpts.style !== 'none';
    const connRadius = (connectorOpts?.diameter ?? 5.0) / 2;
    const connLength = connectorOpts?.length ?? 8.0;
    const connHalfLen = connLength / 2;
    const connTol = connectorOpts?.tolerance ?? 0.2;
    const pinRadius = Math.max(0.5, connRadius - connTol);

    const pinVerts: number[] = [];
    const pinTris: number[] = [];
    const pinPaints: number[] = [];

    // Helper to generate a cylinder mesh (for sockets or standalone pin)
    const buildCylinder = (
      centerU: number,
      centerV: number,
      radius: number,
      startOffsetN: number,
      endOffsetN: number,
      invertNormals: boolean,
      targetVerts: number[],
      targetTris: number[],
      targetPaints: number[],
      paintSlot: number,
      includeEndCaps: boolean
    ) => {
      const segments = 24;
      const baseIdx = targetVerts.length / 3;

      // Circle 1 at startOffsetN
      for (let s = 0; s < segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        const u = centerU + radius * Math.cos(theta);
        const v = centerV + radius * Math.sin(theta);
        const [x, y, z] = to3D(u, v, startOffsetN);
        targetVerts.push(x, y, z);
      }
      // Circle 2 at endOffsetN
      for (let s = 0; s < segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        const u = centerU + radius * Math.cos(theta);
        const v = centerV + radius * Math.sin(theta);
        const [x, y, z] = to3D(u, v, endOffsetN);
        targetVerts.push(x, y, z);
      }

      // Side wall quads (2 triangles each)
      for (let s = 0; s < segments; s++) {
        const sNext = (s + 1) % segments;
        const v0 = baseIdx + s;
        const v1 = baseIdx + sNext;
        const v2 = baseIdx + segments + sNext;
        const v3 = baseIdx + segments + s;

        if (invertNormals) {
          targetTris.push(v0, v1, v2);
          targetPaints.push(paintSlot);
          targetTris.push(v0, v2, v3);
          targetPaints.push(paintSlot);
        } else {
          targetTris.push(v0, v2, v1);
          targetPaints.push(paintSlot);
          targetTris.push(v0, v3, v2);
          targetPaints.push(paintSlot);
        }
      }

      // End caps if requested (e.g. For standalone pin or bottom of socket)
      if (includeEndCaps) {
        // Bottom cap at startOffsetN
        const bottomCenterIdx = targetVerts.length / 3;
        const [bcx, bcy, bcz] = to3D(centerU, centerV, startOffsetN);
        targetVerts.push(bcx, bcy, bcz);
        for (let s = 0; s < segments; s++) {
          const sNext = (s + 1) % segments;
          if (invertNormals) {
            targetTris.push(bottomCenterIdx, baseIdx + s, baseIdx + sNext);
          } else {
            targetTris.push(bottomCenterIdx, baseIdx + sNext, baseIdx + s);
          }
          targetPaints.push(paintSlot);
        }

        // Top cap at endOffsetN
        const topCenterIdx = targetVerts.length / 3;
        const [tcx, tcy, tcz] = to3D(centerU, centerV, endOffsetN);
        targetVerts.push(tcx, tcy, tcz);
        for (let s = 0; s < segments; s++) {
          const sNext = (s + 1) % segments;
          if (invertNormals) {
            targetTris.push(topCenterIdx, baseIdx + segments + sNext, baseIdx + segments + s);
          } else {
            targetTris.push(topCenterIdx, baseIdx + segments + s, baseIdx + segments + sNext);
          }
          targetPaints.push(paintSlot);
        }
      }
    };

    // Triangulate each contour group and generate cap geometry
    for (const group of groups) {
      const socketHoles: [number, number][][] = [];

      // Check if this contour is large enough to host a dowel connector
      if (connEnabled) {
        const [cu, cv] = polygonCentroid2D(group.outer);
        // Ensure centroid is inside and has clearance
        const clearanceRadius = connRadius + connTol + 1.5;
        let fits = isPointInPolygon2D([cu, cv], group.outer);
        if (fits) {
          // Check perimeter clearance
          for (let a = 0; a < 8; a++) {
            const rad = (a / 8) * Math.PI * 2;
            const testPt: [number, number] = [
              cu + clearanceRadius * Math.cos(rad),
              cv + clearanceRadius * Math.sin(rad),
            ];
            if (!isPointInPolygon2D(testPt, group.outer)) {
              fits = false;
              break;
            }
          }
        }

        if (fits) {
          connectorsCount++;
          // Generate a circular hole polygon (CW orientation)
          const holePts: [number, number][] = [];
          const holeSegs = 24;
          for (let s = 0; s < holeSegs; s++) {
            // Clockwise for hole
            const theta = -(s / holeSegs) * Math.PI * 2;
            holePts.push([cu + connRadius * Math.cos(theta), cv + connRadius * Math.sin(theta)]);
          }
          socketHoles.push(holePts);

          if (connectorOpts.style === 'dowel_sockets') {
            // Sockets in both Part A and Part B
            // Socket in Part A (cavity goes into Part A along +N)
            buildCylinder(
              cu, cv, connRadius,
              0, connHalfLen,
              true, // Invert normals for cavity
              vertsA, trisA, paintsA, capPaintSlot,
              false
            );
            // Socket bottom cap in Part A
            const segs = 24;
            const bottomAIdx = vertsA.length / 3;
            const [bAx, bAy, bAz] = to3D(cu, cv, connHalfLen);
            vertsA.push(bAx, bAy, bAz);
            // Circle vertices at connHalfLen are at index (bottomAIdx - segs) to (bottomAIdx - 1)
            const ringStartA = bottomAIdx - segs;
            for (let s = 0; s < segs; s++) {
              const sNext = (s + 1) % segs;
              trisA.push(bottomAIdx, ringStartA + sNext, ringStartA + s);
              paintsA.push(capPaintSlot);
            }

            // Socket in Part B (cavity goes into Part B along -N)
            buildCylinder(
              cu, cv, connRadius,
              0, -connHalfLen,
              false,
              vertsB, trisB, paintsB, capPaintSlot,
              false
            );
            // Socket bottom cap in Part B
            const bottomBIdx = vertsB.length / 3;
            const [bBx, bBy, bBz] = to3D(cu, cv, -connHalfLen);
            vertsB.push(bBx, bBy, bBz);
            const ringStartB = bottomBIdx - segs;
            for (let s = 0; s < segs; s++) {
              const sNext = (s + 1) % segs;
              trisB.push(bottomBIdx, ringStartB + s, ringStartB + sNext);
              paintsB.push(capPaintSlot);
            }

            // Companion printable dowel pin
            buildCylinder(
              0, 0, pinRadius,
              -connHalfLen, connHalfLen,
              false,
              pinVerts, pinTris, pinPaints, 1,
              true
            );
          } else if (connectorOpts.style === 'integrated_pin') {
            // Pin on Part A, Socket on Part B
            buildCylinder(
              cu, cv, pinRadius,
              0, -connHalfLen,
              false,
              vertsA, trisA, paintsA, capPaintSlot,
              true
            );

            // Socket on Part B
            buildCylinder(
              cu, cv, connRadius,
              0, -connHalfLen,
              false,
              vertsB, trisB, paintsB, capPaintSlot,
              false
            );
            const segs = 24;
            const bottomBIdx = vertsB.length / 3;
            const [bBx, bBy, bBz] = to3D(cu, cv, -connHalfLen);
            vertsB.push(bBx, bBy, bBz);
            const ringStartB = bottomBIdx - segs;
            for (let s = 0; s < segs; s++) {
              const sNext = (s + 1) % segs;
              trisB.push(bottomBIdx, ringStartB + s, ringStartB + sNext);
              paintsB.push(capPaintSlot);
            }
          }
        }
      }

      // Combine cut mesh holes + connector socket holes
      const allHoles = [...group.holes, ...socketHoles];

      // Format for Three.js ShapeUtils.triangulateShape
      const contourVecs = group.outer.map((p) => new Vector2(p[0], p[1]));
      const holeVecsList = allHoles.map((h) => h.map((p) => new Vector2(p[0], p[1])));

      try {
        const faces = ShapeUtils.triangulateShape(contourVecs, holeVecsList);

        // Build flat array of all 2D points used in triangulation
        const allPts: [number, number][] = [...group.outer];
        for (const h of allHoles) {
          for (const p of h) {
            allPts.push(p);
          }
        }

        // Add cap vertices to Part A and Part B
        const capBaseA = vertsA.length / 3;
        const capBaseB = vertsB.length / 3;

        for (const [u, v] of allPts) {
          const [x, y, z] = to3D(u, v, 0);
          vertsA.push(x, y, z);
          vertsB.push(x, y, z);
        }

        for (const face of faces) {
          const f0 = face[0];
          const f1 = face[1];
          const f2 = face[2];

          // Part A cap normal points into -N (away from Part A)
          trisA.push(capBaseA + f0, capBaseA + f2, capBaseA + f1);
          paintsA.push(capPaintSlot);

          // Part B cap normal points into +N (away from Part B)
          trisB.push(capBaseB + f0, capBaseB + f1, capBaseB + f2);
          paintsB.push(capPaintSlot);
        }
      } catch (err) {
        console.warn('Triangulation warning for contour cap:', err);
      }
    }

    if (pinVerts.length > 0) {
      const pinVertsArray = new Float32Array(pinVerts);
      dowelPinPart = {
        name: 'Dowel_Pin',
        vertices: pinVertsArray,
        triangles: new Uint32Array(pinTris),
        paintStates: new Uint8Array(pinPaints),
        triangleCount: pinTris.length / 3,
        bounds: computeBounds(pinVertsArray),
      };
    }
  }

  const finalVertsA = new Float32Array(vertsA);
  const finalTrisA = new Uint32Array(trisA);
  const finalPaintsA = new Uint8Array(paintsA);

  const finalVertsB = new Float32Array(vertsB);
  const finalTrisB = new Uint32Array(trisB);
  const finalPaintsB = new Uint8Array(paintsB);

  const partA: CutPartMesh = {
    name: 'Part_A_Upper',
    vertices: finalVertsA,
    triangles: finalTrisA,
    paintStates: finalPaintsA,
    triangleCount: finalTrisA.length / 3,
    bounds: computeBounds(finalVertsA),
  };

  const partB: CutPartMesh = {
    name: 'Part_B_Lower',
    vertices: finalVertsB,
    triangles: finalTrisB,
    paintStates: finalPaintsB,
    triangleCount: finalTrisB.length / 3,
    bounds: computeBounds(finalVertsB),
  };

  return {
    partA,
    partB,
    dowelPin: dowelPinPart,
    crossSectionArea: Math.max(0, crossSectionArea),
    cutLoopsCount,
    connectorsCount,
    processingTimeMs: performance.now() - startTime,
  };
}
