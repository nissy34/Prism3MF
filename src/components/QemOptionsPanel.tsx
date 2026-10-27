import React from 'react';
import {
  SlidersHorizontal,
  Pin,
  PinOff,
  X,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Layers,
  HelpCircle,
} from 'lucide-react';

export interface QemOptionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  lockColorBoundaries: boolean;
  onLockColorBoundariesChange: (v: boolean) => void;
  colorBoundaryWeight: number;
  onColorBoundaryWeightChange: (v: number) => void;
  resolveSubdivisions: boolean;
  onResolveSubdivisionsChange: (v: boolean) => void;
  maxGeometricError: number;
  onMaxGeometricErrorChange: (v: number) => void;
  lockOpenBorders: boolean;
  onLockOpenBordersChange: (v: boolean) => void;
  onResetDefaults: () => void;
  onApplyChanges?: () => void;
  hasUnappliedChanges?: boolean;
  isProcessing?: boolean;
  mode?: 'panel' | 'drawer'; // 'panel' for desktop dock/flyout, 'drawer' for mobile slide-up sheet
}

export function QemOptionsPanel({
  isOpen,
  onClose,
  isPinned,
  onTogglePin,
  lockColorBoundaries,
  onLockColorBoundariesChange,
  colorBoundaryWeight,
  onColorBoundaryWeightChange,
  resolveSubdivisions,
  onResolveSubdivisionsChange,
  maxGeometricError,
  onMaxGeometricErrorChange,
  lockOpenBorders,
  onLockOpenBordersChange,
  onResetDefaults,
  onApplyChanges,
  hasUnappliedChanges = false,
  isProcessing = false,
  mode = 'panel',
}: QemOptionsPanelProps) {
  if (!isOpen) return null;

  const content = (
    <div className="flex flex-col h-full overflow-hidden text-zinc-100">
      {/* Header */}
      <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/90">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              QEM Algorithm Options
            </h3>
            <p className="text-[10px] text-zinc-400 hidden sm:block">
              Fine-tune color boundary constraints & geometric accuracy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {mode === 'panel' && (
            <button
              type="button"
              onClick={onTogglePin}
              className={`p-1.5 rounded-md border transition-colors ${
                isPinned
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
              title={isPinned ? 'Unpin panel (float)' : 'Pin panel to workspace'}
            >
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 border border-zinc-700 transition-colors"
            title="Close options"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Parameters Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain">
        {/* Option 1: Lock Color Boundaries */}
        <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={lockColorBoundaries}
              onChange={(e) => onLockColorBoundariesChange(e.target.checked)}
              className="mt-0.5 rounded accent-emerald-500"
            />
            <div>
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Keep Paint Edges Sharp
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                Applies infinite quadric error penalties along color borders. Multi-color eyes, logos,
                and painted patterns will never bleed across neighboring triangles.
              </p>
            </div>
          </label>
        </div>

        {/* Option 2: Color Seam Strictness */}
        <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2">
          <div className="flex justify-between items-baseline text-xs">
            <label htmlFor="boundary-weight-slider-opt" className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Color Seam Strictness
            </label>
            <span className="font-mono text-emerald-400 font-bold">{colorBoundaryWeight}x</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Multiplies edge-collapse cost along paint boundaries. Higher values keep fine color
            strokes strictly intact; lower values allow more aggressive simplification along seams.
          </p>
          <input
            id="boundary-weight-slider-opt"
            type="range"
            min={10}
            max={2000}
            step={10}
            value={colorBoundaryWeight}
            onChange={(e) => onColorBoundaryWeightChange(parseInt(e.target.value, 10))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
            <span>10x (Soft)</span>
            <span>500x (Default)</span>
            <span>2000x (Strict)</span>
          </div>
        </div>

        {/* Option 3: Preserve Fine Brush Strokes */}
        <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={resolveSubdivisions}
              onChange={(e) => onResolveSubdivisionsChange(e.target.checked)}
              className="mt-0.5 rounded accent-emerald-500"
            />
            <div>
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                Preserve Fine Brush Strokes
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                Resolves internal slicer brush stroke sub-triangles (<code className="text-zinc-300">paint_color</code> trees)
                before simplification so curved brush lines stay smooth instead of jagged.
              </p>
            </div>
          </label>
        </div>

        {/* Option 4: Max Geometric Error */}
        <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2">
          <div className="flex justify-between items-baseline text-xs">
            <label htmlFor="geom-error-slider-opt" className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
              Max Shape Deviation
            </label>
            <span className="font-mono text-emerald-400 font-bold">
              {(maxGeometricError * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Stops decimation early if surface deviation exceeds this percentage of the model
            size. Keeps curved organic or mechanical silhouettes accurate.
          </p>
          <input
            id="geom-error-slider-opt"
            type="range"
            min={0.002}
            max={0.1}
            step={0.002}
            value={maxGeometricError}
            onChange={(e) => onMaxGeometricErrorChange(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
            <span>0.2% (Strict)</span>
            <span>2.0% (Default)</span>
            <span>10.0% (Fast)</span>
          </div>
        </div>

        {/* Option 5: Lock Open Borders */}
        <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={lockOpenBorders}
              onChange={(e) => onLockOpenBordersChange(e.target.checked)}
              className="mt-0.5 rounded accent-emerald-500"
            />
            <div>
              <div className="text-xs font-semibold text-zinc-200">
                Lock Open Perimeter Borders
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                Prevents non-manifold boundary edges from collapsing inward on open surfaces or flat plates.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-3 bg-zinc-900/90 border-t border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onResetDefaults}
          className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
          title="Reset to recommended defaults (500x seam weight, 2.0% error)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Defaults</span>
        </button>

        {onApplyChanges && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => {
              onApplyChanges();
              if (!isPinned) onClose();
            }}
            className="px-3.5 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            {hasUnappliedChanges ? 'Apply & Re-simplify' : 'Apply Options'}
          </button>
        )}
      </div>
    </div>
  );

  // If in mobile drawer mode:
  if (mode === 'drawer') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
        <div className="relative z-10 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl max-h-[85dvh] flex flex-col shadow-2xl">
          {content}
        </div>
      </div>
    );
  }

  // If pinned on desktop: docks as a right-hand sidebar
  if (isPinned) {
    return (
      <aside className="w-80 border-l border-zinc-800/90 bg-zinc-900/95 shrink-0 flex flex-col h-full z-20 shadow-xl">
        {content}
      </aside>
    );
  }

  // If unpinned on desktop: floats as an overlay popover with shadow
  return (
    <div className="absolute top-16 right-4 w-84 max-h-[calc(100vh-5rem)] rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl backdrop-blur-md z-30 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      {content}
    </div>
  );
}
