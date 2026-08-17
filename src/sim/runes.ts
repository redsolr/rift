import { Rng } from "./rng";
import { UnitState } from "./types";

/**
 * Dota-style runes. A `shrine` tile spawns a rune at battle start and again RESPAWN_TURNS after it is taken;
 * a unit that ends its move on (or acts from) a shrine holding a rune picks it up and carries ONE buff at a time
 * (a new rune replaces the old one). Buffs count down at the start of the owner's phase.
 * Pure data + helpers — the engine (`battle.ts`) owns spawn/pickup/expiry, the AI reads `effectiveMov`/`damageMult`.
 */
export type RuneKind = "haste" | "double_damage" | "invisibility";
export const RUNE_KINDS: RuneKind[] = ["haste", "double_damage", "invisibility"];

export interface RuneDef {
  label: string;
  /** phases of the owner during which the buff is active (picked up on turn T → active T..T+turns-1) */
  turns: number;
  glyph: string;
  color: string;
  blurb: string;
}

export const RUNES: Record<RuneKind, RuneDef> = {
  haste: { label: "Haste", turns: 3, glyph: "⚡", color: "#ffe14a", blurb: "+2 MOV" },
  double_damage: { label: "Double Damage", turns: 2, glyph: "✶", color: "#ff6a2a", blurb: "attacks deal 2×" },
  invisibility: { label: "Invisibility", turns: 2, glyph: "◌", color: "#b56cff", blurb: "cannot be targeted — breaks when you attack" },
};

/** Turns after a pickup before the same shrine spawns again. */
export const RESPAWN_TURNS = 3;
export const HASTE_MOV = 2;
export const DOUBLE_DAMAGE_MULT = 2;

export interface Buff {
  kind: RuneKind;
  /** owner phases left including the current one */
  turns: number;
}

export function pickRune(rng: Rng): RuneKind {
  return RUNE_KINDS[rng.int(RUNE_KINDS.length)];
}

export const hasBuff = (u: Pick<UnitState, "buff">, kind: RuneKind) => !!u.buff && u.buff.kind === kind;
export const isInvisible = (u: Pick<UnitState, "buff">) => hasBuff(u, "invisibility");
/** Movement points this activation: base MOV, +HASTE_MOV under Haste. The ONE definition — grid + AI use it. */
export const effectiveMov = (u: Pick<UnitState, "stats" | "buff">) => u.stats.mov + (hasBuff(u, "haste") ? HASTE_MOV : 0);
export const damageMult = (u: Pick<UnitState, "buff">) => (hasBuff(u, "double_damage") ? DOUBLE_DAMAGE_MULT : 1);
