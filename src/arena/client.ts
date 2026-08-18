/** Client-side wire shapes + fetch helpers for the arena API. Mirrors `server.ts`'s views (kept in sync by tsc). */
import type { LegResult, MatchWinner, Side } from "./match";
import type { Lineup } from "./lineup";

export interface PlayerView {
  id: string;
  handle: string;
  bot: boolean;
  mmr: number;
  wins: number;
  losses: number;
  draws: number;
  hasLineup: boolean;
}
export interface MatchSummary {
  id: string;
  createdAt: string;
  simVersion: string;
  seed: number;
  mySide: Side | null;
  a: PlayerView & { mmrBefore: number; mmrAfter: number };
  b: PlayerView & { mmrBefore: number; mmrAfter: number };
  legs: LegResult[];
  winner: MatchWinner;
}
export type MatchDetail = MatchSummary & { lineupA: Lineup; lineupB: Lineup };

export interface MeResponse {
  me: PlayerView;
  recent: MatchSummary[];
  leaderboard: PlayerView[];
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export const arenaApi = {
  me: () => fetch("/api/arena/me", { cache: "no-store" }).then((r) => json<MeResponse>(r)),
  rename: (handle: string) => fetch("/api/arena/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) }).then((r) => json<{ me: PlayerView }>(r)),
  findMatch: (lineup: Lineup) => fetch("/api/arena/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lineup }) }).then((r) => json<{ match: MatchSummary; me: PlayerView }>(r)),
  match: (id: string) => fetch(`/api/arena/match/${id}`, { cache: "no-store" }).then((r) => json<{ match: MatchDetail }>(r)),
};

/** "win" | "loss" | "draw" from the viewer's side, or null when they were not in it. */
export const verdictFor = (m: MatchSummary, side: Side | null = m.mySide): "win" | "loss" | "draw" | null => (side ? (m.winner === "draw" ? "draw" : m.winner === side ? "win" : "loss") : null);
export const opponentOf = (m: MatchSummary, side: Side | null = m.mySide) => (side === "a" ? m.b : m.a);
export const deltaFor = (m: MatchSummary, side: Side | null = m.mySide) => (side === "a" ? m.a.mmrAfter - m.a.mmrBefore : side === "b" ? m.b.mmrAfter - m.b.mmrBefore : 0);
