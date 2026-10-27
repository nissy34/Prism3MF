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
  RotateCcw,
  RotateCw,
  Sliders,
  Split,
  FolderDown,
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
  onUndoCut: () => void;
  isProcessing: boolean;
  cutResult: CutMeshResult | null;
  explodedOffset: number;
  onExplodedOffsetChange: (offset: number) => void;
  onExport: (partType: 'all' | 'partA' | 'partB' | 'dowel', assembleInPlace?: boolean) => void;
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
  onUndoCut,
  isProcessing,
  cutResult,
  explodedOffset,
  onExplodedOffsetChange,
  onExport,
  isExporting,
}) => {
  const [pitchAngle, setPitchAngle] = useState<number>(0);
  const [rollAngle, setRollAngle] = useState<number>(0);
  const [assembleInPlace, setAssembleInPlace] = useState<boolean>(false);

  const zMin = Number(meshBounds.min[2].toFixed(1));
  const zMax = Number(meshBounds.max[2].toFixed(1));
  const totalHeight = Math.max(0.1, zMax - zMin);

  const zSliderId = useId();
  const pitchSliderId = useId();
  const rollSliderId = useId();
  const explodeSliderId = useId();
  const diameterSliderId = useId();
  const lengthSliderId = useId();

  const updateNormalFromAngles = (pDeg: number, rDeg: number) => {
    setPitchAngle(pDeg);
    setRollAngle(rDeg);
    const radX = (pDeg * Math.PI) / 180;
    const radY = (rDeg * Math.PI) / 180;
    const nx = Math.cos(radX) * Math.sin(radY);
    const ny = -Math.sin(radX);
    const nz = Math.cos(radX) * Math.cos(radY);
    const len = Math.hypot(nx, ny, nz) || 1;
    onCutPlaneNormalChange([nx / len, ny / len, nz / len]);
  };

  const handlePreset = (pct: number) => {
    const newZ = Number((zMin + totalHeight * pct).toFixed(2));
    onCutPlaneZChange(newZ);
  };

  const handleBuildPlatePreset = (maxPlateZ: number) => {
    if (totalHeight > maxPlateZ) {
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

      {/* When Cut Result exists: show Reset Cut / Back to Original bar */}
      {cutResult && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Model Cut Active</span>
          </div>
          <button
            type="button"
            onClick={onUndoCut}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            title="Discard cut and return to original uncut model"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reset Cut</span>
          </button>
        </div>
      )}

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

        {/* Quick Height Presets */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => handlePreset(0.5)}
            className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          >
            50% Center
          </button>
          <button
            type="button"
            onClick={() => handlePreset(0.33)}
            className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          >
            1/3 Bottom
          </button>
          <button
            type="button"
            onClick={() => handlePreset(0.67)}
            className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
          >
            2/3 Top
          </button>
          {totalHeight > 180 && (
            <button
              type="button"
              onClick={() => handleBuildPlatePreset(180)}
              className="px-2 py-1 text-[11px] font-medium rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 transition-colors cursor-pointer"
            >
              Fit A1 Mini (180mm)
            </button>
          )}
          {totalHeight > 256 && (
            <button
              type="button"
              onClick={() => handleBuildPlatePreset(256)}
              className="px-2 py-1 text-[11px] font-medium rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 transition-colors cursor-pointer"
            >
              Fit X1/P1 (256mm)
            </button>
          )}
        </div>
      </div>

      {/* Plane Rotation & Angle Controls */}
      <div className="flex flex-col gap-2.5 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800/60">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-300">
          <span className="flex items-center gap-1.5">
            <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
            Plane Cut Rotation (Tilt & Angle)
          </span>
          <span className="font-mono text-zinc-400 text-[11px]">
            {pitchAngle}° X • {rollAngle}° Y
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-zinc-400 text-[11px]">
              <label htmlFor={pitchSliderId}>Pitch (Tilt X)</label>
              <span className="font-mono text-zinc-200">{pitchAngle}°</span>
            </div>
            <input
              id={pitchSliderId}
              type="range"
              min="-60"
              max="60"
              step="1"
              value={pitchAngle}
              onChange={(e) => updateNormalFromAngles(parseFloat(e.target.value), rollAngle)}
              className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-zinc-400 text-[11px]">
              <label htmlFor={rollSliderId}>Roll (Tilt Y)</label>
              <span className="font-mono text-zinc-200">{rollAngle}°</span>
            </div>
            <input
              id={rollSliderId}
              type="range"
              min="-60"
              max="60"
              step="1"
              value={rollAngle}
              onChange={(e) => updateNormalFromAngles(pitchAngle, parseFloat(e.target.value))}
              className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Quick Rotation Angle Presets */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => updateNormalFromAngles(0, 0)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
              pitchAngle === 0 && rollAngle === 0
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            Flat (0°)
          </button>
          <button
            type="button"
            onClick={() => updateNormalFromAngles(45, 0)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
              pitchAngle === 45 && rollAngle === 0
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            +45° Pitch
          </button>
          <button
            type="button"
            onClick={() => updateNormalFromAngles(-45, 0)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
              pitchAngle === -45 && rollAngle === 0
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            -45° Pitch
          </button>
          <button
            type="button"
            onClick={() => updateNormalFromAngles(0, 45)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
              pitchAngle === 0 && rollAngle === 45
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            +45° Roll
          </button>
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
                className={`py-1.5 px-2 rounded border text-center transition-all cursor-pointer ${
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
                className={`py-1.5 px-2 rounded border text-center transition-all cursor-pointer ${
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
                    className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
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

      {/* Action Buttons: Execute Cut or Reset */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onExecuteCut}
          disabled={isProcessing}
          className="flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Scissors className="w-4 h-4" />
          {isProcessing ? 'Slicing & Capping...' : cutResult ? 'Recut Plane' : 'Perform Cut (Keep Colors)'}
        </button>
        {cutResult && (
          <button
            type="button"
            onClick={onUndoCut}
            disabled={isProcessing}
            className="py-2.5 px-3.5 rounded-lg font-medium text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
            title="Discard cut and return to original uncut model"
          >
            <RotateCcw className="w-4 h-4 text-emerald-400" />
            <span>Reset Cut</span>
          </button>
        )}
      </div>

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

          {/* 3MF Export Options */}
          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-400">
                <Box className="w-3.5 h-3.5 text-emerald-400" />
                3MF Object Layout
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setAssembleInPlace(false)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                    !assembleInPlace
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                  }`}
                  title="Place parts side-by-side on the print bed"
                >
                  Plate-Ready
                </button>
                <button
                  type="button"
                  onClick={() => setAssembleInPlace(true)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                    assembleInPlace
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                  }`}
                  title="Keep parts at original aligned 3D coordinates (import as multi-body assembly)"
                >
                  Assembled
                </button>
              </div>
            </div>

            {/* Combined 3MF Export Button */}
            <button
              type="button"
              onClick={() => onExport('all', assembleInPlace)}
              disabled={isExporting}
              className="w-full py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                Export Combined 3MF ({assembleInPlace ? 'Assembled' : 'Plate-Ready'})
              </span>
            </button>

            {/* Individual Parts Export Buttons */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onExport('partA')}
                disabled={isExporting}
                className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center justify-center gap-1 border border-zinc-700 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                Part A Only (.3mf)
              </button>
              <button
                type="button"
                onClick={() => onExport('partB')}
                disabled={isExporting}
                className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center justify-center gap-1 border border-zinc-700 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                Part B Only (.3mf)
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
