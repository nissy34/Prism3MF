import React from 'react';
import { Sparkles, Palette } from 'lucide-react';
import { FilamentInfo } from '../core/types';

export interface FilamentPaletteProps {
  filaments: FilamentInfo[];
  onFilamentColorChange: (id: number, newHex: string) => void;
  compact?: boolean;
}

export function FilamentPaletteCard({
  filaments,
  onFilamentColorChange,
  compact = false,
}: FilamentPaletteProps) {
  if (filaments.length === 0) {
    if (compact) return null;
    return (
      <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 p-3 text-xs text-zinc-500 flex items-center gap-2">
        <Palette className="w-4 h-4 text-zinc-600 shrink-0" />
        <span>Filament palette will appear once a 3MF file is loaded.</span>
      </div>
    );
  }

  // Compact row style (for mobile HUD or quick bar)
  if (compact) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto py-1 px-0.5 no-scrollbar touch-pan-x overscroll-contain">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>Colors:</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {filaments.map((fil) => (
            <label
              key={fil.id}
              className="relative flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer text-xs shrink-0 transition-colors"
              title={`Slot ${fil.id}: ${fil.name || `Extruder ${fil.id}`} (${fil.type || 'PLA'}) • Click to change preview color`}
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-xs shrink-0"
                style={{ backgroundColor: fil.color }}
              />
              <span className="font-mono text-[11px] text-zinc-300">
                #{fil.id}
              </span>
              <input
                type="color"
                value={fil.color}
                onChange={(e) => onFilamentColorChange(fil.id, e.target.value)}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer pointer-events-auto"
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  // Full Desktop Inspector Card
  return (
    <div className="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-3.5 space-y-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          Active Filaments ({filaments.length})
        </span>
        <span className="text-[11px] text-zinc-400">Click swatch to re-tint</span>
      </div>

      <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {filaments.map((fil) => (
          <div
            key={fil.id}
            className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 hover:border-zinc-700/80 transition-colors text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <label
                className="relative w-6 h-6 rounded-md border border-white/20 shadow-xs shrink-0 cursor-pointer overflow-hidden transition-transform hover:scale-105"
                style={{ backgroundColor: fil.color }}
                title={`Change preview color for Slot ${fil.id}`}
              >
                <input
                  type="color"
                  value={fil.color}
                  onChange={(e) => onFilamentColorChange(fil.id, e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>

              <div className="truncate min-w-0">
                <div className="font-medium text-zinc-200 truncate flex items-center gap-1.5">
                  <span>Slot {fil.id}</span>
                  {fil.name && (
                    <span className="text-zinc-400 font-normal truncate">
                      • {fil.name}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-zinc-400">
                  {fil.color.toUpperCase()}
                </div>
              </div>
            </div>

            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0 border border-zinc-700/50">
              {fil.type || 'PLA'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
