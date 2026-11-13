"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type LeaderboardRow } from "@/lib/api";

const CATS = ["bullet", "blitz", "rapid"] as const;

export default function Leaderboard() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("blitz");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(null);
    api<LeaderboardRow[]>(`/leaderboard?category=${cat}`).then(setRows, () => setError("Could not load leaderboard"));
  }, [cat]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Leaderboard</h1>
      <div className="mb-4 flex gap-2">
        {CATS.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={c === cat ? "btn-primary capitalize" : "btn-ghost capitalize"}>
            {c}
          </button>
        ))}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500 dark:bg-stone-800">
            <tr><th className="p-3">#</th><th>Player</th><th>Rating</th><th>W / D / L</th></tr>
          </thead>
          <tbody>
            {rows?.map((r, i) => (
              <tr key={r.id} className="border-t border-stone-200 dark:border-stone-800">
                <td className="p-3">{i + 1}</td>
                <td><Link className="font-medium hover:underline" href={`/profile/${r.id}`}>{r.name}</Link></td>
                <td className="font-semibold">{r.rating}</td>
                <td>{r.wins} / {r.draws} / {r.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && <p className="p-4 text-stone-500">No players yet.</p>}
      </div>
    </div>
  );
}
