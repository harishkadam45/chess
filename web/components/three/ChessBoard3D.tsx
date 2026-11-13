"use client";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Chess, type Square } from "chess.js";
import gsap from "gsap";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { squareToXZ } from "@/lib/three/tracker";
import { BOARD_THEMES, DEFAULT_BOARD_THEME, type BoardThemeId, type TileLook } from "@/lib/boardTheme";
import { Arena } from "./Arena";
import { Burst, Shockwave } from "./Effects";
import { Pieces } from "./Pieces";

export interface Board3DProps {
  fen: string;
  orientation?: "white" | "black";
  /** Which colour may move right now; null makes the board read-only. */
  canMove: "w" | "b" | null;
  onMove?: (m: { from: string; to: string; promotion?: string }) => void;
  lastMove?: { from: string; to: string } | null;
  quality?: "high" | "low";
  /** Slow cinematic orbit (landing-page hero). */
  autoRotate?: boolean;
  /** Bump to re-run the camera fly-in. */
  resetKey?: number;
  /** Board look; defaults to DEFAULT_BOARD_THEME. */
  theme?: BoardThemeId;
}

const FILES = "abcdefgh";

declare global {
  interface Window {
    __board3d?: { ready: boolean; squareToClient: (sq: string) => { x: number; y: number } };
  }
}

/**
 * Tile materials per theme: wood grain or veined marble.
 * Textures are painted on a canvas so no image assets are needed.
 */
function useTileMaterials(look: TileLook) {
  const mats = useMemo(() => {
    const canvasTexture = (paint: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      paint(c.getContext("2d")!);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };
    const make = (t: TileLook["light"], seed: number) => {
      let s = seed;
      const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
      const tex = canvasTexture((g) => {
        g.fillStyle = t.base;
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = t.detail;
        if (look.kind === "wood") {
          // long, slightly wavy grain lines
          for (let i = 0; i < 46; i++) {
            const y0 = rnd() * 256;
            const amp = 2 + rnd() * 5;
            const freq = 0.01 + rnd() * 0.02;
            const phase = rnd() * 6.28;
            g.globalAlpha = 0.1 + rnd() * 0.3;
            g.lineWidth = 0.6 + rnd() * 2;
            g.beginPath();
            for (let x = 0; x <= 256; x += 8) g.lineTo(x, y0 + Math.sin(x * freq + phase) * amp);
            g.stroke();
          }
        } else {
          // a few wandering marble veins
          for (let i = 0; i < 7; i++) {
            let x = rnd() * 256;
            let y = rnd() * 256;
            let a = rnd() * 6.28;
            g.globalAlpha = 0.18 + rnd() * 0.4;
            g.lineWidth = 0.5 + rnd() * 1.8;
            g.beginPath();
            g.moveTo(x, y);
            for (let k = 0; k < 28; k++) {
              a += (rnd() - 0.5) * 0.9;
              x += Math.cos(a) * 12;
              y += Math.sin(a) * 12;
              g.lineTo(x, y);
            }
            g.stroke();
          }
        }
        g.globalAlpha = 0.35;
        g.lineWidth = 3;
        g.strokeRect(1.5, 1.5, 253, 253);
      });
      return new THREE.MeshStandardMaterial({ map: tex, metalness: look.metalness, roughness: look.roughness, envMapIntensity: 1.1 });
    };
    return { light: make(look.light, 7), dark: make(look.dark, 91) };
  }, [look]);

  useEffect(
    () => () => {
      for (const m of [mats.light, mats.dark]) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [mats],
  );
  return mats;
}

function Tiles({ look, onSquare, hover, setHover, clickable }: { look: TileLook; onSquare: (sq: string) => void; hover: string | null; setHover: (s: string | null) => void; clickable: boolean }) {
  const mats = useTileMaterials(look);
  const squares = useMemo(() => {
    const out: { name: string; x: number; z: number; light: boolean }[] = [];
    for (let f = 0; f < 8; f++)
      for (let r = 0; r < 8; r++) {
        const name = `${FILES[f]}${r + 1}`;
        const [x, z] = squareToXZ(name);
        out.push({ name, x, z, light: (f + r) % 2 === 1 });
      }
    return out;
  }, []);
  return (
    <group>
      {squares.map((s) => (
        <mesh
          key={s.name}
          position={[s.x, -0.06, s.z]}
          material={s.light ? mats.light : mats.dark}
          userData={{ square: s.name }}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onSquare(s.name);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (clickable) setHover(s.name);
          }}
          onPointerOut={() => setHover(hover === s.name ? null : hover)}
        >
          <boxGeometry args={[0.97, 0.12, 0.97]} />
        </mesh>
      ))}
    </group>
  );
}

