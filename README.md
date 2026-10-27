# Prism3MF

**The Multi-Color 3MF Studio for 3D Printing (Bambu Studio, OrcaSlicer, PrusaSlicer)**

**Prism3MF** is a fast, 100% client-side web application and TypeScript SDK designed specifically for multi-color 3D printing (AMS / MMU). It decimates ultra-high-poly `.3mf` models while keeping multi-color paint zones razor-sharp, and cuts oversized models to fit smaller build plates with watertight caps and alignment dowel connectors.

---

## Capabilities

### 1. ✂️ Color-Preserving Planar Cut Splitter (Fit to Build Plate)
- **Cut along arbitrary planes (Z-height, X, Y):** Easily divide large models (e.g. 250mm+ helmets, figurines) to fit smaller print beds like the **Bambu Lab A1 Mini (180mm)** or **Prusa MK4 / Core One**.
- **100% Color Preservation:** Exterior triangles on Part A and Part B inherit the exact filament assignments from the parent model down to the cut line.
- **Watertight Manifold Capping:** Slices are stitched into closed 2D loops and triangulated with polygon ear-clipping to create solid, watertight flat surfaces.
- **Alignment Dowel Sockets & Companion Pins:** Automatically creates matching cylindrical sockets on cut surfaces with configurable press-fit tolerance (e.g. 0.2mm) and generates a printable companion dowel pin for rock-solid mechanical assembly.
- **Plate-Ready Multi-Object Export:** Exports both parts side-by-side on the build plate in a single `.3mf` archive or as individual part archives ready to slice.

### 2. ⚡ Color-Boundary-Locked QEM Simplifier
- **Nibble-Packed Paint Tree Codec (`TriangleSelector` compatible):** Decodes and re-encodes Bambu Studio, OrcaSlicer, and PrusaSlicer hex paint trees (`paint_color` and `slic3rpe:mmu_segmentation`), including multi-extruder slots (1–16+) and recursive triangle subdivisions with conformal T-junction stitching.
- **Color-Boundary-Locked QEM Decimation:** Uses Garland–Heckbert Quadric Error Metrics (QEM) with perpendicular constraint planes and topological locks along multi-color boundaries. Flat monochromatic regions are aggressively simplified (e.g. 75%–90% reduction), while color seams (eyes, logos, stripes, text) remain locked in place without bleeding.
- **Scales to 2M+ Triangles in the Browser:** Built with zero-string-allocation spatial hashing, flat `TypedArray` quadrics, and chunked UTF-8 byte streaming inside a Web Worker so 180 MB+ `.3mf` archives parse, simplify, and re-package without freezing the UI or hitting V8 string limits.
- **Full 3MF Archive Preservation:** Preserves all non-mesh files in the `.3mf` ZIP container (print profiles, `project_settings.config` filament colors, `model_settings.config`, build plate transforms, and thumbnails).

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Run the automated test suite (Vitest)
npm test

# Build for production
npm run build
```

---

## Programmatic Core SDK

The core geometry engine lives in [`src/core/`](./src/core) with zero React or DOM dependencies:

### Slicing a Painted 3MF Model with Alignment Connectors

```ts
import {
  parse3MFArchive,
  cutPaintedMesh,
  exportCut3MF,
} from './src/core';

export function split3MFAtHeight(
  inputBuffer: ArrayBuffer,
  cutZ: number
): Uint8Array {
  const archive = parse3MFArchive(inputBuffer, 'model.3mf');
  const mesh = archive.meshes[0];

  const cutResult = cutPaintedMesh(
    mesh.expandedVertices,
    mesh.expandedTriangles,
    mesh.expandedPaintStates,
    {
      planePoint: [0, 0, cutZ],
      planeNormal: [0, 0, 1], // Horizontal Z cut
      capFaces: true,         // Watertight flat face
      capPaintSlot: 1,        // Extruder for cut cap
      connectors: {
        enabled: true,
        style: 'dowel_sockets',
        diameter: 5.0,        // 5mm diameter
        length: 8.0,          // 8mm pin (4mm socket depth per half)
        tolerance: 0.2,       // 0.2mm FDM press-fit clearance
      },
    }
  );

  // Exports a multi-object 3MF with Part A, Part B, and Dowel Pin side-by-side on the build plate
  return exportCut3MF(archive, cutResult);
}
```

### Simplifying a Painted 3MF Model

```ts
import {
  parse3MFArchive,
  simplifyPaintedMesh,
  exportSimplified3MF,
} from './src/core';

export function simplify3MFBuffer(
  inputBuffer: ArrayBuffer,
  targetRatio = 0.25
): Uint8Array {
  const archive = parse3MFArchive(inputBuffer, 'model.3mf');

  const simplifiedMeshes = archive.meshes.map((mesh) => {
    const decimated = simplifyPaintedMesh(
      mesh.expandedVertices,
      mesh.expandedTriangles,
      mesh.expandedPaintStates,
      {
        targetRatio,
        lockColorBoundaries: true,
        colorBoundaryWeight: 500,
        resolveSubdivisions: true,
        maxGeometricError: 0.02,
        lockOpenBorders: true,
      }
    );

    return {
      modelPath: mesh.modelPath,
      objectId: mesh.objectId,
      vertices: decimated.vertices,
      triangles: decimated.triangles,
      paintStates: decimated.paintStates,
      originalRawTriangles: mesh.rawTriangles.length / 3,
      originalExpandedTriangles: mesh.expandedTriangles.length / 3,
      simplifiedTriangles: decimated.triangles.length / 3,
    };
  });

  return exportSimplified3MF(archive, simplifiedMeshes);
}
```

---

## Architecture

| File | Description |
| :--- | :--- |
| `src/core/meshCutter.ts` | Arbitrary planar slicing engine with color propagation, 2D contour stitching, watertight cap polygon triangulation, and FDM dowel connector generation. |
| `src/core/paintColorCodec.ts` | Decoder/encoder for Bambu Studio, OrcaSlicer & PrusaSlicer `paint_color` / `mmu_segmentation` nibble-packed subdivision trees + T-junction stitcher. |
| `src/core/qemSimplifier.ts` | Color-aware Quadric Error Metrics (QEM) mesh simplifier with spatial-hash vertex welding, Hoppe link-condition checks, and color-seam locking. |
| `src/core/threeMfProcessor.ts` | Streaming `.3mf` ZIP parser and chunked UTF-8 byte exporter (handles multi-object assemblies, cut parts, and config files). |
| `src/workers/simplifier.worker.ts` | Web Worker offloading 3MF parsing, QEM simplification, planar cutting, and ZIP packaging off the main thread. |
| `src/components/ThreeViewport.tsx` | Three.js Z-up build-plate viewport with interactive cutting plane laser visualizer, exploded view slider, and per-triangle filament shading. |
| `src/components/CutSplitterControlCard.tsx` | UI controls for cut height, bed presets (A1 Mini 180mm, X1/P1 256mm), dowel pin dimensions, exploded separation, and part exports. |

---

## License

MIT License — see [LICENSE](./LICENSE).
