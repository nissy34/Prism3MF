import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  encodePaintState,
  decodeDominantPaintState,
  isPaintSubdivided,
  expandPaintedMesh,
} from './paintColorCodec';
import { simplifyPaintedMesh } from './qemSimplifier';
import {
  parse3MFArchive,
  exportSimplified3MF,
} from './threeMfProcessor';
import { generateSample3MF } from './sample3mfGenerator';

describe('3MF Paint Color Codec', () => {
  it('accurately encodes and decodes filament slots 1..16', () => {
    expect(encodePaintState(0)).toBe('');
    expect(encodePaintState(1)).toBe('4');
    expect(encodePaintState(2)).toBe('8');
    expect(encodePaintState(3)).toBe('0C');
    expect(encodePaintState(4)).toBe('1C');
    expect(encodePaintState(8)).toBe('5C');
    expect(encodePaintState(16)).toBe('DC');

    for (let slot = 1; slot <= 16; slot++) {
      const hex = encodePaintState(slot);
      expect(isPaintSubdivided(hex)).toBe(false);
      expect(decodeDominantPaintState(hex)).toBe(slot);
    }
  });

  it('expands recursive subdivided paint_color trees into exact sub-triangles', () => {
    const rawVerts = new Float32Array([
      0, 0, 0,
      10, 0, 0,
      0, 10, 0,
    ]);
    const rawTris = new Uint32Array([0, 1, 2]);
    // Root nibble '3' (split_sides=3 -> 4 children), children states: '4' (slot 1), '8' (slot 2), '0C' (slot 3), '1C' (slot 4)
    const rawAttrs = ['1C0C843'];

    const expanded = expandPaintedMesh(rawVerts, rawTris, rawAttrs);
    expect(expanded.subdividedCount).toBe(1);
    // 1 triangle split with case 3 produces 4 child triangles and 6 vertices (3 original + 3 midpoints)
    expect(expanded.triangles.length / 3).toBe(4);
    expect(expanded.vertices.length / 3).toBe(6);
    expect(Array.from(expanded.paintStates)).toEqual([1, 2, 3, 4]);
  });

  it('stitches T-junctions between a subdivided painted triangle and an unsubdivided neighbor', () => {
    // Two triangles sharing edge (1, 2):
    // T0 = (0, 1, 2) subdivided on all 3 sides (root nibble '3')
    // T1 = (2, 1, 3) un-subdivided, painted with slot 2 ('8')
    const rawVerts = new Float32Array([
      0, 0, 0,   // v0
      10, 0, 0,  // v1
      0, 10, 0,  // v2
      10, 10, 0, // v3
    ]);
    const rawTris = new Uint32Array([
      0, 1, 2,
      2, 1, 3,
    ]);
    const rawAttrs = ['1C0C843', '8'];

    const expanded = expandPaintedMesh(rawVerts, rawTris, rawAttrs);
    // T0 splits into 4 triangles; T1 shares edge (1, 2) which has a midpoint allocated,
    // so T1 must be stitched into 2 triangles (total = 6 triangles, zero T-junctions!)
    expect(expanded.triangles.length / 3).toBe(6);
  });

  it('decodes dominant paint state accurately when unpainted area dominates', () => {
    // 4-child split ('3') where 3 children are unpainted ('0') and 1 child is slot 1 ('4')
    expect(decodeDominantPaintState('00043')).toBe(0);
    // 4-child split ('3') where 3 children are slot 2 ('8') and 1 child is unpainted ('0')
    expect(decodeDominantPaintState('88803')).toBe(2);
  });
});

