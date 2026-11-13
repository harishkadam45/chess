"use client";
import { Chess, type Square } from "chess.js";
import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { BOARD_THEMES, DEFAULT_BOARD_THEME, type BoardThemeId } from "@/lib/boardTheme";

interface Props {
  fen: string;
  orientation?: "white" | "black";
  /** Which colour may move right now; null makes the board read-only. */
  canMove: "w" | "b" | null;
  onMove?: (m: { from: string; to: string; promotion?: string }) => void;
  lastMove?: { from: string; to: string } | null;
  theme?: BoardThemeId;
}

const PROMO = [
  { p: "q", g: { w: "♕", b: "♛" } },
  { p: "r", g: { w: "♖", b: "♜" } },
  { p: "b", g: { w: "♗", b: "♝" } },
  { p: "n", g: { w: "♘", b: "♞" } },
];

export function ChessBoard({ fen, orientation = "white", canMove, onMove, lastMove, theme = DEFAULT_BOARD_THEME }: Props) {
  const flat = BOARD_THEMES[theme].flat;
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const interactive = canMove !== null && chess.turn() === canMove;

  const targets = useMemo(
    () => (selected && interactive ? chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to) : []),
    [chess, selected, interactive],
  );

  const attempt = (from: string, to: string): boolean => {
    const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) return false;
    setSelected(null);
    if (legal[0].promotion) setPending({ from, to });
    else onMove?.({ from, to });
    return true;
  };

  const styles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    styles[lastMove.from] = { background: `rgba(${flat.lastMove}, 0.35)` };
    styles[lastMove.to] = { background: `rgba(${flat.lastMove}, 0.5)` };
  }
  if (chess.inCheck()) {
    const k = chess.board().flat().find((s) => s?.type === "k" && s.color === chess.turn());
    if (k) styles[k.square] = { background: "radial-gradient(circle, rgba(239,68,68,.85) 0%, rgba(239,68,68,0) 70%)" };
  }
  if (selected) styles[selected] = { background: `rgba(${flat.selected}, 0.45)` };
  for (const t of targets) {
    styles[t] = {
      ...styles[t],
      background: chess.get(t as Square)
        ? "radial-gradient(circle, transparent 60%, rgba(0,0,0,.3) 62%)"
        : "radial-gradient(circle, rgba(0,0,0,.25) 22%, transparent 24%)",
    };
  }

  return (
    <div className="relative aspect-square w-full max-w-[min(90vw,640px)]">
      <Chessboard
        options={{
          id: "board",
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          canDragPiece: ({ piece }) => interactive && piece.pieceType[0] === canMove,
          squareStyles: styles,
          darkSquareStyle: flat.dark,
          lightSquareStyle: flat.light,
          animationDurationInMs: 150,
          onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? attempt(sourceSquare, targetSquare) : false),
          onSquareClick: ({ square, piece }) => {
            if (!interactive) return;
            if (selected && selected !== square && attempt(selected, square)) return;
            setSelected(piece && piece.pieceType[0] === canMove ? square : null);
          },
        }}
      />
      {pending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="flex gap-2 rounded-xl bg-white p-3 dark:bg-stone-900">
            {PROMO.map(({ p, g }) => (
              <button
                key={p}
                aria-label={`Promote to ${p}`}
                className="h-16 w-16 rounded-lg text-5xl hover:bg-amber-100 dark:hover:bg-stone-700"
                onClick={() => {
                  onMove?.({ ...pending, promotion: p });
                  setPending(null);
                }}
              >
                {g[canMove ?? "w"]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
