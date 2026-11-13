// End-to-end smoke test against a running server (needs a DB): signup, matchmaking, a full game, ratings, history.
import { io } from "socket.io-client";

const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = process.env.WEB_URL ?? "http://localhost:3000";
const run = Date.now();

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
}

async function signup(name) {
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name, email: `${name}-${run}@test.dev`, password: "password123" }),
  });
  assert(res.ok, `sign up ${name} (${res.status})`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const body = await res.json();
  return { id: body.user.id, cookie };
}

const connect = (cookie) =>
  new Promise((resolve, reject) => {
    const s = io(API, { extraHeaders: { cookie, origin: ORIGIN }, transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });

const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

// Unauthenticated sockets must be rejected.
await new Promise((resolve) => {
  const s = io(API, { transports: ["websocket"], reconnection: false });
  s.on("connect_error", (e) => {
    assert(e.message === "Unauthorized", "anonymous socket rejected");
    s.close();
    resolve();
  });
  s.on("connect", () => assert(false, "anonymous socket connected"));
});

// Native app path: origin is the app scheme and the session cookie travels in the socket handshake payload.
{
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "chessapp://", "expo-origin": "chessapp://" },
    body: JSON.stringify({ name: "native", email: `native-${run}@test.dev`, password: "password123" }),
  });
  assert(res.ok, "native sign up with app-scheme origin");
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const s = await new Promise((resolve, reject) => {
    const sock = io(API, { auth: { cookie }, transports: ["websocket"], forceNew: true });
    sock.on("connect", () => resolve(sock));
    sock.on("connect_error", reject);
  });
  assert(s.connected, "socket authenticated via handshake auth cookie");
  const r = await new Promise((res) => s.emit("room:create", { preset: "5+0" }, res));
  assert(r.code, "native client can create a room");
  s.close();
  const bad = await new Promise((resolve) => {
    const sock = io(API, { auth: { cookie: "better-auth.session_token=forged" }, transports: ["websocket"], reconnection: false, forceNew: true });
    sock.on("connect_error", (e) => resolve(e.message));
    sock.on("connect", () => resolve("connected"));
  });
  assert(bad === "Unauthorized", "forged handshake cookie rejected");
}

const a = await signup("alice");
const b = await signup("bob");
const sa = await connect(a.cookie);
const sb = await connect(b.cookie);

let stateA, over;
const found = new Promise((r) => sb.once("match:found", r));
sa.on("game:state", (s) => (stateA = s));
const overP = new Promise((r) => sa.once("game:over", (o) => r((over = o))));

const q1 = await emit(sa, "queue:join", { preset: "3+0" });
assert(q1.queued, "first player queued");
const q2 = await emit(sb, "queue:join", { preset: "3+0" });
assert(q2.gameId, "second player matched");
const { gameId } = await found;
assert(gameId === q2.gameId, "both players notified of same game");
await new Promise((r) => setTimeout(r, 200));
assert(stateA?.status === "active" && stateA.moves.length === 0, "game active");

const white = stateA.white.id === a.id ? sa : sb;
const black = white === sa ? sb : sa;
const mv = (s, from, to) => emit(s, "game:move", { gameId, from, to });

assert((await mv(black, "e7", "e5")).error, "black moving first rejected");
assert((await mv(white, "e2", "e5")).error, "illegal move rejected");
assert((await mv(white, "f2", "f3")).ok, "f3");
await mv(black, "e7", "e5");
await mv(white, "g2", "g4");
await mv(black, "d8", "h4");
const res = await overP;
assert(res.result === "0-1" && res.reason === "checkmate", "fool's mate => black wins by checkmate");

await new Promise((r) => setTimeout(r, 500));
const winner = white === sa ? b : a;
const loser = winner === a ? b : a;
const [pw, pl] = await Promise.all([
  fetch(`${API}/api/players/${winner.id}`).then((r) => r.json()),
  fetch(`${API}/api/players/${loser.id}`).then((r) => r.json()),
]);
assert(pw.ratingBlitz === 1212 && pw.wins === 1, "winner rating 1212, 1 win");
assert(pl.ratingBlitz === 1188 && pl.losses === 1, "loser rating 1188, 1 loss");

const hist = await fetch(`${API}/api/games/${gameId}`).then((r) => r.json());
assert(hist.pgn.includes("Qh4#"), "PGN persisted with mate");
const lb = await fetch(`${API}/api/leaderboard?category=blitz`).then((r) => r.json());
assert(lb.some((r) => r.id === winner.id && r.rating === 1212), "winner listed on leaderboard with 1212");

// Private room flow (casual) + resign + timing out of ratings.
const rc = await emit(sa, "room:create", { preset: "5+0", color: "white" });
assert(rc.code?.length === 6, "room created");
const rj = await emit(sb, "room:join", { code: rc.code });
assert(rj.gameId === rc.gameId, "friend joined room");
assert((await emit(sa, "game:resign", { gameId: rc.gameId })).ok, "resign");
await new Promise((r) => setTimeout(r, 500));
const after = await fetch(`${API}/api/players/${a.id}`).then((r) => r.json());
assert(after.ratingBlitz === (a === winner ? 1212 : 1188), "casual game left rating unchanged");

sa.close();
sb.close();
console.log("\nAll smoke checks passed.");
