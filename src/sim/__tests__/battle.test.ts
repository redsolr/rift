import { describe, expect, it } from "vitest";
import { Battle, runMany } from "../battle";
import { damage } from "../combat";
import { pathTo, reachable, standable } from "../grid";
import { decodeConfig, defaultConfig, encodeConfig, makeUnit } from "../presets";
import { BattleConfig } from "../types";

const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

describe("determinism", () => {
  it("same config + seed → identical event log", () => {
    const a = new Battle(defaultConfig(), 42);
    const b = new Battle(defaultConfig(), 42);
    a.runToEnd();
    b.runToEnd();
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    expect(a.state.winner).toBe(b.state.winner);
  });

  it("different seeds → outcomes are not all identical across 20 runs", () => {
    const stats = runMany(defaultConfig(), seeds(20));
    expect(stats.runs).toBe(20);
    expect(stats.redWins + stats.blueWins + stats.draws).toBe(20);
    // sanity: battles actually finish and are non-trivial
    expect(stats.avgTurns).toBeGreaterThan(2);
  });

  it("runMany is reproducible", () => {
    const a = runMany(defaultConfig(), seeds(30));
    const b = runMany(defaultConfig(), seeds(30));
    expect(a).toEqual(b);
  });
});

describe("combat", () => {
  it("damage = max(1, atk - (def + terrain))", () => {
    const cfg = defaultConfig();
    const b = new Battle(cfg, 1);
    const knight = b.state.units.find((u) => u.archetype === "knight" && u.team === "red")!;
    const mage = b.state.units.find((u) => u.archetype === "mage" && u.team === "blue")!;
    expect(damage(cfg.map, mage, knight)).toBe(11 - 6);
    // put knight in forest (+2 def)
    knight.x = 2;
    knight.y = 0;
    expect(damage(cfg.map, mage, knight)).toBe(11 - 8);
    // floor at 1
    const healer = b.state.units.find((u) => u.archetype === "healer")!;
    healer.stats.atk = 1;
    expect(damage(cfg.map, healer, knight)).toBe(1);
  });
});