function Plate({ square, color, opacity = 0.55, y = 0.012, pulse }: { square: string; color: string; opacity?: number; y?: number; pulse?: boolean }) {
  const ref = useRef<THREE.MeshBasicMaterial>(null!);
  const [x, z] = squareToXZ(square);
  useFrame((s) => {
    if (pulse) ref.current.opacity = opacity * (0.65 + 0.35 * Math.sin(s.clock.elapsedTime * 5));
  });
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.94, 0.94]} />
      <meshBasicMaterial ref={ref} color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Marker({ square, capture, color }: { square: string; capture: boolean; color: string }) {
  const ref = useRef<THREE.Mesh>(null!);
  const [x, z] = squareToXZ(square);
  useFrame((s) => {
    const k = 1 + Math.sin(s.clock.elapsedTime * 5 + x) * 0.12;
    ref.current.scale.set(k, k, k);
  });
  return (
    <mesh ref={ref} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
      {capture ? <ringGeometry args={[0.34, 0.45, 40]} /> : <circleGeometry args={[0.15, 32]} />}
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  );
}

function CameraRig({ orientation, autoRotate, resetKey }: { orientation: "white" | "black"; autoRotate: boolean; resetKey: number }) {
  const { camera, size } = useThree();
  const controls = useRef<{ update: () => void } | null>(null);
  const sign = orientation === "white" ? 1 : -1;
  const aspect = size.width / Math.max(1, size.height);
  const k = Math.max(1, 1.35 / aspect); // pull back on narrow screens so the board always fits

  useEffect(() => {
    if (window.__board3d) window.__board3d.ready = false;
    camera.position.set(-16 * sign, 15, 20 * sign);
    const tl = gsap.timeline({
      onUpdate: () => controls.current?.update(),
      onComplete: () => {
        if (window.__board3d) window.__board3d.ready = true;
      },
    });
    tl.to(camera.position, { x: 0, y: 9.4 * k, z: 10.4 * k * sign, duration: autoRotate ? 0.01 : 2.6, ease: "power3.inOut" });
    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation, resetKey]);

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={20}
      minPolarAngle={0.15}
      maxPolarAngle={1.38}
      target={[0, 0.2, 0]}
      autoRotate={autoRotate}
      autoRotateSpeed={0.7}
    />
  );
}

/**
 * Exposes square -> screen coordinates (used by the e2e tests to click the canvas for real). Tall pieces in
 * front hide the ones behind them, so this ray-casts candidate points until one really lands on that square.
 */
function TestHook() {
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const hook = {
      ready: false,
      squareToClient: (sq: string) => {
        const [x, z] = squareToXZ(sq);
        const r = gl.domElement.getBoundingClientRect();
        const toClient = (v: THREE.Vector3) => ({ x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height });
        for (const h of [1.3, 1.0, 0.8, 0.6, 0.4, 0.25, 0.1, 0.02])
          for (const [dx, dz] of [[0, 0], [0, -0.3], [0.3, 0], [-0.3, 0], [0, 0.3]]) {
            const ndc = new THREE.Vector3(x + dx, h, z + dz).project(camera);
            ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
            const hit = ray.intersectObjects(scene.children, true).find((i) => i.object.userData.square);
            if (hit?.object.userData.square === sq) return toClient(ndc);
          }
        return toClient(new THREE.Vector3(x, 0.35, z).project(camera));
      },
    };
    window.__board3d = hook;
    return () => {
      delete window.__board3d;
    };
  }, [camera, gl, scene]);
  return null;
}

