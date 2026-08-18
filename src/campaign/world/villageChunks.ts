import { Rng } from "@/sim/rng";
import type { AABB } from "./types";

/**
 * The village as DATA: a 7×7 grid of 8-unit chunks (56×56 world units), each generated deterministically from its
 * (cx, cz) seed — cottages, trees, lantern posts, the well plaza in the centre chunk, the monastery kitchen's facade
 * on the south edge (door gap x ∈ [-1.1, 1.1]). Two cobbled lanes cross at the well (x ≈ 0 and z ≈ 0). Chunk data is memoised: the collision
 * routine and the renderer read the same objects, and only the 5×5 ring around the player is ever MOUNTED as meshes.
 */
export const CHUNK = 8;
export const COLS = 7;
export const ROWS = 7;
export const HALF = (COLS * CHUNK) / 2; // 28 → world x, z ∈ [-28, 28]
export const LANE = 2; // half-width of a lane
export const KITCHEN_Z = HALF - 2.5; // the kitchen facade starts here (south edge), door at x ∈ [-1.1, 1.1]

export interface Cottage {
  x: number;
  z: number;
  yaw: number; // multiple of π/2, door faces the nearer lane
  w: number; // along local x
  d: number; // along local z
  tone: number; // 0..1 plaster tint
}
export interface Tree {
  x: number;
  z: number;
  s: number; // scale
  hue: number; // 0..1 canopy variation
}
export interface Lantern {
  x: number;
  z: number;
}
export interface Bush {
  x: number;
  z: number;
  s: number;
}

export interface ChunkData {
  cx: number;
  cz: number;
  /** world-space min corner */
  ox: number;
  oz: number;
  laneNS: boolean; // the north-south lane runs through this chunk
  laneEW: boolean;
  plaza: boolean; // the centre chunk: cobbled square + well
  kitchen: boolean; // the south-centre chunk: the kitchen facade
  cottages: Cottage[];
  trees: Tree[];
  lanterns: Lantern[];
  bushes: Bush[];
  obstacles: AABB[];
}

const cache = new Map<string, ChunkData>();
export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
export const chunkOf = (x: number, z: number): { cx: number; cz: number } => ({
  cx: Math.max(0, Math.min(COLS - 1, Math.floor((x + HALF) / CHUNK))),
  cz: Math.max(0, Math.min(ROWS - 1, Math.floor((z + HALF) / CHUNK))),
});

/** footprint half-extents of a cottage in world axes */
export const cottageHalf = (c: Cottage): [number, number] => (Math.abs(Math.sin(c.yaw)) > 0.5 ? [c.d / 2, c.w / 2] : [c.w / 2, c.d / 2]);

const onLane = (x: number, z: number, r: number) => Math.abs(x) < LANE + 0.6 + r || Math.abs(z) < LANE + 0.6 + r;
const onPlaza = (x: number, z: number, r: number) => Math.abs(x) < CHUNK / 2 + 1.4 + r && Math.abs(z) < CHUNK / 2 + 1.4 + r;
const onKitchen = (x: number, z: number, r: number) => z > KITCHEN_Z - 1.2 - r;