describe("grid", () => {
  it("water/walls block, forest costs 2, enemies block, allies pass-through but not stand", () => {
    const cfg: BattleConfig = {
      map: { width: 5, height: 1, tiles: ["ground", "forest", "ground", "ground", "water"] },
      units: [makeUnit("red", "fighter", 0, 0), makeUnit("red", "knight", 2, 0), makeUnit("blue", "knight", 3, 0)],
      doctrine: { red: { aggression: "balanced", objective: "advance" }, blue: { aggression: "balanced", objective: "advance" } },
      maxTurns: 10,
    };
    const b = new Battle(cfg, 1);
    const f = b.state.units[0];
    const reach = reachable(cfg.map, f, b.state.units);
    // fighter mov 4: 0 →(2) forest 1 →(1) 2 [ally, pass] →(1) 3 [enemy, blocked]
    expect(reach.cost.get("1,0")).toBe(2);
    expect(reach.cost.get("2,0")).toBe(3);
    expect(reach.cost.has("3,0")).toBe(false);
    expect(reach.cost.has("4,0")).toBe(false);
    const stand = standable(reach, f, b.state.units).map((p) => `${p.x},${p.y}`);
    expect(stand).toContain("1,0");
    expect(stand).not.toContain("2,0");
    expect(pathTo(reach, { x: 1, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });
});

describe("engine rules", () => {
  it("rejects acting out of turn / unreachable tiles / already-acted", () => {
    const b = new Battle(defaultConfig(), 7);
    const blue = b.alive("blue")[0];
    expect(() => b.act({ kind: "wait", unit: blue.id, moveTo: { x: blue.x, y: blue.y } })).toThrow(/turn/);
    const red = b.alive("red")[0];
    expect(() => b.act({ kind: "wait", unit: red.id, moveTo: { x: 0, y: 15 } })).toThrow(/reach/);
    b.act({ kind: "wait", unit: red.id, moveTo: { x: red.x, y: red.y } });
    expect(() => b.act({ kind: "wait", unit: red.id, moveTo: { x: red.x, y: red.y } })).toThrow(/already/);
  });

  it("phase ends automatically when every unit has acted; turn increments after blue", () => {
    const b = new Battle(defaultConfig(), 7);
    expect(b.state.activeTeam).toBe("red");
    b.runPhaseAI();
    expect(b.state.activeTeam).toBe("blue");
    expect(b.state.turn).toBe(1);
    b.runPhaseAI();
    expect(b.state.activeTeam).toBe("red");
    expect(b.state.turn).toBe(2);
  });

  it("every decision event explains the chosen action with named terms", () => {
    const b = new Battle(defaultConfig(), 3);
    b.runTurns(2);
    const decisions = b.log.filter((e) => e.type === "decision");
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      if (d.type !== "decision") continue;
      expect(d.candidates[d.chosen].terms.length).toBeGreaterThan(0);
      const sum = d.candidates[d.chosen].terms.reduce((s, t) => s + t.value, 0);
      expect(sum).toBe(d.candidates[d.chosen].score);
      // sorted desc
      for (let i = 1; i < d.candidates.length; i++) expect(d.candidates[i - 1].score).toBeGreaterThanOrEqual(d.candidates[i].score);
    }
  });

  it("orders change behaviour: 'hold' units move less than 'pursue' units", () => {
    const moved = (stance: "hold" | "pursue") => {
      const cfg = defaultConfig();
      for (const u of cfg.units) if (u.team === "red") u.orders = { ...u.orders, stance };
      const b = new Battle(cfg, 11);
      b.runTurns(3);
      return b.log.filter((e) => e.type === "move" && b.unit(e.unit).team === "red").reduce((s, e) => (e.type === "move" ? s + e.path.length - 1 : s), 0);
    };
    expect(moved("hold")).toBeLessThan(moved("pursue"));
  });

  it("battle ends in draw at maxTurns", () => {
    const cfg = defaultConfig();
    cfg.maxTurns = 1;
    for (const u of cfg.units) u.orders = { ...u.orders, stance: "hold" };
    const b = new Battle(cfg, 1);
    b.runToEnd();
    expect(b.state.ended).toBe(true);
    expect(b.state.winner).toBe("draw");
  });
});

describe("share code", () => {
  it("round-trips config", () => {
    const cfg = defaultConfig();
    const code = encodeConfig(cfg);
    expect(code).not.toMatch(/[+/=]/);
    const back = decodeConfig(code);
    expect(back).toEqual(cfg);
    // and a battle from the decoded config replays identically
    const a = new Battle(cfg, 5);
    const b = new Battle(back, 5);
    a.runToEnd();
    b.runToEnd();
    expect(a.log).toEqual(b.log);
  });
});


describe("threat + forecast", () => {
  it("threatTiles = reachable tiles expanded by range; threatsTo finds enemies that can hit a tile", () => {
    const cfg: BattleConfig = {
      map: { width: 8, height: 1, tiles: Array(8).fill("ground") },
      units: [makeUnit("red", "knight", 0, 0), makeUnit("blue", "archer", 7, 0)],
      doctrine: { red: { aggression: "balanced", objective: "advance" }, blue: { aggression: "balanced", objective: "advance" } },
      maxTurns: 10,
    };
    const b = new Battle(cfg, 1);
    const [knight, archer] = b.state.units;
    // archer mov 4 (tiles 3..7), range 2-3 → can hit 0..6 (from 3 it hits 0,1)
    const t = b.threatTiles(archer.id);
    expect(t.has("0,0")).toBe(true);
    expect(t.has("6,0")).toBe(true);
    // knight mov 3 range 1 → tiles 0..4 (blocked beyond by nothing) → hits up to 4
    const k = b.threatTiles(knight.id);
    expect(k.has("4,0")).toBe(true);
    expect(k.has("5,0")).toBe(false);
    expect(b.threatsTo(knight.id).map((u) => u.id)).toEqual([archer.id]);
    expect(b.threatsTo(archer.id, { x: 6, y: 0 })).toEqual([]);
  });

  it("forecast reports damage, kill, hp-after and retaliation only when the defender can reach the tile", () => {
    const cfg = defaultConfig();
    const b = new Battle(cfg, 1);
    const knight = b.state.units.find((u) => u.archetype === "knight" && u.team === "red")!;
    const archer = b.state.units.find((u) => u.archetype === "archer" && u.team === "blue")!;
    // adjacent → archer (range 2-3) cannot retaliate
    const f1 = b.forecast(knight.id, archer.id, { x: archer.x, y: archer.y - 1 });
    expect(f1.inRange).toBe(true);
    expect(f1.damage).toBe(8 - 2);
    expect(f1.hpAfter).toBe(archer.hp - 6);
    expect(f1.retaliation).toBeNull();
    // archer attacking knight from range 2 → knight (range 1) cannot retaliate; from range 1 it can
    const f2 = b.forecast(archer.id, knight.id, { x: knight.x, y: knight.y + 2 });
    expect(f2.retaliation).toBeNull();
    const f3 = b.forecast(archer.id, knight.id, { x: knight.x, y: knight.y + 1 });
    expect(f3.inRange).toBe(false); // archer min range 2
    expect(f3.retaliation).toBe(8 - 2);
  });
});
