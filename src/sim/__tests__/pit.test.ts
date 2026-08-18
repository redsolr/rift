import { describe, expect, it } from "vitest";
import { Battle, runMany } from "../battle";
import { PIT_STEP, pitArchetypes, pitBracket, pitConfig, pitRosterSize, pitScaling } from "../pit";
import { Stats } from "../types";

const sum = (s: Stats) => s.hp + s.atk * 10 + s.def * 10 + s.spd * 10;

describe("the tower (pit floors)", () => {
  it("limits the enemy roster on the first floors and unlocks one archetype per bracket", () => {
    expect(pitArchetypes(1)).toEqual(["fighter", "knight"]);
    expect(pitArchetypes(PIT_STEP)).toEqual(["fighter", "knight"]);
    expect(pitArchetypes(PIT_STEP + 1)).toContain("archer");
    expect(pitArchetypes(PIT_STEP + 1)).not.toContain("mage");
    expect(pitArchetypes(2 * PIT_STEP + 1)).toContain("mage");
    expect(pitArchetypes(3 * PIT_STEP + 1)).toContain("healer");
    for (const f of [1, 3, 5]) for (const u of pitConfig(f).units.filter((u) => u.team === "red")) expect(["fighter", "knight"]).toContain(u.archetype);
  });

  it("is identical inside a bracket and steps up exactly at every 5th threshold", () => {
    expect(pitBracket(1)).toBe(0);
    expect(pitBracket(5)).toBe(0);
    expect(pitBracket(6)).toBe(1);
    expect(pitScaling(5)).toEqual(pitScaling(1));
    expect(pitScaling(6).hp).toBeGreaterThan(pitScaling(5).hp);
    expect(pitScaling(6).atk).toBeGreaterThan(pitScaling(5).atk);
    expect(JSON.stringify(pitConfig(7).units)).toBe(JSON.stringify(pitConfig(9).units));
  });

  it("enemy strength never goes down as you climb; the roster grows to 6", () => {
    let prev = -1;
    for (let f = 1; f <= 40; f++) {
      const reds = pitConfig(f).units.filter((u) => u.team === "red");
      const power = reds.reduce((a, u) => a + sum(u.stats), 0);
      expect(power).toBeGreaterThanOrEqual(prev);
      prev = power;
      expect(reds.length).toBe(pitRosterSize(f));
    }
    expect(pitRosterSize(1)).toBe(4);
    expect(pitRosterSize(20)).toBe(6);
  });

  it("keeps your squad and the map, occupies distinct tiles, and produces a battle that runs deterministically", () => {
    const cfg = pitConfig(12);
    expect(cfg.units.filter((u) => u.team === "blue")).toHaveLength(5);
    const keys = new Set(cfg.units.map((u) => `${u.x},${u.y}`));
    expect(keys.size).toBe(cfg.units.length);
    expect(() => new Battle(cfg, 7)).not.toThrow();
    const a = runMany(cfg, [1, 2, 3, 4, 5]);
    const b = runMany(cfg, [1, 2, 3, 4, 5]);
    expect(a).toEqual(b);
  });
});
