import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

/*
 * Procedural chess pieces (no external model files): lathe-turned bodies, a few primitives for crowns and
 * crenellations, and an extruded profile for the knight. Each piece is merged into ONE geometry so 32 pieces
 * stay cheap. Units: a square is 1.0 wide; pieces are ~0.8 wide at the base.
 */

const lathe = (pts: [number, number][]) =>
  new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 56);

const sphere = (r: number, y: number, sy = 1) => {
  const g = new THREE.SphereGeometry(r, 36, 24);
  g.scale(1, sy, 1);
  g.translate(0, y, 0);
  return g;
};

const torus = (R: number, r: number, y: number) => {
  const g = new THREE.TorusGeometry(R, r, 14, 48);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

const merge = (parts: THREE.BufferGeometry[]) => {
  // mergeGeometries needs all-indexed or all-non-indexed.
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false)!;
  merged.computeBoundingSphere();
  return merged;
};

const foot = () =>
  lathe([[0, 0], [0.4, 0], [0.42, 0.035], [0.4, 0.08], [0.32, 0.11], [0.3, 0.14], [0, 0.14]]);

const ring = (count: number, radius: number, make: (angle: number) => THREE.BufferGeometry) =>
  Array.from({ length: count }, (_, i) => make((i / count) * Math.PI * 2 + radius * 0));

function build(type: PieceType): THREE.BufferGeometry {
  switch (type) {
    case "p":
      return merge([
        foot(),
        lathe([[0, 0.14], [0.27, 0.14], [0.2, 0.22], [0.13, 0.32], [0.11, 0.44], [0.17, 0.48], [0.17, 0.52], [0, 0.52]]),
        torus(0.16, 0.035, 0.47),
        sphere(0.19, 0.66),
      ]);
    case "r":
      return merge([
        foot(),
        lathe([[0, 0.14], [0.3, 0.14], [0.24, 0.24], [0.2, 0.4], [0.2, 0.66], [0.31, 0.74], [0.31, 0.88], [0, 0.88]]),
        ...ring(6, 0.26, (a) => {
          const g = box(0.13, 0.17, 0.11, 0.26, 0.96, 0);
          g.rotateY(a);
          return g;
        }),
        torus(0.21, 0.03, 0.62),
      ]);
    case "b":
      return merge([
        foot(),
        lathe([[0, 0.14], [0.29, 0.14], [0.2, 0.24], [0.12, 0.38], [0.11, 0.6], [0.2, 0.68], [0.15, 0.76], [0, 0.76]]),
        torus(0.16, 0.035, 0.68),
        sphere(0.2, 0.98, 1.55),
        sphere(0.065, 1.33),
      ]);
    case "n": {
      // Side profile of a horse head, facing +x, extruded along z.
      const s = new THREE.Shape();
      s.moveTo(-0.24, 0.14);
      s.bezierCurveTo(-0.3, 0.4, -0.24, 0.72, -0.1, 0.98);
      s.lineTo(-0.06, 1.12);
      s.lineTo(0.03, 1.04);
      s.lineTo(0.07, 1.14);
      s.lineTo(0.13, 1.02);
      s.bezierCurveTo(0.23, 1.0, 0.33, 0.88, 0.41, 0.7);
      s.lineTo(0.43, 0.62);
      s.bezierCurveTo(0.37, 0.55, 0.29, 0.58, 0.22, 0.62);
      s.bezierCurveTo(0.12, 0.62, 0.16, 0.5, 0.28, 0.38);
      s.bezierCurveTo(0.34, 0.28, 0.32, 0.2, 0.3, 0.14);
      s.lineTo(-0.24, 0.14);
      const head = new THREE.ExtrudeGeometry(s, {
        depth: 0.24, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 4, curveSegments: 18,
      });
      head.translate(0, 0, -0.12);
      return merge([foot(), head]);
    }
    case "q":
      return merge([
        foot(),
        lathe([[0, 0.14], [0.31, 0.14], [0.23, 0.24], [0.14, 0.52], [0.12, 0.86], [0.23, 1.02], [0.3, 1.14], [0, 1.14]]),
        torus(0.17, 0.04, 0.9),
        ...ring(8, 0.25, (a) => {
          const g = new THREE.ConeGeometry(0.055, 0.26, 12);
          g.translate(0.25, 1.28, 0);
          g.rotateY(a);
          return g;
        }),
        torus(0.28, 0.03, 1.15),
        sphere(0.1, 1.46),
      ]);
    case "k":
      return merge([
        foot(),
        lathe([[0, 0.14], [0.31, 0.14], [0.23, 0.24], [0.14, 0.52], [0.12, 0.9], [0.23, 1.06], [0.29, 1.18], [0, 1.18]]),
        torus(0.17, 0.04, 0.94),
        torus(0.27, 0.035, 1.19),
        box(0.1, 0.36, 0.1, 0, 1.46, 0),
        box(0.28, 0.1, 0.1, 0, 1.5, 0),
      ]);
  }
}

const cache = new Map<PieceType, THREE.BufferGeometry>();
export function pieceGeometry(type: PieceType): THREE.BufferGeometry {
  let g = cache.get(type);
  if (!g) {
    g = build(type);
    cache.set(type, g);
  }
  return g;
}
