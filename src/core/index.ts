export {
  parse3MFArchive,
  exportSimplified3MF,
  exportCut3MF,
  exportCutPart3MF,
} from './threeMfProcessor';

export {
  encodePaintState,
  decodeDominantPaintState,
  isPaintSubdivided,
  expandPaintedMesh,
} from './paintColorCodec';

export {
  simplifyPaintedMesh,
} from './qemSimplifier';

export {
  cutPaintedMesh,
} from './meshCutter';

export type {
  FilamentInfo,
  ParsedMeshObject,
  Parsed3MFArchive,
  SimplificationOptions,
  SimplifiedMeshResult,
  SimplificationStats,
  CutConnectorOptions,
  CutPlaneOptions,
  CutPartMesh,
  CutMeshResult,
} from './types';
