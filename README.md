# Chessly

Full-stack online chess: real-time multiplayer, Stockfish opponents, ratings, history and analysis.

```
server/   Express 5 + Socket.IO + Better Auth + Prisma (PostgreSQL) + chess.js
web/      Next.js (App Router) + Tailwind v4 + react-chessboard + Stockfish (Web Worker)
```

## Run it

```bash
npm install
# 1. server/.env  (copy server/.env.example; DATABASE_URL = Neon or local Postgres)
npm run db:push -w server        # creates tables
npm run dev:server               # http://localhost:4000
npm run dev:web                  # http://localhost:3000  (copies Stockfish into public/ first)
```

Redis is optional: set `REDIS_URL` to share the matchmaking queue between server instances.

Tests: `npm test` (Vitest: game rules, clocks, Elo) and `npm run test:e2e -w web` (Playwright; needs `npx playwright install chromium`).

## Design notes

- **Server-authoritative games.** Clients send `from/to/promotion`; the server validates with chess.js, owns the clocks
  (a timer fires the flag even if nobody acts), and broadcasts a full snapshot after every change. Clients
  interpolate the clock locally and resync on reconnect via `game:join`.
- **Clocks** start once both sides have moved. Increment is added after each move from move 2 on.
- **Ratings:** Elo (K=24), separate for bullet/blitz/rapid. Private rooms are casual and never change ratings.
- **Auth:** Better Auth (email + password) is mounted on the Express server; sockets authenticate with the same session cookie.
- **AI & analysis** run client-side (Stockfish 19 lite, single-threaded WASM). Analysis grades moves by eval drop.
- **Security:** zod validation on every socket event, helmet, CORS limited to `WEB_URL`, rate limits on API and auth routes.

## Known limits

- Active games live in server memory: one server instance per game set, and a restart loses games in progress.
  Scaling out needs the Socket.IO Redis adapter plus game state in Redis.
- No reconnect grace/abandonment handling: a disconnected player's clock keeps running.
- Email verification, password reset and OAuth are not wired up.

## Deploy

Web → Vercel (`NEXT_PUBLIC_API_URL` = server URL). Server → Railway (set `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `WEB_URL`, optional `REDIS_URL`; start command `npm run start -w server`). Database → Neon.

## Test suites

| Command | Needs | Covers |
| --- | --- | --- |
| `npm test` | nothing | rules, every end condition, promotion/castling/en passant, clocks, Elo, presets |
| `npm run smoke -w server` | server + DB | signup → match → full game → ratings → history |
| `npm run engine -w server` | server | Stockfish endpoints: moves, eval signs, validation, load shedding |
| `npm run matrix -w server` | server + DB | all 7 time controls, queue/room/draw/reconnect/invalid-input/auth edge cases, real flag timeout (~70s) |
| `npm run test:e2e` | server + DB, Chromium | two real browsers playing, analysis, profile, leaderboard, 5 AI levels × 2 colours |

## Mobile app (React Native / Expo)

`mobile/` is an Expo SDK 58 app (expo-router) that talks to the same server. It is intentionally **not** an npm
workspace: Metro and hoisted `node_modules` don't mix well, so install it on its own.

```bash
cd mobile && npm install
npm start            # scan the QR code with Expo Go (phone and PC on the same Wi-Fi)
```

- In development the app reaches the API at `http://<your PC's LAN IP>:4000` (taken from Expo's host). Allow
  ports 4000 and 8081 through Windows Firewall. For a deployed server set `EXPO_PUBLIC_API_URL`.
- Auth uses `@better-auth/expo` (session stored in SecureStore). Sockets send the session cookie in the
  handshake `auth` payload since native has no cookie jar. The server trusts the `chessapp://` scheme, plus Expo
  dev origins outside production.
- The board is native (tap to move, promotion picker). **Stockfish runs on the server** (`server/src/engine.ts`, a pool of 2
  Stockfish processes behind `POST /api/engine/move` and `/api/engine/eval`) because its WASM build can't run inside React
  Native. The app uses it for the computer opponent (5 levels) and for analysis. If the server is unreachable it falls back to a
  small built-in JS engine (`mobile/lib/engine.ts`, much weaker) and the UI says so ("offline"). Engine routes are rate-limited,
  validate the FEN, and shed load with 503 when the queue is full. Running Stockfish on-device would need a native module.
- Tests: `cd mobile && npm run test:engine` (engine tactics) and
  `npx playwright test -c playwright.config.ts` (runs the real RN screens through react-native-web at phone size;
  needs the server + DB). Not tested on a physical device or emulator.
- Release builds: `npx eas build` (needs an Expo account).

## 3D board (web)

The web app plays on a neon 3D arena built with **Three.js + React Three Fiber + Drei**, animated with **GSAP**
(`web/components/three/`, `web/lib/three/`). Dark teal/navy world, cyan pieces vs magenta pieces, glowing cyan/amber grid
tiles, neon rings, a skyline, sparkles, a reflective floor and bloom.

- **Pieces** are modelled in code (`lib/three/pieceGeometry.ts`: lathe-turned bodies + an extruded knight, merged into one
  geometry per type). No Blender was used. To use Blender models instead, export `.glb` and load them with Drei's `useGLTF`
  in `Pieces.tsx` in place of `pieceGeometry(type)`.
- **Animation:** `lib/three/tracker.ts` keeps every piece's identity across moves (captures, castling, en passant, promotion,
  stepping back through a game), so pieces glide on an arc, captured pieces spin away in a spark burst, and landings send a
  shockwave. GSAP drives the camera fly-in and piece motion.
- **Controls:** click to select/move (legal-move markers, check pulse, last-move glow), drag to orbit, scroll to zoom.
  `2D` toggles the flat board; `FX high/low` toggles bloom/reflections/shadows. The choice is remembered, and the arena
  drops to low effects by itself if the frame rate collapses. Bloom uses an 8-bit buffer so it also works on GPUs without
  half-float render targets.
- 3D is web-only; the mobile app keeps its native 2D board.
- Tests: `lib/three/tracker.test.ts` (vitest) and `tests/three.spec.ts`, which plays real games by ray-cast clicking the canvas
  (`window.__board3d.squareToClient`). Playwright runs two projects: `2d` (existing suites) and `3d`.
