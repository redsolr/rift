/**
 * Arena lineups — the ONE shape a player submits to the ladder, and the ONE builder that turns two lineups into the
 * battle both clients replay. Pure: no React, no store, no DB. Server and client import the same file, so a stored
 * match (lineupA, lineupB, seed, simVersion) rebuilds byte-identical configs on both sides.
 *
 * Rules of the arena:
 *  - gear-off: every unit fights at its archetype's base stats (Tower loot stays a Story reward);
 *  - the neutral ground: always the default 16×12 battlefield;
 *  - a lineup = 1..MAX_UNITS units placed inside the near-side deploy zone (the 4 rows nearest the player) with their
 *    orders + AI personality, plus the team doctrine;
 *  - a match is a MIRROR: leg 1 = A on the near side (blue, moves first) vs B mirrored onto the far side (red);
 *    leg 2 = the same with the roles swapped, same seed. Each player is first mover exactly once, so the known
 *    first-mover imbalance cancels out.
 */
import { DEPLOY_ROWS, passable } from "@/sim/grid";
import { ARCHETYPE_PERSONALITY, ARCHETYPE_STATS, DEFAULT_DOCTRINE, DEFAULT_ORDERS, defaultMap } from "@/sim/presets";
import { ARCHETYPES, Archetype, BattleConfig, Doctrine, DoctrineAggression, DoctrineObjective, MapDef, Orders, Personality, Stance, TargetPref, Team, UnitDef } from "@/sim/types";

export const MAX_UNITS = 6;
export const MAX_TURNS = 30;
export const MAX_NAME = 16;

export interface LineupUnit {
  archetype: Archetype;
  name: string;
  /** position on the NEAR side (rows height-4 .. height-1 of the default map) */
  x: number;
  y: number;
  orders: Orders;
  personality: Personality;
}

export interface Lineup {
  units: LineupUnit[];
  doctrine: Doctrine;
}

export type Leg = 1 | 2;

const STANCES: Stance[] = ["hold", "advance", "pursue"];
const TARGET_PREFS: TargetPref[] = ["nearest", "weakest", "wounded", "ranged", "healers"];
const AGGRESSIONS: DoctrineAggression[] = ["very_defensive", "defensive", "balanced", "aggressive", "all_out"];
const OBJECTIVES: DoctrineObjective[] = ["hold", "advance", "capture", "protect"];

/** The neutral ground every arena match is fought on. */
export const arenaMap = (): MapDef => defaultMap();

/** Every tile a lineup may stand on: the DEPLOY_ROWS near-side rows, passable only. */
export function arenaDeployTiles(map: MapDef = arenaMap()): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = map.height - DEPLOY_ROWS; y < map.height; y++) for (let x = 0; x < map.width; x++) if (passable(map, { x, y })) out.push({ x, y });
  return out;
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(lo, Math.min(hi, v));
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v as string) ? (v as T) : fallback;

/** A human-readable reason the lineup is not legal, or null. */
export function lineupError(l: Lineup, map: MapDef = arenaMap()): string | null {
  if (!l || !Array.isArray(l.units)) return "No lineup";
  if (l.units.length < 1) return "A lineup needs at least one unit";
  if (l.units.length > MAX_UNITS) return `At most ${MAX_UNITS} units`;
  const zone = new Set(arenaDeployTiles(map).map((p) => `${p.x},${p.y}`));
  const seen = new Set<string>();
  for (const u of l.units) {
    if (!ARCHETYPES.includes(u.archetype)) return `Unknown class ${String(u.archetype)}`;
    const k = `${u.x},${u.y}`;
    if (!zone.has(k)) return `${u.name || u.archetype} stands outside the deploy zone`;
    if (seen.has(k)) return `Two units share tile ${k}`;
    seen.add(k);
  }
  return null;
}

/**
 * Coerce untrusted input (a request body, an old localStorage blob) into a well-formed lineup: unknown enum values
 * fall back to defaults, numbers are clamped, names trimmed, `protect` re-pointed by unit index. Does NOT check
 * placement — call `lineupError` after.
 */
