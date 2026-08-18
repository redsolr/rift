import { inRange, posKey, tilesInRange } from "./grid";
import { Archetype, MapDef, Pos, UnitState } from "./types";

/**
 * Attacks — every unit knows four (Pokémon-style placeholder set, FE "combat arts" in
 * spirit). Deterministic, integer, no accuracy yet: an attack changes the POWER
 * (flat bonus/malus on atk), the RANGE (null = the unit's own weapon range) and may
 * carry a CONDITION on movement — `stationary` (may not have moved this turn) or
 * `moved` (must have moved). Each attack has a KIND: damage an enemy or heal an ally — the
 * healer owns three heals and one weak attack; every unit has at least one attack.
 */
export type AttackCondition = "none" | "stationary" | "moved";
/** what the attack does: damage an enemy or heal an ally */
export type AttackKind = "attack" | "heal";
/** flavour/element — display-only today (no resistances yet); the slot for weakness tables later */
/** presentation glyph per element — one table for every panel / picker / badge */
export const ELEMENT_GLYPH: Record<Element, string> = { physical: "⚔", fire: "🔥", ice: "❄", thunder: "⚡", holy: "✚" };
export const ELEMENT_LABEL: Record<Element, string> = { physical: "Physical", fire: "Fire", ice: "Ice", thunder: "Thunder", holy: "Holy" };
export type Element = "physical" | "fire" | "ice" | "thunder" | "holy";
/** delivery: physical strikes are stopped by DEF like today; magic will get its own resist later */
export type School = "physical" | "magic";

export interface AttackDef {
  id: string;
  name: string;
  kind: AttackKind;
  element: Element;
  school: School;
  /** flat modifier on the unit's atk (damage or heal amount) */
  power: number;
  /** [min, max] or null = the unit's own weapon range */
  range: [number, number] | null;
  cond: AttackCondition;
  /** one-line flavour shown in the picker */
  hint: string;
}

const A = (id: string, name: string, power: number, range: [number, number] | null, cond: AttackCondition, hint: string, element: Element = "physical", school: School = "physical"): AttackDef => ({ id, name, kind: "attack", element, school, power, range, cond, hint });
const M = (id: string, name: string, power: number, range: [number, number] | null, cond: AttackCondition, hint: string, element: Element): AttackDef => ({ id, name, kind: "attack", element, school: "magic", power, range, cond, hint });
const H = (id: string, name: string, power: number, range: [number, number] | null, cond: AttackCondition, hint: string): AttackDef => ({ id, name, kind: "heal", element: "holy", school: "magic", power, range, cond, hint });

export const ATTACKS: Record<Archetype, AttackDef[]> = {
  knight: [
    A("thrust", "Thrust", 0, null, "none", "Standard lance strike."),
    A("long_thrust", "Long Thrust", -2, [1, 2], "none", "Reaches two tiles. Lighter blow."),
    A("shield_bash", "Shield Bash", 3, null, "stationary", "Braced strike — only without moving."),
    A("charge", "Blazing Charge", 2, null, "moved", "Momentum strike wreathed in flame — only after moving.", "fire"),
  ],
  fighter: [
    A("slash", "Slash", 0, null, "none", "Standard axe swing."),
    A("wide_swing", "Wide Swing", -2, [1, 2], "none", "Reaches two tiles. Lighter blow."),
    A("cleave", "Cleave", 3, null, "stationary", "Planted heavy swing — only without moving."),
    A("rush", "Thunder Rush", 2, null, "moved", "Running strike that crackles — only after moving.", "thunder"),
  ],
  archer: [
    A("aimed_shot", "Aimed Shot", 0, null, "none", "Standard shot, range 2–3."),
    A("quick_shot", "Quick Shot", -2, [1, 3], "none", "Can fire point-blank. Lighter."),
    A("long_shot", "Long Shot", -3, [3, 4], "none", "Range 3–4. Lighter."),
    A("snipe", "Fire Arrow", 3, null, "stationary", "Braced, burning shot — only without moving.", "fire"),
  ],
  mage: [
    M("fire", "Fire", 0, null, "none", "Standard fire spell, range 1–2.", "fire"),
    M("ember", "Ember", -3, [1, 3], "none", "Reaches three tiles. Weaker.", "fire"),
    M("blaze", "Blaze", 3, null, "stationary", "Channelled inferno — only without moving.", "fire"),
    M("flare", "Frost Bolt", 1, null, "moved", "Ice cast on the move — only after moving.", "ice"),
  ],
  // every unit has at least one attack — the healer's is weak and adjacent-only
  healer: [
    H("heal", "Heal", 0, null, "none", "Standard heal, range 1–2."),
    H("far_heal", "Far Heal", -2, [1, 3], "none", "Reaches three tiles. Smaller."),
    H("mend", "Mend", 3, [1, 1], "stationary", "Adjacent, without moving. Bigger."),
    A("staff_bash", "Staff Bash", -3, [1, 1], "none", "A desperate swing. Weak, adjacent."),
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

/** Every tile any of the unit's damaging attacks could reach from `from` (movement condition ignored — this is the threat primitive). */
export function tilesInAnyRange(map: MapDef, u: UnitState, from: Pos, kind: AttackKind = "attack"): Pos[] {
  const seen = new Set<string>();
  const out: Pos[] = [];
  for (const a of attacksOf(u).filter((x) => x.kind === kind))
    for (const p of tilesInRange(map, from, ...attackRange(u, a))) {
      const k = posKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  return out;
}

/** True if any damaging attack (movement condition ignored) reaches `to` from `from`. */
export function inAnyRange(u: UnitState, from: Pos, to: Pos) {
  return attacksOf(u).some((a) => a.kind === "attack" && inRange(from, to, ...attackRange(u, a)));
}