export function chunkData(cx: number, cz: number): ChunkData {
  const key = chunkKey(cx, cz);
  const hit = cache.get(key);
  if (hit) return hit;
  const ox = -HALF + cx * CHUNK;
  const oz = -HALF + cz * CHUNK;
  const rng = new Rng(((cx + 1) * 73856093) ^ ((cz + 1) * 19349663) ^ 0x9e3779b9);
  const laneNS = cx === Math.floor(COLS / 2);
  const laneEW = cz === Math.floor(ROWS / 2);
  const plaza = laneNS && laneEW;
  const kitchen = laneNS && cz === ROWS - 1;
  const cottages: Cottage[] = [];
  const trees: Tree[] = [];
  const lanterns: Lantern[] = [];
  const bushes: Bush[] = [];
  const obstacles: AABB[] = [];

  if (plaza) {
    obstacles.push([-1.1, 1.1, -1.1, 1.1]); // the well
    for (const [x, z] of [
      [-3.2, -3.2],
      [3.2, -3.2],
      [-3.2, 3.2],
      [3.2, 3.2],
    ])
      lanterns.push({ x, z });
  } else {
    // one cottage, most chunks; its footprint stays off the lanes / plaza / kitchen strip and inside the chunk
    if (rng.next() < 0.78) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const w = 3.2 + rng.next() * 1.0;
        const d = 2.8 + rng.next() * 0.8;
        const x = ox + 2.6 + rng.next() * (CHUNK - 5.2);
        const z = oz + 2.6 + rng.next() * (CHUNK - 5.2);
        const yaw = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
        const c: Cottage = { x, z, yaw, w, d, tone: rng.next() };
        const [hx, hz] = cottageHalf(c);
        const clear = !onLane(x, z, Math.max(hx, hz)) && !onPlaza(x, z, Math.max(hx, hz)) && !onKitchen(x, z, hz) && x - hx > ox + 0.4 && x + hx < ox + CHUNK - 0.4 && z - hz > oz + 0.4 && z + hz < oz + CHUNK - 0.4;
        if (clear) {
          cottages.push(c);
          obstacles.push([x - hx, x + hx, z - hz, z + hz]);
          break;
        }
      }
    }
    // trees
    const nTrees = 3 + rng.int(4);
    for (let i = 0; i < nTrees; i++) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const x = ox + 0.8 + rng.next() * (CHUNK - 1.6);
        const z = oz + 0.8 + rng.next() * (CHUNK - 1.6);
        if (onLane(x, z, 0.5) || onPlaza(x, z, 0.5) || onKitchen(x, z, 0.5)) continue;
        if (cottages.some((c) => Math.abs(x - c.x) < cottageHalf(c)[0] + 1.0 && Math.abs(z - c.z) < cottageHalf(c)[1] + 1.0)) continue;
        if (trees.some((t) => Math.hypot(x - t.x, z - t.z) < 1.6)) continue;
        trees.push({ x, z, s: 0.8 + rng.next() * 0.55, hue: rng.next() });
        obstacles.push([x - 0.32, x + 0.32, z - 0.32, z + 0.32]);
        break;
      }
    }
    // bushes (no collision)
    const nBush = rng.int(4);
    for (let i = 0; i < nBush; i++) {
      const x = ox + 0.6 + rng.next() * (CHUNK - 1.2);
      const z = oz + 0.6 + rng.next() * (CHUNK - 1.2);
      if (onLane(x, z, 0.3) || onPlaza(x, z, 0.3) || onKitchen(x, z, 0.3)) continue;
      if (cottages.some((c) => Math.abs(x - c.x) < cottageHalf(c)[0] + 0.6 && Math.abs(z - c.z) < cottageHalf(c)[1] + 0.6)) continue;
      bushes.push({ x, z, s: 0.35 + rng.next() * 0.35 });
    }
    // lantern posts flank the lanes
    if (laneNS) for (const lz of [CHUNK * 0.25, CHUNK * 0.75]) for (const lx of [-LANE - 0.7, LANE + 0.7]) if (!onKitchen(lx, oz + lz, 0.3)) lanterns.push({ x: lx, z: oz + lz });
    if (laneEW) for (const lx of [CHUNK * 0.25, CHUNK * 0.75]) for (const lz of [-LANE - 0.7, LANE + 0.7]) lanterns.push({ x: ox + lx, z: lz });
  }
  for (const l of lanterns) obstacles.push([l.x - 0.2, l.x + 0.2, l.z - 0.2, l.z + 0.2]);
  if (kitchen) {
    // the facade: solid except the door gap
    obstacles.push([-5.2, -1.1, KITCHEN_Z, HALF], [1.1, 5.2, KITCHEN_Z, HALF]);
  }
  const data: ChunkData = { cx, cz, ox, oz, laneNS, laneEW, plaza, kitchen, cottages, trees, lanterns, bushes, obstacles };
  cache.set(key, data);
  return data;
}

/** colliders of the 3×3 chunks around a world position (collision needs only the neighbours, not the render ring) */
export function obstaclesNear(x: number, z: number): AABB[] {
  const { cx, cz } = chunkOf(x, z);
  const out: AABB[] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const a = cx + dx;
      const b = cz + dz;
      if (a < 0 || b < 0 || a >= COLS || b >= ROWS) continue;
      out.push(...chunkData(a, b).obstacles);
    }
  return out;
}

/** tall solids (cottages, the well) in the 3×3 chunks around a position — camera occlusion candidates */
export function occludersNear(x: number, z: number): [number, number, number, number, number][] {
  const { cx, cz } = chunkOf(x, z);
  const out: [number, number, number, number, number][] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const a = cx + dx;
      const b = cz + dz;
      if (a < 0 || b < 0 || a >= COLS || b >= ROWS) continue;
      const d = chunkData(a, b);
      for (const c of d.cottages) {
        const [hx, hz] = cottageHalf(c);
        out.push([c.x - hx - 0.1, c.x + hx + 0.1, c.z - hz - 0.1, c.z + hz + 0.1, 4.1]);
      }
      if (d.plaza) out.push([-1.4, 1.4, -1.4, 1.4, 3.0]);
    }
  return out;
}

/** the chunk keys that should be mounted for a player in chunk (cx, cz) with the given ring */
export function ringKeys(cx: number, cz: number, ring: number): { cx: number; cz: number }[] {
  const out: { cx: number; cz: number }[] = [];
  for (let dz = -ring; dz <= ring; dz++)
    for (let dx = -ring; dx <= ring; dx++) {
      const a = cx + dx;
      const b = cz + dz;
      if (a < 0 || b < 0 || a >= COLS || b >= ROWS) continue;
      out.push({ cx: a, cz: b });
    }
  return out;
}
