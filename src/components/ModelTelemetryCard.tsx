import React from 'react';
import { FileBox, CheckCircle2, TrendingDown, Layers, Zap } from 'lucide-react';

export interface ModelTelemetryProps {
  fileName: string;
  fileSize: number;
  baselineTris: number;
  currentSimplifiedTris: number;
  isSimplified: boolean;
  reductionPct: number;
  processingTimeMs: number;
  totalSubdividedTris: number;
  isProcessing?: boolean;
  compact?: boolean;
}

export function ModelTelemetryCard({
  fileName,
  fileSize,
  baselineTris,
  currentSimplifiedTris,
  isSimplified,
  reductionPct,
  processingTimeMs,
  totalSubdividedTris,
  compact = false,
}: ModelTelemetryProps) {
  const formattedFileSize = (fileSize / (1024 * 1024)).toFixed(1);

  if (compact) {
    // Compact HUD style for mobile or narrow bars
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <FileBox className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate text-zinc-200 font-medium" title={fileName}>
            {fileName}
          </span>
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
            {formattedFileSize}MB
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
          <span className="text-zinc-400">{baselineTris.toLocaleString()}</span>
          <span className="text-zinc-600">→</span>
          {isSimplified ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
              {currentSimplifiedTris.toLocaleString()}
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 rounded ml-1">
                -{reductionPct}%
              </span>
            </span>
          ) : (
            <span className="text-zinc-500 italic">
              <span className="hidden xs:inline">Not simplified</span>
              <span className="xs:hidden">Ready</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  // Full Desktop / Inspector Card
  return (
    <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3.5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <FileBox className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-200 truncate" title={fileName}>
              {fileName}
            </div>
            <div className="text-[10px] font-mono text-zinc-400">
              {formattedFileSize} MB • Multi-Color 3MF
            </div>
          </div>
        </div>

        {processingTimeMs > 0 && isSimplified && (
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            {(processingTimeMs / 1000).toFixed(2)}s
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <div className="bg-zinc-950/70 rounded-lg p-2.5 border border-zinc-800/60">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Layers className="w-3 h-3 text-zinc-500" />
            Input Mesh
          </div>
          <div className="text-base font-mono font-bold text-zinc-100 mt-1">
            {baselineTris.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
            {totalSubdividedTris > 0 ? (
              <span title={`${totalSubdividedTris.toLocaleString()} paint subdivisions`}>
                {totalSubdividedTris.toLocaleString()} paint trees
              </span>
            ) : (
              '100% original polygons'
            )}
          </div>
        </div>

        <div
          className={`rounded-lg p-2.5 border transition-all ${
            isSimplified
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-zinc-950/40 border-zinc-800/40'
          }`}
        >
          <div
            className={`text-[10px] font-medium uppercase tracking-wider flex items-center gap-1 ${
              isSimplified ? 'text-emerald-400' : 'text-zinc-500'
            }`}
          >
            {isSimplified ? (
              <TrendingDown className="w-3 h-3 text-emerald-400" />
            ) : (
              <Zap className="w-3 h-3 text-zinc-600" />
            )}
            Simplified
          </div>
          <div
            className={`text-base font-mono font-bold mt-1 ${
              isSimplified ? 'text-emerald-400' : 'text-zinc-500'
            }`}
          >
            {isSimplified ? currentSimplifiedTris.toLocaleString() : 'Ready'}
          </div>
          <div
            className={`text-[10px] font-mono mt-0.5 ${
              isSimplified ? 'text-emerald-300 font-semibold' : 'text-zinc-500'
            }`}
          >
            {isSimplified ? `-${reductionPct}% reduction` : 'Click simplify below'}
          </div>
        </div>
      </div>
    </div>
  );
}
