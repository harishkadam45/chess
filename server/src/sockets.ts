import type { Server } from "socket.io";
import { z } from "zod";
import { userFromHeaders } from "./auth";
import { GameManager, loadPlayer } from "./game/manager";
import type { LiveGame } from "./game/liveGame";
import { categoryOf, parsePreset } from "./game/timeControl";
import { queue } from "./matchmaking";

const move = z.object({
  gameId: z.string().max(64),
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});
const gameRef = z.object({ gameId: z.string().max(64) });
const preset = z.object({ preset: z.string().max(10) });
const roomCreate = preset.extend({ color: z.enum(["white", "black", "random"]).default("random") });
const roomJoin = z.object({ code: z.string().max(12) });
const empty = z.object({}).passthrough();

type Ack = (r: unknown) => void;

export function registerSockets(io: Server) {
  const manager = new GameManager(io);
  const sockets = new Map<string, string>(); // userId -> socketId

  io.use(async (socket, next) => {
    try {
      // Browsers send the session cookie automatically; the native app passes it in the handshake payload.
      const cookie = socket.handshake.auth?.cookie;
      const headers = typeof cookie === "string" && cookie ? { cookie } : socket.handshake.headers;
      const user = await userFromHeaders(headers);
      if (!user) return next(new Error("Unauthorized"));
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    sockets.set(userId, socket.id);
    let queued: string | null = null;

    /** Validates payload with zod and normalizes errors into the ack callback. */
    const on = <T>(event: string, schema: z.ZodType<T>, fn: (data: T, ack: Ack) => void | Promise<void>) =>
      socket.on(event, (raw: unknown, cb?: Ack) => {
        const ack: Ack = typeof cb === "function" ? cb : () => {};
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return ack({ error: "Invalid request" });
        Promise.resolve(fn(parsed.data, ack)).catch((e) => {
          console.error(event, e);
          ack({ error: "Server error" });
        });
      });

    const seat = (game: LiveGame) => {
      for (const p of [game.white, game.black]) {
        const sid = p && sockets.get(p.id);
        if (sid) {
          io.in(sid).socketsJoin(`game:${game.id}`);
          io.to(sid).emit("match:found", { gameId: game.id });
        }
      }
      manager.broadcast(game);
    };

    on("game:join", gameRef, ({ gameId }, ack) => {
      const g = manager.getAny(gameId);
      if (!g) return ack({ error: "Game not found" });
      socket.join(`game:${gameId}`);
      socket.emit("game:state", g.snapshot(Date.now()));
      ack({ ok: true });
    });

    on("queue:join", preset, async ({ preset: p }, ack) => {
      const tc = parsePreset(p);
      if (!tc) return ack({ error: "Invalid time control" });
      if (manager.activeGameOf(userId)) return ack({ error: "Finish your current game first" });
      const cat = categoryOf(tc);
      // One queue at a time: switching time control leaves the previous queue.
      if (queued && queued !== p) await queue.remove(queued, userId);
      queued = null;
      const opp = await queue.enqueue(p, userId);
      if (!opp) {
        queued = p;
        return ack({ queued: true });
      }
      const [a, b] = await Promise.all([loadPlayer(userId, cat), loadPlayer(opp, cat)]);
      if (!a || !b) return ack({ queued: true });
      queued = null;
      const game = manager.createMatch(a, b, tc);
      seat(game);
      ack({ gameId: game.id });
    });

    on("queue:leave", empty, async (_d, ack) => {
      if (queued) await queue.remove(queued, userId);
      queued = null;
      ack({ ok: true });
    });

    on("room:create", roomCreate, async ({ preset: p, color }, ack) => {
      const tc = parsePreset(p);
      if (!tc) return ack({ error: "Invalid time control" });
      if (manager.activeGameOf(userId)) return ack({ error: "Finish your current game first" });
      const host = await loadPlayer(userId, categoryOf(tc));
      if (!host) return ack({ error: "User not found" });
      const { game, code } = manager.createRoom(host, tc, color);
      socket.join(`game:${game.id}`);
      socket.emit("game:state", game.snapshot(Date.now()));
      ack({ gameId: game.id, code });
    });

    on("room:join", roomJoin, async ({ code }, ack) => {
      if (manager.activeGameOf(userId)) return ack({ error: "Finish your current game first" });
      const result = await manager.joinRoom(code, userId, (c) => loadPlayer(userId, c));
      if (typeof result === "string") return ack({ error: result });
      seat(result);
      ack({ gameId: result.id });
    });

    on("room:cancel", gameRef, ({ gameId }, ack) =>
      ack(manager.cancelRoom(gameId, userId) ? { ok: true } : { error: "Not allowed" }),
    );

    const act = (event: string, fn: (g: LiveGame, c: "white" | "black") => boolean) =>
      on(event, gameRef, ({ gameId }, ack) => {
        const g = manager.get(gameId);
        const c = g?.colorOf(userId);
        if (!g || !c) return ack({ error: "Not a player in this game" });
        if (!fn(g, c)) return ack({ error: "Not allowed" });
        manager.broadcast(g);
        ack({ ok: true });
      });

    act("game:resign", (g, c) => g.resign(c));
    act("game:draw:offer", (g, c) => g.offerDraw(c));
    act("game:draw:accept", (g, c) => g.acceptDraw(c));
    act("game:draw:decline", (g, c) => g.declineDraw(c));

    on("game:move", move, ({ gameId, from, to, promotion }, ack) => {
      const g = manager.get(gameId);
      const c = g?.colorOf(userId);
      if (!g || !c) return ack({ error: "Not a player in this game" });
      const r = g.makeMove(c, { from, to, promotion }, Date.now());
      // Always re-broadcast: on rejection this resyncs the client's optimistic board.
      manager.broadcast(g);
      ack(r.ok ? { ok: true } : { error: r.error });
    });

    socket.on("disconnect", () => {
      if (sockets.get(userId) === socket.id) sockets.delete(userId);
      if (queued) void queue.remove(queued, userId);
    });
  });
}
