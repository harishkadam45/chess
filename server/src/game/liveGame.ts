import { Chess, type Move } from "chess.js";
import { categoryOf, type Category, type TimeControl } from "./timeControl";

export type Color = "white" | "black";
export type Result = "1-0" | "0-1" | "1/2-1/2";
export type Reason =
  | "checkmate" | "resign" | "timeout" | "stalemate"
  | "repetition" | "insufficient" | "fifty-move" | "agreement";

export interface PlayerInfo {
  id: string;
  name: string;
  rating: number;
}

export interface Snapshot {
  id: string;
  fen: string;
  moves: string[]; // SAN
  lastMove: { from: string; to: string } | null;
  white: PlayerInfo | null;
  black: PlayerInfo | null;
  clocks: { white: number; black: number }; // ms remaining, as of serverTime
  turn: Color;
  status: "waiting" | "active" | "finished";
  result: Result | null;
  reason: Reason | null;
  drawOffer: Color | null;
  tc: TimeControl;
  category: Category;
  rated: boolean;
  serverTime: number;
  inCheck: boolean;
}

export type MoveInput = { from: string; to: string; promotion?: string };

export class LiveGame {
  readonly chess = new Chess();
  readonly category: Category;
  white: PlayerInfo | null = null;
  black: PlayerInfo | null = null;
  status: Snapshot["status"] = "waiting";
  result: Result | null = null;
  reason: Reason | null = null;
  drawOffer: Color | null = null;
  clocks: { white: number; black: number };
  private lastTick = 0;
  private last: Move | null = null;

  constructor(
    readonly id: string,
    readonly tc: TimeControl,
    readonly rated: boolean,
  ) {
    this.category = categoryOf(tc);
    this.clocks = { white: tc.base * 1000, black: tc.base * 1000 };
  }

  get turn(): Color {
    return this.chess.turn() === "w" ? "white" : "black";
  }

  colorOf(userId: string): Color | null {
    if (this.white?.id === userId) return "white";
    if (this.black?.id === userId) return "black";
    return null;
  }

  start(now: number) {
    this.status = "active";
    this.lastTick = now;
  }

  /** Clock only runs once both sides have moved, so a slow opening doesn't cost time. */
  private clockRunning() {
    return this.status === "active" && this.chess.history().length >= 2;
  }

  /** Milliseconds left for the side to move, as of `now`. */
  remaining(now: number): number {
    const used = this.clockRunning() ? now - this.lastTick : 0;
    return this.clocks[this.turn] - used;
  }

  /** Ends the game if the side to move has run out of time. */
  checkTimeout(now: number): boolean {
    if (this.status !== "active" || !this.clockRunning()) return false;
    if (this.remaining(now) > 0) return false;
    this.clocks[this.turn] = 0;
    this.finish(this.turn === "white" ? "0-1" : "1-0", "timeout");
    return true;
  }

  makeMove(color: Color, input: MoveInput, now: number): { ok: true; move: Move } | { ok: false; error: string } {
    if (this.status !== "active") return { ok: false, error: "Game is not active" };
    if (this.turn !== color) return { ok: false, error: "Not your turn" };
    if (this.checkTimeout(now)) return { ok: false, error: "Out of time" };

    let move: Move;
    try {
      move = this.chess.move({ from: input.from, to: input.to, promotion: input.promotion });
    } catch {
      return { ok: false, error: "Illegal move" };
    }

    if (this.chess.history().length > 2) {
      const spent = now - this.lastTick;
      this.clocks[color] = Math.max(0, this.clocks[color] - spent) + this.tc.inc * 1000;
    }
    this.lastTick = now;
    this.last = move;
    this.drawOffer = null;
    this.detectEnd();
    return { ok: true, move };
  }

  private detectEnd() {
    const c = this.chess;
    if (c.isCheckmate()) this.finish(c.turn() === "w" ? "0-1" : "1-0", "checkmate");
    else if (c.isStalemate()) this.finish("1/2-1/2", "stalemate");
    else if (c.isInsufficientMaterial()) this.finish("1/2-1/2", "insufficient");
    else if (c.isThreefoldRepetition()) this.finish("1/2-1/2", "repetition");
    else if (c.isDraw()) this.finish("1/2-1/2", "fifty-move");
  }

  resign(color: Color) {
    if (this.status !== "active") return false;
    this.finish(color === "white" ? "0-1" : "1-0", "resign");
    return true;
  }

  offerDraw(color: Color) {
    if (this.status !== "active") return false;
    this.drawOffer = color;
    return true;
  }

  acceptDraw(color: Color) {
    if (this.status !== "active" || !this.drawOffer || this.drawOffer === color) return false;
    this.finish("1/2-1/2", "agreement");
    return true;
  }

  declineDraw(color: Color) {
    if (!this.drawOffer || this.drawOffer === color) return false;
    this.drawOffer = null;
    return true;
  }

  private finish(result: Result, reason: Reason) {
    this.status = "finished";
    this.result = result;
    this.reason = reason;
    this.drawOffer = null;
  }

  pgn(): string {
    this.chess.setHeader("White", this.white?.name ?? "?");
    this.chess.setHeader("Black", this.black?.name ?? "?");
    this.chess.setHeader("Result", this.result ?? "*");
    this.chess.setHeader("TimeControl", `${this.tc.base}+${this.tc.inc}`);
    return this.chess.pgn();
  }

  snapshot(now: number): Snapshot {
    const clocks = { ...this.clocks };
    if (this.clockRunning()) clocks[this.turn] = Math.max(0, this.remaining(now));
    return {
      id: this.id,
      fen: this.chess.fen(),
      moves: this.chess.history(),
      lastMove: this.last ? { from: this.last.from, to: this.last.to } : null,
      white: this.white,
      black: this.black,
      clocks,
      turn: this.turn,
      status: this.status,
      result: this.result,
      reason: this.reason,
      drawOffer: this.drawOffer,
      tc: this.tc,
      category: this.category,
      rated: this.rated,
      serverTime: now,
      inCheck: this.chess.inCheck(),
    };
  }
}
