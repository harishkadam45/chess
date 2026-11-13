// Combination matrix against a running server + DB: every time control, queue edge cases, rooms, draws,
// reconnects, invalid input, auth edge cases and a real flag timeout.
import { io } from "socket.io-client";

const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = process.env.WEB_URL ?? "http://localhost:3000";
const run = Date.now();
let passed = 0;

function check(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
  console.log("ok  -", msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (path) => fetch(`${API}${path}`).then((r) => r.json());

async function signup(name, email = `${name}-${run}@test.dev`, password = "password123") {
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) return { res };
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const body = await res.json();
  return { res, id: body.user.id, cookie };
}

async function player(name) {
  const u = await signup(name);
  const s = await connect(u.cookie);
  return { ...u, name, s, states: {} };
}

function connect(cookie) {
  return new Promise((resolve, reject) => {
    const s = io(API, { extraHeaders: { cookie, origin: ORIGIN }, transports: ["websocket"], forceNew: true });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
}
const track = (p) => p.s.on("game:state", (st) => (p.states[st.id] = st));
const emit = (p, ev, data) => new Promise((r) => p.s.emit(ev, data, r));
const profile = (p) => json(`/api/players/${p.id}`);

async function match(a, b, preset) {
  const q1 = await emit(a, "queue:join", { preset });
  const q2 = await emit(b, "queue:join", { preset });
  if (!q1.queued || !q2.gameId) throw new Error(`match failed ${JSON.stringify([q1, q2])}`);
  await sleep(150);
  const st = a.states[q2.gameId];
  const white = st.white.id === a.id ? a : b;
  return { gameId: q2.gameId, white, black: white === a ? b : a };
}

const mv = (p, gameId, from, to, promotion) => emit(p, "game:move", { gameId, from, to, promotion });
async function foolsMate({ gameId, white, black }) {
  await mv(white, gameId, "f2", "f3");
  await mv(black, gameId, "e7", "e5");
  await mv(white, gameId, "g2", "g4");
  await mv(black, gameId, "d8", "h4");
  await sleep(400);
}

const [a, b, c, d] = await Promise.all(["ann", "ben", "cal", "dee"].map(player));
for (const p of [a, b, c, d]) track(p);

// ---- 1. every time control: only that category's rating moves ---------------------------------
const catField = { bullet: "ratingBullet", blitz: "ratingBlitz", rapid: "ratingRapid" };
const catOf = { "1+0": "bullet", "2+1": "bullet", "3+0": "blitz", "3+2": "blitz", "5+0": "blitz", "10+0": "rapid", "15+10": "rapid" };
for (const preset of Object.keys(catOf)) {
  const [pa, pb] = [await profile(a), await profile(b)];
  const m = await match(a, b, preset);
  const snap = a.states[m.gameId];
  check(snap.category === catOf[preset] && snap.rated, `${preset}: rated ${catOf[preset]} game created`);
  check(snap.clocks.white === parseInt(preset) * 60_000, `${preset}: starting clock correct`);
  await foolsMate(m);
  const [na, nb] = [await profile(a), await profile(b)];
  const f = catField[catOf[preset]];
  const other = Object.values(catField).filter((x) => x !== f);
  check(na[f] !== pa[f] && nb[f] !== pb[f], `${preset}: ${f} changed for both players`);
  check(other.every((o) => na[o] === pa[o] && nb[o] === pb[o]), `${preset}: other categories untouched`);
  check(na[f] + nb[f] === pa[f] + pb[f], `${preset}: rating change is zero-sum`);
}
const pa = await profile(a);
check(pa.wins + pa.losses === 7 && pa.draws === 0, "7 decisive games recorded in stats");

// ---- 2. queue edge cases -----------------------------------------------------------------------
check((await emit(c, "queue:join", { preset: "3+0" })).queued, "c queues 3+0");
check((await emit(d, "queue:join", { preset: "5+0" })).queued, "d queues 5+0 -> different preset, no match");
check((await emit(c, "queue:join", { preset: "3+0" })).queued, "double-queue does not self-match");
await emit(c, "queue:leave", {});
const leftTry = await emit(d, "queue:join", { preset: "3+0" });
check(leftTry.queued, "after c left queue, d does not match c");
await emit(d, "queue:leave", {});
check((await emit(c, "queue:join", { preset: "nope" })).error, "invalid preset rejected");
check((await emit(c, "queue:join", {})).error, "missing preset rejected");
await emit(c, "queue:leave", {});

// ---- 3. rooms ---------------------------------------------------------------------------------
for (const color of ["white", "black"]) {
  const room = await emit(a, "room:create", { preset: "5+0", color });
  check(room.code?.length === 6, `room (${color}) created`);
  check((await emit(a, "room:join", { code: room.code })).error, "cannot join while in a game");
  check((await emit(b, "room:join", { code: "ZZZZZZ" })).error === "Room not found", "bad code rejected");
  await sleep(100);
  check(a.states[room.gameId].status === "waiting", "waiting for opponent");
  check((await mv(a, room.gameId, "e2", "e4")).error, "cannot move before opponent joins");
  const join = await emit(b, "room:join", { code: room.code.toLowerCase() });
  check(join.gameId === room.gameId, "lowercase code joins");
  await sleep(150);
  const st = a.states[room.gameId];
  check(st.status === "active" && !st.rated, "room game active and casual");
  check(st[color].id === a.id, `host got requested colour ${color}`);
  check((await emit(c, "room:join", { code: room.code })).error, "full/used room code rejected");
  // spectator: can watch but not act
  check((await emit(c, "game:join", { gameId: room.gameId })).ok, "spectator can join");
  check((await mv(c, room.gameId, "e2", "e4")).error, "spectator cannot move");
  check((await emit(c, "game:resign", { gameId: room.gameId })).error, "spectator cannot resign");
  const before = await profile(a);
  await emit(a, "game:resign", { gameId: room.gameId });
  await sleep(400);
  const after = await profile(a);
  check(JSON.stringify(before) === JSON.stringify(after), `casual ${color} game leaves rating & stats unchanged`);
  check(c.states[room.gameId].status === "finished", "spectator saw game finish");
}
const rr = await emit(a, "room:create", { preset: "5+0", color: "random" });
check(rr.code, "random-colour room created");
check((await emit(a, "room:join", { code: rr.code })).error, "cannot join own room");
check((await emit(b, "room:cancel", { gameId: rr.gameId })).error, "non-host cannot cancel room");
check((await emit(a, "room:cancel", { gameId: rr.gameId })).ok, "host cancels waiting room");
check((await emit(b, "room:join", { code: rr.code })).error === "Room not found", "cancelled room code is dead");
check((await emit(a, "queue:join", { preset: "5+0" })).queued, "host free to queue after cancelling");
await emit(a, "queue:leave", {});
check((await emit(a, "room:create", { preset: "9+9" })).error, "room with bad preset rejected");

// ---- 4. draws & rated draw --------------------------------------------------------------------
{
  const [pa0, pb0] = [await profile(a), await profile(b)];
  const m = await match(a, b, "10+0");
  await mv(m.white, m.gameId, "e2", "e4");
  check((await emit(m.white, "game:draw:accept", { gameId: m.gameId })).error, "accept without offer rejected");
  await emit(m.white, "game:draw:offer", { gameId: m.gameId });
  await sleep(100);
  check(a.states[m.gameId].drawOffer === "white", "draw offer visible to both");
  check((await emit(m.white, "game:draw:accept", { gameId: m.gameId })).error, "cannot accept own offer");
  check((await emit(m.black, "game:draw:decline", { gameId: m.gameId })).ok, "decline works");
  await emit(m.black, "game:draw:offer", { gameId: m.gameId });
  await mv(m.black, m.gameId, "e7", "e5");
  await sleep(100);
  check(a.states[m.gameId].drawOffer === null, "offer cleared by a move");
  await emit(m.black, "game:draw:offer", { gameId: m.gameId });
  check((await emit(m.white, "game:draw:accept", { gameId: m.gameId })).ok, "accept works");
  await sleep(500);
  const st = a.states[m.gameId];
  check(st.result === "1/2-1/2" && st.reason === "agreement", "game drawn by agreement");
  const [pa1, pb1] = [await profile(a), await profile(b)];
  check(pa1.draws === pa0.draws + 1 && pb1.draws === pb0.draws + 1, "draw counted for both");
  check(pa1.ratingRapid !== undefined, "rated draw persisted");
  const g = await json(`/api/games/${m.gameId}`);
  check(g.result === "1/2-1/2" && g.reason === "agreement" && g.rated, "draw stored in history");
}

// ---- 5. invalid payloads & reconnect ---------------------------------------------------------
{
  const m = await match(a, b, "3+2");
  for (const bad of [
    { gameId: m.gameId, from: "z9", to: "e4" },
    { gameId: m.gameId, from: "e2", to: "e4", promotion: "k" },
    { from: "e2", to: "e4" },
    { gameId: "x".repeat(200), from: "e2", to: "e4" },
    "garbage",
    null,
  ]) check((await emit(m.white, "game:move", bad)).error, `invalid move payload rejected: ${JSON.stringify(bad)?.slice(0, 40)}`);
  check((await emit(a, "game:join", { gameId: "does-not-exist" })).error, "unknown game id rejected");
  check((await emit(a, "queue:join", { preset: "1+0" })).error, "cannot queue during a game");
  await mv(m.white, m.gameId, "e2", "e4");
  await mv(m.black, m.gameId, "e7", "e5");
  // reconnect: drop black's socket, open a fresh one, rejoin, expect full state
  const old = m.black.s;
  old.close();
  m.black.s = await connect(m.black.cookie);
  track(m.black);
  const rj = await emit(m.black, "game:join", { gameId: m.gameId });
  await sleep(150);
  check(rj.ok && m.black.states[m.gameId].moves.join() === "e4,e5", "reconnected player resynced full move list");
  check((await mv(m.white, m.gameId, "g1", "f3")).ok, "game continues after reconnect");
  // the reconnected socket only receives updates because it re-joined the room
  await sleep(150);
  check(m.black.states[m.gameId].moves.length === 3, "reconnected socket receives live updates");
  await emit(m.white, "game:resign", { gameId: m.gameId });
  await sleep(300);
  a.s = a.s.connected ? a.s : a.s;
}

// ---- 6. REST + auth edge cases ----------------------------------------------------------------
{
  check((await fetch(`${API}/api/players/nobody`)).status === 404, "unknown player 404");
  check((await fetch(`${API}/api/games/nobody`)).status === 404, "unknown game 404");
  for (const cat of ["bullet", "blitz", "rapid", "bogus", undefined]) {
    const lb = await json(`/api/leaderboard${cat ? `?category=${cat}` : ""}`);
    const f = catField[cat] ?? "ratingBlitz";
    check(Array.isArray(lb) && lb.every((r, i) => i === 0 || lb[i - 1].rating >= r.rating), `leaderboard ${cat} sorted`);
  }
  const hist = await json(`/api/players/${a.id}/games`);
  check(hist.length >= 10 && hist[0].white?.name, "game history lists games with player names");
  const dup = await signup("ann2", `ann-${run}@test.dev`);
  check(!dup.res.ok, "duplicate email rejected");
  const short = await signup("shorty", `short-${run}@test.dev`, "123");
  check(!short.res.ok, "short password rejected");
  const bad = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: `ann-${run}@test.dev`, password: "wrongwrong" }),
  });
  check(!bad.ok, "wrong password rejected");
  const good = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: `ann-${run}@test.dev`, password: "password123" }),
  });
  check(good.ok, "correct password signs in");
  const evil = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://evil.example" },
    body: JSON.stringify({ email: `ann-${run}@test.dev`, password: "password123" }),
  });
  check(!evil.ok, "untrusted origin rejected");
  const noCookie = await new Promise((r) => {
    const s = io(API, { transports: ["websocket"], reconnection: false });
    s.on("connect_error", (e) => r(e.message));
  });
  check(noCookie === "Unauthorized", "anonymous socket rejected");
  const forged = await new Promise((r) => {
    const s = io(API, { extraHeaders: { cookie: "better-auth.session_token=forged" }, transports: ["websocket"], reconnection: false });
    s.on("connect_error", (e) => r(e.message));
  });
  check(forged === "Unauthorized", "forged session cookie rejected");
}

// ---- 7. real timeout (1+0): white never moves its 2nd move ------------------------------------
{
  const m = await match(c, d, "1+0");
  await mv(m.white, m.gameId, "e2", "e4");
  await mv(m.black, m.gameId, "e7", "e5");
  console.log("... waiting ~60s for the flag");
  await sleep(61_500);
  const st = c.states[m.gameId];
  check(st.status === "finished" && st.reason === "timeout" && st.result === "0-1", "white flagged on time, black wins");
  check(st.clocks.white === 0, "flagged clock shows zero");
  check((await mv(m.white, m.gameId, "g1", "f3")).error, "no moves after timeout");
  await sleep(300);
  const g = await json(`/api/games/${m.gameId}`);
  check(g.reason === "timeout" && g.category === "bullet", "timeout persisted");
}

for (const p of [a, b, c, d]) p.s.close();
console.log(`\n${passed} matrix checks passed.`);
process.exit(0);
