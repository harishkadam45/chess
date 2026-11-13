import Link from "next/link";
import { HeroLoader } from "@/components/three/HeroLoader";

const features = [
  ["Real-time duels", "Server-authoritative games with synced clocks, from bullet to rapid."],
  ["Stockfish opponents", "Five difficulty levels running right in your browser."],
  ["Ranked ladder", "Separate Elo ratings for bullet, blitz and rapid."],
  ["Replay & analysis", "Step through any game with engine evaluation and blunder marks."],
];

export default function Home() {
  return (
    <div>
      <section className="relative -mx-4 h-[74vh] min-h-[500px] overflow-hidden rounded-3xl border border-amber-400/20 bg-[#120c07] shadow-[0_0_80px_rgba(255,154,46,.12),0_0_120px_rgba(196,120,60,.1)] sm:mx-0">
        <div className="absolute inset-y-0 right-0 w-full sm:w-[68%] sm:[mask-image:linear-gradient(to_right,transparent,black_22%)]">
          <HeroLoader />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#120c07] via-[#120c07]/55 to-transparent sm:via-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#120c07] to-transparent" />
        <div className="relative z-10 flex h-full flex-col justify-end gap-5 p-6 sm:max-w-xl sm:justify-center sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Chessly · online arena</p>
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
            Chess in <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-orange-600 bg-clip-text text-transparent">another dimension</span>
          </h1>
          <p className="max-w-md text-slate-300">
            Fight it out on a hand-carved 3D wooden board. Real players, a real engine, ratings that count.
          </p>
          <div className="pointer-events-auto flex flex-wrap gap-3">
            <Link href="/play" className="btn-primary !px-6 !py-3">Play online</Link>
            <Link href="/play/ai" className="btn-ghost !px-6 !py-3">Play computer</Link>
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(([t, d]) => (
          <div key={t} className="card">
            <h2 className="font-semibold text-amber-700 dark:text-amber-300">{t}</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
