import { randomUUID, randomBytes } from "node:crypto";
import type { Server } from "socket.io";
import { prisma } from "../db";
import { newRatings } from "./elo";
import { LiveGame, type Color, type PlayerInfo } from "./liveGame";
import type { Category, TimeControl } from "./timeControl";

const ratingField = { bullet: "ratingBullet", blitz: "ratingBlitz", rapid: "ratingRapid" } as const;

export async function loadPlayer(userId: string, category: Category): Promise<PlayerInfo | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  return { id: u.id, name: u.name, rating: u[ratingField[category]] };
}

type Score = 0 | 0.5 | 1;

const statUpdate = (own: Score) =>
  own === 1 ? { wins: { increment: 1 } } : own === 0 ? { losses: { increment: 1 } } : { draws: { increment: 1 } };

export class GameManager {
  private games = new Map<string, LiveGame>();
  private finished = new Map<string, LiveGame>();
  private rooms = new Map<string, string>(); // room code -> gameId
  private timers = new Map<string, NodeJS.Timeout>();
  private byUser = new Map<string, string>(); // userId -> active gameId

  constructor(private io: Server) {}

  get(id: string) {
    return this.games.get(id);
  }

  /** Active or just-finished game, so late joiners and reconnects still see the result. */
  getAny(id: string) {
    return this.games.get(id) ?? this.finished.get(id);
  }

  activeGameOf(userId: string) {
    return this.byUser.get(userId);
  }

  /** Create a started game between two players (matchmaking). */
  createMatch(a: PlayerInfo, b: PlayerInfo, tc: TimeControl): LiveGame {
    const [white, black] = Math.random() < 0.5 ? [a, b] : [b, a];
    const game = new LiveGame(randomUUID(), tc, true);
    game.white = white;
    game.black = black;
    this.register(game);
    game.start(Date.now());
    return game;
  }

  /** Create a private (unrated) room; the host waits for a friend to join with the code. */
  createRoom(host: PlayerInfo, tc: TimeControl, color: Color | "random") {
    const game = new LiveGame(randomUUID(), tc, false);
    const side = color === "random" ? (Math.random() < 0.5 ? "white" : "black") : color;
    game[side] = host;
    this.register(game);
    const code = randomBytes(3).toString("hex").toUpperCase();
    this.rooms.set(code, game.id);
    // Abandoned rooms free the host and the code after 15 minutes.
    setTimeout(() => {
      if (game.status !== "waiting") return;
      this.rooms.delete(code);
      this.games.delete(game.id);
      if (this.byUser.get(host.id) === game.id) this.byUser.delete(host.id);
    }, 15 * 60_000).unref();
    return { game, code };
  }

  /** Seat `userId` in the room. `load` fetches their rating for the room's category. */
  async joinRoom(code: string, userId: string, load: (c: Category) => Promise<PlayerInfo | null>) {
    const key = code.toUpperCase();
    const game = this.games.get(this.rooms.get(key) ?? "");
    if (!game) return "Room not found";
    if (game.status !== "waiting") return "Room is already full";
    if (game.white?.id === userId || game.black?.id === userId) return "You created this room";
    const player = await load(game.category);
    if (!player) return "User not found";
    if (game.status !== "waiting") return "Room is already full"; // raced during await
    if (!game.white) game.white = player;
    else game.black = player;
    this.rooms.delete(key);
    this.byUser.set(player.id, game.id);
    game.start(Date.now());
    return game;
  }

  /** Lets a host abandon a room nobody has joined yet. */
  cancelRoom(gameId: string, userId: string): boolean {
    const game = this.games.get(gameId);
    if (!game || game.status !== "waiting") return false;
    if (game.white?.id !== userId && game.black?.id !== userId) return false;
    for (const [code, id] of this.rooms) if (id === gameId) this.rooms.delete(code);
    this.games.delete(gameId);
    this.byUser.delete(userId);
    this.io.to(`game:${gameId}`).emit("game:cancelled", { id: gameId });
    return true;
  }

  private register(game: LiveGame) {
    this.games.set(game.id, game);
    for (const p of [game.white, game.black]) if (p) this.byUser.set(p.id, game.id);
  }

  broadcast(game: LiveGame) {
    this.io.to(`game:${game.id}`).emit("game:state", game.snapshot(Date.now()));
    this.schedule(game);
  }

  /** Arms a timer for the mover's flag so timeouts fire even if nobody acts. */
  private schedule(game: LiveGame) {
    clearTimeout(this.timers.get(game.id));
    this.timers.delete(game.id);
    if (game.status === "finished") return void this.finalize(game);
    if (game.status !== "active" || game.chess.history().length < 2) return;
    const ms = Math.max(0, game.remaining(Date.now())) + 20;
    this.timers.set(
      game.id,
      setTimeout(() => {
        if (game.checkTimeout(Date.now())) this.broadcast(game);
      }, ms),
    );
  }

  private async finalize(game: LiveGame) {
    if (!this.games.has(game.id) || !game.white || !game.black || !game.result) return;
    const { white, black } = game;
    this.games.delete(game.id);
    this.finished.set(game.id, game);
    setTimeout(() => this.finished.delete(game.id), 60_000);
    for (const p of [white, black]) if (this.byUser.get(p.id) === game.id) this.byUser.delete(p.id);

    const score: Score = game.result === "1-0" ? 1 : game.result === "0-1" ? 0 : 0.5;
    const after = game.rated
      ? newRatings(white.rating, black.rating, score)
      : { white: white.rating, black: black.rating };
    const field = ratingField[game.category];

    try {
      await prisma.$transaction([
        prisma.game.create({
          data: {
            id: game.id,
            whiteId: white.id,
            blackId: black.id,
            category: game.category,
            baseSeconds: game.tc.base,
            incrementSeconds: game.tc.inc,
            rated: game.rated,
            result: game.result,
            reason: game.reason!,
            pgn: game.pgn(),
            whiteRatingBefore: white.rating,
            blackRatingBefore: black.rating,
            whiteRatingAfter: after.white,
            blackRatingAfter: after.black,
          },
        }),
        // Casual (private room) games are stored but never touch ratings or stats.
        ...(game.rated
          ? [
              prisma.user.update({ where: { id: white.id }, data: { [field]: after.white, ...statUpdate(score) } }),
              prisma.user.update({
                where: { id: black.id },
                data: { [field]: after.black, ...statUpdate((1 - score) as Score) },
              }),
            ]
          : []),
      ]);
    } catch (e) {
      console.error("Failed to persist game", game.id, e);
    }
    this.io.to(`game:${game.id}`).emit("game:over", {
      id: game.id,
      result: game.result,
      reason: game.reason,
      ratings: after,
    });
  }
}
