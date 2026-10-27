import { simplifyPaintedMesh } from '../core/qemSimplifier';
import { decodeDominantPaintState } from '../core/paintColorCodec';
import {
  parse3MFArchive,
  exportSimplified3MF,
  exportCut3MF,
  exportCutPart3MF,
} from '../core/threeMfProcessor';
import { cutPaintedMesh } from '../core/meshCutter';
import {
  FilamentInfo,
  Parsed3MFArchive,
  SimplificationOptions,
  SimplifiedMeshResult,
  CutPlaneOptions,
  CutMeshResult,
  CutPartMesh,
} from '../core/types';

export interface LightweightMeshInfo {
  modelPath: string;
  objectId: string;
  name: string;
  defaultExtruder: number;
  rawTriangleCount: number;
  expandedTriangleCount: number;
  subdividedTriangleCount: number;
  expandedVertices: Float32Array;
  expandedTriangles: Uint32Array;
  expandedPaintStates: Uint8Array;
}

export type WorkerRequestMessage =
  | {
      type: 'LOAD_ONLY';
      jobId: number;
      buffer: ArrayBuffer;
      fileName: string;
    }
  | {
      type: 'LOAD_AND_SIMPLIFY';
      jobId: number;
      buffer: ArrayBuffer;
      fileName: string;
      options: SimplificationOptions;
    }
  | {
      type: 'SIMPLIFY';
      jobId: number;
      options: SimplificationOptions;
    }
  | {
      type: 'CUT';
      jobId: number;
      options: CutPlaneOptions;
      useSimplifiedIfAvailable?: boolean;
    }
  | {
      type: 'EXPORT';
      jobId: number;
    }
  | {
      type: 'EXPORT_CUT';
      jobId: number;
      partType: 'all' | 'partA' | 'partB' | 'dowel';
    };

export type WorkerResponseMessage =
  | {
      type: 'STAGE';
      jobId: number;
      stage: string;
      percent: number;
    }
  | {
      type: 'LOADED';
      jobId: number;
      fileName: string;
      fileSize: number;
      filaments: FilamentInfo[];
      meshes: LightweightMeshInfo[];
      totalRawTriangles: number;
      totalExpandedTriangles: number;
      totalPaintedTriangles: number;
    }
  | {
      type: 'SIMPLIFIED';
      jobId: number;
      results: SimplifiedMeshResult[];
      elapsedMs: number;
    }
  | {
      type: 'CUT_DONE';
      jobId: number;
      result: CutMeshResult;
    }
  | {
      type: 'EXPORTED';
      jobId: number;
      bytes: Uint8Array;
      suggestedFileName?: string;
    }
  | {
      type: 'ERROR';
      jobId: number;
      message: string;
    };

let currentArchive: Parsed3MFArchive | null = null;
let latestResults: SimplifiedMeshResult[] = [];
let latestCutResult: CutMeshResult | null = null;

function runSimplification(jobId: number, options: SimplificationOptions): void {
  if (!currentArchive) return;

  const t0 = performance.now();
  const meshes = currentArchive.meshes;
  const results: SimplifiedMeshResult[] = [];

  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];

    let inVerts: Float32Array;
    let inTris: Uint32Array;
    let inStates: Uint8Array;

    if (options.resolveSubdivisions) {
      inVerts = m.expandedVertices;
      inTris = m.expandedTriangles;
      inStates = m.expandedPaintStates;
    } else {
      inVerts = m.rawVertices;
      inTris = m.rawTriangles;
      const numRawTris = m.rawTriangles.length / 3;
      inStates = new Uint8Array(numRawTris);
      for (let t = 0; t < numRawTris; t++) {
        inStates[t] = decodeDominantPaintState(m.rawPaintAttrs[t]);
      }
    }

    const decimated = simplifyPaintedMesh(
      inVerts,
      inTris,
      inStates,
      options,
      (meshPct) => {
        const overallPct = Math.round(
          ((i + meshPct / 100) / meshes.length) * 100
        );
        const msg: WorkerResponseMessage = {
          type: 'STAGE',
          jobId,
          stage: 'Simplifying Mesh & Locking Paint Boundaries...',
          percent: overallPct,
        };
        self.postMessage(msg);
      }
    );

    results.push({
      modelPath: m.modelPath,
      objectId: m.objectId,
      vertices: decimated.vertices,
      triangles: decimated.triangles,
      paintStates: decimated.paintStates,
      originalRawTriangles: m.rawTriangles.length / 3,
      originalExpandedTriangles: m.expandedTriangles.length / 3,
      simplifiedTriangles: decimated.triangles.length / 3,
    });
  }

  latestResults = results;
  const elapsedMs = Math.round(performance.now() - t0);

  const doneMsg: WorkerResponseMessage = {
    type: 'SIMPLIFIED',
    jobId,
    results,
    elapsedMs,
  };
  self.postMessage(doneMsg);
}

