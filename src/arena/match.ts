/**
 * Arena match resolution — pure. Runs both mirror legs headlessly with the sim, scores them, and applies Elo.
 * The server calls this once per matchmaking request; the client re-derives the same legs for the replay from the
 * stored (lineupA, lineupB, seed) and never trusts anything else.
 */
import { Battle } from "@/sim/battle";
import { Team } from "@/sim/types";
import { Leg, Lineup, buildLegConfig, teamOf } from "./lineup";

export type Side = "a" | "b";
export type MatchWinner = Side | "draw";

export interface LegResult {
  leg: Leg;
  /** engine winner of the leg (team) — null never happens; a draw is "draw" */
  winner: Team | "draw";
  /** which side that was */
  side: MatchWinner;
  turns: number;
  /** remaining HP as a % of starting HP, per side — the tie-break */
  hpPct: Record<Side, number>;
}

export interface MatchOutcome {
  legs: [LegResult, LegResult];
  winner: MatchWinner;
  /** leg wins per side */
  score: Record<Side, number>;
}

function hpPct(b: Battle, team: Team): number {
  let cur = 0,
    max = 0;
  for (const u of b.state.units) {
    if (u.team !== team) continue;
    max += u.stats.hp;
    if (u.alive) cur += u.hp;
  }
  return max ? Math.round((cur * 100) / max) : 0;
}

export function runLeg(a: Lineup, b: Lineup, leg: Leg, seed: number): LegResult {
  const battle = new Battle(buildLegConfig(a, b, leg), seed);
  battle.runToEnd();
  const winner = battle.state.winner ?? "draw";
  const side: MatchWinner = winner === "draw" ? "draw" : winner === teamOf("a", leg) ? "a" : "b";
  return {
    leg,
    winner,
    side,
    turns: battle.state.turn,
    hpPct: { a: hpPct(battle, teamOf("a", leg)), b: hpPct(battle, teamOf("b", leg)) },
  };
}

/** Both legs, then: more leg wins → winner; 1–1 or 0–0 → more total remaining HP%; still level → draw. */
export function resolveMatch(a: Lineup, b: Lineup, seed: number): MatchOutcome {
  const legs: [LegResult, LegResult] = [runLeg(a, b, 1, seed), runLeg(a, b, 2, seed)];
  const score: Record<Side, number> = { a: 0, b: 0 };
  for (const l of legs) if (l.side !== "draw") score[l.side]++;
  let winner: MatchWinner = "draw";
  if (score.a !== score.b) winner = score.a > score.b ? "a" : "b";
  else {
    const hpA = legs[0].hpPct.a + legs[1].hpPct.a;
    const hpB = legs[0].hpPct.b + legs[1].hpPct.b;
    if (hpA !== hpB) winner = hpA > hpB ? "a" : "b";
  }
  return { legs, winner, score };
}

// ---- Elo ----

export const ELO_START = 1000;
export const ELO_K = 32;

/** New ratings after a match; `winner` from A's point of view. Integer results (rounded), symmetric. */
export function elo(ratingA: number, ratingB: number, winner: MatchWinner): { a: number; b: number; delta: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const scoreA = winner === "a" ? 1 : winner === "b" ? 0 : 0.5;
  const delta = Math.round(ELO_K * (scoreA - expectedA));
  return { a: ratingA + delta, b: ratingB - delta, delta };
}
