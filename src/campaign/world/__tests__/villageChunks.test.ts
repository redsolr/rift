import { describe, expect, it } from "vitest";
import { CHUNK, COLS, HALF, KITCHEN_Z, LANE, ROWS, chunkData, chunkOf, cottageHalf, obstaclesNear, ringKeys } from "../villageChunks";

describe("village chunks", () => {
  it("are deterministic — the same chunk generates the same data every time", () => {
    const a = JSON.stringify(chunkData(1, 3));
    const b = JSON.stringify(chunkData(1, 3));
    expect(a).toBe(b);
    // different chunks differ
    expect(JSON.stringify(chunkData(0, 0))).not.toBe(JSON.stringify(chunkData(4, 4)));
  });

  it("keeps every cottage and tree off the lanes, the plaza and the kitchen strip, inside its own chunk", () => {
    for (let cz = 0; cz < ROWS; cz++)
      for (let cx = 0; cx < COLS; cx++) {
        const d = chunkData(cx, cz);
        for (const c of d.cottages) {
          const [hx, hz] = cottageHalf(c);
          expect(Math.abs(c.x) - hx).toBeGreaterThan(LANE);
          expect(Math.abs(c.z) - hz).toBeGreaterThan(LANE);
          expect(c.x - hx).toBeGreaterThanOrEqual(d.ox);
          expect(c.x + hx).toBeLessThanOrEqual(d.ox + CHUNK);
          expect(c.z - hz).toBeGreaterThanOrEqual(d.oz);
          expect(c.z + hz).toBeLessThanOrEqual(d.oz + CHUNK);
          expect(c.z + hz).toBeLessThan(KITCHEN_Z);
        }
        for (const t of d.trees) {
          expect(Math.abs(t.x)).toBeGreaterThan(LANE);
          expect(Math.abs(t.z)).toBeGreaterThan(LANE);
          expect(t.z).toBeLessThan(KITCHEN_Z);
        }
      }
  });

  it("the plaza chunk holds the well and no cottage; the south-centre chunk holds the kitchen facade with a door gap", () => {
    const plaza = chunkData(Math.floor(COLS / 2), Math.floor(ROWS / 2));
    expect(plaza.plaza).toBe(true);
    expect(plaza.cottages).toHaveLength(0);
    expect(plaza.obstacles.some(([x0, x1, z0, z1]) => x0 < 0 && x1 > 0 && z0 < 0 && z1 > 0)).toBe(true);
    const kitchen = chunkData(Math.floor(COLS / 2), ROWS - 1);
    expect(kitchen.kitchen).toBe(true);
    // the door gap at x = 0 is walkable at the facade line
    const atDoor = kitchen.obstacles.some(([x0, x1, z0, z1]) => x0 <= 0 && 0 <= x1 && z0 <= KITCHEN_Z + 0.3 && KITCHEN_Z + 0.3 <= z1);
    expect(atDoor).toBe(false);
  });

  it("streams a ring in the middle and clips it at the edges; colliders come from the 3×3 neighbourhood", () => {
    expect(ringKeys(3, 3, 2)).toHaveLength(25);
    expect(ringKeys(0, 0, 2)).toHaveLength(9);
    expect(ringKeys(0, 3, 2)).toHaveLength(15);
    expect(ringKeys(3, 3, 1)).toHaveLength(9);
    expect(chunkOf(0, 0)).toEqual({ cx: 3, cz: 3 });
    expect(chunkOf(-HALF, -HALF)).toEqual({ cx: 0, cz: 0 });
    expect(chunkOf(HALF, HALF)).toEqual({ cx: COLS - 1, cz: ROWS - 1 });
    const near = obstaclesNear(0, 0);
    const all = ringKeys(3, 3, 1).flatMap((k) => chunkData(k.cx, k.cz).obstacles);
    expect(near).toHaveLength(all.length);
  });
});
