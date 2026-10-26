/**
 * OrcaSlicer / Bambu Studio / PrusaSlicer `paint_color` & `slic3rpe:mmu_segmentation`
 * Nibble-Packed Recursive Triangle Subdivision Tree Codec.
 *
 * Compatible with `libslic3r/TriangleSelector.cpp` (`TriangleSelector::serialize` and `deserialize`).
 *
 * Includes automatic T-junction (hanging midpoint vertex) resolution so that when a painted
 * boundary triangle is subdivided by the brush tool adjacent to an un-subdivided triangle,
 * the shared edge is split cleanly on both sides — keeping the mesh 100% manifold and watertight
 * for QEM simplification and slicing.
 */

export interface PaintSubdivisionResult {
  vertices: Float32Array;
  triangles: Uint32Array;
  paintStates: Uint8Array;
  subdividedCount: number;
}

/**
 * Encodes a single whole-triangle paint state (1-based extruder slot, or 0 for unpainted)
 * into a Bambu Studio / OrcaSlicer `paint_color` hex string.
 */
export function encodePaintState(state: number): string {
  if (state <= 0) return '';
  if (state === 1) return '4';
  if (state === 2) return '8';

  const offset = state - 3;
  if (offset < 15) {
    return offset.toString(16).toUpperCase() + 'C';
  }
  let rem = offset;
  let prefix = '';
  while (rem >= 15) {
    prefix = 'F' + prefix;
    rem -= 15;
  }
  prefix = rem.toString(16).toUpperCase() + prefix;
  return prefix + 'C';
}

/**
 * Fast decoder for dominant/root state when subdivision is disabled or for quick stats.
 * Properly tracks both unpainted (`state === 0`) and painted (`state > 0`) sub-triangle areas
 * so a mostly-unpainted triangle stays `0`.
 */
export function decodeDominantPaintState(hexStr: string): number {
  if (!hexStr || hexStr.length === 0) return 0;
  let pos = hexStr.length - 1;

  function readNibble(): number {
    if (pos < 0) return 0;
    const ch = hexStr.charCodeAt(pos--);
    if (ch >= 48 && ch <= 57) return ch - 48; // '0'-'9'
    if (ch >= 65 && ch <= 70) return ch - 55; // 'A'-'F'
    if (ch >= 97 && ch <= 102) return ch - 87; // 'a'-'f'
    return 0;
  }

  // Fast path for single-nibble or 2-nibble unsubdivided triangles
  const rootCh = hexStr.charCodeAt(pos);
  let rootNib = 0;
  if (rootCh >= 48 && rootCh <= 57) rootNib = rootCh - 48;
  else if (rootCh >= 65 && rootCh <= 70) rootNib = rootCh - 55;
  else if (rootCh >= 97 && rootCh <= 102) rootNib = rootCh - 87;

  if ((rootNib & 0b11) === 0) {
    pos--;
    let state = (rootNib >> 2) & 0b11;
    if (state === 3) {
      let extra = readNibble();
      state = 3 + extra;
      while (extra === 15 && pos >= 0) {
        extra = readNibble();
        state += extra;
      }
    }
    return state;
  }

  const weights = new Float64Array(64);

  function traverse(areaWeight: number): void {
    const nib = readNibble();
    const splitSides = nib & 0b11;
    const highBits = (nib >> 2) & 0b11;

    if (splitSides === 0) {
      let state = highBits;
      if (state === 3) {
        let extra = readNibble();
        state = 3 + extra;
        while (extra === 15 && pos >= 0) {
          extra = readNibble();
          state += extra;
        }
      }
      if (state >= 0 && state < 64) {
        weights[state] += areaWeight;
      }
      return;
    }

    const numChildren = splitSides + 1;
    const childWeight = areaWeight / numChildren;
    for (let i = 0; i < numChildren; i++) {
      traverse(childWeight);
    }
  }

  traverse(1.0);

  let bestState = 0;
  let bestWeight = -1;
  for (let st = 0; st < 64; st++) {
    if (weights[st] > bestWeight) {
      bestWeight = weights[st];
      bestState = st;
    }
  }
  return bestState;
}

