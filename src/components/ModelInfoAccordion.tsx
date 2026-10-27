import React, { useState } from 'react';
import {
  FileBox,
  ChevronDown,
  ChevronUp,
  Layers,
  Palette,
  CheckCircle2,
  Sparkles,
  Scissors,
} from 'lucide-react';
import { FilamentInfo, CutMeshResult } from '../core/types';

export interface ModelInfoAccordionProps {
  fileName: string;
  fileSize: number;
  baselineTris: number;
  currentSimplifiedTris: number;
  isSimplified: boolean;
  reductionPct: number;
  processingTimeMs: number;
  totalSubdividedTris: number;
  filaments: FilamentInfo[];
  onFilamentColorChange: (id: number, newHex: string) => void;
  cutResult?: CutMeshResult | null;
  defaultExpanded?: boolean;
}

export function ModelInfoAccordion({
  fileName,
  fileSize,
  baselineTris,
  currentSimplifiedTris,
  isSimplified,
  reductionPct,
  processingTimeMs,
  totalSubdividedTris,
  filaments,
  onFilamentColorChange,
  cutResult,
  defaultExpanded = false,
}: ModelInfoAccordionProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const formattedFileSize = (fileSize / (1024 * 1024)).toFixed(1);

  const isCut = cutResult !== null && cutResult !== undefined;
  const cutPartTris = isCut
    ? (cutResult.partA.triangles.length + cutResult.partB.triangles.length) / 3
    : 0;

  return (
    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800/90 shadow-md transition-all overflow-hidden shrink-0">
      {/* Collapsed Header Bar (36-40px): Always visible on top of sidebar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors group cursor-pointer select-none"
        title="Click to toggle model telemetry & filament colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-5 h-5 rounded bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
            <FileBox className="w-3 h-3" />
          </div>

          <div className="flex items-center gap-1.5 min-w-0 text-xs">
            <span className="font-semibold text-zinc-200 truncate max-w-28 sm:max-w-32 lg:max-w-36" title={fileName}>
              {fileName}
            </span>
            <span className="text-zinc-600 shrink-0">•</span>
            <span className="font-mono text-zinc-400 shrink-0 text-[11px]">
              {isCut
                ? `${cutPartTris.toLocaleString()} tris`
                : isSimplified
                  ? `${currentSimplifiedTris.toLocaleString()} tris`
                  : `${baselineTris.toLocaleString()} tris`}
            </span>
            {isSimplified && (
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold shrink-0">
                -{reductionPct}%
              </span>
            )}
            {isCut && (
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold shrink-0 flex items-center gap-0.5">
                <Scissors className="w-2.5 h-2.5" />
                Cut
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {/* Filament color preview dots when collapsed */}
          {!isExpanded && filaments.length > 0 && (
            <div className="flex items-center -space-x-1">
              {filaments.slice(0, 5).map((f) => (
                <span
                  key={f.id}
                  className="w-2.5 h-2.5 rounded-full border border-black/60 shadow-xs"
                  style={{ backgroundColor: f.color }}
                  title={`Slot ${f.id}: ${f.color}`}
                />
              ))}
              {filaments.length > 5 && (
                <span className="text-[9px] text-zinc-400 pl-1.5 font-mono">
                  +{filaments.length - 5}
                </span>
              )}
            </div>
          )}

          <div className="w-5 h-5 rounded flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 transition-colors">
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded Accordion Body */}
      {isExpanded && (
        <div className="p-3 pt-1 border-t border-zinc-800/80 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* File & Mesh Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-950/70 rounded-lg p-2 border border-zinc-800/60">
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                <Layers className="w-2.5 h-2.5 text-zinc-500" />
                Original Mesh
              </div>
              <div className="text-sm font-mono font-bold text-zinc-200 mt-0.5">
                {baselineTris.toLocaleString()} <span className="text-[10px] text-zinc-500 font-normal">tris</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                {formattedFileSize} MB • {filaments.length} colors
              </div>
            </div>

            <div className="bg-zinc-950/70 rounded-lg p-2 border border-zinc-800/60">
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                Active State
              </div>
              <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                {isCut ? (
                  <>
                    {cutPartTris.toLocaleString()}{' '}
                    <span className="text-[10px] text-zinc-400 font-normal">(2 parts)</span>
                  </>
                ) : isSimplified ? (
                  <>
                    {currentSimplifiedTris.toLocaleString()}{' '}
                    <span className="text-[10px] text-emerald-300 font-normal">(-{reductionPct}%)</span>
                  </>
                ) : (
                  <span className="text-zinc-400 font-normal text-xs">Original (Untouched)</span>
                )}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
                {processingTimeMs > 0 ? (
                  <>
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Processed in {(processingTimeMs / 1000).toFixed(2)}s</span>
                  </>
                ) : (
                  <span>Ready for tool actions</span>
                )}
              </div>
            </div>
          </div>

          {/* Filament Palette with Color Pickers */}
          {filaments.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1">
                  <Palette className="w-3 h-3 text-emerald-400" />
                  Filament Palette ({filaments.length})
                </span>
                <span className="text-[10px] text-zinc-500">Click swatch to tint</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                {filaments.map((fil) => (
                  <div
                    key={fil.id}
                    className="flex items-center justify-between p-1.5 rounded-md bg-zinc-950/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <label
                        className="relative w-4 h-4 rounded border border-white/20 shadow-xs shrink-0 cursor-pointer overflow-hidden transition-transform hover:scale-110"
                        title="Click to change color"
                      >
                        <span
                          className="block w-full h-full"
                          style={{ backgroundColor: fil.color }}
                        />
                        <input
                          type="color"
                          value={fil.color}
                          onChange={(e) => onFilamentColorChange(fil.id, e.target.value)}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        />
                      </label>
                      <span className="font-mono text-zinc-300 text-[10px] truncate">
                        #{fil.id} {fil.color.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subdivided Boundary info if applicable */}
          {totalSubdividedTris > 0 && (
            <div className="text-[10px] font-mono text-zinc-500 bg-zinc-950/40 rounded p-1.5 border border-zinc-900 flex items-center justify-between">
              <span>Color Boundary Split:</span>
              <span className="text-zinc-300">+{totalSubdividedTris.toLocaleString()} edge tris</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
