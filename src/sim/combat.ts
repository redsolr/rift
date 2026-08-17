import { MapDef, Pos, TERRAIN, UnitState } from "./types";
import { terrainAt } from "./grid";

export function defenseAt(map: MapDef, u: UnitState, at?: Pos) {
  const p = at ?? u;
  return u.stats.def + TERRAIN[terrainAt(map, p.x, p.y)].defense;
}

/** damage = max(1, atk - (def + terrain)) — the doc's v1 formula, kept readable. */
export function damage(map: MapDef, attacker: UnitState, target: UnitState) {
  return Math.max(1, attacker.stats.atk - defenseAt(map, target));
}

export function healAmount(healer: UnitState) {
  return healer.stats.atk;
}
