export type Category = "bullet" | "blitz" | "rapid";

export interface TimeControl {
  base: number; // seconds
  inc: number; // seconds
}

// "minutes+increment seconds"
export const PRESETS = ["1+0", "2+1", "3+0", "3+2", "5+0", "10+0", "15+10"] as const;

export function parsePreset(preset: string): TimeControl | null {
  if (!(PRESETS as readonly string[]).includes(preset)) return null;
  const [minutes, inc] = preset.split("+").map(Number);
  return { base: minutes * 60, inc };
}

// Same estimate Lichess uses: base + 40 * increment.
export function categoryOf(tc: TimeControl): Category {
  const total = tc.base + 40 * tc.inc;
  if (total < 180) return "bullet";
  if (total < 480) return "blitz";
  return "rapid";
}
