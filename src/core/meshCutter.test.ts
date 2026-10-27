import { describe, it, expect } from 'vitest';
import { cutPaintedMesh } from './meshCutter';
import { parse3MFArchive, exportCut3MF, exportCutPart3MF } from './threeMfProcessor';
import { generateSample3MF } from './sample3mfGenerator';

describe('Color-Preserving Cut Splitter (cutPaintedMesh)', () => {
  it('cleanly cuts a painted box into Part A and Part B while keeping color attributes', () => {
    // Construct a simple 1x1x2 box centered at (0,0,1), extending Z from 0 to 2
    // Bottom 4 vertices at Z = 0, top 4 vertices at Z = 2
    const vertices = new Float32Array([
      // Bottom z=0
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1,  1, 0,
      // Top z=2
      -1, -1, 2,
       1, -1, 2,
       1,  1, 2,
      -1,  1, 2,
    ]);

    // 12 triangles (2 per box face)
    const triangles = new Uint32Array([
      // Bottom (z=0)
      0, 2, 1,  0, 3, 2,
      // Top (z=2)
      4, 5, 6,  4, 6, 7,
      // Front (y=-1)
      0, 1, 5,  0, 5, 4,
      // Right (x=1)
      1, 2, 6,  1, 6, 5,
      // Back (y=1)
      2, 3, 7,  2, 7, 6,
      // Left (x=-1)
      3, 0, 4,  3, 4, 7,
    ]);

    // Distinct paint states per face
    const paintStates = new Uint8Array([
      1, 1, // Bottom = 1
      2, 2, // Top = 2
      3, 3, // Front = 3
      4, 4, // Right = 4
      3, 3, // Back = 3
      4, 4, // Left = 4
    ]);

    // Cut at Z = 1.0 (halfway through the box)
    const result = cutPaintedMesh(vertices, triangles, paintStates, {
      planePoint: [0, 0, 1.0],
      planeNormal: [0, 0, 1.0],
      capFaces: true,
      capPaintSlot: 1,
    });

    expect(result.partA.triangleCount).toBeGreaterThan(0);
    expect(result.partB.triangleCount).toBeGreaterThan(0);

    // Verify bounds
    expect(result.partA.bounds.min[2]).toBeCloseTo(1.0, 3);
    expect(result.partA.bounds.max[2]).toBeCloseTo(2.0, 3);
    expect(result.partB.bounds.min[2]).toBeCloseTo(0.0, 3);
    expect(result.partB.bounds.max[2]).toBeCloseTo(1.0, 3);

    // Verify cross section area: Box is 2x2 = 4.0
    expect(result.crossSectionArea).toBeCloseTo(4.0, 2);

    // Verify paint colors are preserved on Part A (Top=2, Side walls=3 and 4)
    const paintSetA = new Set(result.partA.paintStates);
    expect(paintSetA.has(2)).toBe(true); // Top face
    expect(paintSetA.has(3)).toBe(true); // Front/Back wall
    expect(paintSetA.has(4)).toBe(true); // Left/Right wall

    // Verify paint colors are preserved on Part B (Bottom=1, Side walls=3 and 4)
    const paintSetB = new Set(result.partB.paintStates);
    expect(paintSetB.has(1)).toBe(true); // Bottom face
    expect(paintSetB.has(3)).toBe(true);
    expect(paintSetB.has(4)).toBe(true);
  });

  it('generates alignment dowel sockets and printable pin on cut faces', () => {
    // 20x20x40 box centered at Z from 0 to 40
    const vertices = new Float32Array([
      -10, -10, 0,
       10, -10, 0,
       10,  10, 0,
      -10,  10, 0,
      -10, -10, 40,
       10, -10, 40,
       10,  10, 40,
      -10,  10, 40,
    ]);

    const triangles = new Uint32Array([
      0, 2, 1,  0, 3, 2,
      4, 5, 6,  4, 6, 7,
      0, 1, 5,  0, 5, 4,
      1, 2, 6,  1, 6, 5,
      2, 3, 7,  2, 7, 6,
      3, 0, 4,  3, 4, 7,
    ]);

    const paintStates = new Uint8Array(12).fill(1);

    const result = cutPaintedMesh(vertices, triangles, paintStates, {
      planePoint: [0, 0, 20],
      planeNormal: [0, 0, 1],
      capFaces: true,
      capPaintSlot: 1,
      connectors: {
        enabled: true,
        style: 'dowel_sockets',
        diameter: 6.0,
        length: 10.0,
        tolerance: 0.2,
      },
    });

    expect(result.connectorsCount).toBe(1);
    expect(result.dowelPin).toBeDefined();
    if (result.dowelPin) {
      expect(result.dowelPin.triangleCount).toBeGreaterThan(20);
      // Diameter is 6.0 - 2 * 0.2 = 5.6 -> radius 2.8
      expect(result.dowelPin.bounds.max[0] - result.dowelPin.bounds.min[0]).toBeCloseTo(5.6, 1);
      // Length is 10.0
      expect(result.dowelPin.bounds.max[2] - result.dowelPin.bounds.min[2]).toBeCloseTo(10.0, 1);
    }
  });

  it('cuts a complex 4-color 3MF figurine model while retaining all colors', () => {
    const buffer = generateSample3MF();
    const archive = parse3MFArchive(buffer, 'figurine.3mf');
    const mesh = archive.meshes[0];

    // Mesh is approx 0 to 65mm in Z. Cut at exact ring coordinate Z = 28.0
    const cutZ = 28.0;

    const result = cutPaintedMesh(
      mesh.expandedVertices,
      mesh.expandedTriangles,
      mesh.expandedPaintStates,
      {
        planePoint: [0, 0, cutZ],
        planeNormal: [0, 0, 1],
        capFaces: true,
        capPaintSlot: 1,
        connectors: {
          enabled: true,
          style: 'dowel_sockets',
          diameter: 5.0,
          length: 8.0,
          tolerance: 0.2,
        },
      }
    );

    expect(result.partA.triangleCount).toBeGreaterThan(1000);
    expect(result.partB.triangleCount).toBeGreaterThan(1000);

    // Verify height split
    expect(result.partA.bounds.min[2]).toBeCloseTo(cutZ, 1);
    expect(result.partB.bounds.max[2]).toBeCloseTo(cutZ, 1);

    // Verify multiple filament colors exist in Part A (head/ears/eyes)
    const setA = new Set(result.partA.paintStates);
    expect(setA.size).toBeGreaterThanOrEqual(2);

    // Verify multiple filament colors exist in Part B (belly/base)
    const setB = new Set(result.partB.paintStates);
    expect(setB.size).toBeGreaterThanOrEqual(2);

    // Verify cross section area is positive and realistic
    expect(result.crossSectionArea).toBeGreaterThan(500); // Figurine radius ~28mm -> area ~2400 mm^2
    expect(result.connectorsCount).toBeGreaterThanOrEqual(1);
    expect(result.processingTimeMs).toBeLessThan(1000); // Super fast
  });

  it('exports cut parts into a valid multi-object 3MF archive with full color roundtrip', () => {
    const buffer = generateSample3MF();
    const originalArchive = parse3MFArchive(buffer, 'figurine.3mf');
    const mesh = originalArchive.meshes[0];

    const cutResult = cutPaintedMesh(
      mesh.expandedVertices,
      mesh.expandedTriangles,
      mesh.expandedPaintStates,
      {
        planePoint: [0, 0, 25.0],
        planeNormal: [0, 0, 1],
        capFaces: true,
        capPaintSlot: 1,
        connectors: {
          enabled: true,
          style: 'dowel_sockets',
          diameter: 5.0,
          length: 8.0,
          tolerance: 0.2,
        },
      }
    );

    // Export both parts into a single multi-object 3MF
    const cut3mfBytes = exportCut3MF(originalArchive, cutResult);
    expect(cut3mfBytes.byteLength).toBeGreaterThan(1000);

    // Parse it back to verify Bambu/OrcaSlicer compatibility
    const reloadedArchive = parse3MFArchive(cut3mfBytes.buffer, 'cut_model.3mf');
    // Should have Part A, Part B, and Dowel Pin
    expect(reloadedArchive.meshes.length).toBe(3);

    const reloadedNames = reloadedArchive.meshes.map((m) => m.name);
    expect(reloadedNames).toContain('Part_A_Upper');
    expect(reloadedNames).toContain('Part_B_Lower');
    expect(reloadedNames).toContain('Dowel_Pin');

    // Verify filament palette was preserved from project_settings
    expect(reloadedArchive.filaments.length).toBe(originalArchive.filaments.length);

    // Test single-part standalone export
    const singlePartBytes = exportCutPart3MF(originalArchive, cutResult.partA);
    const reloadedSingle = parse3MFArchive(singlePartBytes.buffer, 'part_a.3mf');
    expect(reloadedSingle.meshes.length).toBe(1);
    expect(reloadedSingle.meshes[0].name).toBe('Part_A_Upper');
  });
});
