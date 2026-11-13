import type { CSSProperties } from "react";

export type BoardThemeId = "wood";
export const BOARD_THEME_IDS = ["wood"] as const;
export const DEFAULT_BOARD_THEME: BoardThemeId = "wood";

/** Subset of MeshPhysicalMaterial parameters used for the 3D pieces. */
export interface PieceLook {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  envMapIntensity: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transparent?: boolean;
  opacity?: number;
}

export interface TileLook {
  /** wood = grain, marble = veined stone. */
  kind: "wood" | "marble";
  light: { base: string; detail: string };
  dark: { base: string; detail: string };
  metalness: number;
  roughness: number;
}

export interface BoardTheme {
  id: BoardThemeId;
  label: string;
  /** Flat 2D board squares. */
  flat: { light: CSSProperties; dark: CSSProperties; lastMove: string; selected: string };
  tiles: TileLook;
  pieces: { w: PieceLook; b: PieceLook };
  /** Highlight colours on the 3D board. */
  fx: { white: string; black: string; lastMove: string; selected: string; target: string; capture: string };
  arena: {
    background: string;
    fog: string;
    /** Environment + point light colours: White's side, Black's side, centre. */
    lightA: string;
    lightB: string;
    lightCenter: string;
    pointIntensity: number;
    ambient: number;
    slab: { color: string; metalness: number; roughness: number };
    /** Board edge strips: White's side, Black's side, flanks. */
    edges: [string, string, string];
    floor: string;
    rings: string[];
    sparkles: [string, string];
    bloom: number;
  };
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  /** Hand-carved maple and walnut with painted indigo / terracotta motifs. */
  wood: {
    id: "wood",
    label: "Carved Wood",
    flat: {
      light: { backgroundColor: "#ecd9b0", backgroundImage: "linear-gradient(135deg, #f3e3bf 0%, #e3c890 100%)" },
      dark: { backgroundColor: "#a9743f", backgroundImage: "linear-gradient(135deg, #b98248 0%, #8f5e30 100%)" },
      lastMove: "196, 85, 58",
      selected: "39, 73, 109",
    },
    tiles: {
      kind: "wood",
      light: { base: "#e6cc9a", detail: "#b98f55" },
      dark: { base: "#8a5a33", detail: "#4e2f17" },
      metalness: 0.05,
      roughness: 0.55,
    },
    pieces: {
      w: { color: "#f0dcb0", emissive: "#6b4a22", emissiveIntensity: 0.12, metalness: 0.05, roughness: 0.42, envMapIntensity: 0.9, clearcoat: 0.5, clearcoatRoughness: 0.35 },
      b: { color: "#5a3620", emissive: "#2a1508", emissiveIntensity: 0.15, metalness: 0.05, roughness: 0.4, envMapIntensity: 0.9, clearcoat: 0.6, clearcoatRoughness: 0.3 },
    },
    fx: { white: "#e8c98a", black: "#c4553a", lastMove: "#d9a441", selected: "#3f78b5", target: "#27496d", capture: "#c4452f" },
    arena: {
      background: "#150e08",
      fog: "#150e08",
      lightA: "#ffe2b0",
      lightB: "#ffb878",
      lightCenter: "#ffd9a0",
      pointIntensity: 38,
      ambient: 0.55,
      slab: { color: "#3b2414", metalness: 0.1, roughness: 0.55 },
      edges: ["#b8894a", "#b8894a", "#7a5326"],
      floor: "#0f0a06",
      rings: [],
      sparkles: ["#ffdca8", "#e8a86a"],
      bloom: 0.3,
    },
  },
};