export function normalizeLineup(raw: unknown): Lineup {
  const r = (raw ?? {}) as { units?: unknown; doctrine?: Partial<Doctrine> };
  const unitsIn = Array.isArray(r.units) ? (r.units as Partial<LineupUnit>[]).slice(0, MAX_UNITS) : [];
  const ids = unitsIn.map((_, i) => `u${i}`);
  const units: LineupUnit[] = unitsIn.map((u, i) => {
    const archetype = oneOf(u.archetype, ARCHETYPES, "fighter");
    const o = (u.orders ?? {}) as Partial<Orders>;
    const p = (u.personality ?? {}) as Partial<Personality>;
    const dp = ARCHETYPE_PERSONALITY[archetype];
    return {
      archetype,
      name: String(u.name ?? "").trim().slice(0, MAX_NAME) || archetype[0].toUpperCase() + archetype.slice(1),
      x: clamp(u.x, 0, 99, 0),
      y: clamp(u.y, 0, 99, 0),
      orders: {
        stance: oneOf(o.stance, STANCES, DEFAULT_ORDERS.stance),
        targetPref: oneOf(o.targetPref, TARGET_PREFS, DEFAULT_ORDERS.targetPref),
        // protect names a unit by lineup id (u<i>); anything else is dropped
        protect: typeof o.protect === "string" && ids.includes(o.protect) && o.protect !== ids[i] ? o.protect : null,
        avoidArmored: !!o.avoidArmored,
        noPursue: !!o.noPursue,
        retreatHpPct: clamp(o.retreatHpPct, 0, 100, DEFAULT_ORDERS.retreatHpPct),
      },
      personality: {
        aggression: clamp(p.aggression, 0, 100, dp.aggression),
        courage: clamp(p.courage, 0, 100, dp.courage),
        discipline: clamp(p.discipline, 0, 100, dp.discipline),
        intelligence: clamp(p.intelligence, 0, 100, dp.intelligence),
        loyalty: clamp(p.loyalty, 0, 100, dp.loyalty),
      },
    };
  });
  const d = r.doctrine ?? {};
  return {
    units,
    doctrine: { aggression: oneOf(d.aggression, AGGRESSIONS, DEFAULT_DOCTRINE.aggression), objective: oneOf(d.objective, OBJECTIVES, DEFAULT_DOCTRINE.objective) },
  };
}

/** Unit ids inside a leg config: `<team>u<i>` — protect orders are re-pointed to the same scheme. */
const legId = (team: Team, i: number) => `${team}u${i}`;

function placeLineup(l: Lineup, team: Team, mirror: boolean, map: MapDef): UnitDef[] {
  return l.units.map((u, i) => ({
    id: legId(team, i),
    name: u.name,
    team,
    archetype: u.archetype,
    stats: { ...ARCHETYPE_STATS[u.archetype] },
    personality: { ...u.personality },
    orders: { ...u.orders, protect: u.orders.protect ? legId(team, Number(u.orders.protect.slice(1))) : null },
    x: mirror ? map.width - 1 - u.x : u.x,
    y: mirror ? map.height - 1 - u.y : u.y,
  }));
}

/**
 * The battle for one leg. `near` fights as blue on the near side and moves first; `far` is point-mirrored onto the
 * far side as red. Leg 1 = (A near, B far); leg 2 = (B near, A far).
 */
export function buildLegConfig(a: Lineup, b: Lineup, leg: Leg): BattleConfig {
  const map = arenaMap();
  const near = leg === 1 ? a : b;
  const far = leg === 1 ? b : a;
  return {
    map,
    units: [...placeLineup(near, "blue", false, map), ...placeLineup(far, "red", true, map)],
    doctrine: { blue: { ...near.doctrine }, red: { ...far.doctrine } },
    maxTurns: MAX_TURNS,
    firstTeam: "blue",
  };
}

/** Which team the given side ("a" | "b") plays in a leg. */
export const teamOf = (side: "a" | "b", leg: Leg): Team => ((side === "a") === (leg === 1) ? "blue" : "red");

/**
 * Lift a lineup out of a skirmish setup: the player's team, base stats dropped (gear-off), ids re-based to `u<i>`,
 * positions kept as they are on the near side. Units outside the arena zone stay where they are so `lineupError`
 * can name them.
 */
export function lineupFromConfig(config: BattleConfig, team: Team): Lineup {
  const mine = config.units.filter((u) => u.team === team);
  const ids = mine.map((_, i) => `u${i}`);
  return normalizeLineup({
    units: mine.map((u) => ({
      archetype: u.archetype,
      name: u.name,
      x: u.x,
      y: u.y,
      orders: { ...u.orders, protect: u.orders.protect ? (ids[mine.findIndex((m) => m.id === u.orders.protect)] ?? null) : null },
      personality: u.personality,
    })),
    doctrine: config.doctrine[team],
  });
}
