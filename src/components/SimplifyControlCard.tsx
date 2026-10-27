import React from 'react';
import { Sliders, Cpu, CheckCircle2, Download, SlidersHorizontal, RotateCcw } from 'lucide-react';

export interface SimplifyControlCardProps {
  targetRatio: number;
  onTargetRatioChange: (ratio: number) => void;
  baselineTris: number;
  estimatedTargetTris: number;
  isProcessing: boolean;
  progress: number;
  isSimplified: boolean;
  hasUnappliedChanges: boolean;
  onApplySimplification: () => void;
  onCancelSimplification?: () => void;
  onExport3MF: () => void;
  isExporting: boolean;
  archiveLoaded: boolean;
  onToggleQemOptions: () => void;
  isQemOptionsOpen: boolean;
  hasCustomQemSettings?: boolean;
  compact?: boolean;
}

export function SimplifyControlCard({
  targetRatio,
  onTargetRatioChange,
  baselineTris,
  estimatedTargetTris,
  isProcessing,
  progress,
  isSimplified,
  hasUnappliedChanges,
  onApplySimplification,
  onCancelSimplification,
  onExport3MF,
  isExporting,
  archiveLoaded,
  onToggleQemOptions,
  isQemOptionsOpen,
  hasCustomQemSettings = false,
  compact = false,
}: SimplifyControlCardProps) {
  const reductionPct = Math.round((1 - targetRatio) * 100);

  if (compact) {
    // Mobile Bottom Deck style
    return (
      <div className="space-y-2.5">
        {/* Row 1: Target Ratio & Live Estimate */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium text-zinc-200">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>Keep:</span>
            <span className="font-mono text-emerald-400 font-bold">
              {Math.round(targetRatio * 100)}%
            </span>
            <span className="text-zinc-500 text-[10px]">(-{reductionPct}%)</span>
          </div>
          {baselineTris > 0 && (
            <span className="text-[11px] font-mono text-zinc-400">
              ~{estimatedTargetTris.toLocaleString()} tris
            </span>
          )}
        </div>

        {/* Row 2: Range Slider + Quick Presets */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.05}
            value={targetRatio}
            disabled={isProcessing}
            onChange={(e) => onTargetRatioChange(parseFloat(e.target.value))}
            className="flex-1 accent-emerald-500 cursor-pointer h-1.5"
          />
          <div className="flex items-center gap-1 shrink-0">
            {[0.1, 0.25, 0.5, 0.75].map((r) => (
              <button
                key={r}
                type="button"
                disabled={isProcessing}
                onClick={() => onTargetRatioChange(r)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                  Math.abs(targetRatio - r) < 0.01
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-bold'
                    : 'bg-zinc-800 border-zinc-700/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {Math.round(r * 100)}%
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Action Buttons + QEM Settings Trigger */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            disabled={!archiveLoaded || isProcessing}
            onClick={onApplySimplification}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow ${
              !archiveLoaded
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : isProcessing
                  ? 'bg-emerald-500/80 text-zinc-950 cursor-wait'
                  : !isSimplified
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20 ring-2 ring-emerald-400/40'
                    : hasUnappliedChanges
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 ring-2 ring-emerald-400/40'
                      : 'bg-zinc-800 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {isProcessing ? (
              <>
                <Cpu className="w-3.5 h-3.5 animate-spin" />
                <span>Simplifying ({progress}%)...</span>
              </>
            ) : !isSimplified ? (
              <>
                <Cpu className="w-3.5 h-3.5" />
                <span>Simplify ({Math.round(targetRatio * 100)}%)</span>
              </>
            ) : hasUnappliedChanges ? (
              <>
                <Cpu className="w-3.5 h-3.5" />
                <span>Re-simplify ({Math.round(targetRatio * 100)}%)</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simplified</span>
              </>
            )}
          </button>

          {isSimplified && (
            <button
              type="button"
              disabled={isProcessing || isExporting}
              onClick={onExport3MF}
              className="py-2 px-3 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1 transition-colors shadow shrink-0"
              title="Download simplified .3MF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporting...' : '.3MF'}</span>
            </button>
          )}

          {isSimplified && onCancelSimplification && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={onCancelSimplification}
              className="py-2 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
              title="Cancel simplification and revert to original unsimplified mesh"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Revert</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleQemOptions}
            className={`relative p-2 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors shrink-0 ${
              isQemOptionsOpen
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-800/90 border-zinc-700/80 text-zinc-300 hover:bg-zinc-800'
            }`}
            title="Extra QEM Options (Paint edge sharpness, seam strictness, tolerance)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="text-[11px]">QEM</span>
            {hasCustomQemSettings && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 animate-pulse" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // Full Desktop Sidebar Card
  return (
    <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3.5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
          Polygon Simplification
        </span>
        <button
          type="button"
          onClick={onToggleQemOptions}
          className={`relative px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors border ${
            isQemOptionsOpen
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
          }`}
          title="Open extra QEM algorithm tuning options"
        >
          <SlidersHorizontal className="w-3 h-3 text-emerald-400" />
          <span>Extra QEM Options</span>
          {hasCustomQemSettings && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          )}
        </button>
      </div>

      {/* Target Ratio Slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline text-xs">
          <label htmlFor="target-ratio-slider-desktop" className="text-zinc-200 font-medium">
            Triangles to Keep
          </label>
          <span className="font-mono text-emerald-400 font-bold">
            {Math.round(targetRatio * 100)}% ({reductionPct}% reduction)
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Lower % creates a smaller file that slices much faster in Bambu Studio / OrcaSlicer.
          {baselineTris > 0 && (
            <span className="text-zinc-300 font-mono">
              {' '}Target: ~{estimatedTargetTris.toLocaleString()} tris
            </span>
          )}
        </p>
        <input
          id="target-ratio-slider-desktop"
          type="range"
          min={0.05}
          max={0.95}
          step={0.05}
          value={targetRatio}
          disabled={isProcessing}
          onChange={(e) => onTargetRatioChange(parseFloat(e.target.value))}
          className="w-full accent-emerald-500 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-zinc-400">
          <span>Smallest File (5%)</span>
          <span>Balanced (25%)</span>
          <span>Max Detail (95%)</span>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
          Quick Presets
        </div>
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
              onClick={() => onTargetRatioChange(preset.ratio)}
              className={`py-1.5 rounded-md text-xs font-mono border transition-all ${
                Math.abs(targetRatio - preset.ratio) < 0.01
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-bold shadow-xs'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              Keep {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="space-y-2 pt-1 border-t border-zinc-800/60">
        {hasUnappliedChanges && !isProcessing && (
          <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-md px-2.5 py-1.5 text-center">
            Settings changed — click below to update the 3D model
          </div>
        )}

        <button
          type="button"
          disabled={!archiveLoaded || isProcessing || (isSimplified && !hasUnappliedChanges)}
          onClick={onApplySimplification}
          className={`w-full py-2.5 px-3 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
            !archiveLoaded
              ? 'bg-zinc-800/80 border border-zinc-700/60 text-zinc-500 cursor-not-allowed'
              : isProcessing
                ? 'bg-emerald-500/80 text-zinc-950 cursor-wait'
                : !isSimplified
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400/40'
                  : hasUnappliedChanges
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-400/40'
                    : 'bg-zinc-900 border border-emerald-500/30 text-emerald-400 cursor-default'
          }`}
        >
          {!archiveLoaded ? (
            <>
              <Cpu className="w-4 h-4" />
              Open a .3MF File to Simplify
            </>
          ) : isProcessing ? (
            <>
              <Cpu className="w-4 h-4 animate-spin" />
              Simplifying Mesh ({progress}%)...
            </>
          ) : !isSimplified ? (
            <>
              <Cpu className="w-4 h-4" />
              Simplify Mesh (Keep {Math.round(targetRatio * 100)}%)
            </>
          ) : hasUnappliedChanges ? (
            <>
              <Cpu className="w-4 h-4" />
              Re-simplify Mesh (Keep {Math.round(targetRatio * 100)}%)
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Mesh Simplified ({Math.round(targetRatio * 100)}% Kept)
            </>
          )}
        </button>

        {isSimplified && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isProcessing || isExporting}
              onClick={onExport3MF}
              className="flex-1 py-2.5 px-3 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Downloading...' : 'Download .3MF'}</span>
            </button>
            {onCancelSimplification && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={onCancelSimplification}
                className="py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
                title="Discard simplification and return to original unsimplified mesh"
              >
                <RotateCcw className="w-4 h-4 text-emerald-400" />
                <span>Revert Mesh</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
