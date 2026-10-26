import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Sliders,
  Layers,
  ShieldCheck,
  Sparkles,
  Grid,
  Eye,
  Columns,
  Cpu,
  FileBox,
  CheckCircle2,
  AlertCircle,
  Code2,
  RotateCcw,
} from 'lucide-react';
import {
  SimplificationOptions,
  SimplifiedMeshResult,
  FilamentInfo,
} from './core';
import { generateSampleMakerWorld3MF } from './core/sample3mfGenerator';
import {
  ThreeViewport,
  ViewportDisplayMode,
} from './components/ThreeViewport';
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

  // Simplification controls
  const [targetRatio, setTargetRatio] = useState<number>(0.25); // 25% of original triangles (75% reduction)
  const [lockColorBoundaries, setLockColorBoundaries] = useState<boolean>(true);
  const [colorBoundaryWeight, setColorBoundaryWeight] = useState<number>(500);
  const [resolveSubdivisions, setResolveSubdivisions] = useState<boolean>(true);
  const [maxGeometricError, setMaxGeometricError] = useState<number>(0.02);

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
        // Auto-disable wireframe on huge 500k+ triangle models so initial render is silky-smooth
        if (msg.totalRawTriangles > 200000) {
          setShowWireframe(false);
        }
      } else if (msg.type === 'SIMPLIFIED') {
        setSimplifiedMeshes(msg.results);
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

  // Load a 3MF ArrayBuffer inside the Web Worker
  const load3MFBuffer = useCallback(
    (buffer: ArrayBuffer, fileName: string) => {
      // If a job is already running, recreate the worker to cancel it immediately
      const worker = isProcessing ? createWorker() : workerRef.current || createWorker();

      const nextJobId = ++jobIdRef.current;
      setIsProcessing(true);
      setProgressStage(`Unpacking & Parsing ${fileName}...`);
      setProgress(5);
      setErrorMsg(null);

      const req: WorkerRequestMessage = {
        type: 'LOAD_AND_SIMPLIFY',
        jobId: nextJobId,
        buffer,
        fileName,
        options: {
          targetRatio,
          lockColorBoundaries,
          colorBoundaryWeight,
          resolveSubdivisions,
          maxGeometricError,
          lockOpenBorders: true,
        },
      };

      worker.postMessage(req, [buffer]);
    },
    [
      isProcessing,
      createWorker,
      targetRatio,
      lockColorBoundaries,
      colorBoundaryWeight,
      resolveSubdivisions,
      maxGeometricError,
    ]
  );

  // Auto-load built-in MakerWorld sample 3MF on first mount
  useEffect(() => {
    const sampleBuf = generateSampleMakerWorld3MF();
    load3MFBuffer(sampleBuf, 'MakerWorld_Painted_Companion.3mf');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerSimplificationWithOptions = (opts: SimplificationOptions) => {
    if (!archive || !workerRef.current) return;
    const nextJobId = ++jobIdRef.current;
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
      lockOpenBorders: true,
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.3mf')) {
      setErrorMsg('Please select a valid .3mf file (from MakerWorld, Bambu Studio, or OrcaSlicer).');
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

  return (
    <div
      className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 select-none"
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
      <header className="h-14 border-b border-zinc-800/90 bg-zinc-900/80 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
                Prism3MF
              </h1>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Color-Preserving QEM
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Simplify high-poly MakerWorld, Bambu Studio, OrcaSlicer &amp; PrusaSlicer 3MF models without losing paint
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
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
            onClick={() => {
              const sampleBuf = generateSampleMakerWorld3MF();
              load3MFBuffer(sampleBuf, 'MakerWorld_Painted_Companion.3mf');
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 flex items-center gap-1.5 transition-colors"
            title="Reload built-in multi-color painted sample 3MF"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            Sample 3MF
          </button>

          <button
            type="button"
            onClick={() => setShowIntegrationModal(true)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/70 flex items-center gap-1.5 transition-colors"
          >
            <Code2 className="w-3.5 h-3.5 text-emerald-400" />
            Core SDK
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            Open .3MF File
          </button>

          <button
            type="button"
            disabled={!archive || simplifiedMeshes.length === 0 || isProcessing || isExporting}
            onClick={handleExport3MF}
            className="px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Exporting .3MF...' : 'Export Simplified .3MF'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Control Sidebar */}
        <aside className="w-80 border-r border-zinc-800/90 bg-zinc-900/50 flex flex-col overflow-y-auto shrink-0">
          {/* Active File & Mesh Telemetry Card */}
          <div className="p-4 border-b border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <FileBox className="w-3.5 h-3.5 text-emerald-400" />
                Model Telemetry
              </span>
              {processingTimeMs > 0 && !isProcessing && (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {(processingTimeMs / 1000).toFixed(2)}s
                </span>
              )}
            </div>

            {archive && (
              <div className="rounded-md bg-zinc-900 border border-zinc-800 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-medium text-zinc-200" title={archive.fileName}>
                    {archive.fileName}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                    {(archive.fileSize / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-zinc-950/70 rounded p-2 border border-zinc-800/60">
                    <div className="text-[10px] uppercase text-zinc-400">
                      Input Triangles
                    </div>
                    <div className="text-sm font-mono font-semibold text-zinc-200 mt-0.5">
                      {baselineTris.toLocaleString()}
                    </div>
                    {totalSubdividedTris > 0 && (
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        ({totalSubdividedTris.toLocaleString()} painted trees)
                      </div>
                    )}
                  </div>

                  <div className="bg-emerald-950/20 rounded p-2 border border-emerald-500/30">
                    <div className="text-[10px] uppercase text-emerald-300/80">
                      Simplified Output
                    </div>
                    <div className="text-sm font-mono font-semibold text-emerald-400 mt-0.5">
                      {currentSimplifiedTris.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400/90 mt-0.5">
                      -{reductionPct}% polygons
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Decimation Parameters */}
          <div className="p-4 border-b border-zinc-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                Simplification Target
              </span>
            </div>

            {/* Target Ratio Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="target-ratio-slider" className="text-zinc-300 font-medium">
                  Keep Triangle Ratio
                </label>
                <span className="font-mono text-emerald-400 font-semibold">
                  {Math.round(targetRatio * 100)}% ({Math.round((1 - targetRatio) * 100)}% reduction)
                </span>
              </div>
              <input
                id="target-ratio-slider"
                type="range"
                min={0.05}
                max={0.95}
                step={0.05}
                value={targetRatio}
                onChange={(e) => setTargetRatio(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Aggressive (5%)</span>
                <span>Balanced (25%)</span>
                <span>Light (80%)</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '10%', ratio: 0.1 },
                { label: '25%', ratio: 0.25 },
                { label: '50%', ratio: 0.5 },
                { label: '75%', ratio: 0.75 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => {
                    setTargetRatio(preset.ratio);
                    triggerSimplificationWithOptions({
                      targetRatio: preset.ratio,
                      lockColorBoundaries,
                      colorBoundaryWeight,
                      resolveSubdivisions,
                      maxGeometricError,
                      lockOpenBorders: true,
                    });
                  }}
                  className={`py-1 rounded text-xs font-mono border transition-colors ${
                    Math.abs(targetRatio - preset.ratio) < 0.01
                      ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-semibold'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Keep {preset.label}
                </button>
              ))}
            </div>

            {/* Paint Protection Settings */}
            <div className="pt-2 space-y-3 border-t border-zinc-800/60">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Paint Boundary Protection
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lockColorBoundaries}
                  onChange={(e) => setLockColorBoundaries(e.target.checked)}
                  className="mt-0.5 rounded accent-emerald-500"
                />
                <div>
                  <div className="text-xs font-medium text-zinc-200">
                    Lock Color Borders
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">
                    Prevents edges from collapsing across different filament colors so eyes, text, and logos never bleed.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resolveSubdivisions}
                  onChange={(e) => setResolveSubdivisions(e.target.checked)}
                  className="mt-0.5 rounded accent-emerald-500"
                />
                <div>
                  <div className="text-xs font-medium text-zinc-200">
                    Resolve Subdivided Paint Trees
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">
                    Unpacks Orca/Bambu recursive <code className="text-zinc-300">paint_color</code> quadtrees into sub-triangles with T-junction stitching.
                  </div>
                </div>
              </label>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label htmlFor="boundary-weight-slider" className="text-zinc-300">
                    Color Seam Sharpness Weight
                  </label>
                  <span className="font-mono text-zinc-300">
                    {colorBoundaryWeight}x
                  </span>
                </div>
                <input
                  id="boundary-weight-slider"
                  type="range"
                  min={10}
                  max={2000}
                  step={10}
                  value={colorBoundaryWeight}
                  onChange={(e) => setColorBoundaryWeight(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label htmlFor="geom-error-slider" className="text-zinc-300">
                    Max Geometric Tolerance
                  </label>
                  <span className="font-mono text-zinc-300">
                    {(maxGeometricError * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  id="geom-error-slider"
                  type="range"
                  min={0.002}
                  max={0.1}
                  step={0.002}
                  value={maxGeometricError}
                  onChange={(e) => setMaxGeometricError(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!archive || isProcessing}
              onClick={handleApplySimplification}
              className="w-full py-2 px-3 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow"
            >
              <Cpu className="w-4 h-4" />
              {isProcessing ? `Processing (${progress}%)...` : 'Run Color-Aware Decimation'}
            </button>
          </div>

          {/* AMS Filament Slots Palette */}
          <div className="p-4 space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                AMS Filament Slots ({filaments.length})
              </span>
              <span className="text-[11px] text-zinc-400">Click to preview tint</span>
            </div>

            <div className="space-y-1.5">
              {filaments.map((fil) => (
                <div
                  key={fil.id}
                  className="flex items-center justify-between p-2 rounded bg-zinc-900/90 border border-zinc-800/80 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <label
                      className="relative w-5 h-5 rounded border border-zinc-600 shrink-0 cursor-pointer overflow-hidden"
                      style={{ backgroundColor: fil.color }}
                      title={`Change preview color for Slot ${fil.id}`}
                    >
                      <input
                        type="color"
                        value={fil.color}
                        onChange={(e) => handleFilamentColorChange(fil.id, e.target.value)}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <div className="truncate">
                      <div className="font-medium text-zinc-200 truncate">
                        Slot {fil.id}: {fil.name || `Extruder ${fil.id}`}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        paint_color=&quot;{fil.id === 1 ? '4' : fil.id === 2 ? '8' : `${(fil.id - 3).toString(16).toUpperCase()}C`}&quot; • {fil.color.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0">
                    {fil.type || 'PLA'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center 3D Viewport Area */}
        <main className="flex-1 relative flex flex-col bg-zinc-950 min-w-0">
          {/* Floating Viewport Toolbar */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 p-1 rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-md shadow-lg">
            <button
              type="button"
              onClick={() => setDisplayMode('simplified')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                displayMode === 'simplified'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Simplified ({currentSimplifiedTris.toLocaleString()} tris)
            </button>

            <button
              type="button"
              onClick={() => setDisplayMode('original')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                displayMode === 'original'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Original ({baselineTris.toLocaleString()} tris)
            </button>

            <button
              type="button"
              onClick={() => setDisplayMode('split')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                displayMode === 'split'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              Before / After Split
            </button>
          </div>

          {/* Right Viewport Overlay Controls */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 p-1 rounded-lg bg-zinc-900/90 border border-zinc-800 backdrop-blur-md shadow-lg">
            <button
              type="button"
              onClick={() => setShowWireframe((v) => !v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                showWireframe
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              Wireframe
            </button>

            <button
              type="button"
              onClick={() => setHighlightColorBorders((v) => !v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                highlightColorBorders
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
              title="Highlight locked paint boundary edges in cyan"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Inspect Color Seams
            </button>
          </div>

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
                  {isExporting
                    ? 'Streaming Simplified .3MF Archive...'
                    : progressStage}
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
                Drop MakerWorld / OrcaSlicer .3MF file to simplify
              </div>
              <div className="text-xs text-emerald-300/80">
                Supports 100MB+ / 2M+ triangle 3MF files with multi-color paint preservation
              </div>
            </div>
          )}

          {/* 3D WebGL Canvas */}
          <div className="flex-1 w-full h-full">
            {archive && (
              <ThreeViewport
                meshes={archive.meshes}
                simplifiedMeshes={simplifiedMeshes}
                filaments={filaments}
                displayMode={displayMode}
                showWireframe={showWireframe}
                highlightColorBorders={highlightColorBorders}
              />
            )}
          </div>

          {/* Bottom Status Footer */}
          <div className="h-8 border-t border-zinc-800/80 bg-zinc-900/90 px-4 flex items-center justify-between text-[11px] text-zinc-400">
            <div className="flex items-center gap-4">
              <span>
                Drag to orbit • Scroll to zoom • Right-click to pan
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                Build Plate: <strong className="text-zinc-300">256 × 256 mm</strong> (Bambu / Orca Z-Up)
              </span>
            </div>
            <div className="font-mono text-zinc-300">
              {baselineTris.toLocaleString()} → {currentSimplifiedTris.toLocaleString()} tris ({reductionPct}% lighter for slicing)
            </div>
          </div>
        </main>
      </div>

      {/* Modal: How to embed the Core Engine directly into the user's online Orca Slicer */}
      {showIntegrationModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  Prism3MF Core SDK — Headless Slicer &amp; Web Integration
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
                The simplification engine is isolated inside <code className="text-emerald-400 font-mono">src/core/</code> with zero React/UI dependencies so you can call it directly in your online OrcaSlicer pipeline before passing the <code className="font-mono text-zinc-200">.3mf</code> buffer to the slicer backend/WASM:
              </p>

              <pre className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
{`import {
  parse3MFArchive,
  simplifyPaintedMesh,
  exportSimplified3MF,
} from './core';

export async function preprocessHeavy3MFForOrca(
  inputBuffer: ArrayBuffer,
  maxTriangles = 150_000
): Promise<Uint8Array> {
  const archive = parse3MFArchive(inputBuffer, 'input.3mf');

  // Skip if model is already lightweight
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

  // Returns a valid .3mf Uint8Array with paint_color and configs intact
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
