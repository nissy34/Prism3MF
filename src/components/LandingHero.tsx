import React from 'react';
import {
  Scissors,
  Layers,
  Palette,
  Upload,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Puzzle,
} from 'lucide-react';

export interface LandingHeroProps {
  onSelectFile: () => void;
  onLoadDemo: (mode?: 'simplify' | 'cut') => void;
}

export function LandingHero({ onSelectFile, onLoadDemo }: LandingHeroProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto w-full max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Title & Headline */}
      <div className="text-center space-y-2 max-w-2xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Multi-Tool Suite for 3MF</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-zinc-100 tracking-tight">
          Professional In-Browser Tools for 3MF Files
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
          Cut, simplify, and inspect multi-color 3MF files directly in your browser.
          100% client-side WebAssembly — zero uploads, ultra-fast and completely private.
        </p>
      </div>

      {/* Main Drag & Drop Zone */}
      <div className="w-full max-w-2xl rounded-2xl border-2 border-dashed border-zinc-700/80 hover:border-emerald-500/60 bg-zinc-900/70 hover:bg-zinc-900/90 p-6 sm:p-8 text-center transition-all shadow-xl group">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shadow-inner">
            <Upload className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <div className="text-sm sm:text-base font-semibold text-zinc-200">
              Drop your .3MF model here
            </div>
            <p className="text-xs text-zinc-500">
              Supports Bambu Studio, OrcaSlicer, and PrusaSlicer painted multi-material files
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onSelectFile}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:scale-[1.02] cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Browse .3MF File
            </button>
            <button
              type="button"
              onClick={() => onLoadDemo()}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-2 transition-colors hover:scale-[1.02] cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Try Demo Model
            </button>
          </div>
        </div>
      </div>

      {/* Modular Tool Cards Section */}
      <div className="w-full space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 text-center sm:text-left">
          Available Tools in This Suite
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Card 1: Planar Cut Splitter */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/90 p-4 sm:p-5 flex flex-col justify-between transition-all hover:border-emerald-500/40 group">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                  <Scissors className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  NEW TOOL
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-1.5">
                Planar Cut Splitter
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Slice oversized models to fit your build plate (A1 Mini 180mm, X1/P1 256mm).
                Adds watertight cut caps, interlocking dowel pins, and alignment sockets while preserving all painted color zones.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 font-mono">Dowel Pins • Caps • Glue-Free</span>
              <button
                type="button"
                onClick={() => onLoadDemo('cut')}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform cursor-pointer"
              >
                <span>Try Cut Splitter</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Card 2: Color-Preserving Simplifier */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/90 p-4 sm:p-5 flex flex-col justify-between transition-all hover:border-emerald-500/40 group">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Smart Decimation
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-1.5">
                Color-Preserving Simplifier
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Decimate dense meshes up to 90% without losing multi-color details using quadric error metric (QEM) edge decimation with strict paint boundary preservation.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 font-mono">Up to -90% Tris • Zero Color Bleed</span>
              <button
                type="button"
                onClick={() => onLoadDemo('simplify')}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform cursor-pointer"
              >
                <span>Try Simplifier</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Badges footer */}
      <div className="grid grid-cols-3 gap-2 w-full pt-1 text-[11px] text-zinc-400 border-t border-zinc-800/80">
        <div className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-zinc-900/40">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">100% Private (Local WASM)</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-zinc-900/40">
          <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Web Worker Multi-Threaded</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-zinc-900/40">
          <Puzzle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Slicer-Compatible (.3MF)</span>
        </div>
      </div>
    </div>
  );
}
