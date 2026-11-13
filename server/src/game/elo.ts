export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** score: 1 win, 0.5 draw, 0 loss from white's point of view. */
export function newRatings(white: number, black: number, score: number, k = 24) {
  const ew = expectedScore(white, black);
  const w = Math.round(white + k * (score - ew));
  const b = Math.round(black + k * (1 - score - (1 - ew)));
  return { white: w, black: b };
}
