"use client";
import { useEffect, useRef } from "react";

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  const m = Math.floor(s / 60);
  if (total < 10_000) return `${m}:${String(s % 60).padStart(2, "0")}.${Math.floor((total % 1000) / 100)}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function PlayerBar({
  name, rating, ms, active,
}: { name: string; rating?: number; ms?: number; active?: boolean }) {
  return (
    <div className="flex w-full max-w-[min(90vw,640px)] items-center justify-between py-1.5">
      <span className="font-semibold">
        {name} {rating !== undefined && <span className="text-sm font-normal text-stone-500">({rating})</span>}
      </span>
      {ms !== undefined && (
        <span
          className={`rounded-md px-3 py-1 font-mono text-lg tabular-nums ${
            active ? "bg-amber-600 text-white" : "bg-stone-200 dark:bg-stone-800"
          } ${ms < 10_000 && active ? "!bg-red-600" : ""}`}
        >
          {formatClock(ms)}
        </span>
      )}
    </div>
  );
}

export function MoveList({
  moves, current, onSelect,
}: { moves: string[]; current?: number; onSelect?: (ply: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("[data-current=true]")?.scrollIntoView({ block: "nearest" });
  }, [current, moves.length]);

  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);
  const cell = (ply: number, san?: string) =>
    san && (
      <button
        data-current={current === ply}
        disabled={!onSelect}
        onClick={() => onSelect?.(ply)}
        className={`rounded px-1.5 py-0.5 text-left ${current === ply ? "bg-amber-600 text-white" : "hover:bg-stone-200 dark:hover:bg-stone-800"}`}
      >
        {san}
      </button>
    );

  return (
    <div ref={ref} className="max-h-72 overflow-y-auto font-mono text-sm">
      {rows.length === 0 && <p className="text-stone-500">No moves yet.</p>}
      <div className="grid grid-cols-[2rem_1fr_1fr] gap-y-0.5">
        {rows.map(([w, b], i) => (
          <div key={i} className="contents">
            <span className="text-stone-500">{i + 1}.</span>
            {cell(i * 2 + 1, w)}
            {cell(i * 2 + 2, b) || <span />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function describeResult(result: string | null, reason: string | null): string {
  if (!result) return "";
  const who = result === "1-0" ? "White wins" : result === "0-1" ? "Black wins" : "Draw";
  const why: Record<string, string> = {
    checkmate: "by checkmate", resign: "by resignation", timeout: "on time", stalemate: "by stalemate",
    repetition: "by repetition", insufficient: "(insufficient material)", "fifty-move": "(50-move rule)",
    agreement: "by agreement",
  };
  return `${who} ${reason ? why[reason] ?? "" : ""}`.trim();
}
