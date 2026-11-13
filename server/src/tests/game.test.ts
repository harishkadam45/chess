import { describe, expect, it } from "vitest";
import { LiveGame } from "../game/liveGame";
import { newRatings } from "../game/elo";
import { categoryOf, parsePreset } from "../game/timeControl";

const p = (id: string) => ({ id, name: id, rating: 1200 });

function started(tc = { base: 300, inc: 0 }) {
  const g = new LiveGame("g1", tc, true);
  g.white = p("w");
  g.black = p("b");
  g.start(0);
  return g;
}

describe("LiveGame", () => {
  it("rejects illegal moves and wrong turn", () => {
    const g = started();
    expect(g.makeMove("black", { from: "e7", to: "e5" }, 0).ok).toBe(false);
    expect(g.makeMove("white", { from: "e2", to: "e5" }, 0).ok).toBe(false);
    expect(g.makeMove("white", { from: "e2", to: "e4" }, 0).ok).toBe(true);
  });

  it("detects fool's mate", () => {
    const g = started();
    g.makeMove("white", { from: "f2", to: "f3" }, 0);
    g.makeMove("black", { from: "e7", to: "e5" }, 0);
    g.makeMove("white", { from: "g2", to: "g4" }, 0);
    g.makeMove("black", { from: "d8", to: "h4" }, 0);
    expect(g.status).toBe("finished");
    expect(g.result).toBe("0-1");
    expect(g.reason).toBe("checkmate");
  });

  it("supports castling and promotion", () => {
    const g = started();
    for (const [c, f, t] of [
      ["white", "e2", "e4"], ["black", "e7", "e5"], ["white", "g1", "f3"], ["black", "b8", "c6"],
      ["white", "f1", "c4"], ["black", "g8", "f6"],
    ] as const) expect(g.makeMove(c, { from: f, to: t }, 0).ok).toBe(true);
    expect(g.makeMove("white", { from: "e1", to: "g1" }, 0).ok).toBe(true);
    expect(g.chess.get("f1")?.type).toBe("r");
  });

  it("flags the side to move once the clock is running", () => {
    const g = started({ base: 60, inc: 0 });
    g.makeMove("white", { from: "e2", to: "e4" }, 0);
    g.makeMove("black", { from: "e7", to: "e5" }, 1000);
    expect(g.checkTimeout(30_000)).toBe(false);
    expect(g.checkTimeout(62_000)).toBe(true);
    expect(g.result).toBe("0-1");
    expect(g.reason).toBe("timeout");
  });

  it("does not run the clock before both sides moved", () => {
    const g = started({ base: 60, inc: 0 });
    expect(g.checkTimeout(10 * 60_000)).toBe(false);
  });

  it("adds increment after moves", () => {
    const g = started({ base: 60, inc: 2 });
    g.makeMove("white", { from: "e2", to: "e4" }, 0);
    g.makeMove("black", { from: "e7", to: "e5" }, 0);
    g.makeMove("white", { from: "g1", to: "f3" }, 5000);
    expect(g.clocks.white).toBe(60_000 - 5000 + 2000);
  });

  it("handles resignation and draw offers", () => {
    const g = started();
    expect(g.offerDraw("white")).toBe(true);
    expect(g.acceptDraw("white")).toBe(false);
    expect(g.acceptDraw("black")).toBe(true);
    expect(g.result).toBe("1/2-1/2");
    const h = started();
    h.resign("white");
    expect(h.result).toBe("0-1");
  });
});

describe("elo + time controls", () => {
  it("is zero-sum for equal ratings", () => {
    const r = newRatings(1200, 1200, 1);
    expect(r).toEqual({ white: 1212, black: 1188 });
  });
  it("classifies presets", () => {
    expect(categoryOf(parsePreset("1+0")!)).toBe("bullet");
    expect(categoryOf(parsePreset("5+0")!)).toBe("blitz");
    expect(categoryOf(parsePreset("10+0")!)).toBe("rapid");
    expect(parsePreset("9+9")).toBeNull();
  });
});
