export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Request failed");
  return res.json();
}

export interface GameSummary {
  id: string;
  category: string;
  baseSeconds: number;
  incrementSeconds: number;
  rated: boolean;
  result: string;
  reason: string;
  createdAt: string;
  whiteRatingAfter: number;
  blackRatingAfter: number;
  white: { id: string; name: string };
  black: { id: string; name: string };
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  ratingBullet: number;
  ratingBlitz: number;
  ratingRapid: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface LeaderboardRow {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export const PRESETS = [
  { id: "1+0", label: "1 min", kind: "Bullet" },
  { id: "2+1", label: "2 | 1", kind: "Bullet" },
  { id: "3+0", label: "3 min", kind: "Blitz" },
  { id: "3+2", label: "3 | 2", kind: "Blitz" },
  { id: "5+0", label: "5 min", kind: "Blitz" },
  { id: "10+0", label: "10 min", kind: "Rapid" },
  { id: "15+10", label: "15 | 10", kind: "Rapid" },
] as const;
