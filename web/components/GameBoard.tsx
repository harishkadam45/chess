"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BOARD_THEME_IDS, BOARD_THEMES, DEFAULT_BOARD_THEME, type BoardThemeId } from "@/lib/boardTheme";
import { ChessBoard } from "./ChessBoard";

const ChessBoard3D = dynamic(() => import("./three/ChessBoard3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-amber-300/70">Booting arena…</div>,
});

interface Props {
  fen: string;
  orientation?: "white" | "black";
  canMove: "w" | "b" | null;
  onMove?: (m: { from: string; to: string; promotion?: string }) => void;
  lastMove?: { from: string; to: string } | null;
  /** Rendered above/below the board in 2D; as a glass HUD over the arena in 3D. */
  top?: ReactNode;
  bottom?: ReactNode;
}

type View = "3d" | "2d";
type Quality = "high" | "low";

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
const write = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {}
};

/** Board chooser: cinematic 3D arena (default) or the flat 2D board. Remembers the choice. */
export function GameBoard({ fen, orientation = "white", canMove, onMove, lastMove, top, bottom }: Props) {
  const [view, setView] = useState<View>("3d");
  const [quality, setQuality] = useState<Quality>("high");
  const [resetKey, setResetKey] = useState(0);
  const [theme, setTheme] = useState<BoardThemeId>(DEFAULT_BOARD_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(read("boardTheme", DEFAULT_BOARD_THEME, BOARD_THEME_IDS));
    setView(read("view", "3d", ["3d", "2d"] as const));
    const lowEnd = (navigator.hardwareConcurrency ?? 8) < 4 || matchMedia("(prefers-reduced-motion: reduce)").matches;
    setQuality(read("quality", lowEnd ? "low" : "high", ["high", "low"] as const));
    setReady(true);
  }, []);

  // Keep the latest handler in a ref so the memoised 3D canvas isn't re-rendered by every parent tick (clocks).
  const handler = useRef(onMove);
  handler.current = onMove;
  const stableMove = useCallback((m: { from: string; to: string; promotion?: string }) => handler.current?.(m), []);

  const toggle = (
    <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5 text-xs">
      {view === "3d" && (
        <>
          <button
            aria-label="Reset camera"
            className="rounded-md border border-amber-400/30 bg-stone-950/60 px-2.5 py-1 text-amber-100 backdrop-blur hover:bg-amber-400/20"
            onClick={() => setResetKey((k) => k + 1)}
          >
            ⟲ View
          </button>
          <button
            aria-label="Toggle graphics quality"
            className="rounded-md border border-amber-400/30 bg-stone-950/60 px-2.5 py-1 text-amber-100 backdrop-blur hover:bg-amber-400/20"
            onClick={() => {
              const q = quality === "high" ? "low" : "high";
              setQuality(q);
              write("quality", q);
            }}
          >
            {quality === "high" ? "FX high" : "FX low"}
          </button>
        </>
      )}
      <button
        aria-label="Switch board view"
        data-testid="view-toggle"
        className="rounded-md border border-orange-400/40 bg-stone-950/60 px-2.5 py-1 font-semibold text-orange-200 backdrop-blur hover:bg-orange-400/20"
        onClick={() => {
          const v = view === "3d" ? "2d" : "3d";
          setView(v);
          write("view", v);
        }}
      >
        {view === "3d" ? "2D" : "3D"}
      </button>
      {/* only worth showing when there is more than one theme to switch between */}
      {BOARD_THEME_IDS.length > 1 && <button
        aria-label="Change board theme"
        data-testid="theme-toggle"
        title="Change board theme"
        className="flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-stone-950/60 px-2.5 py-1 text-amber-100 backdrop-blur hover:bg-amber-300/20"
        onClick={() => {
          const t = BOARD_THEME_IDS[(BOARD_THEME_IDS.indexOf(theme) + 1) % BOARD_THEME_IDS.length];
          setTheme(t);
          write("boardTheme", t);
        }}
      >
        <span className="flex overflow-hidden rounded-sm">
          <span className="h-3 w-2" style={BOARD_THEMES[theme].flat.light} />
          <span className="h-3 w-2" style={BOARD_THEMES[theme].flat.dark} />
        </span>
        {BOARD_THEMES[theme].label}
      </button>}
    </div>
  );

  if (!ready) return <div className="aspect-[4/3] w-full max-w-[860px] animate-pulse rounded-2xl bg-stone-900/60" />;

  if (view === "2d") {
    return (
      <div className="relative flex flex-col items-center">
        {toggle}
        <div className="w-full max-w-[min(90vw,640px)]">{top}</div>
        <ChessBoard fen={fen} orientation={orientation} canMove={canMove} onMove={onMove} lastMove={lastMove} theme={theme} />
        <div className="w-full max-w-[min(90vw,640px)]">{bottom}</div>
      </div>
    );
  }

  return (
    <div
      className="relative aspect-[4/5] w-full max-w-[860px] overflow-hidden rounded-2xl border border-amber-400/25 bg-[#120c07] shadow-[0_0_60px_rgba(255,154,46,.15),0_0_90px_rgba(196,120,60,.1)] sm:aspect-[4/3]"
      data-view="3d"
    >
      <ChessBoard3D
        fen={fen}
        orientation={orientation}
        canMove={canMove}
        onMove={stableMove}
        lastMove={lastMove}
        quality={quality}
        resetKey={resetKey}
        theme={theme}
      />
      {toggle}
      {top && <div className="pointer-events-none absolute left-3 right-24 top-3 z-10 max-w-sm rounded-xl border border-orange-400/30 bg-stone-950/55 px-3 backdrop-blur-md">{top}</div>}
      {bottom && <div className="pointer-events-none absolute bottom-3 left-3 z-10 w-[min(24rem,calc(100%-1.5rem))] rounded-xl border border-amber-400/30 bg-stone-950/55 px-3 backdrop-blur-md">{bottom}</div>}
    </div>
  );
}
