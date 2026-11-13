"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type GameSummary, type Profile } from "@/lib/api";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Profile | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Profile>(`/players/${id}`).then(setP, () => setError("Player not found"));
    api<GameSummary[]>(`/players/${id}/games`).then(setGames, () => {});
  }, [id]);

  if (error) return <p>{error}</p>;
  if (!p) return null;
  const total = p.wins + p.losses + p.draws;

  const outcome = (g: GameSummary) => {
    if (g.result === "1/2-1/2") return "Draw";
    const won = (g.result === "1-0") === (g.white.id === id);
    return won ? "Win" : "Loss";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="card">
        <h1 className="text-2xl font-bold">{p.name}</h1>
        <p className="text-sm text-stone-500">Joined {new Date(p.createdAt).toLocaleDateString()}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[["Bullet", p.ratingBullet], ["Blitz", p.ratingBlitz], ["Rapid", p.ratingRapid]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-stone-100 p-3 dark:bg-stone-800">
              <div className="text-xs uppercase text-stone-500">{k}</div>
              <div className="text-2xl font-bold">{v}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm">
          {total} rated games · <span className="text-amber-600">{p.wins}W</span> /{" "}
          <span>{p.draws}D</span> / <span className="text-red-600">{p.losses}L</span>
          {total > 0 && <> · {Math.round((p.wins / total) * 100)}% win rate</>}
        </p>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Game history</h2>
        {games.length === 0 && <p className="text-sm text-stone-500">No games yet.</p>}
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {games.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
              <span className={`w-12 font-semibold ${outcome(g) === "Win" ? "text-amber-600" : outcome(g) === "Loss" ? "text-red-600" : ""}`}>
                {outcome(g)}
              </span>
              <span className="flex-1">
                {g.white.name} vs {g.black.name}
                <span className="ml-2 text-xs text-stone-500">
                  {g.baseSeconds / 60}+{g.incrementSeconds} {g.category}{g.rated ? "" : " · casual"} · {g.reason}
                </span>
              </span>
              <Link className="btn-ghost !py-1" href={`/analysis/${g.id}`}>Replay</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
