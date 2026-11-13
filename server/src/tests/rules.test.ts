import { describe, expect, it } from "vitest";
import { LiveGame, type Color } from "../game/liveGame";
import { expectedScore, newRatings } from "../game/elo";
import { PRESETS, categoryOf, parsePreset } from "../game/timeControl";

const p = (id: string, rating = 1200) => ({ id, name: id, rating });

function game(fen?: string, tc = { base: 300, inc: 0 }) {
  const g = new LiveGame("g", tc, true);
  g.white = p("w");
  g.black = p("b");
  if (fen) g.chess.load(fen);
  g.start(0);
  return g;
}

const play = (g: LiveGame, moves: [string, string, string?][], t = 0) => {
  for (const [from, to, promotion] of moves) {
    const r = g.makeMove(g.turn, { from, to, promotion }, t);
    if (!r.ok) throw new Error(`${from}${to}: ${r.error}`);
  }
};

describe("every way a game ends", () => {
  it("checkmate by white and by black", () => {
    const g = game("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    play(g, [["a1", "a8"]]);
    expect([g.result, g.reason]).toEqual(["1-0", "checkmate"]);
    const m = game("r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1");
    play(m, [["a8", "a1"]]);
    expect([m.result, m.reason]).toEqual(["0-1", "checkmate"]);
  });
  it("stalemate", () => {
    const g = game("7k/8/5K2/6Q1/8/8/8/8 w - - 0 1");
    play(g, [["g5", "g6"]]);
    expect([g.result, g.reason]).toEqual(["1/2-1/2", "stalemate"]);
  });
  it("insufficient material", () => {
    const g = game("k7/8/8/8/8/2n5/8/K3B3 w - - 0 1");
    play(g, [["e1", "c3"]]);
    expect([g.result, g.reason]).toEqual(["1/2-1/2", "insufficient"]);
  });
  it("threefold repetition", () => {
    const g = game();
    const cycle: [string, string][] = [["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"]];
    play(g, [...cycle, ...cycle]);
    expect([g.result, g.reason]).toEqual(["1/2-1/2", "repetition"]);
  });
  it("fifty-move rule", () => {
    const g = game("k7/8/8/8/8/8/8/KR6 w - - 99 80");
    play(g, [["b1", "b2"]]);
    expect([g.result, g.reason]).toEqual(["1/2-1/2", "fifty-move"]);
  });
  it("resignation by either colour", () => {
    for (const c of ["white", "black"] as Color[]) {
      const g = game();
      expect(g.resign(c)).toBe(true);
      expect(g.result).toBe(c === "white" ? "0-1" : "1-0");
      expect(g.reason).toBe("resign");
    }
  });
  it("timeout for either colour", () => {
    const w = game(undefined, { base: 60, inc: 0 });
    play(w, [["e2", "e4"], ["e7", "e5"]], 0);
    expect(w.checkTimeout(61_000)).toBe(true);
    expect(w.result).toBe("0-1");
    const b = game(undefined, { base: 60, inc: 0 });
    play(b, [["e2", "e4"], ["e7", "e5"]], 0);
    play(b, [["g1", "f3"]], 1000);
    expect(b.checkTimeout(61_500)).toBe(true);
    expect(b.result).toBe("1-0");
  });
  it("nothing is allowed after the game ends", () => {
    const g = game();
    g.resign("white");
    expect(g.makeMove("black", { from: "e7", to: "e5" }, 0).ok).toBe(false);
    expect(g.resign("black")).toBe(false);
    expect(g.offerDraw("black")).toBe(false);
  });
});

describe("special moves", () => {
  it("all four promotions, both colours", () => {
    for (const piece of ["q", "r", "b", "n"]) {
      const g = game("8/P6k/8/8/8/8/8/K7 w - - 0 1");
      play(g, [["a7", "a8", piece]]);
      expect(g.chess.get("a8")).toMatchObject({ type: piece, color: "w" });
      const h = game("k7/8/8/8/8/8/p6K/8 b - - 0 1");
      play(h, [["a2", "a1", piece]]);
      expect(h.chess.get("a1")).toMatchObject({ type: piece, color: "b" });
    }
  });
  it("promotion requires a piece choice", () => {
    const g = game("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    expect(g.makeMove("white", { from: "a7", to: "a8" }, 0).ok).toBe(false);
  });
  it("castling kingside and queenside for both colours", () => {
    const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    const g = game(fen);
    play(g, [["e1", "g1"], ["e8", "c8"]]);
    expect(g.chess.get("f1")?.type).toBe("r");
    expect(g.chess.get("d8")?.type).toBe("r");
    const h = game(fen);
    play(h, [["e1", "c1"], ["e8", "g8"]]);
    expect(h.chess.get("d1")?.type).toBe("r");
    expect(h.chess.get("f8")?.type).toBe("r");
  });
  it("castling through check or out of check is illegal", () => {
    const through = game("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1");
    expect(through.makeMove("white", { from: "e1", to: "g1" }, 0).ok).toBe(false);
    const out = game("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1");
    expect(out.makeMove("white", { from: "e1", to: "g1" }, 0).ok).toBe(false);
  });
  it("en passant", () => {
    const g = game();
    play(g, [["e2", "e4"], ["a7", "a6"], ["e4", "e5"], ["d7", "d5"], ["e5", "d6"]]);
    expect(g.chess.get("d5")).toBeFalsy();
    expect(g.chess.get("d6")?.type).toBe("p");
  });
  it("cannot move into or leave a king in check", () => {
    const g = game("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
    expect(g.makeMove("white", { from: "e1", to: "d1" }, 0).ok).toBe(true);
    const h = game("4k3/8/8/8/4r3/8/8/4K3 w - - 0 1");
    expect(h.makeMove("white", { from: "e1", to: "e2" }, 0).ok).toBe(false);
  });
});

describe("clocks and draw offers", () => {
  it("increment accrues for each side from move 2 onwards", () => {
    const g = game(undefined, { base: 180, inc: 2 });
    play(g, [["e2", "e4"], ["e7", "e5"]], 0);
    play(g, [["g1", "f3"]], 3000);
    play(g, [["b8", "c6"]], 4000);
    expect(g.clocks.white).toBe(180_000 - 3000 + 2000);
    expect(g.clocks.black).toBe(180_000 - 1000 + 2000);
  });
  it("snapshot subtracts elapsed time only from the mover", () => {
    const g = game(undefined, { base: 60, inc: 0 });
    play(g, [["e2", "e4"], ["e7", "e5"]], 0);
    const s = g.snapshot(10_000);
    expect(s.clocks.white).toBe(50_000);
    expect(s.clocks.black).toBe(60_000);
  });
  it("draw offer: self-accept blocked, decline clears, moving clears", () => {
    const g = game();
    g.offerDraw("white");
    expect(g.acceptDraw("white")).toBe(false);
    expect(g.declineDraw("white")).toBe(false);
    expect(g.declineDraw("black")).toBe(true);
    expect(g.drawOffer).toBeNull();
    g.offerDraw("black");
    play(g, [["e2", "e4"]]);
    expect(g.drawOffer).toBeNull();
    expect(g.acceptDraw("black")).toBe(false);
  });
  it("accepting a draw ends the game by agreement", () => {
    const g = game();
    g.offerDraw("black");
    expect(g.acceptDraw("white")).toBe(true);
    expect([g.result, g.reason]).toEqual(["1/2-1/2", "agreement"]);
  });
});

describe("time controls", () => {
  it("every preset parses and categorises", () => {
    const expected: Record<string, string> = {
      "1+0": "bullet", "2+1": "bullet", "3+0": "blitz", "3+2": "blitz", "5+0": "blitz", "10+0": "rapid", "15+10": "rapid",
    };
    for (const id of PRESETS) expect(categoryOf(parsePreset(id)!)).toBe(expected[id]);
  });
  it("rejects unknown presets", () => {
    for (const bad of ["", "0+0", "1+1", "abc", "5+0 ", "1+0;drop"]) expect(parsePreset(bad)).toBeNull();
  });
});

describe("elo", () => {
  it("win / draw / loss with equal ratings", () => {
    expect(newRatings(1200, 1200, 1)).toEqual({ white: 1212, black: 1188 });
    expect(newRatings(1200, 1200, 0.5)).toEqual({ white: 1200, black: 1200 });
    expect(newRatings(1200, 1200, 0)).toEqual({ white: 1188, black: 1212 });
  });
  it("upsets move ratings more than expected results", () => {
    const upset = newRatings(1000, 1400, 1);
    const expected = newRatings(1400, 1000, 1);
    expect(upset.white - 1000).toBeGreaterThan(expected.white - 1400);
  });
  it("draw against a stronger player gains points", () => {
    const r = newRatings(1000, 1400, 0.5);
    expect(r.white).toBeGreaterThan(1000);
    expect(r.black).toBeLessThan(1400);
  });
  it("expected scores sum to 1", () => {
    expect(expectedScore(1500, 1300) + expectedScore(1300, 1500)).toBeCloseTo(1);
  });
});
