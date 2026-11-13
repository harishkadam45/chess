"use client";
import { Chess } from "chess.js";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameBoard } from "@/components/GameBoard";
import { MoveList } from "@/components/GameParts";
import { api } from "@/lib/api";
import { Engine, formatScore, scoreToCp, type Score } from "@/lib/engine";

interface Loaded {
  pgn: string;
  white: string;
  black: string;
}

type Grade = "blunder" | "mistake" | "inaccuracy" | null;
const gradeColor: Record<string, string> = { blunder: "text-red-600", mistake: "text-orange-500", inaccuracy: "text-yellow-600" };

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [ply, setPly] = useState(0);
  const [evals, setEvals] = useState<(Score | undefined)[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (id === "local") {
      const pgn = sessionStorage.getItem("lastAiPgn");
      if (pgn) setLoaded({ pgn, white: "White", black: "Black" });
      else setError("No local game to analyze.");
      return;
    }
    api<{ pgn: string; white: { name: string }; black: { name: string } }>(`/games/${id}`).then(
      (g) => setLoaded({ pgn: g.pgn, white: g.white.name, black: g.black.name }),
      () => setError("Game not found"),
    );
  }, [id]);

  // Positions after each ply (index 0 = start) and their SAN moves.
  const { fens, sans, moves } = useMemo(() => {
    if (!loaded) return { fens: [new Chess().fen()], sans: [] as string[], moves: [] as { from: string; to: string }[] };
    const c = new Chess();
    c.loadPgn(loaded.pgn);
    const hist = c.history({ verbose: true });
    const r = new Chess();
    const fens = [r.fen()];
    for (const m of hist) {
      r.move(m.san);
      fens.push(r.fen());
    }
    return { fens, sans: hist.map((m) => m.san), moves: hist.map((m) => ({ from: m.from, to: m.to })) };
  }, [loaded]);

  // Evaluate every position once, sequentially, in the background.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || started.current === loaded.pgn) return;
    started.current = loaded.pgn;
    const engine = new Engine();
    let dead = false;
    (async () => {
      const out: Score[] = [];
      for (let i = 0; i < fens.length && !dead; i++) {
        out[i] = await engine.evaluate(fens[i], 12);
        setEvals([...out]);
        setProgress(i + 1);
      }
    })();
    return () => {
      dead = true;
      started.current = null;
      engine.terminate();
    };
  }, [loaded, fens]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPly((p) => Math.min(sans.length, p + 1));
      if (e.key === "Home") setPly(0);
      if (e.key === "End") setPly(sans.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sans.length]);

  // Grade each move by how much the mover's evaluation dropped.
  const grades = useMemo(
    () =>
      sans.map((_, i): Grade => {
        const before = evals[i];
        const after = evals[i + 1];
        if (!before || !after) return null;
        const sign = i % 2 === 0 ? 1 : -1; // white moved on even i
        const loss = sign * (scoreToCp(before) - scoreToCp(after));
        return loss >= 300 ? "blunder" : loss >= 150 ? "mistake" : loss >= 60 ? "inaccuracy" : null;
      }),
    [sans, evals],
  );

  if (error) return <p className="card mx-auto max-w-md text-center">{error}</p>;
  if (!loaded) return null;

  const cur = evals[ply];
  const whitePct = cur ? 50 + scoreToCp(cur) / 20 : 50;
  const W = 300, H = 60;
  const points = evals
    .map((e, i) => e && `${(i / Math.max(1, fens.length - 1)) * W},${H / 2 - (scoreToCp(e) / 1000) * (H / 2)}`)
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
      <div className="flex w-full min-w-0 items-stretch gap-3 lg:max-w-[900px] lg:flex-1">
        <div className="relative w-5 overflow-hidden rounded bg-stone-800" title={cur ? formatScore(cur) : "…"}>
          <div className="absolute bottom-0 w-full bg-white transition-all" style={{ height: `${Math.max(2, Math.min(98, whitePct))}%` }} />
        </div>
        <GameBoard
          fen={fens[ply]}
          canMove={null}
          lastMove={ply > 0 ? moves[ply - 1] : null}
        />
      </div>
      <aside className="card w-full max-w-sm space-y-4 lg:w-96 lg:shrink-0">
        <h1 className="font-bold">{loaded.white} vs {loaded.black}</h1>
        <div className="flex items-center justify-between text-sm">
          <span>Eval: <b>{cur ? formatScore(cur) : "…"}</b></span>
          <span className="text-stone-500">
            {progress < fens.length ? `Analyzing ${progress}/${fens.length}` : "Analysis complete"}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-stone-100 dark:bg-stone-800" role="img" aria-label="Evaluation graph">
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeOpacity=".2" />
          {points && <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2" />}
          <line x1={(ply / Math.max(1, fens.length - 1)) * W} x2={(ply / Math.max(1, fens.length - 1)) * W} y1="0" y2={H} stroke="#f59e0b" />
        </svg>
        <MoveList moves={sans} current={ply} onSelect={setPly} />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setPly(0)} aria-label="Start">⏮</button>
          <button className="btn-ghost" onClick={() => setPly((p) => Math.max(0, p - 1))} aria-label="Previous">◀</button>
          <button className="btn-ghost" onClick={() => setPly((p) => Math.min(sans.length, p + 1))} aria-label="Next">▶</button>
          <button className="btn-ghost" onClick={() => setPly(sans.length)} aria-label="End">⏭</button>
        </div>
        {ply > 0 && grades[ply - 1] && (
          <p className={`text-sm font-semibold ${gradeColor[grades[ply - 1]!]}`}>
            {sans[ply - 1]} is a {grades[ply - 1]}
          </p>
        )}
        <p className="text-xs text-stone-500">
          Blunders: {grades.filter((g) => g === "blunder").length} · Mistakes: {grades.filter((g) => g === "mistake").length} ·
          Inaccuracies: {grades.filter((g) => g === "inaccuracy").length}
        </p>
      </aside>
    </div>
  );
}