describe('Color-Preserving QEM Simplifier & 3MF Roundtrip', () => {
  it('simplifies a painted 3MF while preserving all color zones and metadata', () => {
    const sampleBuffer = generateSample3MF();
    const archive = parse3MFArchive(sampleBuffer, 'sample.3mf');

    expect(archive.meshes.length).toBe(1);
    expect(archive.filaments.length).toBe(4);
    expect(archive.totalRawTriangles).toBeGreaterThan(15000);
    expect(archive.totalExpandedTriangles).toBeGreaterThan(archive.totalRawTriangles);

    const mesh = archive.meshes[0];
    const decimated = simplifyPaintedMesh(
      mesh.expandedVertices,
      mesh.expandedTriangles,
      mesh.expandedPaintStates,
      {
        targetRatio: 0.25,
        lockColorBoundaries: true,
        colorBoundaryWeight: 500,
        resolveSubdivisions: true,
        maxGeometricError: 0.05,
        lockOpenBorders: true,
      }
    );

    const outTriCount = decimated.triangles.length / 3;
    expect(outTriCount).toBeLessThan(mesh.expandedTriangles.length / 3 * 0.4);
    expect(outTriCount).toBeGreaterThan(1000);

    // Ensure all 4 painted filament slots are still present after simplification
    const survivingSlots = new Set<number>();
    for (let i = 0; i < decimated.paintStates.length; i++) {
      survivingSlots.add(decimated.paintStates[i]);
    }
    expect(survivingSlots.has(2)).toBe(true); // White eyes/belly
    expect(survivingSlots.has(3)).toBe(true); // Black pupils
    expect(survivingSlots.has(4)).toBe(true); // Orange crest/band

    // Export back to .3mf and re-parse to verify valid OrcaSlicer 3MF archive
    const exportedBytes = exportSimplified3MF(archive, [
      {
        modelPath: mesh.modelPath,
        objectId: mesh.objectId,
        vertices: decimated.vertices,
        triangles: decimated.triangles,
        paintStates: decimated.paintStates,
        originalRawTriangles: mesh.rawTriangles.length / 3,
        originalExpandedTriangles: mesh.expandedTriangles.length / 3,
        simplifiedTriangles: outTriCount,
      },
    ]);

    const reparsed = parse3MFArchive(
      exportedBytes.buffer.slice(
        exportedBytes.byteOffset,
        exportedBytes.byteOffset + exportedBytes.byteLength
      ) as ArrayBuffer,
      'exported.3mf'
    );

    expect(reparsed.totalRawTriangles).toBe(outTriCount);
    expect(reparsed.filaments.length).toBe(4);
  });

  it('parses, simplifies, and exports a large external .3mf file when PRISM3MF_LARGE_TEST_FILE is set', () => {
    const testFilePath = process.env.PRISM3MF_LARGE_TEST_FILE || '';
    if (!testFilePath || !fs.existsSync(testFilePath)) return;

    const rawBuf = fs.readFileSync(testFilePath);
    const ab = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) as ArrayBuffer;

    const parsed = parse3MFArchive(ab, 'large_model.3mf');
    expect(parsed.totalRawTriangles).toBeGreaterThan(100000);
    expect(parsed.meshes.length).toBeGreaterThan(0);

    const mesh = parsed.meshes[0];
    const decimated = simplifyPaintedMesh(
      mesh.expandedVertices,
      mesh.expandedTriangles,
      mesh.expandedPaintStates,
      {
        targetRatio: 0.25,
        lockColorBoundaries: true,
        colorBoundaryWeight: 500,
        resolveSubdivisions: true,
        maxGeometricError: 0.02,
        lockOpenBorders: true,
      }
    );

    const simplifiedTriCount = decimated.triangles.length / 3;
    expect(simplifiedTriCount).toBeLessThan(mesh.expandedTriangles.length / 3);
    expect(simplifiedTriCount).toBeGreaterThan(1000);

    // Export back to .3mf bytes (must not throw Invalid string length!)
    const exportedZip = exportSimplified3MF(parsed, [
      {
        modelPath: mesh.modelPath,
        objectId: mesh.objectId,
        vertices: decimated.vertices,
        triangles: decimated.triangles,
        paintStates: decimated.paintStates,
        originalRawTriangles: mesh.rawTriangles.length / 3,
        originalExpandedTriangles: mesh.expandedTriangles.length / 3,
        simplifiedTriangles: simplifiedTriCount,
      },
    ]);

    expect(exportedZip.byteLength).toBeGreaterThan(1000);
    expect(exportedZip.byteLength).toBeLessThan(rawBuf.byteLength);
  }, 60000);
});
