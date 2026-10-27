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
} from 'lucide-react';
import {
  SimplificationOptions,
  SimplifiedMeshResult,
  FilamentInfo,
} from './core';
import { generateSample3MF } from './core/sample3mfGenerator';
import {
  ThreeViewport,
  ViewportDisplayMode,
} from './components/ThreeViewport';
import { ModelTelemetryCard } from './components/ModelTelemetryCard';
import { FilamentPaletteCard } from './components/FilamentPaletteCard';
import { SimplifyControlCard } from './components/SimplifyControlCard';
import { QemOptionsPanel } from './components/QemOptionsPanel';
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

  // Primary Simplification Control
  const [targetRatio, setTargetRatio] = useState<number>(0.25); // 25% of original triangles (75% reduction)

  // Extra QEM Options (Settings)
  const [lockColorBoundaries, setLockColorBoundaries] = useState<boolean>(true);
  const [colorBoundaryWeight, setColorBoundaryWeight] = useState<number>(500);
  const [resolveSubdivisions, setResolveSubdivisions] = useState<boolean>(true);
  const [maxGeometricError, setMaxGeometricError] = useState<number>(0.02);
  const [lockOpenBorders, setLockOpenBorders] = useState<boolean>(true);

  // QEM Panel Open & Pin states
  const [isQemOptionsOpen, setIsQemOptionsOpen] = useState<boolean>(false);
  const [isQemPinned, setIsQemPinned] = useState<boolean>(false);

  // Mobile Floating Deck Expanded state
  const [isMobileDeckExpanded, setIsMobileDeckExpanded] = useState<boolean>(true);

  // Applied options cache for dirty checking
  const [appliedOptions, setAppliedOptions] = useState<SimplificationOptions | null>(null);

  // Viewport controls
  const [displayMode, setDisplayMode] = useState<ViewportDisplayMode>('simplified');
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
        // Auto-disable wireframe on huge 500k+ triangle models so initial render is silky-smooth
        if (msg.totalRawTriangles > 200000) {
          setShowWireframe(false);
        }
      } else if (msg.type === 'SIMPLIFIED') {
        setSimplifiedMeshes(msg.results);
        setDisplayMode('simplified'); // Automatically switch to simplified view to show the result!
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
        a.download = `${baseName}_simplified_${pct}pct.3mf`;
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
    };
    workerRef.current.postMessage(req);
  };

  const handleApplySimplification = () => {
    triggerSimplificationWithOptions({
      targetRatio,
      lockColorBoundaries,
      colorBoundaryWeight,
      resolveSubdivisions,
      maxGeometricError,
      lockOpenBorders,
    });
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

  // Compute live statistics
  const origRawTris = archive?.totalRawTriangles ?? 0;
  const origExpandedTris = archive?.totalExpandedTriangles ?? 0;
  const currentSimplifiedTris = simplifiedMeshes.reduce(
    (acc, m) => acc + m.simplifiedTriangles,
    0
  );
  const baselineTris = resolveSubdivisions ? origExpandedTris : origRawTris;
  const reductionPct =
    baselineTris > 0 && currentSimplifiedTris > 0
      ? Math.max(0, Math.round((1 - currentSimplifiedTris / baselineTris) * 100))
      : 0;

  const totalSubdividedTris =
    archive?.meshes.reduce((acc, m) => acc + m.subdividedTriangleCount, 0) ?? 0;

  const isSimplified = simplifiedMeshes.length > 0;

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
                Color-Preserving QEM
              </span>
            </div>
            <p className="hidden xl:block text-xs text-zinc-400 truncate">
              Simplify multi-color 3MF models while locking painted filament zones
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

          {/* QEM & Download buttons: only shown when a model is loaded */}
          {archive && (
            <>
              <button
                type="button"
                onClick={() => setIsQemOptionsOpen((prev) => !prev)}
                className={`relative px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                  isQemOptionsOpen
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-zinc-800/80 border-zinc-700/70 text-zinc-300 hover:bg-zinc-800'
                }`}
                title="Extra QEM Algorithm Options (Pin to workspace or adjust boundary constraints)"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xs:inline">QEM Options</span>
                <span className="xs:hidden">QEM</span>
                {hasCustomQemSettings && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                disabled={!isSimplified || isProcessing || isExporting}
                onClick={handleExport3MF}
                className="px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-35 disabled:hover:bg-emerald-500 text-zinc-950 flex items-center gap-1.5 transition-colors shadow-xs shrink-0"
                title={!isSimplified ? 'Simplify mesh first to download' : 'Download simplified .3MF file'}
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
            </>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Desktop Left Workspace Sidebar: ONLY rendered when a model is loaded! */}
        {archive && (
          <aside className="hidden md:flex flex-col w-84 lg:w-96 border-r border-zinc-800/90 bg-zinc-900/60 shrink-0 h-full overflow-y-auto p-3.5 space-y-3.5 animate-in fade-in slide-in-from-left duration-200">
            {/* Telemetry Card */}
            <ModelTelemetryCard
              fileName={archive.fileName}
              fileSize={archive.fileSize}
              baselineTris={baselineTris}
              currentSimplifiedTris={currentSimplifiedTris}
              isSimplified={isSimplified}
              reductionPct={reductionPct}
              processingTimeMs={processingTimeMs}
              totalSubdividedTris={totalSubdividedTris}
            />

            {/* Filament Palette Card */}
            <FilamentPaletteCard
              filaments={filaments}
              onFilamentColorChange={handleFilamentColorChange}
            />

            {/* Simplification Controls Card */}
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
              onExport3MF={handleExport3MF}
              isExporting={isExporting}
              archiveLoaded={archive !== null}
              onToggleQemOptions={() => setIsQemOptionsOpen((v) => !v)}
              isQemOptionsOpen={isQemOptionsOpen}
              hasCustomQemSettings={hasCustomQemSettings}
            />
          </aside>
        )}

        {/* Center: 3D Viewport Area */}
        <main className="flex flex-1 relative flex-col bg-zinc-950 min-w-0 h-full overflow-hidden">
          {/* Floating Viewport Toolbar (View Modes + Wireframe & Seams Toggles) */}
          {archive && (
            <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10 flex flex-wrap sm:flex-nowrap items-center justify-between pointer-events-none gap-1 sm:gap-1.5">
              {/* Left: View Mode Toggle */}
              <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-md shadow-lg pointer-events-auto shrink-0">
                <button
                  type="button"
                  disabled={!isSimplified}
                  onClick={() => setDisplayMode('simplified')}
                  className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors ${
                    !isSimplified
                      ? 'opacity-35 cursor-not-allowed text-zinc-500'
                      : displayMode === 'simplified'
                        ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                        : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  title={!isSimplified ? 'Simplify mesh first to view simplified version' : 'View simplified model'}
                >
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">
                    Simplified {isSimplified ? `(${currentSimplifiedTris.toLocaleString()} tris)` : ''}
                  </span>
                  <span className="sm:hidden">Simple</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDisplayMode('original')}
                  className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors ${
                    displayMode === 'original'
                      ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  title="View original unsimplified model"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Original ({baselineTris.toLocaleString()} tris)</span>
                  <span className="sm:hidden">Orig</span>
                </button>

                <button
                  type="button"
                  disabled={!isSimplified}
                  onClick={() => setDisplayMode('split')}
                  className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors ${
                    !isSimplified
                      ? 'opacity-35 cursor-not-allowed text-zinc-500'
                      : displayMode === 'split'
                        ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-xs'
                        : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  title={!isSimplified ? 'Simplify mesh first to compare' : 'Compare before and after'}
                >
                  <Columns className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Before / After Split</span>
                  <span className="sm:hidden">Split</span>
                </button>
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
            <div className="md:hidden absolute bottom-9 left-2 right-2 sm:left-4 sm:right-4 z-20 rounded-2xl bg-zinc-900/95 border border-zinc-800/90 backdrop-blur-md shadow-2xl pointer-events-auto transition-all duration-200">
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

                  {/* Telemetry Summary */}
                  <ModelTelemetryCard
                    fileName={archive.fileName}
                    fileSize={archive.fileSize}
                    baselineTris={baselineTris}
                    currentSimplifiedTris={currentSimplifiedTris}
                    isSimplified={isSimplified}
                    reductionPct={reductionPct}
                    processingTimeMs={processingTimeMs}
                    totalSubdividedTris={totalSubdividedTris}
                    compact
                  />

                  {/* Filaments Row */}
                  <FilamentPaletteCard
                    filaments={filaments}
                    onFilamentColorChange={handleFilamentColorChange}
                    compact
                  />

                  {/* Simplification Slider, Presets & Actions */}
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
                    onExport3MF={handleExport3MF}
                    isExporting={isExporting}
                    archiveLoaded={archive !== null}
                    onToggleQemOptions={() => setIsQemOptionsOpen((v) => !v)}
                    isQemOptionsOpen={isQemOptionsOpen}
                    hasCustomQemSettings={hasCustomQemSettings}
                    compact
                  />
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
            />

            {/* Empty State Hero Card (Single unified landing card floating over the 3D build plate) */}
            {!archive && !isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
                <div className="max-w-lg w-full rounded-2xl border border-zinc-700/60 bg-zinc-900/90 backdrop-blur-xl p-6 sm:p-8 text-center space-y-5 shadow-2xl pointer-events-auto">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-inner">
                    <Layers className="w-7 h-7" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
                      Simplify Multi-Color 3MF Files
                    </h2>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-sm mx-auto">
                      Decimate dense high-poly meshes up to 90% while strictly locking painted filament zones, logos, and brush strokes.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 hover:scale-[1.02]"
                    >
                      <Upload className="w-4 h-4" />
                      Select .3MF File
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadDemoModel}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center justify-center gap-2 transition-colors hover:scale-[1.02]"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Try Demo Model
                    </button>
                  </div>

                  {/* Highlights pills */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800/70 text-[11px] text-zinc-400">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-emerald-400 font-semibold">Color-Locked</span>
                      <span className="text-[10px] text-zinc-500">Zero color bleed</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 border-x border-zinc-800/70">
                      <span className="text-emerald-400 font-semibold">Fast QEM</span>
                      <span className="text-[10px] text-zinc-500">Up to 90% smaller</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-emerald-400 font-semibold">100% Private</span>
                      <span className="text-[10px] text-zinc-500">In-Browser Worker</span>
                    </div>
                  </div>
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

        {/* Right QEM Options Panel (Desktop pinned or unpinned popover) */}
        <div className="hidden md:block">
          <QemOptionsPanel
            isOpen={isQemOptionsOpen}
            onClose={() => setIsQemOptionsOpen(false)}
            isPinned={isQemPinned}
            onTogglePin={() => setIsQemPinned((v) => !v)}
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
            onApplyChanges={handleApplySimplification}
            hasUnappliedChanges={hasUnappliedChanges}
            isProcessing={isProcessing}
            mode="panel"
          />
        </div>
      </div>

      {/* Mobile QEM Options Drawer (Slide-up sheet) */}
      <div className="md:hidden">
        <QemOptionsPanel
          isOpen={isQemOptionsOpen}
          onClose={() => setIsQemOptionsOpen(false)}
          isPinned={false}
          onTogglePin={() => {}}
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
          onApplyChanges={handleApplySimplification}
          hasUnappliedChanges={hasUnappliedChanges}
          isProcessing={isProcessing}
          mode="drawer"
        />
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
