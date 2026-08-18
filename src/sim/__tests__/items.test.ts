import { describe, expect, it } from "vitest";
import { Battle } from "../battle";
import { ITEMS, SLOTS, applyEquipment, canEquip, equipmentDelta, gearUnit, itemById, lootPool, rollLoot, slotsForKind } from "../items";
import { pitBracket, pitConfig } from "../pit";
import { defaultConfig, makeUnit } from "../presets";

describe("items — data", () => {
  it("every item id is unique and every class restriction names real archetypes", () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    expect(ids.size).toBe(ITEMS.length);
    for (const i of ITEMS) for (const c of i.classes ?? []) expect(["knight", "fighter", "archer", "mage", "healer"]).toContain(c);
  });
  it("every slot kind has at least one item and every archetype has at least one weapon", () => {
    for (const s of SLOTS) expect(ITEMS.some((i) => slotsForKind(i.slot).includes(s))).toBe(true);
    for (const a of ["knight", "fighter", "archer", "mage", "healer"] as const) expect(ITEMS.some((i) => i.slot === "weapon" && canEquip({ archetype: a }, i, "weapon"))).toBe(true);
  });
});

describe("items — equipping", () => {
  const knight = makeUnit("blue", "knight", 0, 0);
  const mage = makeUnit("blue", "mage", 0, 0);
  it("a ring fits either ring slot and nothing else", () => {
    const ring = itemById("ring_of_vigor");
    expect(canEquip(knight, ring, "ring1")).toBe(true);
    expect(canEquip(knight, ring, "ring2")).toBe(true);
    expect(canEquip(knight, ring, "head")).toBe(false);
  });
  it("class-bound gear refuses the wrong class", () => {
    const lance = itemById("steel_lance");
    expect(canEquip(knight, lance, "weapon")).toBe(true);
    expect(canEquip(mage, lance, "weapon")).toBe(false);
  });
  it("applyEquipment adds every worn item's mods and never drops HP/MOV below 1", () => {
    const geared = applyEquipment(knight.stats, { weapon: "steel_lance", ring1: "ring_of_vigor", ring2: "ring_of_might" });
    expect(geared.atk).toBe(knight.stats.atk + 2 + 1);
    expect(geared.hp).toBe(knight.stats.hp + 3);
    expect(equipmentDelta({ weapon: "steel_lance", ring1: "ring_of_vigor", ring2: "ring_of_might" })).toEqual({ atk: 3, hp: 3 });
    const floor = applyEquipment({ ...knight.stats, hp: 1, mov: 1 }, { trinket1: "hourglass_shard" }); // −2 hp, +1 mov
    expect(floor.hp).toBe(1);
    expect(floor.mov).toBe(2);
  });
  it("gearUnit is idempotent and reversible: base is kept, re-gearing does not stack, no gear restores base", () => {
    const once = gearUnit(knight, { weapon: "steel_lance" });
    const twice = gearUnit(once, { weapon: "steel_lance" });
    expect(twice.stats).toEqual(once.stats);
    expect(twice.base).toEqual(knight.stats);
    expect(once.stats.atk).toBe(knight.stats.atk + 2);
    const swapped = gearUnit(twice, { weapon: "silver_lance" });
    expect(swapped.stats.atk).toBe(knight.stats.atk + 4); // from base, not from the steel-lance number
    const bare = gearUnit(swapped, {});
    expect(bare.stats).toEqual(knight.stats);
    expect(bare.base).toBeUndefined();
    expect(bare.equipment).toBeUndefined();
  });
  it("gear changes the fight: a geared knight hits harder in the same deterministic battle", () => {
    const cfg = defaultConfig();
    const gearedCfg = { ...cfg, units: cfg.units.map((u) => (u.id === "bk1" ? gearUnit(u, { weapon: "silver_lance", chest: "chainmail" }) : u)) };
    const a = new Battle(cfg, 7);
    const b = new Battle(gearedCfg, 7);
    expect(b.state.units.find((u) => u.id === "bk1")!.stats.atk).toBe(a.state.units.find((u) => u.id === "bk1")!.stats.atk + 4);
    expect(b.state.units.find((u) => u.id === "bk1")!.hp).toBe(a.state.units.find((u) => u.id === "bk1")!.hp + 3);
    // and the engine ignores the extra fields — the tower config still builds and runs
    const p = new Battle({ ...pitConfig(3), units: gearedCfg.units.filter((u) => u.team === "blue").concat(pitConfig(3).units.filter((u) => u.team === "red")) }, 1);
    p.runToEnd();
    expect(p.state.ended).toBe(true);
  });
});

describe("items — loot", () => {
  it("floor loot is deterministic and only draws from the floor's bracket pool", () => {
    for (const floor of [1, 5, 6, 12, 20]) {
      const a = rollLoot(floor, pitBracket(floor));
      const b = rollLoot(floor, pitBracket(floor));
      expect(a.id).toBe(b.id);
      expect(a.tier).toBeLessThanOrEqual(pitBracket(floor));
    }
  });
  it("deeper brackets unlock more items and the epics only past the early floors", () => {
    expect(lootPool(0).length).toBeLessThan(lootPool(3).length);
    expect(lootPool(0).every((i) => i.rarity !== "epic" || i.tier === 0)).toBe(true);
    expect(lootPool(0).some((i) => i.rarity === "epic")).toBe(false);
  });
  it("across the first 30 floors the drops are varied (not one item forever)", () => {
    const ids = new Set<string>();
    for (let f = 1; f <= 30; f++) ids.add(rollLoot(f, pitBracket(f)).id);
    expect(ids.size).toBeGreaterThan(12);
  });
});