function runCut(
  jobId: number,
  options: CutPlaneOptions,
  useSimplifiedIfAvailable = false
): void {
  if (!currentArchive || currentArchive.meshes.length === 0) {
    throw new Error('No 3MF model loaded to cut.');
  }

  const stageMsg: WorkerResponseMessage = {
    type: 'STAGE',
    jobId,
    stage: 'Slicing Painted Mesh & Generating Alignment Dowels...',
    percent: 30,
  };
  self.postMessage(stageMsg);

  const mesh = currentArchive.meshes[0];
  let inVerts = mesh.expandedVertices;
  let inTris = mesh.expandedTriangles;
  let inPaints = mesh.expandedPaintStates;

  if (useSimplifiedIfAvailable && latestResults.length > 0) {
    inVerts = latestResults[0].vertices;
    inTris = latestResults[0].triangles;
    inPaints = latestResults[0].paintStates;
  }

  const cutResult = cutPaintedMesh(inVerts, inTris, inPaints, options);
  latestCutResult = cutResult;

  const doneMsg: WorkerResponseMessage = {
    type: 'CUT_DONE',
    jobId,
    result: cutResult,
  };
  self.postMessage(doneMsg);
}

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;

  try {
    if (msg.type === 'LOAD_ONLY' || msg.type === 'LOAD_AND_SIMPLIFY') {
      const stageMsg: WorkerResponseMessage = {
        type: 'STAGE',
        jobId: msg.jobId,
        stage: `Unpacking & Parsing ${msg.fileName}...`,
        percent: 10,
      };
      self.postMessage(stageMsg);

      currentArchive = parse3MFArchive(msg.buffer, msg.fileName);
      if (currentArchive.meshes.length === 0) {
        const errMsg: WorkerResponseMessage = {
          type: 'ERROR',
          jobId: msg.jobId,
          message:
            'No 3D triangle meshes found in this .3mf archive. Check that it contains 3D/*.model geometry.',
        };
        self.postMessage(errMsg);
        return;
      }

      const loadedMsg: WorkerResponseMessage = {
        type: 'LOADED',
        jobId: msg.jobId,
        fileName: currentArchive.fileName,
        fileSize: currentArchive.fileSize,
        filaments: currentArchive.filaments,
        meshes: currentArchive.meshes.map((m) => ({
          modelPath: m.modelPath,
          objectId: m.objectId,
          name: m.name,
          defaultExtruder: m.defaultExtruder,
          rawTriangleCount: m.rawTriangles.length / 3,
          expandedTriangleCount: m.expandedTriangles.length / 3,
          subdividedTriangleCount: m.subdividedTriangleCount,
          expandedVertices: m.expandedVertices,
          expandedTriangles: m.expandedTriangles,
          expandedPaintStates: m.expandedPaintStates,
        })),
        totalRawTriangles: currentArchive.totalRawTriangles,
        totalExpandedTriangles: currentArchive.totalExpandedTriangles,
        totalPaintedTriangles: currentArchive.totalPaintedTriangles,
      };
      self.postMessage(loadedMsg);

      if (msg.type === 'LOAD_AND_SIMPLIFY') {
        runSimplification(msg.jobId, msg.options);
      }
    } else if (msg.type === 'SIMPLIFY') {
      runSimplification(msg.jobId, msg.options);
    } else if (msg.type === 'CUT') {
      runCut(msg.jobId, msg.options, msg.useSimplifiedIfAvailable);
    } else if (msg.type === 'EXPORT') {
      if (!currentArchive || latestResults.length === 0) {
        throw new Error('No simplified model ready to export.');
      }
      const stageMsg: WorkerResponseMessage = {
        type: 'STAGE',
        jobId: msg.jobId,
        stage: 'Packaging Simplified .3MF Archive...',
        percent: 50,
      };
      self.postMessage(stageMsg);

      const outBytes = exportSimplified3MF(currentArchive, latestResults);
      const expMsg: WorkerResponseMessage = {
        type: 'EXPORTED',
        jobId: msg.jobId,
        bytes: outBytes,
      };
      self.postMessage(expMsg, { transfer: [outBytes.buffer] });
    } else if (msg.type === 'EXPORT_CUT') {
      if (!currentArchive || !latestCutResult) {
        throw new Error('No cut parts ready to export.');
      }
      const stageMsg: WorkerResponseMessage = {
        type: 'STAGE',
        jobId: msg.jobId,
        stage: 'Packaging Cut Parts .3MF Archive...',
        percent: 50,
      };
      self.postMessage(stageMsg);

      let outBytes: Uint8Array;
      let suggestedFileName = 'model_cut.3mf';

      if (msg.partType === 'all') {
        outBytes = exportCut3MF(currentArchive, latestCutResult);
        suggestedFileName = `${currentArchive.fileName.replace(/\.3mf$/i, '')}_cut_all.3mf`;
      } else if (msg.partType === 'partA') {
        outBytes = exportCutPart3MF(currentArchive, latestCutResult.partA);
        suggestedFileName = `${currentArchive.fileName.replace(/\.3mf$/i, '')}_PartA_Upper.3mf`;
      } else if (msg.partType === 'partB') {
        outBytes = exportCutPart3MF(currentArchive, latestCutResult.partB);
        suggestedFileName = `${currentArchive.fileName.replace(/\.3mf$/i, '')}_PartB_Lower.3mf`;
      } else if (msg.partType === 'dowel' && latestCutResult.dowelPin) {
        outBytes = exportCutPart3MF(currentArchive, latestCutResult.dowelPin);
        suggestedFileName = `${currentArchive.fileName.replace(/\.3mf$/i, '')}_DowelPin.3mf`;
      } else {
        throw new Error('Requested part is not available.');
      }

      const expMsg: WorkerResponseMessage = {
        type: 'EXPORTED',
        jobId: msg.jobId,
        bytes: outBytes,
        suggestedFileName,
      };
      self.postMessage(expMsg, { transfer: [outBytes.buffer] });
    }
  } catch (err) {
    const errMsg: WorkerResponseMessage = {
      type: 'ERROR',
      jobId: msg.jobId,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errMsg);
  }
};
