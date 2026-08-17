import { MapDef, Pos, TERRAIN, Terrain, UnitState } from "./types";

export const idx = (map: MapDef, x: number, y: number) => y * map.width + x;
export const inBounds = (map: MapDef, x: number, y: number) =>
  x >= 0 && y >= 0 && x < map.width && y < map.height;
export const terrainAt = (map: MapDef, x: number, y: number): Terrain =>
  map.tiles[idx(map, x, y)];
export const dist = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const posKey = (p: Pos) => `${p.x},${p.y}`;
export const parseKey = (k: string): Pos => {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
};

const DIRS: Pos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export interface Reach {
  cost: Map<string, number>;
  parent: Map<string, string | null>;
}

/**
 * Dijkstra over movement cost. Enemy-occupied tiles block; ally-occupied tiles can be
 * passed through but not stopped on (see `standable`). Deterministic: neighbours are
 * expanded in fixed DIRS order and the queue is a stable sort.
 */
export function reachable(map: MapDef, unit: UnitState, units: UnitState[]): Reach {
  const start: Pos = { x: unit.x, y: unit.y };
  const cost = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const occupied = new Map<string, UnitState>();
  for (const u of units) if (u.alive && u.id !== unit.id) occupied.set(posKey(u), u);

  cost.set(posKey(start), 0);
  parent.set(posKey(start), null);
  const open: { p: Pos; c: number }[] = [{ p: start, c: 0 }];
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const { p, c } = open.shift()!;
    if (c > (cost.get(posKey(p)) ?? Infinity)) continue;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (!inBounds(map, n.x, n.y)) continue;
      const mc = TERRAIN[terrainAt(map, n.x, n.y)].moveCost;
      if (mc === null) continue;
      const occ = occupied.get(posKey(n));
      if (occ && occ.team !== unit.team) continue;
      const nc = c + mc;
      if (nc > unit.stats.mov) continue;
      const k = posKey(n);
      if (nc < (cost.get(k) ?? Infinity)) {
        cost.set(k, nc);
        parent.set(k, posKey(p));
        open.push({ p: n, c: nc });
      }
    }
  }
  return { cost, parent };
}

/** Tiles the unit may END its move on: reachable and not occupied by anyone else. */
export function standable(reach: Reach, unit: UnitState, units: UnitState[]): Pos[] {
  const occ = new Set(units.filter((u) => u.alive && u.id !== unit.id).map(posKey));
  const out: Pos[] = [];
  for (const k of reach.cost.keys()) {
    if (occ.has(k)) continue;
    out.push(parseKey(k));
  }
  return out;
}

export function pathTo(reach: Reach, to: Pos): Pos[] {
  const path: Pos[] = [];
  let k: string | null | undefined = posKey(to);
  while (k) {
    path.unshift(parseKey(k));
    k = reach.parent.get(k);
  }
  return path;
}

export function inRange(from: Pos, to: Pos, rangeMin: number, rangeMax: number) {
  const d = dist(from, to);
  return d >= rangeMin && d <= rangeMax;
}

/**
 * Threat map: for each tile, how many enemy units could attack it next turn
 * (move + range). Used by the AI's exposure term. Cheap approximation: manhattan
 * distance <= mov + rangeMax (ignores terrain cost — intentionally, low-int units
 * are supposed to be sloppy and high-int units still get a useful signal).
 */
export function threatCount(pos: Pos, enemies: UnitState[]): number {
  let n = 0;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (dist(pos, e) <= e.stats.mov + e.stats.rangeMax) n++;
  }
  return n;
}
