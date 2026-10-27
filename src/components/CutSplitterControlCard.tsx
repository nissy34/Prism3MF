import React, { useState, useId } from 'react';
import {
  Scissors,
  Download,
  Layers,
  Sparkles,
  Maximize2,
  Box,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Disc,
} from 'lucide-react';
import {
  CutPlaneOptions,
  CutMeshResult,
  CutConnectorOptions,
} from '../core/types';

interface CutSplitterControlCardProps {
  meshBounds: { min: [number, number, number]; max: [number, number, number] };
  cutPlaneZ: number;
  onCutPlaneZChange: (z: number) => void;
  cutPlaneNormal: [number, number, number];
  onCutPlaneNormalChange: (norm: [number, number, number]) => void;
  connectorOptions: CutConnectorOptions;
  onConnectorOptionsChange: (opts: CutConnectorOptions) => void;
  capFaces: boolean;
  onCapFacesChange: (cap: boolean) => void;
  onExecuteCut: () => void;
  isProcessing: boolean;
  cutResult: CutMeshResult | null;
  explodedOffset: number;
  onExplodedOffsetChange: (offset: number) => void;
  onExport: (partType: 'all' | 'partA' | 'partB' | 'dowel') => void;
  isExporting: boolean;
}

export const CutSplitterControlCard: React.FC<CutSplitterControlCardProps> = ({
  meshBounds,
  cutPlaneZ,
  onCutPlaneZChange,
  cutPlaneNormal,
  onCutPlaneNormalChange,
  connectorOptions,
  onConnectorOptionsChange,
  capFaces,
  onCapFacesChange,
  onExecuteCut,
  isProcessing,
  cutResult,
  explodedOffset,
  onExplodedOffsetChange,
  onExport,
  isExporting,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const zMin = Number(meshBounds.min[2].toFixed(1));
  const zMax = Number(meshBounds.max[2].toFixed(1));
  const totalHeight = Math.max(0.1, zMax - zMin);

  const zSliderId = useId();
  const explodeSliderId = useId();
  const diameterSliderId = useId();
  const lengthSliderId = useId();

  const handlePreset = (pct: number) => {
    const newZ = Number((zMin + totalHeight * pct).toFixed(2));
    onCutPlaneZChange(newZ);
  };

  const handleBuildPlatePreset = (maxPlateZ: number) => {
    if (totalHeight > maxPlateZ) {
      // Cut so bottom half fits maxPlateZ
      const newZ = Number((zMin + maxPlateZ).toFixed(2));
      onCutPlaneZChange(newZ);
    } else {
      handlePreset(0.5);
    }
  };

  return (
    <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-4 sm:p-5 shadow-2xl flex flex-col gap-4 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              Color-Preserving Cut Splitter
            </h2>
            <p className="text-xs text-zinc-400">
              Cut large models to fit build plates while keeping all paint zones intact
            </p>
          </div>
        </div>
      </div>

      {/* Cut Plane Position Slider */}
      <div className="flex flex-col gap-2 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800/60">
        <div className="flex items-center justify-between">
          <label htmlFor={zSliderId} className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            Cut Height (Z Plane)
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={Number(cutPlaneZ.toFixed(1))}
              step="0.5"
              min={zMin}
              max={zMax}
              onChange={(e) => onCutPlaneZChange(parseFloat(e.target.value) || zMin)}
              className="w-16 px-1.5 py-0.5 text-xs text-right font-mono bg-zinc-900 border border-zinc-700 rounded text-emerald-400 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-zinc-400">mm</span>
          </div>
        </div>

        <input
          id={zSliderId}
          type="range"
          min={zMin}
          max={zMax}
          step="0.1"
          value={cutPlaneZ}
          onChange={(e) => onCutPlaneZChange(parseFloat(e.target.value))}
          className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
        />

        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
          <span>Min: {zMin} mm</span>
          <span className="text-emerald-400 font-medium">
            {(((cutPlaneZ - zMin) / totalHeight) * 100).toFixed(0)}% Height
          </span>
          <span>Max: {zMax} mm</span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => handlePreset(0.5)}
            className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            50% Center
          </button>
          <button
            type="button"
            onClick={() => handlePreset(0.33)}
            className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            1/3 Bottom
          </button>
          <button
            type="button"
            onClick={() => handlePreset(0.67)}
            className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            2/3 Top
          </button>
          {totalHeight > 180 && (
            <button
              type="button"
              onClick={() => handleBuildPlatePreset(180)}
              className="px-2 py-1 text-[11px] font-medium rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 transition-colors"
            >
              Fit A1 Mini (180mm)
            </button>
          )}
          {totalHeight > 256 && (
            <button
              type="button"
              onClick={() => handleBuildPlatePreset(256)}
              className="px-2 py-1 text-[11px] font-medium rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 transition-colors"
            >
              Fit X1/P1 (256mm)
            </button>
          )}
        </div>
      </div>

      {/* Alignment Dowel Connectors Settings */}
      <div className="bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800/60 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={connectorOptions.enabled}
              onChange={(e) =>
                onConnectorOptionsChange({
                  ...connectorOptions,
                  enabled: e.target.checked,
                  style: e.target.checked && connectorOptions.style === 'none' ? 'dowel_sockets' : connectorOptions.style,
                })
              }
              className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
            />
            <Disc className="w-3.5 h-3.5 text-emerald-400" />
            Add Alignment Connectors (Dowels & Sockets)
          </label>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            FDM Ready
          </span>
        </div>

        {connectorOptions.enabled && (
          <div className="flex flex-col gap-2.5 pt-1 border-t border-zinc-800/60">
            {/* Style Selector */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  onConnectorOptionsChange({
                    ...connectorOptions,
                    style: 'dowel_sockets',
                  })
                }
                className={`py-1.5 px-2 rounded border text-center transition-all ${
                  connectorOptions.style === 'dowel_sockets'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-medium'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                Dowel Sockets (Both) + Pin
              </button>
              <button
                type="button"
                onClick={() =>
                  onConnectorOptionsChange({
                    ...connectorOptions,
                    style: 'integrated_pin',
                  })
                }
                className={`py-1.5 px-2 rounded border text-center transition-all ${
                  connectorOptions.style === 'integrated_pin'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-medium'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                Integrated Pin on Part A
              </button>
            </div>

            {/* Diameter & Length */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-zinc-400">
                  <label htmlFor={diameterSliderId}>Diameter</label>
                  <span className="font-mono text-zinc-200">{connectorOptions.diameter} mm</span>
                </div>
                <input
                  id={diameterSliderId}
                  type="range"
                  min="3.0"
                  max="10.0"
                  step="0.5"
                  value={connectorOptions.diameter}
                  onChange={(e) =>
                    onConnectorOptionsChange({
                      ...connectorOptions,
                      diameter: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-zinc-400">
                  <label htmlFor={lengthSliderId}>Length</label>
                  <span className="font-mono text-zinc-200">{connectorOptions.length} mm</span>
                </div>
                <input
                  id={lengthSliderId}
                  type="range"
                  min="6.0"
                  max="20.0"
                  step="1.0"
                  value={connectorOptions.length}
                  onChange={(e) =>
                    onConnectorOptionsChange({
                      ...connectorOptions,
                      length: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Fit Clearance Tolerance */}
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
              <span>Press-Fit Tolerance</span>
              <div className="flex gap-1">
                {[0.15, 0.2, 0.25].map((tol) => (
                  <button
                    key={tol}
                    type="button"
                    onClick={() =>
                      onConnectorOptionsChange({
                        ...connectorOptions,
                        tolerance: tol,
                      })
                    }
                    className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                      connectorOptions.tolerance === tol
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {tol}mm
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Watertight Cap Toggle */}
      <div className="flex items-center justify-between px-1">
        <label className="text-xs text-zinc-300 flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={capFaces}
            onChange={(e) => onCapFacesChange(e.target.checked)}
            className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
          />
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Seal & Cap Cut Cross-Sections (Watertight Manifold)
        </label>
      </div>

      {/* Action Button: Execute Cut */}
      <button
        type="button"
        onClick={onExecuteCut}
        disabled={isProcessing}
        className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <Scissors className="w-4 h-4" />
        {isProcessing ? 'Slicing & Capping Mesh...' : 'Slice Model & Keep Colors'}
      </button>

      {/* Cut Results & Exploded View */}
      {cutResult && (
        <div className="bg-zinc-950/80 p-3.5 rounded-lg border border-emerald-500/30 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Slicing Complete ({cutResult.processingTimeMs.toFixed(0)} ms)
            </span>
            <span className="font-mono text-zinc-400 text-[11px]">
              Area: {cutResult.crossSectionArea.toFixed(1)} mm²
            </span>
          </div>

          {/* Exploded Separation View Slider */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-800/80">
            <div className="flex justify-between text-xs text-zinc-300">
              <label htmlFor={explodeSliderId} className="flex items-center gap-1">
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                Exploded View Separation
              </label>
              <span className="font-mono text-emerald-400">{explodedOffset} mm</span>
            </div>
            <input
              id={explodeSliderId}
              type="range"
              min="0"
              max="40"
              step="1"
              value={explodedOffset}
              onChange={(e) => onExplodedOffsetChange(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded cursor-pointer"
            />
          </div>

          {/* Part Stats */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-zinc-900/60 p-2 rounded border border-zinc-800">
            <div>
              <div className="text-zinc-400">Part A (Upper)</div>
              <div className="text-zinc-200 font-semibold">
                {cutResult.partA.triangleCount.toLocaleString()} tris
              </div>
              <div className="text-zinc-400 text-[10px]">
                Z: {cutResult.partA.bounds.min[2].toFixed(1)} → {cutResult.partA.bounds.max[2].toFixed(1)}mm
              </div>
            </div>
            <div>
              <div className="text-zinc-400">Part B (Lower)</div>
              <div className="text-zinc-200 font-semibold">
                {cutResult.partB.triangleCount.toLocaleString()} tris
              </div>
              <div className="text-zinc-400 text-[10px]">
                Z: {cutResult.partB.bounds.min[2].toFixed(1)} → {cutResult.partB.bounds.max[2].toFixed(1)}mm
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => onExport('all')}
              disabled={isExporting}
              className="w-full py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Multi-Part 3MF (Plate-Ready)
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onExport('partA')}
                disabled={isExporting}
                className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center justify-center gap-1 border border-zinc-700 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                Part A Only
              </button>
              <button
                type="button"
                onClick={() => onExport('partB')}
                disabled={isExporting}
                className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center justify-center gap-1 border border-zinc-700 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                Part B Only
              </button>
            </div>

            {cutResult.dowelPin && (
              <button
                type="button"
                onClick={() => onExport('dowel')}
                disabled={isExporting}
                className="w-full py-1.5 px-2 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center justify-center gap-1 border border-zinc-700/80 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-teal-400" />
                Export Companion Dowel Pin (.3mf)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
