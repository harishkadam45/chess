"use client";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/80 backdrop-blur dark:border-amber-400/15 dark:bg-[#100b07]/70">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm font-medium">
        <Link href="/" className="font-display text-lg font-black tracking-wider">♞ <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent dark:from-amber-300 dark:to-orange-400">CHESSLY</span></Link>
        <Link href="/play">Play</Link>
        <Link href="/play/ai">vs Computer</Link>
        <Link href="/leaderboard">Leaderboard</Link>
        <div className="ml-auto flex items-center gap-3">
          {!isPending && session ? (
            <>
              <Link href={`/profile/${session.user.id}`}>{session.user.name}</Link>
              <button className="btn-ghost" onClick={() => authClient.signOut().then(() => (location.href = "/"))}>
                Log out
              </button>
            </>
          ) : (
            !isPending && (
              <>
                <Link href="/login" className="btn-ghost">Log in</Link>
                <Link href="/register" className="btn-primary">Sign up</Link>
              </>
            )
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
