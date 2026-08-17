import { inRange, posKey, tilesInRange } from "./grid";
import { Archetype, MapDef, Pos, UnitState } from "./types";

/**
 * Attacks — every unit knows four (Pokémon-style placeholder set, FE "combat arts" in
 * spirit). Deterministic, integer, no accuracy yet: an attack changes the POWER
 * (flat bonus/malus on atk), the RANGE (null = the unit's own weapon range) and may
 * carry a CONDITION on movement — `stationary` (may not have moved this turn) or
 * `moved` (must have moved). Healers' four are heals: power adds to the heal amount.
 */
export type AttackCondition = "none" | "stationary" | "moved";

export interface AttackDef {
  id: string;
  name: string;
  /** flat modifier on the unit's atk (damage or heal amount) */
  power: number;
  /** [min, max] or null = the unit's own weapon range */
  range: [number, number] | null;
  cond: AttackCondition;
  /** one-line flavour shown in the picker */
  hint: string;
}

const A = (id: string, name: string, power: number, range: [number, number] | null, cond: AttackCondition, hint: string): AttackDef => ({ id, name, power, range, cond, hint });

export const ATTACKS: Record<Archetype, AttackDef[]> = {
  knight: [
    A("thrust", "Thrust", 0, null, "none", "Standard lance strike."),
    A("long_thrust", "Long Thrust", -2, [1, 2], "none", "Reaches two tiles. Lighter blow."),
    A("shield_bash", "Shield Bash", 3, null, "stationary", "Braced strike — only without moving."),
    A("charge", "Charge", 2, null, "moved", "Momentum strike — only after moving."),
  ],
  fighter: [
    A("slash", "Slash", 0, null, "none", "Standard axe swing."),
    A("wide_swing", "Wide Swing", -2, [1, 2], "none", "Reaches two tiles. Lighter blow."),
    A("cleave", "Cleave", 3, null, "stationary", "Planted heavy swing — only without moving."),
    A("rush", "Rush", 2, null, "moved", "Running strike — only after moving."),
  ],
  archer: [
    A("aimed_shot", "Aimed Shot", 0, null, "none", "Standard shot, range 2–3."),
    A("quick_shot", "Quick Shot", -2, [1, 3], "none", "Can fire point-blank. Lighter."),
    A("long_shot", "Long Shot", -3, [3, 4], "none", "Range 3–4. Lighter."),
    A("snipe", "Snipe", 3, null, "stationary", "Braced shot — only without moving."),
  ],
  mage: [
    A("fire", "Fire", 0, null, "none", "Standard spell, range 1–2."),
    A("ember", "Ember", -3, [1, 3], "none", "Reaches three tiles. Weaker."),
    A("blaze", "Blaze", 3, null, "stationary", "Channelled — only without moving."),
    A("flare", "Flare", 1, null, "moved", "Cast on the move — only after moving."),
  ],
  healer: [
    A("heal", "Heal", 0, null, "none", "Standard heal, range 1–2."),
    A("far_heal", "Far Heal", -2, [1, 3], "none", "Reaches three tiles. Smaller."),
    A("mend", "Mend", 3, [1, 1], "stationary", "Adjacent, without moving. Bigger."),
    A("quick_heal", "Quick Heal", 1, null, "moved", "Heal on the move — only after moving."),
  ],
};

export function attacksOf(u: Pick<UnitState, "archetype">): AttackDef[] {
  return ATTACKS[u.archetype];
}

export function attackById(u: Pick<UnitState, "archetype">, id: string): AttackDef {
  const a = ATTACKS[u.archetype].find((x) => x.id === id);
  if (!a) throw new Error(`${u.archetype} has no attack ${id}`);
  return a;
}

export function attackRange(u: Pick<UnitState, "stats">, a: AttackDef): [number, number] {
  return a.range ?? [u.stats.rangeMin, u.stats.rangeMax];
}

/** Movement condition satisfied? `moved` = the unit ends its move on a different tile than it started. */
export function attackUsable(a: AttackDef, moved: boolean) {
  return a.cond === "none" || (a.cond === "stationary" ? !moved : moved);
}

/** Attacks the unit could use from `from` (given whether it moved) that reach `target`. */
export function attacksReaching(u: UnitState, from: Pos, moved: boolean, target: Pos): AttackDef[] {
  return attacksOf(u).filter((a) => {
    if (!attackUsable(a, moved)) return false;
    const [lo, hi] = attackRange(u, a);
    return inRange(from, target, lo, hi);
  });
}

/** Every tile any of the unit's attacks could reach from `from` (movement condition ignored — this is the threat primitive). */
export function tilesInAnyRange(map: MapDef, u: UnitState, from: Pos): Pos[] {
  const seen = new Set<string>();
  const out: Pos[] = [];
  for (const a of attacksOf(u))
    for (const p of tilesInRange(map, from, ...attackRange(u, a))) {
      const k = posKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  return out;
}

/** True if any attack (movement condition ignored) reaches `to` from `from`. */
export function inAnyRange(u: UnitState, from: Pos, to: Pos) {
  return attacksOf(u).some((a) => inRange(from, to, ...attackRange(u, a)));
}
