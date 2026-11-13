import type { PieceType } from "./pieceGeometry";

export interface Tracked {
  id: number;
  type: PieceType;
  color: "w" | "b";
  square: string;
  /** Piece was captured (or promoted away) and is playing its exit animation. */
  dead?: boolean;
}

const FILES = "abcdefgh";

/** Board square -> world x/z. White's side (rank 1) is +z, so the default camera looks from white's side. */
export function squareToXZ(square: string): [number, number] {
  return [FILES.indexOf(square[0]) - 3.5, 3.5 - (Number(square[1]) - 1)];
}

function parseFen(fen: string): Omit<Tracked, "id">[] {
  const out: Omit<Tracked, "id">[] = [];
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") file += Number(ch);
      else {
        out.push({
          type: ch.toLowerCase() as PieceType,
          color: ch === ch.toUpperCase() ? "w" : "b",
          square: `${FILES[file]}${8 - i}`,
        });
        file++;
      }
    }
  });
  return out;
}

const dist = (a: string, b: string) => {
  const [ax, az] = squareToXZ(a);
  const [bx, bz] = squareToXZ(b);
  return Math.hypot(ax - bx, az - bz);
};

/**
 * Reconcile the tracked pieces with a new position, keeping piece identity across moves so the renderer can
 * animate them: pieces that moved are matched to the nearest same-type/colour target (this also handles
 * castling and en passant), pieces with no target are marked dead (captured), and unmatched targets are new
 * (initial setup, promotion, undo).
 */
export function syncPieces(prev: Tracked[], fen: string, nextId: () => number): Tracked[] {
  const targets = parseFen(fen);
  const live = prev.filter((p) => !p.dead);
  const usedPrev = new Set<number>();
  const usedTarget = new Set<number>();
  const result: Tracked[] = [];

  // 1. pieces that did not move
  targets.forEach((t, ti) => {
    const p = live.find((x) => !usedPrev.has(x.id) && x.square === t.square && x.type === t.type && x.color === t.color);
    if (p) {
      usedPrev.add(p.id);
      usedTarget.add(ti);
      result.push(p);
    }
  });

  // 2. pieces that moved: closest pairs first, per type+colour
  const pairs: { p: Tracked; ti: number; d: number }[] = [];
  for (const p of live) {
    if (usedPrev.has(p.id)) continue;
    targets.forEach((t, ti) => {
      if (usedTarget.has(ti) || t.type !== p.type || t.color !== p.color) return;
      pairs.push({ p, ti, d: dist(p.square, t.square) });
    });
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const { p, ti } of pairs) {
    if (usedPrev.has(p.id) || usedTarget.has(ti)) continue;
    usedPrev.add(p.id);
    usedTarget.add(ti);
    result.push({ ...p, square: targets[ti].square });
  }

  // 3. captured pieces exit, 4. unmatched targets are new
  for (const p of live) if (!usedPrev.has(p.id)) result.push({ ...p, dead: true });
  targets.forEach((t, ti) => {
    if (!usedTarget.has(ti)) result.push({ ...t, id: nextId() });
  });
  return result;
}
