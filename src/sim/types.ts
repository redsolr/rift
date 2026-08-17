// Pure simulation types. Nothing in src/sim may import from React, Three, or the store.

export type Terrain = "ground" | "forest" | "wall" | "water" | "hill" | "objective";

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
  wall: { label: "Wall", moveCost: null, defense: 0, color: "#4a4a52", height: 0.9 },
  objective: { label: "Objective", moveCost: 1, defense: 1, color: "#b59a3c", height: 0.12 },
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
}

export interface UnitState extends UnitDef {
  hp: number; // current
  alive: boolean;
  acted: boolean;
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
}

export interface Pos {
  x: number;
  y: number;
}

// ---- Actions ----

export type Action =
  | { kind: "attack"; unit: string; moveTo: Pos; target: string }
  | { kind: "heal"; unit: string; moveTo: Pos; target: string }
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

// ---- Events (the only thing the renderer sees) ----

export type BattleEvent =
  | { type: "turn_start"; turn: number; team: Team }
  | { type: "decision"; unit: string; turn: number; candidates: ScoredAction[]; chosen: number }
  | { type: "move"; unit: string; path: Pos[] }
  | {
      type: "attack";
      attacker: string;
      target: string;
      damage: number;
      targetHp: number;
      killed: boolean;
    }
  | { type: "heal"; healer: string; target: string; amount: number; targetHp: number }
  | { type: "wait"; unit: string }
  | { type: "death"; unit: string }
  | { type: "end"; winner: Team | "draw"; turn: number };
