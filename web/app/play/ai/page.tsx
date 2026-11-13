"use client";
import Link from "next/link";
import { Chess } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameBoard } from "@/components/GameBoard";
import { MoveList, PlayerBar } from "@/components/GameParts";
import { Engine, LEVELS } from "@/lib/engine";

function outcome(c: Chess): string | null {
  if (c.isCheckmate()) return c.turn() === "w" ? "Black wins by checkmate" : "White wins by checkmate";
  if (c.isStalemate()) return "Draw by stalemate";
  if (c.isInsufficientMaterial()) return "Draw (insufficient material)";
  if (c.isThreefoldRepetition()) return "Draw by repetition";
  if (c.isDraw()) return "Draw (50-move rule)";
  return null;
}

export default function AiPage() {
  const [levelId, setLevelId] = useState("medium");
  const [color, setColor] = useState<"white" | "black">("white");
  const [game, setGame] = useState(() => new Chess());
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const engine = useRef<Engine | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    engine.current = new Engine();
    return () => engine.current?.terminate();
  }, []);

  const level = LEVELS.find((l) => l.id === levelId)!;
  const myTurn = color === "white" ? "w" : "b";
  const over = outcome(game);

  const apply = useCallback((m: { from: string; to: string; promotion?: string }) => {
    const next = new Chess();
    next.loadPgn(gameRef.current.pgn());
    try {
      next.move(m);
    } catch {
      return;
    }
    setLast({ from: m.from, to: m.to });
    setGame(next);
    try {
      sessionStorage.setItem("lastAiPgn", next.pgn());
    } catch {}
  }, []);

  // Ask the engine to move whenever it's its turn.
  useEffect(() => {
    if (over || game.turn() === myTurn || !engine.current) return;
    let cancelled = false;
    setThinking(true);
    engine.current.bestMove(game.fen(), level).then((uci) => {
      if (cancelled) return;
      setThinking(false);
      apply({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    });
    return () => {
      cancelled = true;
      setThinking(false);
    };
  }, [game, over, myTurn, level, apply]);

  const reset = (c = color) => {
    setColor(c);
    setGame(new Chess());
    setLast(null);
  };

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
      <div className="flex w-full min-w-0 flex-col items-center lg:max-w-[860px] lg:flex-1">
        <GameBoard
          top={<PlayerBar name={`Stockfish (${level.label})`} />}
          bottom={<PlayerBar name="You" />}
          fen={game.fen()}
          orientation={color}
          lastMove={last}
          canMove={over ? null : myTurn}
          onMove={apply}
        />
      </div>
      <aside className="card w-full max-w-sm space-y-4 lg:w-96 lg:shrink-0">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-stone-500">Difficulty</label>
          <select className="input" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={() => reset("white")}>New game as White</button>
          <button className="btn-ghost flex-1" onClick={() => reset("black")}>As Black</button>
        </div>
        {over && (
          <div className="rounded-lg bg-amber-50 p-3 text-center font-bold dark:bg-amber-950">
            {over}
            <div className="mt-2"><Link className="btn-primary" href="/analysis/local">Analyze game</Link></div>
          </div>
        )}
        {!over && <p className="text-sm text-stone-500">{thinking ? "Engine is thinking…" : game.turn() === myTurn ? "Your move" : ""}</p>}
        <MoveList moves={game.history()} />
      </aside>
    </div>
  );
}
