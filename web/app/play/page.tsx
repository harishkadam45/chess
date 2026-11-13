"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PRESETS } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { emitAck, getSocket } from "@/lib/socket";

export default function PlayPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [preset, setPreset] = useState("5+0");
  const [searching, setSearching] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    const s = getSocket();
    const found = ({ gameId }: { gameId: string }) => router.push(`/game/${gameId}`);
    s.on("match:found", found);
    return () => {
      s.off("match:found", found);
    };
  }, [session, router]);

  if (isPending) return null;
  if (!session)
    return (
      <p className="card mx-auto max-w-md text-center">
        <Link href="/login" className="underline">Log in</Link> or <Link href="/register" className="underline">sign up</Link> to play online.
      </p>
    );

  const quickMatch = async () => {
    setError("");
    setSearching(true);
    const res = await emitAck<{ gameId?: string; queued?: boolean }>("queue:join", { preset });
    if (res.error) {
      setSearching(false);
      setError(res.error);
    } else if (res.gameId) router.push(`/game/${res.gameId}`);
  };

  const cancel = async () => {
    await emitAck("queue:leave");
    setSearching(false);
  };

  const createRoom = async () => {
    setError("");
    const res = await emitAck<{ gameId: string; code: string }>("room:create", { preset });
    if (res.error) setError(res.error);
    else router.push(`/game/${res.gameId}?code=${res.code}`);
  };

  const joinRoom = async () => {
    setError("");
    const res = await emitAck<{ gameId: string }>("room:join", { code: code.trim() });
    if (res.error) setError(res.error);
    else router.push(`/game/${res.gameId}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="card">
        <h1 className="mb-3 text-xl font-bold">Time control</h1>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              aria-pressed={preset === p.id}
              className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                preset === p.id
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                  : "border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
              }`}
            >
              <div className="text-base font-semibold">{p.label}</div>
              <div className="text-xs text-stone-500">{p.kind}</div>
            </button>
          ))}
        </div>
        <div className="mt-4">
          {searching ? (
            <button className="btn-ghost w-full" onClick={cancel}>Searching for an opponent… (cancel)</button>
          ) : (
            <button className="btn-primary w-full" onClick={quickMatch}>Find a rated match</button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Play a friend (casual)</h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn-ghost" onClick={createRoom}>Create private room</button>
          <div className="flex flex-1 gap-2">
            <input
              className="input min-w-0 uppercase"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn-primary" disabled={code.trim().length < 6} onClick={joinRoom}>Join</button>
          </div>
        </div>
      </section>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
