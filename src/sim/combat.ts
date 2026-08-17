import { MapDef, Pos, TERRAIN, UnitState } from "./types";
import { terrainAt } from "./grid";
import { AttackDef } from "./attacks";
import { damageMult } from "./runes";

export function defenseAt(map: MapDef, u: UnitState, at?: Pos) {
  const p = at ?? u;
  return u.stats.def + TERRAIN[terrainAt(map, p.x, p.y)].defense;
}

/** damage = max(1, (atk + attack power) × rune mult − (def + terrain)) — the doc's v1 formula plus the attack's flat power; Double Damage doubles the offence before defence. */
export function damage(map: MapDef, attacker: UnitState, target: UnitState, attack?: Pick<AttackDef, "power">) {
  return Math.max(1, (attacker.stats.atk + (attack?.power ?? 0)) * damageMult(attacker) - defenseAt(map, target));
}

export function healAmount(healer: UnitState, attack?: Pick<AttackDef, "power">) {
  return Math.max(1, healer.stats.atk + (attack?.power ?? 0));
}
