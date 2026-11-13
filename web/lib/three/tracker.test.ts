import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { squareToXZ, syncPieces, type Tracked } from "./tracker";

let n = 0;
const nextId = () => ++n;
const alive = (p: Tracked[]) => p.filter((x) => !x.dead);

function play(fens: string[], start: Tracked[] = []) {
  return fens.reduce((acc, f) => syncPieces(acc, f, nextId), start);
}

describe("syncPieces", () => {
  it("creates 32 pieces for the start position", () => {
    const p = syncPieces([], new Chess().fen(), nextId);
    expect(alive(p)).toHaveLength(32);
    expect(new Set(p.map((x) => x.id)).size).toBe(32);
  });

  it("keeps identity when a piece moves", () => {
    const c = new Chess();
    const a = syncPieces([], c.fen(), nextId);
    const pawn = a.find((x) => x.square === "e2")!;
    c.move("e4");
    const b = syncPieces(a, c.fen(), nextId);
    const moved = b.find((x) => x.id === pawn.id);
    expect(moved?.square).toBe("e4");
    expect(moved?.dead).toBeFalsy();
    expect(alive(b)).toHaveLength(32);
  });

  it("marks captured pieces dead and moves the capturer", () => {
    const c = new Chess();
    let t = syncPieces([], c.fen(), nextId);
    for (const m of ["e4", "d5"]) {
      c.move(m);
      t = syncPieces(t, c.fen(), nextId);
    }
    const mover = t.find((x) => x.square === "e4")!;
    const victim = t.find((x) => x.square === "d5")!;
    c.move("exd5");
    t = syncPieces(t, c.fen(), nextId);
    expect(t.find((x) => x.id === mover.id)?.square).toBe("d5");
    expect(t.find((x) => x.id === victim.id)?.dead).toBe(true);
    expect(alive(t)).toHaveLength(31);
  });

  it("moves both king and rook when castling", () => {
    const c = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    let t = syncPieces([], c.fen(), nextId);
    const king = t.find((x) => x.square === "e1")!;
    const rook = t.find((x) => x.square === "h1")!;
    c.move("O-O");
    t = syncPieces(t, c.fen(), nextId);
    expect(t.find((x) => x.id === king.id)?.square).toBe("g1");
    expect(t.find((x) => x.id === rook.id)?.square).toBe("f1");
    expect(alive(t)).toHaveLength(6);
  });

  it("handles en passant (captured pawn is not on the destination square)", () => {
    const c = new Chess("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    let t = syncPieces([], c.fen(), nextId);
    const victim = t.find((x) => x.square === "d5")!;
    c.move("exd6");
    t = syncPieces(t, c.fen(), nextId);
    expect(t.find((x) => x.id === victim.id)?.dead).toBe(true);
    expect(alive(t)).toHaveLength(3);
  });

  it("promotion removes the pawn and spawns the new piece", () => {
    const c = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    let t = syncPieces([], c.fen(), nextId);
    c.move({ from: "a7", to: "a8", promotion: "q" });
    t = syncPieces(t, c.fen(), nextId);
    expect(alive(t).find((x) => x.square === "a8")?.type).toBe("q");
    expect(t.some((x) => x.dead && x.type === "p")).toBe(true);
  });

  it("stepping back through a game restores captured pieces", () => {
    const c = new Chess();
    const fens = [c.fen()];
    for (const m of ["e4", "d5", "exd5"]) {
      c.move(m);
      fens.push(c.fen());
    }
    let t = play(fens);
    t = syncPieces(t, fens[2], nextId);
    expect(alive(t)).toHaveLength(32);
    expect(alive(t).find((x) => x.square === "d5")?.color).toBe("b");
  });

  it("is stable through a whole game: always matches the board", () => {
    const c = new Chess();
    let t = syncPieces([], c.fen(), nextId);
    for (let i = 0; i < 60 && !c.isGameOver(); i++) {
      const moves = c.moves();
      c.move(moves[(i * 7) % moves.length]);
      t = syncPieces(t, c.fen(), nextId);
      const board = c.board().flat().filter(Boolean).length;
      expect(alive(t)).toHaveLength(board);
      for (const p of alive(t)) expect(c.get(p.square as never)).toMatchObject({ type: p.type, color: p.color });
    }
  });
});

describe("squareToXZ", () => {
  it("puts white's back rank toward +z", () => {
    expect(squareToXZ("a1")).toEqual([-3.5, 3.5]);
    expect(squareToXZ("h8")).toEqual([3.5, -3.5]);
  });
});
