import { defaultConfig, makeUnit } from "./presets";
import { Archetype, BattleConfig, UnitDef } from "./types";

/**
 * The Tower (Diablo-IV-Pit shape): numbered FLOORS of the same battle, harder as you climb. Pure config builder — the
 * store starts a normal battle from it. Two dials, both stepping every `PIT_STEP` floors (a "bracket"):
 *  - roster: which enemy archetypes may appear (fighters + knights first; archers, mages, healers unlock per bracket)
 *    and how many (4 → 6);
 *  - stats: hp / atk / def / spd of every enemy climb per bracket. Inside a bracket the fight is identical, so a
 *    player who clears floor 6 knows exactly what floor 10 is — the jump comes at 11.
 * Your own squad and the map are the default skirmish setup; the enemy stands on the far bank as usual.
 */
export const PIT_STEP = 5;
export const PIT_MAX = 100;

export const pitBracket = (floor: number): number => Math.max(0, Math.floor((Math.max(1, floor) - 1) / PIT_STEP));

const UNLOCK: Archetype[][] = [
  ["fighter", "knight"], // bracket 0 · floors 1–5
  ["archer"], // 6–10
  ["mage"], // 11–15
  ["healer"], // 16+
];

/** enemy archetypes allowed on this floor (cumulative per bracket) */
export function pitArchetypes(floor: number): Archetype[] {
  const b = pitBracket(floor);
  return UNLOCK.slice(0, b + 1).flat();
}

/** enemy head-count on this floor */
export const pitRosterSize = (floor: number): number => Math.min(6, 4 + pitBracket(floor));

/** stat multipliers / bonuses on this floor */
export function pitScaling(floor: number): { hp: number; atk: number; def: number; spd: number } {
  const b = pitBracket(floor);
  return { hp: 1 + 0.14 * b, atk: b, def: Math.floor(b / 2), spd: Math.floor(b / 3) };
}

/** far-bank slots for the enemy, in fill order */
const RED_SLOTS: [number, number][] = [
  [8, 1],
  [7, 1],
  [9, 0],
  [6, 0],
  [7, 0],
  [8, 0],
];

const NUMERAL = ["", " II", " III", " IV"];

/** the whole battle config for a floor: default map + your default squad, a ramped enemy roster */
export function pitConfig(floor: number): BattleConfig {
  const base = defaultConfig();
  const allowed = pitArchetypes(floor);
  const size = pitRosterSize(floor);
  const sc = pitScaling(floor);
  const seen: Partial<Record<Archetype, number>> = {};
  const red: UnitDef[] = [];
  for (let i = 0; i < size; i++) {
    // deterministic pick: walk the allowed list, latest unlocks first so a new bracket is visibly different
    const arch = allowed[(allowed.length - 1 - i + allowed.length * 4) % allowed.length];
    const n = seen[arch] ?? 0;
    seen[arch] = n + 1;
    const [x, y] = RED_SLOTS[i];
    const u = makeUnit("red", arch, x, y);
    u.name = `${u.name}${NUMERAL[n] ?? ` ${n + 1}`}`;
    u.stats = { ...u.stats, hp: Math.round(u.stats.hp * sc.hp), atk: u.stats.atk + sc.atk, def: u.stats.def + sc.def, spd: u.stats.spd + sc.spd };
    red.push(u);
  }
  return { ...base, units: [...base.units.filter((u) => u.team === "blue"), ...red] };
}
