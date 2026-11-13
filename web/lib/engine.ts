"use client";

export interface Level {
  id: string;
  label: string;
  skill: number; // Stockfish "Skill Level" 0-20
  movetime: number; // ms
}

export const LEVELS: Level[] = [
  { id: "beginner", label: "Beginner", skill: 0, movetime: 50 },
  { id: "easy", label: "Easy", skill: 4, movetime: 150 },
  { id: "medium", label: "Medium", skill: 9, movetime: 400 },
  { id: "hard", label: "Hard", skill: 15, movetime: 800 },
  { id: "master", label: "Master", skill: 20, movetime: 1500 },
];

export interface Score {
  cp?: number;
  mate?: number;
}

/** Thin UCI wrapper around the Stockfish worker. Requests run one at a time. */
export class Engine {
  private worker: Worker;
  private chain: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;

  constructor() {
    this.worker = new Worker("/stockfish/stockfish-19-lite-single.js");
    this.ready = this.waitFor("uciok", "uci").then(() => this.waitFor("readyok", "isready"));
  }

  private waitFor(token: string, cmd: string): Promise<void> {
    return new Promise((resolve) => {
      const on = (e: MessageEvent) => {
        if (String(e.data).startsWith(token)) {
          this.worker.removeEventListener("message", on);
          resolve();
        }
      };
      this.worker.addEventListener("message", on);
      this.worker.postMessage(cmd);
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => this.ready).then(job);
    this.chain = run.catch(() => {});
    return run;
  }

  private search(fen: string, go: string, skill: number): Promise<{ best: string; score: Score }> {
    return this.enqueue(
      () =>
        new Promise((resolve) => {
          let score: Score = {};
          const on = (e: MessageEvent) => {
            const line = String(e.data);
            if (line.startsWith("info") && line.includes(" score ")) {
              const m = line.match(/score (cp|mate) (-?\d+)/);
              if (m) score = m[1] === "cp" ? { cp: +m[2] } : { mate: +m[2] };
            } else if (line.startsWith("bestmove")) {
              this.worker.removeEventListener("message", on);
              resolve({ best: line.split(" ")[1], score });
            }
          };
          this.worker.addEventListener("message", on);
          this.worker.postMessage("ucinewgame");
          this.worker.postMessage(`setoption name Skill Level value ${skill}`);
          this.worker.postMessage(`position fen ${fen}`);
          this.worker.postMessage(go);
        }),
    );
  }

  async bestMove(fen: string, level: Level): Promise<string> {
    return (await this.search(fen, `go movetime ${level.movetime}`, level.skill)).best;
  }

  /** Evaluation from White's point of view. */
  async evaluate(fen: string, depth = 12): Promise<Score> {
    const { score } = await this.search(fen, `go depth ${depth}`, 20);
    const whiteToMove = fen.split(" ")[1] === "w";
    const sign = whiteToMove ? 1 : -1;
    // "mate 0" means the side to move is already checkmated.
    if (score.mate === 0) return { cp: -1000 * sign };
    return score.mate !== undefined ? { mate: score.mate * sign } : { cp: (score.cp ?? 0) * sign };
  }

  terminate() {
    this.worker.terminate();
  }
}

/** Centipawn-ish value for charting/bars; mates clamp to +/-1000. */
export function scoreToCp(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 1000 : -1000;
  return Math.max(-1000, Math.min(1000, s.cp ?? 0));
}

export function formatScore(s: Score): string {
  if (s.mate !== undefined) return `${s.mate > 0 ? "" : "-"}M${Math.abs(s.mate)}`;
  const v = (s.cp ?? 0) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}