/**
 * Checks whether a `paint_color` hex string contains recursive triangle subdivisions
 * (`split_sides > 0` at the root nibble).
 */
export function isPaintSubdivided(hexStr: string): boolean {
  if (!hexStr || hexStr.length === 0) return false;
  const ch = hexStr.charCodeAt(hexStr.length - 1);
  let nib = 0;
  if (ch >= 48 && ch <= 57) nib = ch - 48;
  else if (ch >= 65 && ch <= 70) nib = ch - 55;
  else if (ch >= 97 && ch <= 102) nib = ch - 87;
  return (nib & 0b11) !== 0;
}

/**
 * Expands a mesh's triangles using the exact `TriangleSelector::perform_split`
 * topology rules from OrcaSlicer / Bambu Studio / PrusaSlicer, and then stitches
 * any T-junctions where a subdivided triangle borders a coarser triangle.
 */
export function expandPaintedMesh(
  rawVertices: Float32Array,
  rawTriangles: Uint32Array,
  rawPaintAttrs: string[]
): PaintSubdivisionResult {
  const numRawTris = rawTriangles.length / 3;
  const numRawVerts = rawVertices.length / 3;

  let subdividedCount = 0;
  for (let i = 0; i < numRawTris; i++) {
    const attr = rawPaintAttrs[i];
    if (attr && isPaintSubdivided(attr)) {
      subdividedCount++;
    }
  }

  // Fast path: if no triangles are subdivided, no geometry expansion is needed
  if (subdividedCount === 0) {
    const paintStates = new Uint8Array(numRawTris);
    for (let i = 0; i < numRawTris; i++) {
      const attr = rawPaintAttrs[i];
      if (attr) {
        paintStates[i] = decodeDominantPaintState(attr);
      }
    }
    return {
      vertices: new Float32Array(rawVertices),
      triangles: new Uint32Array(rawTriangles),
      paintStates,
      subdividedCount: 0,
    };
  }

  let vertCap = Math.max(numRawVerts + subdividedCount * 4, 1024);
  let vertBuf = new Float32Array(vertCap * 3);
  vertBuf.set(rawVertices);
  let vertCount = numRawVerts;

  let triCap = Math.max(numRawTris + subdividedCount * 6, 1024);
  let triBuf = new Uint32Array(triCap * 3);
  let stateBuf = new Uint8Array(triCap);
  let triCount = 0;

  // Flat hash table for edge midpoints (zero string allocations!)
  // Maps undirected edge (minV, maxV) -> midpoint vertex index
  const midpointMap = new Map<number, number>();
  // Multiply minV by 67_108_864 (2^26) so (minV * 2^26 + maxV) is an exact 52-bit integer in JS Number
  const EDGE_KEY_MULT = 67108864;

  function makeEdgeKey(vA: number, vB: number): number {
    const minV = vA < vB ? vA : vB;
    const maxV = vA < vB ? vB : vA;
    return minV * EDGE_KEY_MULT + maxV;
  }

  function getOrAllocateMidpoint(vA: number, vB: number): number {
    const key = makeEdgeKey(vA, vB);
    const existing = midpointMap.get(key);
    if (existing !== undefined) return existing;

    if (vertCount >= vertCap) {
      vertCap *= 2;
      const nextVertBuf = new Float32Array(vertCap * 3);
      nextVertBuf.set(vertBuf);
      vertBuf = nextVertBuf;
    }

    const idxA = vA * 3;
    const idxB = vB * 3;
    const newIdx = vertCount++;
    const outBase = newIdx * 3;
    vertBuf[outBase] = 0.5 * (vertBuf[idxA] + vertBuf[idxB]);
    vertBuf[outBase + 1] = 0.5 * (vertBuf[idxA + 1] + vertBuf[idxB + 1]);
    vertBuf[outBase + 2] = 0.5 * (vertBuf[idxA + 2] + vertBuf[idxB + 2]);

    midpointMap.set(key, newIdx);
    return newIdx;
  }

  function emitTriangle(v0: number, v1: number, v2: number, state: number): void {
    if (triCount >= triCap) {
      triCap *= 2;
      const nextTriBuf = new Uint32Array(triCap * 3);
      nextTriBuf.set(triBuf);
      triBuf = nextTriBuf;

      const nextStateBuf = new Uint8Array(triCap);
      nextStateBuf.set(stateBuf);
      stateBuf = nextStateBuf;
    }
    const base = triCount * 3;
    triBuf[base] = v0;
    triBuf[base + 1] = v1;
    triBuf[base + 2] = v2;
    stateBuf[triCount] = state;
    triCount++;
  }

  for (let t = 0; t < numRawTris; t++) {
    const v0 = rawTriangles[t * 3];
    const v1 = rawTriangles[t * 3 + 1];
    const v2 = rawTriangles[t * 3 + 2];
    const hexStr = rawPaintAttrs[t];

    if (!hexStr || hexStr.length === 0) {
      emitTriangle(v0, v1, v2, 0);
      continue;
    }

    if (!isPaintSubdivided(hexStr)) {
      emitTriangle(v0, v1, v2, decodeDominantPaintState(hexStr));
      continue;
    }

    let pos = hexStr.length - 1;

    const readNibble = (): number => {
      if (pos < 0) return 0;
      const ch = hexStr.charCodeAt(pos--);
      if (ch >= 48 && ch <= 57) return ch - 48;
      if (ch >= 65 && ch <= 70) return ch - 55;
      if (ch >= 97 && ch <= 102) return ch - 87;
      return 0;
    };

    /**
     * Consumes a subtree without creating new vertices if depth exceeds limit,
     * returning the dominant paint state of the consumed subtree.
     */
    const consumeSubtreeState = (): number => {
      const nib = readNibble();
      const splitSides = nib & 0b11;
      const highBits = (nib >> 2) & 0b11;
      if (splitSides === 0) {
        let state = highBits;
        if (state === 3) {
          let extra = readNibble();
          state = 3 + extra;
          while (extra === 15 && pos >= 0) {
            extra = readNibble();
            state += extra;
          }
        }
        return state;
      }
      const numChildren = splitSides + 1;
      let chosenState = 0;
      for (let i = 0; i < numChildren; i++) {
        const childSt = consumeSubtreeState();
        if (childSt > 0) chosenState = childSt;
      }
      return chosenState;
    };

    const subdivideNode = (a: number, b: number, c: number, depth: number): void => {
      const nib = readNibble();
      const splitSides = nib & 0b11;
      const highBits = (nib >> 2) & 0b11;

      if (splitSides === 0) {
        let state = highBits;
        if (state === 3) {
          let extra = readNibble();
          state = 3 + extra;
          while (extra === 15 && pos >= 0) {
            extra = readNibble();
            state += extra;
          }
        }
        emitTriangle(a, b, c, state);
        return;
      }

      if (depth >= 10) {
        // Consume child nibbles cleanly so stream stays aligned, then emit single triangle
        const numChildren = splitSides + 1;
        let domState = 0;
        for (let i = 0; i < numChildren; i++) {
          const st = consumeSubtreeState();
          if (st > 0) domState = st;
        }
        emitTriangle(a, b, c, domState);
        return;
      }

      const specialSide = highBits;
      const triVerts = [a, b, c];
      const u0 = triVerts[specialSide % 3];
      const u1 = triVerts[(specialSide + 1) % 3];
      const u2 = triVerts[(specialSide + 2) % 3];

      if (splitSides === 1) {
        const m12 = getOrAllocateMidpoint(u1, u2);
        subdivideNode(m12, u2, u0, depth + 1);
        subdivideNode(u0, u1, m12, depth + 1);
      } else if (splitSides === 2) {
        const m01 = getOrAllocateMidpoint(u0, u1);
        const m20 = getOrAllocateMidpoint(u2, u0);
        subdivideNode(u1, u2, m20, depth + 1);
        subdivideNode(m01, u1, m20, depth + 1);
        subdivideNode(u0, m01, m20, depth + 1);
      } else {
        const m01 = getOrAllocateMidpoint(u0, u1);
        const m12 = getOrAllocateMidpoint(u1, u2);
        const m20 = getOrAllocateMidpoint(u2, u0);
        subdivideNode(m01, m12, m20, depth + 1);
        subdivideNode(m12, u2, m20, depth + 1);
        subdivideNode(m01, u1, m12, depth + 1);
        subdivideNode(u0, m01, m20, depth + 1);
      }
    };

    subdivideNode(v0, v1, v2, 0);
  }

  // Step 2: Conformal T-Junction Stitching Pass
  // When a subdivided triangle split edge (vA, vB) at midpoint M, any un-split neighbor
  // sharing (vA, vB) must also split across M so there are zero non-manifold hanging vertices!
  if (midpointMap.size > 0) {
    const initialEmitted = triCount;
    triCount = 0; // Reset and re-emit into a clean stitched buffer

    const oldTris = triBuf.slice(0, initialEmitted * 3);
    const oldStates = stateBuf.slice(0, initialEmitted);

    const stitchTriangle = (a: number, b: number, c: number, state: number, depth: number): void => {
      if (depth > 8) {
        emitTriangle(a, b, c, state);
        return;
      }
      const m01 = midpointMap.get(makeEdgeKey(a, b));
      const m12 = midpointMap.get(makeEdgeKey(b, c));
      const m20 = midpointMap.get(makeEdgeKey(c, a));

      if (m01 === undefined && m12 === undefined && m20 === undefined) {
        emitTriangle(a, b, c, state);
        return;
      }

      if (m01 !== undefined && m12 !== undefined && m20 !== undefined) {
        stitchTriangle(a, m01, m20, state, depth + 1);
        stitchTriangle(m01, b, m12, state, depth + 1);
        stitchTriangle(m12, c, m20, state, depth + 1);
        stitchTriangle(m01, m12, m20, state, depth + 1);
      } else if (m01 !== undefined && m12 === undefined && m20 === undefined) {
        stitchTriangle(a, m01, c, state, depth + 1);
        stitchTriangle(m01, b, c, state, depth + 1);
      } else if (m12 !== undefined && m01 === undefined && m20 === undefined) {
        stitchTriangle(a, b, m12, state, depth + 1);
        stitchTriangle(m12, c, a, state, depth + 1);
      } else if (m20 !== undefined && m01 === undefined && m12 === undefined) {
        stitchTriangle(a, b, m20, state, depth + 1);
        stitchTriangle(b, c, m20, state, depth + 1);
      } else if (m01 !== undefined && m20 !== undefined) {
        stitchTriangle(a, m01, m20, state, depth + 1);
        stitchTriangle(m01, b, m20, state, depth + 1);
        stitchTriangle(b, c, m20, state, depth + 1);
      } else if (m01 !== undefined && m12 !== undefined) {
        stitchTriangle(b, m12, m01, state, depth + 1);
        stitchTriangle(m12, c, m01, state, depth + 1);
        stitchTriangle(c, a, m01, state, depth + 1);
      } else if (m12 !== undefined && m20 !== undefined) {
        stitchTriangle(c, m20, m12, state, depth + 1);
        stitchTriangle(m20, a, m12, state, depth + 1);
        stitchTriangle(a, b, m12, state, depth + 1);
      }
    };

    for (let t = 0; t < initialEmitted; t++) {
      stitchTriangle(
        oldTris[t * 3],
        oldTris[t * 3 + 1],
        oldTris[t * 3 + 2],
        oldStates[t],
        0
      );
    }
  }

  return {
    vertices: vertBuf.subarray(0, vertCount * 3),
    triangles: triBuf.subarray(0, triCount * 3),
    paintStates: stateBuf.subarray(0, triCount),
    subdividedCount,
  };
}
