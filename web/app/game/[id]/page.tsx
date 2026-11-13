"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GameBoard } from "@/components/GameBoard";
import { MoveList, PlayerBar, describeResult } from "@/components/GameParts";
import { authClient } from "@/lib/auth-client";
import { emitAck, getSocket } from "@/lib/socket";

interface Snapshot {
  id: string;
  fen: string;
  moves: string[];
  lastMove: { from: string; to: string } | null;
  white: { id: string; name: string; rating: number } | null;
  black: { id: string; name: string; rating: number } | null;
  clocks: { white: number; black: number };
  turn: "white" | "black";
  status: "waiting" | "active" | "finished";
  result: string | null;
  reason: string | null;
  drawOffer: "white" | "black" | null;
  rated: boolean;
  category: string;
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const code = useSearchParams().get("code");
  const { data: session, isPending } = authClient.useSession();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [ratings, setRatings] = useState<{ white: number; black: number } | null>(null);
  const [, tick] = useState(0);
  const receivedAt = useRef(0);

  useEffect(() => {
    if (!session) return;
    const s = getSocket();
    const onState = (st: Snapshot) => {
      receivedAt.current = performance.now();
      setSnap(st);
    };
    const onOver = (o: { ratings: { white: number; black: number } }) => setRatings(o.ratings);
    // Re-join after every (re)connect so a dropped socket resyncs the full state.
    const join = () => emitAck("game:join", { gameId: id }).then((r) => r.error && setError(r.error));
    s.on("game:state", onState);
    s.on("game:over", onOver);
    s.on("connect", join);
    if (s.connected) join();
    return () => {
      s.off("game:state", onState);
      s.off("game:over", onOver);
      s.off("connect", join);
    };
  }, [session, id]);

  // Re-render ~10x/s while the clock runs so the countdown stays smooth.
  useEffect(() => {
    if (snap?.status !== "active") return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [snap?.status]);

  if (isPending) return null;
  if (!session) return <p className="card mx-auto max-w-md text-center"><Link href="/login" className="underline">Log in</Link> to view this game.</p>;
  if (error) return <p className="card mx-auto max-w-md text-center">{error}</p>;
  if (!snap) return <p className="text-center text-stone-500">Loading game…</p>;

  const me = session.user.id;
  const myColor = snap.white?.id === me ? "white" : snap.black?.id === me ? "black" : null;
  const orientation = myColor ?? "white";
  const opp = orientation === "white" ? "black" : "white";
  const running = snap.status === "active" && snap.moves.length >= 2;
  const clockOf = (c: "white" | "black") =>
    snap.clocks[c] - (running && snap.turn === c ? performance.now() - receivedAt.current : 0);

  const act = (event: string) => emitAck(event, { gameId: id }).then((r) => r.error && setError(r.error));
  const bar = (c: "white" | "black") => (
    <PlayerBar
      name={snap[c]?.name ?? "Waiting for opponent…"}
      rating={snap[c]?.rating}
      ms={snap.status === "waiting" ? undefined : clockOf(c)}
      active={running && snap.turn === c}
    />
  );

  return (
    <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
      <div className="flex w-full min-w-0 flex-col items-center lg:max-w-[860px] lg:flex-1">
        <GameBoard
          top={bar(opp)}
          bottom={bar(orientation)}
          fen={snap.fen}
          orientation={orientation}
          lastMove={snap.lastMove}
          canMove={snap.status === "active" && myColor ? (myColor === "white" ? "w" : "b") : null}
          onMove={(m) => emitAck("game:move", { gameId: id, ...m }).then((r) => r.error && setError(r.error))}
        />
      </div>

      <aside className="card w-full max-w-sm space-y-4 lg:w-96 lg:shrink-0">
        {snap.status === "waiting" && (
          <div className="text-center">
            <p className="text-sm text-stone-500">Share this code with your friend</p>
            <p className="my-2 font-mono text-3xl font-bold tracking-widest">{code ?? "——"}</p>
            <p className="text-sm text-stone-500">Waiting for them to join…</p>
            <button
              className="btn-ghost mt-3"
              onClick={() => emitAck("room:cancel", { gameId: id }).then((r) => !r.error && (location.href = "/play"))}
            >
              Cancel room
            </button>
          </div>
        )}
        {snap.status === "finished" && (
          <div className="rounded-lg bg-amber-50 p-3 text-center dark:bg-amber-950">
            <p className="font-bold">{describeResult(snap.result, snap.reason)}</p>
            {ratings && snap.rated && (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                New ratings: {snap.white?.name} {ratings.white} · {snap.black?.name} {ratings.black}
              </p>
            )}
            <div className="mt-3 flex justify-center gap-2">
              <Link className="btn-primary" href={`/analysis/${id}`}>Analyze</Link>
              <Link className="btn-ghost" href="/play">New game</Link>
            </div>
          </div>
        )}
        <p className="text-xs text-stone-500">
          {snap.category} · {snap.rated ? "rated" : "casual"}
          {snap.status === "active" && ` · ${snap.turn} to move`}
        </p>
        <MoveList moves={snap.moves} />
        {snap.status === "active" && myColor && (
          <div className="flex flex-wrap gap-2">
            {snap.drawOffer && snap.drawOffer !== myColor ? (
              <>
                <button className="btn-primary" onClick={() => act("game:draw:accept")}>Accept draw</button>
                <button className="btn-ghost" onClick={() => act("game:draw:decline")}>Decline</button>
              </>
            ) : (
              <button className="btn-ghost" disabled={snap.drawOffer === myColor} onClick={() => act("game:draw:offer")}>
                {snap.drawOffer === myColor ? "Draw offered" : "Offer draw"}
              </button>
            )}
            <button
              className="btn-ghost text-red-600"
              onClick={() => confirm("Resign this game?") && act("game:resign")}
            >
              Resign
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