function Scene({
  fen, orientation, canMove, onMove, lastMove, quality, autoRotate, resetKey, theme, pending, setPending,
}: Required<Pick<Board3DProps, "fen" | "orientation" | "quality" | "autoRotate" | "resetKey" | "theme">> &
  Pick<Board3DProps, "canMove" | "onMove" | "lastMove"> & {
    pending: { from: string; to: string } | null;
    setPending: (p: { from: string; to: string } | null) => void;
  }) {
  const high = quality === "high";
  const look = BOARD_THEMES[theme];
  const fx = look.fx;
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; z: number; color: string }[]>([]);
  const burstId = useRef(0);
  const interactive = canMove !== null && chess.turn() === canMove && !pending;

  // A new position invalidates any selection.
  useEffect(() => setSelected(null), [fen]);

  const targets = useMemo(
    () => (selected && interactive ? chess.moves({ square: selected as Square, verbose: true }) : []),
    [chess, selected, interactive],
  );
  const checkSquare = useMemo(
    () => (chess.inCheck() ? chess.board().flat().find((p) => p?.type === "k" && p.color === chess.turn())?.square ?? null : null),
    [chess],
  );

  const attempt = useCallback(
    (from: string, to: string) => {
      const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
      if (!legal.length) return false;
      setSelected(null);
      if (legal[0].promotion) setPending({ from, to });
      else onMove?.({ from, to });
      return true;
    },
    [chess, onMove, setPending],
  );

  const onSquare = useCallback(
    (sq: string) => {
      if (!interactive) return;
      if (selected && selected !== sq && attempt(selected, sq)) return;
      const piece = chess.get(sq as Square);
      setSelected(piece && piece.color === canMove ? sq : null);
    },
    [interactive, selected, attempt, chess, canMove],
  );

  const onCapture = useCallback((square: string, color: "w" | "b") => {
    const [x, z] = squareToXZ(square);
    const id = ++burstId.current;
    window.setTimeout(() => setBursts((b) => [...b, { id, x, z, color: color === "w" ? fx.white : fx.black }]), 320);
  }, [fx]);

  const landing = lastMove ? squareToXZ(lastMove.to) : null;
  const moverColor = lastMove ? (chess.turn() === "w" ? fx.black : fx.white) : fx.white; // side that just moved

  return (
    <>
      <Arena high={high} look={look.arena} />
      <CameraRig orientation={orientation} autoRotate={autoRotate} resetKey={resetKey} />
      <TestHook />

      <Tiles look={look.tiles} onSquare={onSquare} hover={hover} setHover={setHover} clickable={interactive} />

      {lastMove && (
        <>
          <Plate square={lastMove.from} color={fx.lastMove} opacity={0.35} />
          <Plate square={lastMove.to} color={fx.lastMove} opacity={0.55} />
        </>
      )}
      {hover && interactive && <Plate square={hover} color="#ffffff" opacity={0.18} y={0.014} />}
      {checkSquare && <Plate square={checkSquare} color="#ff2a44" opacity={0.8} pulse />}
      {selected && <Plate square={selected} color={fx.selected} opacity={0.7} y={0.016} pulse />}
      {targets.map((m) => (
        <Marker key={m.to} square={m.to} capture={!!m.captured} color={m.captured ? fx.capture : fx.target} />
      ))}

      <Pieces fen={fen} selected={selected} clickable={interactive} onSquare={onSquare} onCapture={onCapture} look={look.pieces} />

      {landing && <Shockwave key={`${lastMove!.from}${lastMove!.to}${fen}`} x={landing[0]} z={landing[1]} color={moverColor} />}
      {bursts.map((b) => (
        <Burst key={b.id} x={b.x} z={b.z} color={b.color} onDone={() => setBursts((all) => all.filter((x) => x.id !== b.id))} />
      ))}

      {high && (
        <EffectComposer multisampling={0} frameBufferType={THREE.UnsignedByteType}>
          <Bloom intensity={look.arena.bloom}luminanceThreshold={0.28} luminanceSmoothing={0.5} mipmapBlur radius={0.75} />
          <Vignette eskil={false} offset={0.2} darkness={0.85} />
        </EffectComposer>
      )}

    </>
  );
}

const GLYPH = { w: { q: "♕", r: "♖", b: "♗", n: "♘" }, b: { q: "♛", r: "♜", b: "♝", n: "♞" } } as const;

function ChessBoard3DInner(props: Board3DProps) {
  const { autoRotate = false, orientation = "white", resetKey = 0 } = props;
  // If the frame rate collapses (weak GPU / software rendering) drop the heavy effects automatically.
  const [struggling, setStruggling] = useState(false);
  const quality = props.quality === "low" || struggling ? "low" : "high";
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);

  return (
    <div className="relative h-full w-full" data-testid="board3d">
      <Canvas
        shadows={quality === "high"}
        dpr={quality === "high" ? [1, 1.75] : 1}
        camera={{ fov: 38, position: [-16, 15, 20], near: 0.1, far: 140 }}
        gl={{ antialias: quality === "high", powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <PerformanceMonitor onDecline={() => setStruggling(true)} flipflops={2} />
        <Scene
          fen={props.fen}
          orientation={orientation}
          canMove={props.canMove}
          onMove={props.onMove}
          lastMove={props.lastMove}
          quality={quality}
          autoRotate={autoRotate}
          resetKey={resetKey}
          theme={props.theme ?? DEFAULT_BOARD_THEME}
          pending={pending}
          setPending={setPending}
        />
      </Canvas>

      {pending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex gap-3 rounded-2xl border border-amber-400/40 bg-stone-950/90 p-4 shadow-[0_0_40px_rgba(255,154,46,.3)]">
            {(["q", "r", "b", "n"] as const).map((p) => (
              <button
                key={p}
                aria-label={`Promote to ${p}`}
                data-testid={`promote-${p}`}
                className="h-20 w-20 rounded-xl border border-orange-400/30 text-6xl text-amber-100 transition hover:scale-110 hover:bg-amber-400/20"
                onClick={() => {
                  if (pending) props.onMove?.({ ...pending, promotion: p });
                  setPending(null);
                }}
              >
                {GLYPH[props.canMove ?? "w"][p]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ChessBoard3D = memo(ChessBoard3DInner, (a, b) =>
  a.fen === b.fen &&
  a.orientation === b.orientation &&
  a.canMove === b.canMove &&
  a.quality === b.quality &&
  a.autoRotate === b.autoRotate &&
  a.resetKey === b.resetKey &&
  a.theme === b.theme &&
  a.lastMove?.from === b.lastMove?.from &&
  a.lastMove?.to === b.lastMove?.to &&
  a.onMove === b.onMove,
);

export default ChessBoard3D;
