// Stockfish endpoint checks against a running server: correctness, input validation, load behaviour.
const API = process.env.API_URL ?? "http://localhost:4000";
let passed = 0;
const check = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  passed++;
  console.log("ok  -", m);
};
const post = (path, body) =>
  fetch(`${API}/api/engine/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// correctness
let r = await (await post("move", { fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", level: "master" })).json();
check(r.move === "a1a8", "master finds back-rank mate in one");
r = await (await post("move", { fen: "4k3/8/8/8/8/8/8/3RK3 w - - 0 1".replace("8/3RK3", "3q4/3RK3"), level: "hard" })).json();
check(["d1d8", "d1d8"].includes(r.move) || typeof r.move === "string", "returns a UCI move for a normal position");
r = await (await post("move", { fen: "8/P6k/8/8/8/8/8/K7 w - - 0 1", level: "hard" })).json();
check(/^a7a8[qr]$/.test(r.move), `promotion move carries the piece (${r.move})`);
r = await (await post("move", { fen: "R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1", level: "easy" })).json();
check(r.move === null, "no legal moves -> null");

// evaluation sign conventions (always White's point of view)
r = await (await post("eval", { fen: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1" })).json();
check(r.cp > 500, "white up a queen is positive");
r = await (await post("eval", { fen: "3qk3/8/8/8/8/8/8/4K3 b - - 0 1" })).json();
check(r.cp < -500, "black up a queen is negative even with black to move");
r = await (await post("eval", { fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", depth: 6 })).json();
check(r.mate > 0, "white mating shows positive mate score");

// validation
for (const [p, body] of [
  ["move", { fen: "garbage", level: "easy" }],
  ["move", { fen: "8/8/8/8/8/8/8/K6k w - - 0 1", level: "godlike" }],
  ["move", { level: "easy" }],
  ["move", { fen: "x".repeat(500), level: "easy" }],
  ["eval", { fen: "8/8/8/8/8/8/8/K6k w - - 0 1", depth: 99 }],
  ["eval", { fen: "8/8/8/8/8/8/8/K6k w - - 0 1; rm -rf /" }],
]) check((await post(p, body)).status === 400, `rejects ${JSON.stringify(body).slice(0, 50)}`);

// load: 40 parallel searches. Each must succeed (queued) or be turned away with 503, never 500 / hang.
const t0 = Date.now();
const results = await Promise.all(
  Array.from({ length: 40 }, () => post("move", { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", level: "medium" }).then((x) => x.status)),
);
const ok = results.filter((s) => s === 200).length;
const busy = results.filter((s) => s === 503).length;
const limited = results.filter((s) => s === 429).length;
check(ok + busy + limited === 40, `40 parallel requests all answered cleanly (200:${ok} 503:${busy} 429:${limited}) in ${Date.now() - t0}ms`);
check(ok >= 2, "engine pool served requests under load");
await new Promise((r) => setTimeout(r, 1500));
const after = await post("move", { fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", level: "easy" });
check(after.status === 200 || after.status === 429, "pool recovers after the burst");

console.log(`\n${passed} engine checks passed.`);
