// Pure simulation types. Nothing in src/sim may import from React, Three, or the store.

import type { Buff, RuneKind } from "./runes";

export type Terrain = "ground" | "forest" | "wall" | "water" | "hill" | "objective" | "shrine";

export interface TerrainDef {
  label: string;
  moveCost: number | null; // null = impassable
  defense: number;
  color: string;
  height: number;
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  ground: { label: "Ground", moveCost: 1, defense: 0, color: "#7a8a5a", height: 0.1 },
  forest: { label: "Forest", moveCost: 2, defense: 2, color: "#3f6b3a", height: 0.25 },
  hill: { label: "Hill", moveCost: 2, defense: 1, color: "#9a8a6a", height: 0.45 },
  water: { label: "Water", moveCost: null, defense: 0, color: "#3d6f9e", height: 0.02 },
  wall: { label: "Wall", moveCost: null, defense: 0, color: "#4a4a52", height: 0.6 },
  objective: { label: "Objective", moveCost: 1, defense: 1, color: "#b59a3c", height: 0.12 },
  shrine: { label: "Rune shrine", moveCost: 1, defense: 0, color: "#6f5f86", height: 0.12 },
};

export const TERRAINS = Object.keys(TERRAIN) as Terrain[];

export type Team = "red" | "blue";
export const TEAMS: Team[] = ["red", "blue"];
export const otherTeam = (t: Team): Team => (t === "red" ? "blue" : "red");

export type Archetype = "knight" | "fighter" | "archer" | "mage" | "healer";
export const ARCHETYPES: Archetype[] = ["knight", "fighter", "archer", "mage", "healer"];

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  mov: number;
  rangeMin: number;
  rangeMax: number;
}

export interface Personality {
  aggression: number; // 0-100
  courage: number;
  discipline: number;
  intelligence: number;
  loyalty: number;
}

export type Stance = "hold" | "advance" | "pursue";
export type TargetPref = "nearest" | "weakest" | "wounded" | "ranged" | "healers";

export interface Orders {
  stance: Stance;
  targetPref: TargetPref;
  protect: string | null; // unit id
  avoidArmored: boolean;
  noPursue: boolean;
  retreatHpPct: number; // 0..100
}

export type DoctrineAggression =
  | "very_defensive"
  | "defensive"
  | "balanced"
  | "aggressive"
  | "all_out";
export type DoctrineObjective = "hold" | "advance" | "capture" | "protect";

export interface Doctrine {
  aggression: DoctrineAggression;
  objective: DoctrineObjective;
}

export interface UnitDef {
  id: string;
  name: string;
  team: Team;
  archetype: Archetype;
  stats: Stats;
  personality: Personality;
  orders: Orders;
  x: number;
  y: number;
  /** items worn (slot → item id, see sim/items.ts) — `stats` already INCLUDES their modifiers; `base` = the ungeared stats */
  equipment?: Partial<Record<string, string>>;
  base?: Stats;
}

export interface UnitState extends UnitDef {
  hp: number; // current
  alive: boolean;
  acted: boolean;
  /** rune buff carried (one at a time), null when none — see sim/runes.ts */
  buff: Buff | null;
}

export interface MapDef {
  width: number;
  height: number;
  tiles: Terrain[]; // row-major, index = y*width + x
}

export interface BattleConfig {
  map: MapDef;
  units: UnitDef[];
  doctrine: Record<Team, Doctrine>;
  maxTurns: number;
  /** which side acts first each turn (default red) */
  firstTeam?: Team;
}

export interface Pos {
  x: number;
  y: number;
}

// ---- Actions ----

/** `attack` = id from `sim/attacks.ts` (one of the unit's four); attacks and heals always name one. */
export type Action =
  | { kind: "attack"; unit: string; moveTo: Pos; target: string; attack: string }
  | { kind: "heal"; unit: string; moveTo: Pos; target: string; attack: string }
  | { kind: "wait"; unit: string; moveTo: Pos };

export interface ScoreTerm {
  label: string;
  value: number;
}

export interface ScoredAction {
  action: Action;
  label: string;
  score: number;
  terms: ScoreTerm[];
}

export interface Forecast {
  attacker: string;
  defender: string;
  from: Pos;
  /** the attack this forecast is for (id + display name); null when nothing usable reaches from `from` */
  attack: { id: string; name: string } | null;
  inRange: boolean;
  damage: number;
  kill: boolean;
  hpAfter: number;
  /** damage the defender would deal back on its own turn if it can reach `from`; null if it cannot */
  retaliation: number | null;
  retaliationKill: boolean;
}

// ---- Events (the only thing the renderer sees) ----

export type BattleEvent =
  | { type: "turn_start"; turn: number; team: Team }
  | { type: "decision"; unit: string; turn: number; candidates: ScoredAction[]; chosen: number }
  | { type: "move"; unit: string; path: Pos[] }
  | {
      type: "attack";
      attacker: string;
      target: string;
      /** display name of the attack used */
      attack: string;
      damage: number;
      targetHp: number;
      killed: boolean;
    }
  | { type: "heal"; healer: string; target: string; attack: string; amount: number; targetHp: number }
  | { type: "wait"; unit: string }
  | { type: "death"; unit: string }
  | { type: "rune_spawn"; rune: RuneKind; at: Pos }
  | { type: "rune_pickup"; unit: string; rune: RuneKind; at: Pos; turns: number }
  | { type: "rune_expire"; unit: string; rune: RuneKind }
  /** the unit may act again this phase (Haste pickup) */
  | { type: "refresh"; unit: string }
  | { type: "end"; winner: Team | "draw"; turn: number };
