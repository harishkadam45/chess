"use client";
import { Chess } from "chess.js";
import { useEffect, useState } from "react";
import ChessBoard3D from "./ChessBoard3D";

// A short game with castling and captures, replayed on a loop behind the landing page.
const DEMO = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O d4 exd4 cxd4 Bg4 Be3 Nxe4 Nbd2 Nxd2 Bxd2 Bxf3 Qxf3 Na5 Bc2 Nc4".split(" ");

export default function HeroScene({ quality = "high" }: { quality?: "high" | "low" }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s >= DEMO.length + 2 ? 0 : s + 1)), 2300);
    return () => clearInterval(t);
  }, []);

  const { fen, last } = (() => {
    const c = new Chess();
    let last: { from: string; to: string } | null = null;
    for (let i = 0; i < Math.min(step, DEMO.length); i++) {
      const m = c.move(DEMO[i]);
      last = { from: m.from, to: m.to };
    }
    return { fen: c.fen(), last };
  })();

  return <ChessBoard3D fen={fen} lastMove={last} canMove={null} autoRotate quality={quality} />;
}
