import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Layers,
  Sparkles,
  Triangle,
  Paintbrush,
  Eye,
  Columns,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Code2,
  RotateCcw,
  SlidersHorizontal,
  FileBox,
  ChevronDown,
  ChevronUp,
  Github,
  Scissors,
} from 'lucide-react';
import {
  SimplificationOptions,
  SimplifiedMeshResult,
  FilamentInfo,
  CutConnectorOptions,
  CutMeshResult,
} from './core';
import { generateSample3MF } from './core/sample3mfGenerator';
import {
  ThreeViewport,
  ViewportDisplayMode,
} from './components/ThreeViewport';
import { ModelInfoAccordion } from './components/ModelInfoAccordion';
import { LandingHero } from './components/LandingHero';
import { SimplifyControlCard } from './components/SimplifyControlCard';
import { CutSplitterControlCard } from './components/CutSplitterControlCard';
import type {
  LightweightMeshInfo,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './workers/simplifier.worker';

interface LoadedArchiveSummary {
  fileName: string;
  fileSize: number;
  meshes: LightweightMeshInfo[];
  totalRawTriangles: number;
  totalExpandedTriangles: number;
  totalPaintedTriangles: number;
}

export function App() {
  const [archive, setArchive] = useState<LoadedArchiveSummary | null>(null);
  const [filaments, setFilaments] = useState<FilamentInfo[]>([]);
  const [simplifiedMeshes, setSimplifiedMeshes] = useState<SimplifiedMeshResult[]>([]);

  // Active Tool Mode
  const [toolMode, setToolMode] = useState<'simplify' | 'cut'>('simplify');

  // Planar Cut Splitter State
  const [cutPlaneZ, setCutPlaneZ] = useState<number>(25.0);
  const [cutPlaneNormal, setCutPlaneNormal] = useState<[number, number, number]>([0, 0, 1]);
  const [cutCapFaces, setCutCapFaces] = useState<boolean>(true);
  const [cutConnectors, setCutConnectors] = useState<CutConnectorOptions>({
    enabled: true,
    style: 'dowel_sockets',
    diameter: 5.0,
    length: 8.0,
    tolerance: 0.2,
  });
  const [cutResult, setCutResult] = useState<CutMeshResult | null>(null);
  const [explodedOffset, setExplodedOffset] = useState<number>(0);
  const [useSimplifiedForCut, setUseSimplifiedForCut] = useState<boolean>(true);
  const [simplificationTarget, setSimplificationTarget] = useState<'cut' | 'uncut'>('cut');

  // Primary Simplification Control
  const [targetRatio, setTargetRatio] = useState<number>(0.25); // 25% of original triangles (75% reduction)

  // Extra QEM Options (Settings)
  const [lockColorBoundaries, setLockColorBoundaries] = useState<boolean>(true);
  const [colorBoundaryWeight, setColorBoundaryWeight] = useState<number>(500);
  const [resolveSubdivisions, setResolveSubdivisions] = useState<boolean>(true);
  const [maxGeometricError, setMaxGeometricError] = useState<number>(0.02);
  const [lockOpenBorders, setLockOpenBorders] = useState<boolean>(true);

  // QEM Panel Open state
  const [isQemOptionsOpen, setIsQemOptionsOpen] = useState<boolean>(false);

  // Mobile Floating Deck Expanded state
  const [isMobileDeckExpanded, setIsMobileDeckExpanded] = useState<boolean>(true);

  // Applied options cache for dirty checking
  const [appliedOptions, setAppliedOptions] = useState<SimplificationOptions | null>(null);

  // Viewport controls
  const [displayMode, setDisplayMode] = useState<ViewportDisplayMode>('original');
  const [showWireframe, setShowWireframe] = useState<boolean>(true);
  const [highlightColorBorders, setHighlightColorBorders] = useState<boolean>(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progressStage, setProgressStage] = useState<string>('Processing...');
  const [progress, setProgress] = useState<number>(0);
  const [processingTimeMs, setProcessingTimeMs] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [showIntegrationModal, setShowIntegrationModal] = useState<boolean>(false);

  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const archiveFileNameRef = useRef<string>('model.3mf');
  const targetRatioRef = useRef<number>(0.25);
  targetRatioRef.current = targetRatio;

  const meshBounds = React.useMemo(() => {
    if (!archive || archive.meshes.length === 0) {
      return { min: [0, 0, 0] as [number, number, number], max: [0, 0, 50] as [number, number, number] };
    }
    const verts = archive.meshes[0].expandedVertices;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i], y = verts[i + 1], z = verts[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    return {
      min: [minX, minY, minZ] as [number, number, number],
      max: [maxX, maxY, maxZ] as [number, number, number],
    };
  }, [archive]);

  const createWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }
    const worker = new Worker(
      new URL('./workers/simplifier.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const msg = event.data;
      if (msg.jobId !== jobIdRef.current) return;

      if (msg.type === 'STAGE') {
        setProgressStage(msg.stage);
        setProgress(msg.percent);
      } else if (msg.type === 'LOADED') {
        archiveFileNameRef.current = msg.fileName;
        setArchive({
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          meshes: msg.meshes,
          totalRawTriangles: msg.totalRawTriangles,
          totalExpandedTriangles: msg.totalExpandedTriangles,
          totalPaintedTriangles: msg.totalPaintedTriangles,
        });
        setFilaments(msg.filaments);
        setSimplifiedMeshes([]);
        setDisplayMode('original'); // Show original model on load!
        setAppliedOptions(null);
        setIsProcessing(false);
        setProgress(100);
        const verts = msg.meshes[0]?.expandedVertices;
        if (verts && verts.length > 0) {
          let minZ = Infinity, maxZ = -Infinity;
          for (let i = 2; i < verts.length; i += 3) {
            if (verts[i] < minZ) minZ = verts[i];
            if (verts[i] > maxZ) maxZ = verts[i];
          }
          setCutPlaneZ(Number(((minZ + maxZ) / 2).toFixed(1)));
        }
        setCutResult(null);
        setExplodedOffset(0);

        // Auto-disable wireframe on huge 500k+ triangle models so initial render is silky-smooth
        if (msg.totalRawTriangles > 200000) {
          setShowWireframe(false);
        }
      } else if (msg.type === 'CUT_DONE') {
        setCutResult(msg.result);
        setSimplificationTarget('cut');
        setExplodedOffset(12);
        setDisplayMode('result'); // Automatically switch to result view to show cut parts!
        setIsProcessing(false);
        setProgress(100);
      } else if (msg.type === 'SIMPLIFIED') {
        setSimplifiedMeshes(msg.results);
        if (msg.cutResult) {
          setCutResult(msg.cutResult);
        }
        setDisplayMode('result'); // Automatically switch to result view to show the result!
        setProcessingTimeMs(msg.elapsedMs);
        setIsProcessing(false);
        setProgress(100);
      } else if (msg.type === 'EXPORTED') {
        setIsExporting(false);
        const blob = new Blob([msg.bytes], {
          type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const baseName = archiveFileNameRef.current.replace(/\.3mf$/i, '');
        const pct = Math.round(targetRatioRef.current * 100);
        a.href = url;
        a.download = msg.suggestedFileName || `${baseName}_simplified_${pct}pct.3mf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (msg.type === 'ERROR') {
        setErrorMsg(msg.message);
        setIsProcessing(false);
        setIsExporting(false);
      }
    };

    worker.onerror = (err) => {
      setErrorMsg(`Worker error: ${err.message}`);
      setIsProcessing(false);
      setIsExporting(false);
    };

    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    createWorker();
    return () => {
      workerRef.current?.terminate();
    };
  }, [createWorker]);

  // Load a 3MF ArrayBuffer inside the Web Worker (parses without auto-simplifying)
  const load3MFBuffer = useCallback(
    (buffer: ArrayBuffer, fileName: string) => {
      const worker = isProcessing ? createWorker() : workerRef.current || createWorker();

      const nextJobId = ++jobIdRef.current;
      setIsProcessing(true);
      setProgressStage(`Unpacking & Parsing ${fileName}...`);
      setProgress(10);
      setErrorMsg(null);
      setSimplifiedMeshes([]);
      setDisplayMode('original');
      setAppliedOptions(null);

      const req: WorkerRequestMessage = {
        type: 'LOAD_ONLY',
        jobId: nextJobId,
        buffer,
        fileName,
      };

      worker.postMessage(req, [buffer]);
    },
    [isProcessing, createWorker]
  );

  const handleLoadDemoModel = () => {
    const sampleBuf = generateSample3MF();
    load3MFBuffer(sampleBuf, 'Painted_Demo_Model.3mf');
  };

  const triggerSimplificationWithOptions = (opts: SimplificationOptions) => {
    if (!archive || !workerRef.current) return;
    const nextJobId = ++jobIdRef.current;
    setAppliedOptions(opts);
    setIsProcessing(true);
    setProgressStage('Simplifying Mesh & Locking Paint Boundaries...');
    setProgress(0);
    setErrorMsg(null);

    const req: WorkerRequestMessage = {
      type: 'SIMPLIFY',
      jobId: nextJobId,
      options: opts,
      target: 'original',
    };
    workerRef.current.postMessage(req);
  };

  const handleSimplifyCutParts = (targetRatioOverride?: number) => {
    if (!archive || !cutResult || !workerRef.current) return;
    const nextJobId = ++jobIdRef.current;
    const ratioToUse = targetRatioOverride ?? targetRatio;
    const opts: SimplificationOptions = {
      targetRatio: ratioToUse,
      lockColorBoundaries,
      colorBoundaryWeight,
      resolveSubdivisions,
      maxGeometricError,
      lockOpenBorders,
    };
    setAppliedOptions(opts);
    setIsProcessing(true);
    setProgressStage('Simplifying Cut Parts (Upper & Lower)...');
    setProgress(0);
    setErrorMsg(null);

    const req: WorkerRequestMessage = {
      type: 'SIMPLIFY_CUT',
      jobId: nextJobId,
      options: opts,
    };
    workerRef.current.postMessage(req);
  };

  const handleRevertCutSimplification = () => {
    if (!cutResult || !cutResult.originalPartA || !cutResult.originalPartB) return;
    setCutResult({
      ...cutResult,
      partA: cutResult.originalPartA,
      partB: cutResult.originalPartB,
      isSimplified: false,
    });
    setAppliedOptions(null);
  };

  const handleCancelSimplification = () => {
    if (cutResult && (toolMode === 'cut' || simplificationTarget === 'cut') && cutResult.isSimplified) {
      handleRevertCutSimplification();
    } else {
      setSimplifiedMeshes([]);
      setDisplayMode('original');
      setAppliedOptions(null);
    }
  };

  const handleUndoCut = () => {
    setCutResult(null);
    setSimplificationTarget('uncut');
    if (!isSimplified) {
      setDisplayMode('original');
    }
  };

  const handleExecuteCut = () => {
    if (!archive || !workerRef.current) return;
    const nextJobId = ++jobIdRef.current;
    setIsProcessing(true);
    setProgressStage('Slicing Painted Mesh & Generating Alignment Dowels...');
    setProgress(30);
    setErrorMsg(null);

    const req: WorkerRequestMessage = {
      type: 'CUT',
      jobId: nextJobId,
      options: {
        planePoint: [0, 0, cutPlaneZ],
        planeNormal: cutPlaneNormal,
        capFaces: cutCapFaces,
        capPaintSlot: 1,
        connectors: cutConnectors,
      },
      useSimplifiedIfAvailable: isSimplified && useSimplifiedForCut,
    };
    workerRef.current.postMessage(req);
  };

  const handleExportCut = (
    partType: 'all' | 'partA' | 'partB' | 'dowel',
    assembleInPlace = false
  ) => {
    if (!archive || !cutResult || !workerRef.current) return;
    const nextJobId = ++jobIdRef.current;
    setIsExporting(true);
    setProgressStage('Packaging Cut Parts .3MF Archive...');
    setProgress(40);

    const req: WorkerRequestMessage = {
      type: 'EXPORT_CUT',
      jobId: nextJobId,
      partType,
      assembleInPlace,
    };
    workerRef.current.postMessage(req);
  };

  const handleApplySimplification = () => {
    const opts: SimplificationOptions = {
      targetRatio,
      lockColorBoundaries,
      colorBoundaryWeight,
      resolveSubdivisions,
      maxGeometricError,
      lockOpenBorders,
    };
    if (cutResult && (toolMode === 'cut' || simplificationTarget === 'cut')) {
      handleSimplifyCutParts(targetRatio);
    } else {
      triggerSimplificationWithOptions(opts);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.3mf')) {
      setErrorMsg('Please select a valid .3mf file.');
      return;
    }
    const buf = await file.arrayBuffer();
    load3MFBuffer(buf, file.name);
  };

  const handleExport3MF = () => {
    if (cutResult && (toolMode === 'cut' || simplificationTarget === 'cut')) {
      handleExportCut('all', false);
      return;
    }
    if (!archive || simplifiedMeshes.length === 0 || !workerRef.current) return;
    const nextJobId = ++jobIdRef.current;
    setIsExporting(true);
    setErrorMsg(null);
    const req: WorkerRequestMessage = {
      type: 'EXPORT',
      jobId: nextJobId,
    };
    workerRef.current.postMessage(req);
  };

  const handleFilamentColorChange = (id: number, newHex: string) => {
    setFilaments((prev) =>
      prev.map((f) => (f.id === id ? { ...f, color: newHex } : f))
    );
  };

  const handleResetQemDefaults = () => {
    setLockColorBoundaries(true);
    setColorBoundaryWeight(500);
    setResolveSubdivisions(true);
    setMaxGeometricError(0.02);
    setLockOpenBorders(true);
  };

  // Compute live statistics (adapts to whether cut model or uncut model is active target)
  const isCutActive = cutResult !== null && (toolMode === 'cut' || simplificationTarget === 'cut');

  const cutBaselineTris = cutResult
    ? (cutResult.originalPartA?.triangleCount ?? cutResult.partA.triangleCount) +
      (cutResult.originalPartB?.triangleCount ?? cutResult.partB.triangleCount)
    : 0;
  const cutSimplifiedTris = cutResult?.isSimplified
    ? cutResult.partA.triangleCount + cutResult.partB.triangleCount
    : 0;

  const origRawTris = archive?.totalRawTriangles ?? 0;
  const origExpandedTris = archive?.totalExpandedTriangles ?? 0;
  const fullModelSimplifiedTris = simplifiedMeshes.reduce(
    (acc, m) => acc + m.simplifiedTriangles,
    0
  );

  const baselineTris = isCutActive
    ? cutBaselineTris
    : resolveSubdivisions
      ? origExpandedTris
      : origRawTris;

  const currentSimplifiedTris = isCutActive
    ? cutSimplifiedTris
    : fullModelSimplifiedTris;

  const isSimplified = isCutActive
    ? Boolean(cutResult?.isSimplified)
    : simplifiedMeshes.length > 0;

  const reductionPct =
    baselineTris > 0 && currentSimplifiedTris > 0
      ? Math.max(0, Math.round((1 - currentSimplifiedTris / baselineTris) * 100))
      : 0;

  const totalSubdividedTris =
    archive?.meshes.reduce((acc, m) => acc + m.subdividedTriangleCount, 0) ?? 0;

  const hasUnappliedChanges =
    archive !== null &&
    isSimplified &&
    appliedOptions !== null &&
    (Math.abs(appliedOptions.targetRatio - targetRatio) > 0.001 ||
      appliedOptions.lockColorBoundaries !== lockColorBoundaries ||
      appliedOptions.resolveSubdivisions !== resolveSubdivisions ||
      appliedOptions.colorBoundaryWeight !== colorBoundaryWeight ||
      appliedOptions.lockOpenBorders !== lockOpenBorders ||
      Math.abs(appliedOptions.maxGeometricError - maxGeometricError) > 0.0001);

  const hasCustomQemSettings =
    !lockColorBoundaries ||
    colorBoundaryWeight !== 500 ||
    !resolveSubdivisions ||
    !lockOpenBorders ||
    Math.abs(maxGeometricError - 0.02) > 0.0001;

  const estimatedTargetTris =
    baselineTris > 0 ? Math.max(4, Math.round(baselineTris * targetRatio)) : 0;

  return (
    <div
      className="flex flex-col h-[100dvh] w-full max-w-full bg-zinc-950 text-zinc-100 select-none overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFileUpload(f);
      }}
    >
      {/* Top Header Bar */}
      <header className="h-14 border-b border-zinc-800/90 bg-zinc-900/80 px-3 sm:px-4 flex items-center justify-between shrink-0 gap-2 z-20">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-zinc-100 truncate">
                Prism3MF
              </h1>
              <span className="hidden xs:inline-block text-[10px] sm:text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                {toolMode === 'simplify' ? 'Color-Preserving QEM' : 'Planar Cut Splitter'}
              </span>
            </div>
            <p className="hidden xl:block text-xs text-zinc-400 truncate">
              {toolMode === 'simplify'
                ? 'Simplify multi-color 3MF models while locking painted filament zones'
                : 'Cut oversized multi-color models to fit build plates with alignment dowels'}
            </p>
          </div>
        </div>

        {/* Center telemetry pill on desktop when file is loaded */}
        {archive && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-950/80 border border-zinc-800 text-xs">
            <FileBox className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-200 font-medium truncate max-w-44" title={archive.fileName}>
              {archive.fileName}
            </span>
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-400 font-mono">
              {baselineTris.toLocaleString()} tris
            </span>
            {isSimplified && (
              <>
                <span className="text-zinc-600">→</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {currentSimplifiedTris.toLocaleString()} (-{reductionPct}%)
                </span>
              </>
            )}
          </div>
        )}

        {/* Right Header Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".3mf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={handleLoadDemoModel}
            className="hidden sm:flex px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 items-center gap-1.5 transition-colors"
            title="Load built-in multi-color demo model"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden md:inline">Demo Model</span>
            <span className="md:hidden">Demo</span>
          </button>

          <button
            type="button"
            onClick={() => setShowIntegrationModal(true)}
            className="hidden xl:flex px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 items-center gap-1.5 transition-colors"
            title="TypeScript / Node.js programmatic SDK"
          >
            <Code2 className="w-3.5 h-3.5 text-emerald-400" />
            Core SDK
          </button>

          <a
            href="https://github.com/nissy34/Prism3MF"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-700/70 flex items-center gap-1.5 transition-colors"
            title="View source repository on GitHub"
            aria-label="GitHub Repository"
          >
            <Github className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline">Open</span>
            <span className="hidden sm:inline"> .3MF</span>
          </button>

          {/* Download button: shown when a model is loaded */}
          {archive && (() => {
            const canDownload = (isSimplified || cutResult !== null) && !isProcessing && !isExporting;
            return (
              <button
                type="button"
                disabled={!canDownload}
                onClick={handleExport3MF}
                className="px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-35 disabled:hover:bg-emerald-500 text-zinc-950 flex items-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                title={
                  !canDownload
                    ? 'Cut or simplify mesh first to download'
                    : cutResult !== null
                      ? 'Download cut .3MF model'
                      : 'Download simplified .3MF file'
                }
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isExporting ? (
                    'Downloading...'
                  ) : (
                    <>
                      <span className="hidden xs:inline">Download </span>
                      <span>.3MF</span>
                    </>
                  )}
                </span>
              </button>
            );
          })()}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Desktop Left Workspace Sidebar: ONLY rendered when a model is loaded! */}
        {archive && (
          <aside className="hidden md:flex flex-col w-84 lg:w-96 border-r border-zinc-800/90 bg-zinc-900/60 shrink-0 h-full overflow-y-auto p-3.5 space-y-3 animate-in fade-in slide-in-from-left duration-200">
            {/* Option B: Collapsible Model Info & Filaments on top (36px when collapsed) */}
            <ModelInfoAccordion
              fileName={archive.fileName}
              fileSize={archive.fileSize}
              baselineTris={baselineTris}
              currentSimplifiedTris={currentSimplifiedTris}
              isSimplified={isSimplified}
              reductionPct={reductionPct}
              processingTimeMs={processingTimeMs}
              totalSubdividedTris={totalSubdividedTris}
              filaments={filaments}
              onFilamentColorChange={handleFilamentColorChange}
              cutResult={cutResult}
            />

            {/* Tool Selector Tabs: Immediately below model info */}
            <div className="flex rounded-xl bg-zinc-950/90 p-1 border border-zinc-800 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => setToolMode('cut')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  toolMode === 'cut'
                    ? 'bg-emerald-500 text-zinc-950 shadow-md font-bold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Split / Cut</span>
              </button>
              <button
                type="button"
                onClick={() => setToolMode('simplify')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  toolMode === 'simplify'
                    ? 'bg-emerald-500 text-zinc-950 shadow-md font-bold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Simplify</span>
              </button>
            </div>

            {/* Mode: Simplify vs Cut Splitter */}
            {toolMode === 'simplify' ? (
              <SimplifyControlCard
                targetRatio={targetRatio}
                onTargetRatioChange={setTargetRatio}
                baselineTris={baselineTris}
                estimatedTargetTris={estimatedTargetTris}
                isProcessing={isProcessing}
                progress={progress}
                isSimplified={isSimplified}
                hasUnappliedChanges={hasUnappliedChanges}
                onApplySimplification={handleApplySimplification}
                onCancelSimplification={handleCancelSimplification}
                onExport3MF={handleExport3MF}
                isExporting={isExporting}
                archiveLoaded={archive !== null}
                onToggleQemOptions={() => setIsQemOptionsOpen((v) => !v)}
                isQemOptionsOpen={isQemOptionsOpen}
                hasCustomQemSettings={hasCustomQemSettings}
                hasCutResult={cutResult !== null}
                simplificationTarget={simplificationTarget}
                onSimplificationTargetChange={setSimplificationTarget}
                lockColorBoundaries={lockColorBoundaries}
                onLockColorBoundariesChange={setLockColorBoundaries}
                colorBoundaryWeight={colorBoundaryWeight}
                onColorBoundaryWeightChange={setColorBoundaryWeight}
                resolveSubdivisions={resolveSubdivisions}
                onResolveSubdivisionsChange={setResolveSubdivisions}
                maxGeometricError={maxGeometricError}
                onMaxGeometricErrorChange={setMaxGeometricError}
                lockOpenBorders={lockOpenBorders}
                onLockOpenBordersChange={setLockOpenBorders}
                onResetDefaults={handleResetQemDefaults}
              />
            ) : (
              <CutSplitterControlCard
                meshBounds={meshBounds}
                cutPlaneZ={cutPlaneZ}
                onCutPlaneZChange={setCutPlaneZ}
                cutPlaneNormal={cutPlaneNormal}
                onCutPlaneNormalChange={setCutPlaneNormal}
                connectorOptions={cutConnectors}
                onConnectorOptionsChange={setCutConnectors}
                capFaces={cutCapFaces}
                onCapFacesChange={setCutCapFaces}
                onExecuteCut={handleExecuteCut}
                onUndoCut={handleUndoCut}
                isProcessing={isProcessing}
                cutResult={cutResult}
                explodedOffset={explodedOffset}
                onExplodedOffsetChange={setExplodedOffset}
                onExport={handleExportCut}
                isExporting={isExporting}
                isSimplified={isSimplified}
                baselineTris={baselineTris}
                simplifiedTris={currentSimplifiedTris}
                useSimplifiedForCut={useSimplifiedForCut}
                onToggleUseSimplifiedForCut={setUseSimplifiedForCut}
                onCancelSimplification={handleCancelSimplification}
                targetRatio={targetRatio}
                onTargetRatioChange={setTargetRatio}
                onSimplifyCutParts={handleSimplifyCutParts}
                onRevertCutSimplification={handleRevertCutSimplification}
              />
            )}
          </aside>
        )}

        {/* Center: 3D Viewport Area */}
        <main className="flex flex-1 relative flex-col bg-zinc-950 min-w-0 h-full overflow-hidden">
          {/* Floating Viewport Toolbar (View Modes + Wireframe & Seams Toggles) */}
          {archive && (
            <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10 flex flex-wrap sm:flex-nowrap items-center justify-between pointer-events-none gap-1 sm:gap-1.5">
              {/* Left: View Mode Toggle */}
              <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-md shadow-lg pointer-events-auto shrink-0">
                {(() => {
                  const hasResult = isSimplified || cutResult !== null;
                  const isResultActive = displayMode === 'result' || displayMode === 'simplified';

                  return (
                    <>
                      <button
                        type="button"
                        disabled={!hasResult}
                        onClick={() => setDisplayMode('result')}
                        className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors ${
                          !hasResult
                            ? 'opacity-35 cursor-not-allowed text-zinc-500'
                            : isResultActive
                              ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                              : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                        title={
                          !hasResult
                            ? 'Execute a tool (Cut or Simplify) first to view result'
                            : 'View modified result model'
                        }
                      >
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <span>Result</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDisplayMode('original')}
                        className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors ${
                          displayMode === 'original'
                            ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                            : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                        title="View original untouched model (uncut and unsimplified)"
                      >
                        <Layers className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline">Original ({baselineTris.toLocaleString()} tris)</span>
                        <span className="sm:hidden">Orig</span>
                      </button>

                      <button
                        type="button"
                        disabled={!hasResult}
                        onClick={() => setDisplayMode('split')}
                        className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors ${
                          !hasResult
                            ? 'opacity-35 cursor-not-allowed text-zinc-500'
                            : displayMode === 'split'
                              ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                              : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                        title={
                          !hasResult
                            ? 'Execute a tool first to compare before and after'
                            : 'Compare original untouched model side-by-side with result'
                        }
                      >
                        <Columns className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline">Before / After Split</span>
                        <span className="sm:hidden">Split</span>
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* Right Viewport Overlay Controls: Wireframe & Color Seams */}
              <div className="flex items-center gap-0.5 sm:gap-1.5 p-0.5 sm:p-1 rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-md shadow-lg pointer-events-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setShowWireframe((v) => !v)}
                  className={`px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors border ${
                    showWireframe
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border-transparent'
                  }`}
                  title="Wireframe: Show or hide 3D polygon triangle mesh lines"
                  aria-label="Toggle wireframe mesh overlay"
                >
                  <Triangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Wireframe</span>
                  <span className="sm:hidden">Wire</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                      showWireframe ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => setHighlightColorBorders((v) => !v)}
                  className={`px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors border ${
                    highlightColorBorders
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border-transparent'
                  }`}
                  title="Color Seams: Highlight borders between painted filament colors in cyan"
                  aria-label="Highlight paint color seams"
                >
                  <Paintbrush className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Color Seams</span>
                  <span className="sm:hidden">Seams</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                      highlightColorBorders ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]' : 'bg-zinc-600'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Mobile Floating Workspace Deck: Telemetry + Filaments + Simplification */}
          {archive && (
            <div className="md:hidden absolute bottom-9 left-2 right-2 sm:left-4 sm:right-4 z-20 rounded-2xl bg-zinc-900/95 border border-zinc-800/90 backdrop-blur-md shadow-2xl pointer-events-auto transition-all duration-200 max-h-[75dvh] overflow-y-auto">
              {isMobileDeckExpanded ? (
                <div className="p-2.5 sm:p-3 space-y-2">
                  {/* Deck Header with Minimize Toggle */}
                  <div className="flex items-center justify-between pb-1 border-b border-zinc-800/70 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-semibold text-zinc-200 text-[11px] uppercase tracking-wider">
                        Workspace Controls
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMobileDeckExpanded(false)}
                      className="px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 transition-colors flex items-center gap-1"
                      title="Minimize controls to view full 3D model"
                      aria-label="Minimize controls"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Hide</span>
                    </button>
                  </div>

                  {/* Option B: Collapsible Model Info Accordion on mobile */}
                  <ModelInfoAccordion
                    fileName={archive.fileName}
                    fileSize={archive.fileSize}
                    baselineTris={baselineTris}
                    currentSimplifiedTris={currentSimplifiedTris}
                    isSimplified={isSimplified}
                    reductionPct={reductionPct}
                    processingTimeMs={processingTimeMs}
                    totalSubdividedTris={totalSubdividedTris}
                    filaments={filaments}
                    onFilamentColorChange={handleFilamentColorChange}
                    cutResult={cutResult}
                  />

                  {/* Tool Switcher on mobile */}
                  <div className="flex rounded-lg bg-zinc-950/80 p-1 border border-zinc-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setToolMode('cut')}
                      className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                        toolMode === 'cut'
                          ? 'bg-emerald-500 text-zinc-950 shadow-md font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Scissors className="w-3 h-3" />
                      <span>Cut</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('simplify')}
                      className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                        toolMode === 'simplify'
                          ? 'bg-emerald-500 text-zinc-950 shadow-md font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>Simplify</span>
                    </button>
                  </div>

                  {/* Mode: Simplify vs Cut Splitter */}
                  {toolMode === 'simplify' ? (
                    <SimplifyControlCard
                      targetRatio={targetRatio}
                      onTargetRatioChange={setTargetRatio}
                      baselineTris={baselineTris}
                      estimatedTargetTris={estimatedTargetTris}
                      isProcessing={isProcessing}
                      progress={progress}
                      isSimplified={isSimplified}
                      hasUnappliedChanges={hasUnappliedChanges}
                      onApplySimplification={handleApplySimplification}
                      onCancelSimplification={handleCancelSimplification}
                      onExport3MF={handleExport3MF}
                      isExporting={isExporting}
                      archiveLoaded={archive !== null}
                      onToggleQemOptions={() => setIsQemOptionsOpen((v) => !v)}
                      isQemOptionsOpen={isQemOptionsOpen}
                      hasCustomQemSettings={hasCustomQemSettings}
                      hasCutResult={cutResult !== null}
                      simplificationTarget={simplificationTarget}
                      onSimplificationTargetChange={setSimplificationTarget}
                      lockColorBoundaries={lockColorBoundaries}
                      onLockColorBoundariesChange={setLockColorBoundaries}
                      colorBoundaryWeight={colorBoundaryWeight}
                      onColorBoundaryWeightChange={setColorBoundaryWeight}
                      resolveSubdivisions={resolveSubdivisions}
                      onResolveSubdivisionsChange={setResolveSubdivisions}
                      maxGeometricError={maxGeometricError}
                      onMaxGeometricErrorChange={setMaxGeometricError}
                      lockOpenBorders={lockOpenBorders}
                      onLockOpenBordersChange={setLockOpenBorders}
                      onResetDefaults={handleResetQemDefaults}
                      compact
                    />
                  ) : (
                    <CutSplitterControlCard
                      meshBounds={meshBounds}
                      cutPlaneZ={cutPlaneZ}
                      onCutPlaneZChange={setCutPlaneZ}
                      cutPlaneNormal={cutPlaneNormal}
                      onCutPlaneNormalChange={setCutPlaneNormal}
                      connectorOptions={cutConnectors}
                      onConnectorOptionsChange={setCutConnectors}
                      capFaces={cutCapFaces}
                      onCapFacesChange={setCutCapFaces}
                      onExecuteCut={handleExecuteCut}
                      onUndoCut={handleUndoCut}
                      isProcessing={isProcessing}
                      cutResult={cutResult}
                      explodedOffset={explodedOffset}
                      onExplodedOffsetChange={setExplodedOffset}
                      onExport={handleExportCut}
                      isExporting={isExporting}
                      isSimplified={isSimplified}
                      baselineTris={baselineTris}
                      simplifiedTris={currentSimplifiedTris}
                      useSimplifiedForCut={useSimplifiedForCut}
                      onToggleUseSimplifiedForCut={setUseSimplifiedForCut}
                      onCancelSimplification={handleCancelSimplification}
                      targetRatio={targetRatio}
                      onTargetRatioChange={setTargetRatio}
                      onSimplifyCutParts={handleSimplifyCutParts}
                      onRevertCutSimplification={handleRevertCutSimplification}
                      compact
                    />
                  )}
                </div>
              ) : (
                /* Collapsed Minimal Bottom Bar (leaves full screen free for 3D model) */
                <div className="p-2 flex items-center justify-between gap-1.5 text-xs">
                  {/* Left: Quick Target & Live Triangles */}
                  <div className="flex items-center gap-1.5 pl-1 min-w-0">
                    <span className="font-mono text-emerald-400 font-bold text-xs shrink-0">
                      {Math.round(targetRatio * 100)}%
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 truncate">
                      {isSimplified
                        ? `${currentSimplifiedTris.toLocaleString()} tris (-${reductionPct}%)`
                        : `~${estimatedTargetTris.toLocaleString()} tris`}
                    </span>
                  </div>

                  {/* Right: Quick Actions + Expand */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleApplySimplification}
                      className={`py-1 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                        isProcessing
                          ? 'bg-emerald-500/80 text-zinc-950 cursor-wait'
                          : !isSimplified
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-xs'
                            : hasUnappliedChanges
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                              : 'bg-zinc-800 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      <Cpu className="w-3 h-3" />
                      <span>{isProcessing ? `${progress}%` : !isSimplified ? 'Simplify' : hasUnappliedChanges ? 'Re-run' : 'Done'}</span>
                    </button>

                    {isSimplified && (
                      <button
                        type="button"
                        disabled={isProcessing || isExporting}
                        onClick={handleExport3MF}
                        className="py-1 px-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1 transition-colors shadow-xs"
                        title="Download .3MF"
                      >
                        <Download className="w-3 h-3" />
                        <span>.3MF</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsMobileDeckExpanded(true)}
                      className="py-1 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1 border border-zinc-700 transition-colors"
                      title="Expand full controls and telemetry"
                      aria-label="Expand controls"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden xs:inline text-[11px]">Controls</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-950/90 border border-red-500/50 text-red-200 text-xs shadow-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Processing / Exporting Progress Overlay */}
          {(isProcessing || isExporting) && (
            <div className="absolute inset-0 z-20 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center">
              <div className="w-80 p-5 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-3 text-center">
                <Cpu className="w-6 h-6 text-emerald-400 mx-auto animate-pulse" />
                <div className="text-sm font-semibold text-zinc-100">
                  {isExporting ? 'Streaming Simplified .3MF Archive...' : progressStage}
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-150"
                    style={{ width: `${isExporting ? 75 : progress}%` }}
                  />
                </div>
                <div className="text-xs font-mono text-zinc-400">
                  {isExporting ? 'Chunked UTF-8 ZIP packaging' : `${progress}% complete`}
                </div>
              </div>
            </div>
          )}

          {/* Drag & Drop Overlay */}
          {isDraggingOver && (
            <div className="absolute inset-4 z-30 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-950/40 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
              <Upload className="w-10 h-10 text-emerald-400" />
              <div className="text-base font-semibold text-emerald-200">
                Drop your .3MF file to simplify
              </div>
              <div className="text-xs text-emerald-300/80">
                Supports 100MB+ / 2M+ triangle 3MF files with multi-color paint preservation
              </div>
            </div>
          )}

          {/* 3D WebGL Canvas & Interactive Build Plate (Always mounted for immediate 3D scene) */}
          <div className="flex-1 w-full h-full relative">
            <ThreeViewport
              meshes={archive ? archive.meshes : []}
              simplifiedMeshes={simplifiedMeshes}
              filaments={filaments}
              displayMode={displayMode}
              showWireframe={showWireframe}
              highlightColorBorders={highlightColorBorders}
              mode={toolMode}
              simplificationTarget={simplificationTarget}
              cutPlaneZ={cutPlaneZ}
              cutPlaneNormal={cutPlaneNormal}
              onCutPlaneZChange={setCutPlaneZ}
              onCutPlaneNormalChange={setCutPlaneNormal}
              cutResult={cutResult}
              explodedOffset={explodedOffset}
              isMobileDeckExpanded={isMobileDeckExpanded}
            />

            {/* Multi-Tool Suite Landing Hero */}
            {!archive && !isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 pointer-events-none overflow-y-auto">
                <div className="pointer-events-auto w-full my-auto">
                  <LandingHero
                    onSelectFile={() => fileInputRef.current?.click()}
                    onLoadDemo={(mode) => {
                      if (mode) setToolMode(mode);
                      handleLoadDemoModel();
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Status Footer */}
          <div className="h-8 border-t border-zinc-800/80 bg-zinc-900/90 px-2 sm:px-4 flex items-center justify-between text-[10px] sm:text-[11px] text-zinc-400 shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 truncate">
              <span className="hidden md:inline">
                Drag to orbit • Scroll to zoom • Right-click to pan
              </span>
              <span className="md:hidden">
                Drag to rotate • Pinch to zoom
              </span>
              <span className="hidden sm:inline text-zinc-600">•</span>
              <span className="hidden sm:inline">
                Build Plate: <strong className="text-zinc-300">256 × 256 mm</strong>
              </span>
            </div>
            <div className="font-mono text-zinc-300 shrink-0 pl-2 text-right">
              {archive ? (
                <>
                  <span className="hidden xs:inline text-zinc-400">
                    {baselineTris.toLocaleString()} →{' '}
                  </span>
                  <span className={isSimplified ? 'text-emerald-400 font-semibold' : 'text-zinc-300'}>
                    {isSimplified
                      ? `${currentSimplifiedTris.toLocaleString()} (-${reductionPct}%)`
                      : 'Raw'}
                  </span>
                </>
              ) : (
                'Ready'
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modal: Core SDK & Programmatic Usage */}
      {showIntegrationModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="max-w-2xl w-full rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  Prism3MF Core SDK — Programmatic &amp; CLI Usage
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowIntegrationModal(false)}
                className="text-xs text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs text-zinc-300 leading-relaxed">
              <p>
                The simplification engine in <code className="text-emerald-400 font-mono">src/core/</code> has zero UI or DOM dependencies and can be used standalone in Node.js, Web Workers, or custom 3D printing pipelines:
              </p>

              <pre className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
{`import {
  parse3MFArchive,
  simplifyPaintedMesh,
  exportSimplified3MF,
} from './core';

export async function simplify3MFFile(
  inputBuffer: ArrayBuffer,
  maxTriangles = 150_000
): Promise<Uint8Array> {
  const archive = parse3MFArchive(inputBuffer, 'model.3mf');

  // Return as-is if already under the target polygon budget
  if (archive.totalExpandedTriangles <= maxTriangles) {
    return new Uint8Array(inputBuffer);
  }

  const targetRatio = maxTriangles / archive.totalExpandedTriangles;

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

  // Returns a valid .3mf Uint8Array with paint_color and slicer metadata preserved
  return exportSimplified3MF(archive, simplifiedMeshes);
}`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
