import { Router } from "express";
import { z } from "zod";
import { Chess } from "chess.js";
import { rateLimit } from "express-rate-limit";
import { prisma } from "./db";
import { LEVELS, pool, type LevelId } from "./engine";

const ratingField = { bullet: "ratingBullet", blitz: "ratingBlitz", rapid: "ratingRapid" } as const;
const publicUser = {
  id: true, name: true, createdAt: true,
  ratingBullet: true, ratingBlitz: true, ratingRapid: true,
  wins: true, losses: true, draws: true,
} as const;

export const api = Router();

api.get("/health", (_req, res) => void res.json({ ok: true }));

api.get("/leaderboard", async (req, res) => {
  const category = z.enum(["bullet", "blitz", "rapid"]).catch("blitz").parse(req.query.category);
  const field = ratingField[category];
  const users = await prisma.user.findMany({
    orderBy: { [field]: "desc" },
    take: 50,
    select: publicUser,
  });
  res.json(users.map((u) => ({ id: u.id, name: u.name, rating: u[field], wins: u.wins, losses: u.losses, draws: u.draws })));
});

api.get("/players/:id", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: publicUser });
  if (!user) return void res.status(404).json({ error: "Not found" });
  res.json(user);
});

api.get("/players/:id/games", async (req, res) => {
  const games = await prisma.game.findMany({
    where: { OR: [{ whiteId: req.params.id }, { blackId: req.params.id }] },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, category: true, baseSeconds: true, incrementSeconds: true, rated: true, result: true, reason: true,
      createdAt: true, whiteRatingAfter: true, blackRatingAfter: true,
      white: { select: { id: true, name: true } },
      black: { select: { id: true, name: true } },
    },
  });
  res.json(games);
});

api.get("/games/:id", async (req, res) => {
  const game = await prisma.game.findUnique({
    where: { id: req.params.id },
    include: { white: { select: { id: true, name: true } }, black: { select: { id: true, name: true } } },
  });
  if (!game) return void res.status(404).json({ error: "Not found" });
  res.json(game);
});

// ---- Stockfish as a service (used by the mobile app, which can't run Stockfish WASM itself) ----
const engineLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const fenSchema = z.string().max(100).refine((f) => {
  try {
    new Chess(f);
    return true;
  } catch {
    return false;
  }
}, "Invalid FEN");

function engineError(res: import("express").Response, e: unknown) {
  if (e instanceof Error && e.message === "busy") return void res.status(503).json({ error: "Engine busy" });
  console.error(e);
  res.status(500).json({ error: "Engine error" });
}

api.post("/engine/move", engineLimit, async (req, res) => {
  const body = z
    .object({ fen: fenSchema, level: z.enum(Object.keys(LEVELS) as [LevelId, ...LevelId[]]) })
    .safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid request" });
  try {
    const move = await pool.bestMove(body.data.fen, body.data.level);
    res.json({ move: move === "(none)" ? null : move });
  } catch (e) {
    engineError(res, e);
  }
});

api.post("/engine/eval", engineLimit, async (req, res) => {
  const body = z.object({ fen: fenSchema, depth: z.number().int().min(1).max(14).default(10) }).safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Invalid request" });
  try {
    res.json(await pool.evaluate(body.data.fen, body.data.depth));
  } catch (e) {
    engineError(res, e);
  }
});
