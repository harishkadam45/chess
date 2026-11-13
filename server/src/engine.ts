import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const enginePath: string = require("stockfish").findEngine("lite-single");

export const LEVELS = {
  beginner: { skill: 0, movetime: 50 },
  easy: { skill: 4, movetime: 150 },
  medium: { skill: 9, movetime: 400 },
  hard: { skill: 15, movetime: 800 },
  master: { skill: 20, movetime: 1500 },
} as const;
export type LevelId = keyof typeof LEVELS;

export type Score = { cp: number } | { mate: number };

/** One Stockfish process speaking UCI over stdio. Runs one search at a time. */
class UciProcess {
  private proc!: ChildProcessWithoutNullStreams;
  private buf = "";
  private onLine: ((line: string) => void) | null = null;
  ready!: Promise<void>;

  constructor() {
    this.start();
  }

  private start() {
    this.proc = spawn(process.execPath, [enginePath], { stdio: "pipe" });
    this.proc.stdout.on("data", (d) => {
      this.buf += d.toString();
      const lines = this.buf.split(/\r?\n/);
      this.buf = lines.pop() ?? "";
      for (const l of lines) this.onLine?.(l);
    });
    this.proc.on("exit", () => (this.dead = true));
    this.ready = this.exec(["uci"], (l) => l === "uciok", 15_000).then(() =>
      this.exec(["isready"], (l) => l === "readyok", 15_000).then(() => undefined),
    );
  }

  dead = false;

  /** Sends commands, collects output lines until `done` matches, or rejects (and kills the process) on timeout. */
  exec(cmds: string[], done: (line: string) => boolean, timeoutMs: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const lines: string[] = [];
      const timer = setTimeout(() => {
        this.onLine = null;
        this.kill();
        reject(new Error("engine timeout"));
      }, timeoutMs);
      this.onLine = (l) => {
        lines.push(l);
        if (done(l)) {
          clearTimeout(timer);
          this.onLine = null;
          resolve(lines);
        }
      };
      for (const c of cmds) this.proc.stdin.write(c + "\n");
    });
  }

  kill() {
    this.dead = true;
    this.proc.kill();
  }
}

export class EnginePool {
  private idle: UciProcess[] = [];
  private waiting: ((e: UciProcess) => void)[] = [];
  private created = 0;

  constructor(private size = 2, private maxQueue = 16) {}

  private async acquire(): Promise<UciProcess> {
    while (this.idle.length) {
      const e = this.idle.pop()!;
      if (!e.dead) return e;
      this.created--;
    }
    if (this.created < this.size) {
      this.created++;
      return new UciProcess();
    }
    if (this.waiting.length >= this.maxQueue) throw new Error("busy");
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(e: UciProcess) {
    if (e.dead) {
      this.created--;
      const w = this.waiting.shift();
      if (w) {
        this.created++;
        w(new UciProcess());
      }
      return;
    }
    const w = this.waiting.shift();
    if (w) w(e);
    else this.idle.push(e);
  }

  private async withEngine<T>(fn: (e: UciProcess) => Promise<T>): Promise<T> {
    const e = await this.acquire();
    try {
      await e.ready;
      return await fn(e);
    } finally {
      this.release(e);
    }
  }

  bestMove(fen: string, level: LevelId): Promise<string> {
    const { skill, movetime } = LEVELS[level];
    return this.withEngine(async (e) => {
      const out = await e.exec(
        ["ucinewgame", `setoption name Skill Level value ${skill}`, `position fen ${fen}`, `go movetime ${movetime}`],
        (l) => l.startsWith("bestmove"),
        movetime + 8000,
      );
      return out[out.length - 1].split(" ")[1];
    });
  }

  /** Evaluation from White's point of view. */
  evaluate(fen: string, depth: number): Promise<Score> {
    return this.withEngine(async (e) => {
      const out = await e.exec(
        ["ucinewgame", "setoption name Skill Level value 20", `position fen ${fen}`, `go depth ${depth}`],
        (l) => l.startsWith("bestmove"),
        15_000,
      );
      let score: Score = { cp: 0 };
      for (const l of out) {
        const m = l.match(/score (cp|mate) (-?\d+)/);
        if (m) score = m[1] === "cp" ? { cp: +m[2] } : { mate: +m[2] };
      }
      const whiteToMove = fen.split(" ")[1] === "w";
      const sign = whiteToMove ? 1 : -1;
      if ("mate" in score) return score.mate === 0 ? { cp: -1000 * sign } : { mate: score.mate * sign };
      return { cp: score.cp * sign };
    });
  }

  shutdown() {
    for (const e of this.idle) e.kill();
  }
}

export const pool = new EnginePool();
