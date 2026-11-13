"use client";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import * as THREE from "three";
import { pieceGeometry } from "@/lib/three/pieceGeometry";
import { squareToXZ, syncPieces, type Tracked } from "@/lib/three/tracker";
import type { BoardTheme } from "@/lib/boardTheme";

type Mats = Record<"w" | "b", THREE.Material>;

function Piece({
  p, index, mats, selected, clickable, onSquare,
}: {
  p: Tracked;
  index: number;
  mats: Mats;
  selected: boolean;
  clickable: boolean;
  onSquare: (sq: string) => void;
}) {
  const group = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  const spawned = useRef(false);
  const geo = useMemo(() => pieceGeometry(p.type), [p.type]);
  const [x, z] = squareToXZ(p.square);

  // Spawn on first mount, glide (with an arc) whenever the square changes.
  useLayoutEffect(() => {
    const g = group.current;
    if (!spawned.current) {
      spawned.current = true;
      g.position.set(x, 7 + Math.random() * 3, z);
      g.scale.setScalar(0.001);
      const delay = 0.5 + index * 0.035;
      gsap.to(g.position, { y: 0, duration: 1.1, delay, ease: "bounce.out" });
      gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.6, delay, ease: "back.out(2)" });
      return;
    }
    gsap.killTweensOf(g.position);
    const lift = p.type === "n" ? 1.15 : 0.65;
    const tl = gsap.timeline();
    tl.to(g.position, { x, z, duration: 0.55, ease: "power2.inOut" }, 0)
      .to(g.position, { y: lift, duration: 0.27, ease: "power2.out" }, 0)
      .to(g.position, { y: 0, duration: 0.3, ease: "bounce.out" }, 0.27);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.square]);

  // Captured: shrink, spin and rise after the capturing piece lands.
  useEffect(() => {
    if (!p.dead) return;
    const g = group.current;
    gsap.killTweensOf(g.position);
    const tl = gsap.timeline({ delay: 0.32 });
    tl.to(g.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.5, ease: "back.in(2)" }, 0)
      .to(g.position, { y: 1.4, duration: 0.5, ease: "power2.in" }, 0)
      .to(g.rotation, { y: Math.PI * 3, duration: 0.5 }, 0);
    return () => {
      tl.kill();
    };
  }, [p.dead]);

  useFrame((s) => {
    const i = inner.current;
    const t = s.clock.elapsedTime;
    const targetY = selected ? 0.18 + Math.sin(t * 4) * 0.05 : 0;
    i.position.y += (targetY - i.position.y) * 0.2;
    const k = selected ? 1.08 : 1;
    i.scale.setScalar(i.scale.x + (k - i.scale.x) * 0.2);
  });

  const face = p.type === "n" ? (p.color === "w" ? Math.PI / 2 : -Math.PI / 2) : 0;
  return (
    <group ref={group}>
      <group ref={inner}>
        <mesh
          geometry={geo}
          material={mats[p.color]}
          rotation-y={face}
          userData={{ square: p.dead ? undefined : p.square }}
          castShadow
          onClick={
            clickable && !p.dead
              ? (e) => {
                  e.stopPropagation();
                  onSquare(p.square);
                }
              : undefined
          }
          onPointerOver={clickable && !p.dead ? () => void (document.body.style.cursor = "pointer") : undefined}
          onPointerOut={() => void (document.body.style.cursor = "")}
        />
      </group>
    </group>
  );
}

export interface PiecesProps {
  fen: string;
  selected: string | null;
  clickable: boolean;
  onSquare: (sq: string) => void;
  /** Called when a piece is captured (colour of the captured piece) so effects can play. */
  onCapture: (square: string, color: "w" | "b") => void;
  look: BoardTheme["pieces"];
}

export function Pieces({ fen, selected, clickable, onSquare, onCapture, look }: PiecesProps) {
  const nextId = useRef(0);
  const [pieces, update] = useReducer(
    (prev: Tracked[], f: string) => syncPieces(prev, f, () => ++nextId.current),
    [],
    () => [] as Tracked[],
  );

  const mats = useMemo<Mats>(
    () => ({ w: new THREE.MeshPhysicalMaterial(look.w), b: new THREE.MeshPhysicalMaterial(look.b) }),
    [look],
  );

  const prevPieces = useRef<Tracked[]>([]);
  useEffect(() => {
    update(fen);
  }, [fen]);

  // Announce newly captured pieces, and clean up dead ones once their exit animation has played.
  useEffect(() => {
    for (const p of pieces) {
      if (p.dead && !prevPieces.current.some((q) => q.id === p.id && q.dead)) onCapture(p.square, p.color);
    }
    prevPieces.current = pieces;
  }, [pieces, onCapture]);

  const live = pieces.filter((p) => !p.dead);
  const dead = pieces.filter((p) => p.dead);
  const cleanup = useRef<number | null>(null);
  useEffect(() => {
    if (!dead.length) return;
    if (cleanup.current) window.clearTimeout(cleanup.current);
    cleanup.current = window.setTimeout(() => update(fen), 1200);
    // update(fen) re-syncs, which drops dead pieces because syncPieces only carries live ones forward.
    return () => {
      if (cleanup.current) window.clearTimeout(cleanup.current);
    };
  }, [dead.length, fen]);

  useEffect(
    () => () => {
      mats.w.dispose();
      mats.b.dispose();
    },
    [mats],
  );

  return (
    <>
      {[...live, ...dead].map((p, i) => (
        <Piece key={p.id} p={p} index={i} mats={mats} selected={!p.dead && p.square === selected} clickable={clickable} onSquare={onSquare} />
      ))}
    </>
  );
}
