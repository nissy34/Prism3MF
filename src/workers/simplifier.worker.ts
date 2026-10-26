import { simplifyPaintedMesh } from '../core/qemSimplifier';
import { decodeDominantPaintState } from '../core/paintColorCodec';
import {
  parse3MFArchive,
  exportSimplified3MF,
} from '../core/threeMfProcessor';
import {
  FilamentInfo,
  Parsed3MFArchive,
  SimplificationOptions,
  SimplifiedMeshResult,
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
      type: 'EXPORT';
      jobId: number;
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
      type: 'EXPORTED';
      jobId: number;
      bytes: Uint8Array;
    }
  | {
      type: 'ERROR';
      jobId: number;
      message: string;
    };

let currentArchive: Parsed3MFArchive | null = null;
let latestResults: SimplifiedMeshResult[] = [];

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

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;

  try {
    if (msg.type === 'LOAD_AND_SIMPLIFY') {
      const stageMsg: WorkerResponseMessage = {
        type: 'STAGE',
        jobId: msg.jobId,
        stage: `Unpacking & Parsing ${msg.fileName}...`,
        percent: 5,
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

      runSimplification(msg.jobId, msg.options);
    } else if (msg.type === 'SIMPLIFY') {
      runSimplification(msg.jobId, msg.options);
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
      // Transfer the output ArrayBuffer zero-copy to the main thread!
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
