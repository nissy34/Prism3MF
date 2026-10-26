export {
  parse3MFArchive,
  exportSimplified3MF,
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

export type {
  FilamentInfo,
  ParsedMeshObject,
  Parsed3MFArchive,
  SimplificationOptions,
  SimplifiedMeshResult,
  SimplificationStats,
} from './types';
