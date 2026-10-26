# Prism3MF

**Color-Preserving 3MF Mesh Simplifier for Multi-Color 3D Printing**

**Prism3MF** is a fast, 100% client-side web application and TypeScript SDK that decimates ultra-high-poly `.3mf` models (from platforms like **MakerWorld**, **Printables**, **Bambu Studio**, **OrcaSlicer**, and **PrusaSlicer**) while keeping all multi-color filament paint zones (`paint_color` / `slic3rpe:mmu_segmentation`) razor-sharp.

---

## Why Prism3MF?

High-resolution sculpted models on MakerWorld frequently contain **1,000,000 to 2,000,000+ triangles** and approach **200 MB+**.
- Opening or slicing these massive `.3mf` files in desktop or web-based slicers causes severe lag, high RAM consumption, or crashes.
- Standard mesh simplification tools (Blender, MeshLab, CAD decimators) strip out Bambu Studio / OrcaSlicer / PrusaSlicer's proprietary per-triangle `paint_color` and `slic3rpe:mmu_segmentation` attributes, destroying hours of multi-color AMS/MMU painting work.

**Prism3MF solves this:**
1. **Nibble-Packed Paint Tree Codec (`TriangleSelector` compatible):** Decodes and re-encodes Bambu Studio, OrcaSlicer, and PrusaSlicer hex paint trees (`paint_color` and `slic3rpe:mmu_segmentation`), including multi-extruder slots (1–16+) and recursive triangle subdivisions with conformal T-junction stitching.
2. **Color-Boundary-Locked QEM Decimation:** Uses Garland–Heckbert Quadric Error Metrics (QEM) with perpendicular constraint planes and topological locks along multi-color boundaries. Flat monochromatic regions are aggressively simplified (e.g. 75%–90% reduction), while color seams (eyes, logos, stripes, text) remain locked in place without bleeding.
3. **Scales to 2M+ Triangles in the Browser:** Built with zero-string-allocation spatial hashing, flat `TypedArray` quadrics, and chunked UTF-8 byte streaming inside a Web Worker so 180 MB+ `.3mf` archives parse, simplify, and re-package without freezing the UI or hitting V8 string limits.
4. **Full 3MF Archive Preservation:** Preserves all non-mesh files in the `.3mf` ZIP container (print profiles, `project_settings.config` filament colors, `model_settings.config`, build plate transforms, and thumbnails) so the exported `.3mf` opens directly in Bambu Studio, OrcaSlicer, or PrusaSlicer ready to slice.

---

## Features

- **Interactive 3D Build-Plate Viewport:** Preview Simplified, Original, or Side-by-Side Before/After Split views with Z-up slicer coordinates.
- **Color Seam Inspector:** Highlight locked multi-color boundary edges in cyan and toggle wireframe overlays to inspect mesh topology.
- **Live AMS Filament Palette:** Automatically reads filament hex colors and types from `Metadata/project_settings.config` and lets you preview custom filament tints in real time.
- **Zero-Dependency Core Engine (`src/core`):** Easily embeddable into web slicers, print-farm pipelines, or Node.js/CLI scripts.

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

## Using the Core SDK in Your Own Slicer or Pipeline

The core engine lives in [`src/core/`](./src/core) and has zero React or DOM dependencies:

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
| `src/core/paintColorCodec.ts` | Decoder/encoder for Bambu Studio, OrcaSlicer & PrusaSlicer `paint_color` / `mmu_segmentation` nibble-packed subdivision trees + T-junction stitcher. |
| `src/core/qemSimplifier.ts` | Color-aware Quadric Error Metrics (QEM) mesh simplifier with spatial-hash vertex welding, Hoppe link-condition checks, and color-seam locking. |
| `src/core/threeMfProcessor.ts` | Streaming `.3mf` ZIP parser and chunked UTF-8 byte exporter (handles multi-object `3D/Objects/*.model` files and `Metadata/*.config`). |
| `src/workers/simplifier.worker.ts` | Web Worker offloading 3MF parsing, QEM simplification, and ZIP packaging off the main thread. |
| `src/components/ThreeViewport.tsx` | Three.js Z-up build-plate viewport with flat per-triangle filament shading, wireframe, and color-seam inspection. |

---

## License

MIT License — see [LICENSE](./LICENSE).
