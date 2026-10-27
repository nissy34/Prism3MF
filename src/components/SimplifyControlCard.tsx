import React from 'react';
import { Sliders, Cpu, CheckCircle2, Download, SlidersHorizontal, RotateCcw, Scissors } from 'lucide-react';

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
  hasCutResult?: boolean;
  simplificationTarget?: 'cut' | 'uncut';
  onSimplificationTargetChange?: (target: 'cut' | 'uncut') => void;
  // Inline QEM fine-tuning options
  lockColorBoundaries?: boolean;
  onLockColorBoundariesChange?: (v: boolean) => void;
  colorBoundaryWeight?: number;
  onColorBoundaryWeightChange?: (v: number) => void;
  resolveSubdivisions?: boolean;
  onResolveSubdivisionsChange?: (v: boolean) => void;
  maxGeometricError?: number;
  onMaxGeometricErrorChange?: (v: number) => void;
  lockOpenBorders?: boolean;
  onLockOpenBordersChange?: (v: boolean) => void;
  onResetDefaults?: () => void;
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
  hasCutResult = false,
  simplificationTarget = 'uncut',
  onSimplificationTargetChange,
  lockColorBoundaries = true,
  onLockColorBoundariesChange,
  colorBoundaryWeight = 500,
  onColorBoundaryWeightChange,
  resolveSubdivisions = true,
  onResolveSubdivisionsChange,
  maxGeometricError = 0.02,
  onMaxGeometricErrorChange,
  lockOpenBorders = true,
  onLockOpenBordersChange,
  onResetDefaults,
}: SimplifyControlCardProps) {
  const reductionPct = Math.round((1 - targetRatio) * 100);

  if (compact) {
    // Mobile Bottom Deck style
    return (
      <div className="space-y-2.5">
        {hasCutResult && (
          <div className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-950/80 border border-emerald-500/30 gap-1 text-[11px]">
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <Scissors className="w-3 h-3" />
              Target:
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onSimplificationTargetChange?.('cut')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                  simplificationTarget === 'cut'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                Cut Parts
              </button>
              <button
                type="button"
                onClick={() => onSimplificationTargetChange?.('uncut')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                  simplificationTarget === 'uncut'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                Uncut Model
              </button>
            </div>
          </div>
        )}

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

      {hasCutResult && (
        <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-emerald-500/30 flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
            <span className="flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5" />
              Simplification Target
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
              Cut Active
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onSimplificationTargetChange?.('cut')}
              className={`py-1.5 px-2 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                simplificationTarget === 'cut'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold shadow-xs'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              Cut Parts (Upper + Lower)
            </button>
            <button
              type="button"
              onClick={() => onSimplificationTargetChange?.('uncut')}
              className={`py-1.5 px-2 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                simplificationTarget === 'uncut'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold shadow-xs'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              Original Uncut Model
            </button>
          </div>
        </div>
      )}

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

      {/* Inline Extra QEM Algorithm Options (Folds out directly inside card) */}
      {isQemOptionsOpen && (
        <div className="pt-3 border-t border-zinc-800/80 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between text-xs pb-0.5">
            <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              Extra QEM Algorithm Options
            </span>
            {onResetDefaults && (
              <button
                type="button"
                onClick={onResetDefaults}
                className="text-[10px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors cursor-pointer"
                title="Reset to default QEM settings"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset
              </button>
            )}
          </div>

          {/* Option 1: Lock Color Boundaries */}
          <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lockColorBoundaries}
                onChange={(e) => onLockColorBoundariesChange?.(e.target.checked)}
                className="mt-0.5 rounded accent-emerald-500 cursor-pointer"
              />
              <div>
                <div className="text-xs font-semibold text-zinc-200">
                  Lock Painted Color Boundaries
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                  Prevents color bleed across neighboring triangles for painted patterns, logos, and eyes.
                </p>
              </div>
            </label>
          </div>

          {/* Option 2: Color Seam Strictness */}
          <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
            <div className="flex justify-between items-baseline text-xs">
              <span className="font-semibold text-zinc-200 text-xs">
                Color Seam Strictness
              </span>
              <span className="font-mono text-emerald-400 font-bold text-xs">{colorBoundaryWeight}x</span>
            </div>
            <input
              type="range"
              min={10}
              max={2000}
              step={10}
              value={colorBoundaryWeight}
              onChange={(e) => onColorBoundaryWeightChange?.(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-zinc-400 font-mono">
              <span>10x (Soft)</span>
              <span>500x (Default)</span>
              <span>2000x (Strict)</span>
            </div>
          </div>

          {/* Option 3: Preserve Fine Brush Strokes */}
          <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={resolveSubdivisions}
                onChange={(e) => onResolveSubdivisionsChange?.(e.target.checked)}
                className="mt-0.5 rounded accent-emerald-500 cursor-pointer"
              />
              <div>
                <div className="text-xs font-semibold text-zinc-200">
                  Preserve Fine Brush Strokes
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                  Resolves slicer brush sub-triangles before decimation so fine curved lines stay smooth.
                </p>
              </div>
            </label>
          </div>

          {/* Option 4: Max Shape Deviation */}
          <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
            <div className="flex justify-between items-baseline text-xs">
              <span className="font-semibold text-zinc-200 text-xs">
                Max Shape Deviation
              </span>
              <span className="font-mono text-emerald-400 font-bold text-xs">
                {((maxGeometricError ?? 0.02) * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={0.002}
              max={0.1}
              step={0.002}
              value={maxGeometricError}
              onChange={(e) => onMaxGeometricErrorChange?.(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Option 5: Lock Open Mesh Borders */}
          <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lockOpenBorders}
                onChange={(e) => onLockOpenBordersChange?.(e.target.checked)}
                className="mt-0.5 rounded accent-emerald-500 cursor-pointer"
              />
              <div>
                <div className="text-xs font-semibold text-zinc-200">
                  Lock Open Mesh Borders
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                  Locks non-manifold or open shell borders to keep outer edges crisp.
                </p>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
