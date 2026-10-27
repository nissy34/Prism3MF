export interface FilamentInfo {
  /** 1-based filament/extruder index (1 = first AMS slot, etc.) */
  id: number;
  /** Hex color string e.g. "#FF4500" */
  color: string;
  /** Optional filament type e.g. "PLA", "PETG" */
  type?: string;
  /** Optional human-readable name */
  name?: string;
}

export interface ParsedMeshObject {
  /** Path to the .model XML inside the 3MF archive (e.g. "3D/3dmodel.model" or "3D/Objects/object_1.model") */
  modelPath: string;
  /** Object ID attribute in XML `<object id="...">` */
  objectId: string;
  /** Optional object name from XML or model_settings.config */
  name: string;
  /** Default 1-based extruder assigned to this object/part in model_settings.config (default 1) */
  defaultExtruder: number;
  /** Raw un-subdivided vertex coordinates [x0, y0, z0, x1, y1, z1, ...] */
  rawVertices: Float32Array;
  /** Raw un-subdivided triangle indices [v1, v2, v3, ...] */
  rawTriangles: Uint32Array;
  /** Per-triangle raw paint_color / mmu_segmentation attribute string (empty string if unpainted) */
  rawPaintAttrs: string[];
  /** Which attribute name was used in the source XML ('paint_color' | 'slic3rpe:mmu_segmentation') */
  paintAttrName: 'paint_color' | 'slic3rpe:mmu_segmentation';
  /** Number of triangles that had recursive subdivision trees in paint_color */
  subdividedTriangleCount: number;
  /** Expanded geometry where painted subdivision trees are resolved into actual leaf triangles */
  expandedVertices: Float32Array;
  expandedTriangles: Uint32Array;
  /** Per-leaf-triangle state (0 = unpainted/defaultExtruder, 1..N = painted filament slot) */
  expandedPaintStates: Uint8Array;
  /** Optional 4x4 column-major world transform for previewing multi-part assemblies */
  transform?: number[];
}

export interface Parsed3MFArchive {
  fileName: string;
  fileSize: number;
  /** Raw ZIP entries mapped by path */
  files: Record<string, Uint8Array>;
  /** Extracted filament palette */
  filaments: FilamentInfo[];
  /** All mesh objects containing geometry in the 3MF */
  meshes: ParsedMeshObject[];
  /** Total raw triangles across all meshes */
  totalRawTriangles: number;
  /** Total expanded triangles (after resolving paint subdivision trees) */
  totalExpandedTriangles: number;
  /** Total painted triangles count */
  totalPaintedTriangles: number;
}

export interface SimplificationOptions {
  /** Target triangle ratio (0.02 to 1.0, e.g. 0.25 = keep 25% of triangles) */
  targetRatio: number;
  /** Optional explicit max triangle count override */
  targetTriangleCount?: number;
  /** Protect paint color boundaries from drifting/bleeding */
  lockColorBoundaries: boolean;
  /** Penalty multiplier for edges separating two different paint colors (10 to 10000, or Infinity to lock completely) */
  colorBoundaryWeight: number;
  /** Resolve subdivided paint trees into real geometry before simplifying so fine brush strokes aren't lost */
  resolveSubdivisions: boolean;
  /** Maximum geometric error tolerance (as fraction of bounding box diagonal, e.g. 0.01) */
  maxGeometricError: number;
  /** Preserve UV/open mesh borders */
  lockOpenBorders: boolean;
}

export interface SimplifiedMeshResult {
  modelPath: string;
  objectId: string;
  vertices: Float32Array;
  triangles: Uint32Array;
  /** Per-triangle paint state (0 = unpainted/default, 1..N = painted extruder slot) */
  paintStates: Uint8Array;
  originalRawTriangles: number;
  originalExpandedTriangles: number;
  simplifiedTriangles: number;
}

export interface SimplificationStats {
  originalRawTriangles: number;
  originalExpandedTriangles: number;
  simplifiedTriangles: number;
  reductionPercentage: number;
  processingTimeMs: number;
  preservedColorZones: number;
}

export interface CutConnectorOptions {
  enabled: boolean;
  /** 'dowel_sockets' = socket in both Part A and B + separate printable dowel pin
   *  'integrated_pin' = pin on Part A, socket on Part B
   *  'none' = smooth flat cut surface
   */
  style: 'dowel_sockets' | 'integrated_pin' | 'none';
  /** Diameter of connector socket/pin in mm (default 5.0) */
  diameter: number;
  /** Length/depth of connector pin in mm (default 8.0) */
  length: number;
  /** Fit clearance tolerance in mm (default 0.2) */
  tolerance: number;
}

export interface CutPlaneOptions {
  /** A 3D point on the cut plane [px, py, pz] */
  planePoint: [number, number, number];
  /** Normal vector [nx, ny, nz] pointing toward Part A (default: [0, 0, 1]) */
  planeNormal: [number, number, number];
  /** Whether to seal/cap the cut cross-section with watertight faces (default: true) */
  capFaces?: boolean;
  /** Filament slot (1..N) to assign to cap faces (default: 1) */
  capPaintSlot?: number;
  /** Optional alignment connector options */
  connectors?: CutConnectorOptions;
}

export interface CutPartMesh {
  name: string;
  vertices: Float32Array;
  triangles: Uint32Array;
  paintStates: Uint8Array;
  triangleCount: number;
  originalTriangleCount?: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface CutMeshResult {
  partA: CutPartMesh;
  partB: CutPartMesh;
  dowelPin?: CutPartMesh;
  originalPartA?: CutPartMesh;
  originalPartB?: CutPartMesh;
  isSimplified?: boolean;
  crossSectionArea: number;
  cutLoopsCount: number;
  connectorsCount: number;
  processingTimeMs: number;
}
