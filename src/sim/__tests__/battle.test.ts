import { describe, expect, it } from "vitest";
import { Battle, runMany } from "../battle";
import { ARCHETYPES } from "../types";
import { ATTACKS, attackById, attackUsable, attacksOf } from "../attacks";
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
    const first = b.state.activeTeam;
    const other = b.alive(first === "red" ? "blue" : "red")[0];
    expect(() => b.act({ kind: "wait", unit: other.id, moveTo: { x: other.x, y: other.y } })).toThrow(/turn/);
    const mine = b.alive(first)[0];
    expect(() => b.act({ kind: "wait", unit: mine.id, moveTo: { x: 0, y: 0 } })).toThrow(/reach/);
    b.act({ kind: "wait", unit: mine.id, moveTo: { x: mine.x, y: mine.y } });
    expect(() => b.act({ kind: "wait", unit: mine.id, moveTo: { x: mine.x, y: mine.y } })).toThrow(/already/);
  });

  it("phase ends automatically when every unit has acted; turn increments after the second team", () => {
    const cfg = defaultConfig();
    const b = new Battle(cfg, 7);
    const first = cfg.firstTeam ?? "red";
    const second = first === "red" ? "blue" : "red";
    expect(b.state.activeTeam).toBe(first);
    b.runPhaseAI();
    expect(b.state.activeTeam).toBe(second);
    expect(b.state.turn).toBe(1);
    b.runPhaseAI();
    expect(b.state.activeTeam).toBe(first);
    expect(b.state.turn).toBe(2);
  });

  it("firstTeam decides who opens the battle and when the turn counter advances", () => {
    const cfg = defaultConfig();
    cfg.firstTeam = "red";
    const b = new Battle(cfg, 7);
    expect(b.state.activeTeam).toBe("red");
    b.runPhaseAI();
    expect(b.state.activeTeam).toBe("blue");
    expect(b.state.turn).toBe(1);
    b.runPhaseAI();
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
    // knight mov 3 → tiles 0..3; Thrust range 1 hits 4, Long Thrust range 2 hits 5, nothing hits 6
    const k = b.threatTiles(knight.id);
    expect(k.has("4,0")).toBe(true);
    expect(k.has("5,0")).toBe(true);
    expect(k.has("6,0")).toBe(false);
    expect(b.threatsTo(knight.id).map((u) => u.id)).toEqual([archer.id]);
    expect(b.threatsTo(archer.id, { x: 6, y: 0 })).toEqual([]);
  });

  it("forecast reports damage, kill, hp-after and retaliation only when the defender can reach the tile", () => {
    const cfg = defaultConfig();
    const b = new Battle(cfg, 1);
    const knight = b.state.units.find((u) => u.archetype === "knight" && u.team === "red")!;
    const archer = b.state.units.find((u) => u.archetype === "archer" && u.team === "blue")!;
    // adjacent, explicit Thrust (±0): 8 − 2. The archer answers with Quick Shot (−2, range 1–3): 8 − 2 − 6 → floor 1
    const f1 = b.forecast(knight.id, archer.id, { x: archer.x, y: archer.y - 1 }, "thrust");
    expect(f1.attack?.id).toBe("thrust");
    expect(f1.inRange).toBe(true);
    expect(f1.damage).toBe(8 - 2);
    expect(f1.hpAfter).toBe(archer.hp - 6);
    expect(f1.retaliation).toBe(1);
    // no attack named → the best usable one: the knight moved, so Charge (+2) beats Thrust
    const f1b = b.forecast(knight.id, archer.id, { x: archer.x, y: archer.y - 1 });
    expect(f1b.attack?.id).toBe("charge");
    expect(f1b.damage).toBe(8 + 2 - 2);
    // archer at range 3 → the knight (Thrust 1 / Long Thrust 2) cannot answer; at range 2 Long Thrust answers (8 − 2 − 2)
    const f2 = b.forecast(archer.id, knight.id, { x: knight.x, y: knight.y + 3 });
    expect(f2.retaliation).toBeNull();
    const f3 = b.forecast(archer.id, knight.id, { x: knight.x, y: knight.y + 2 }, "aimed_shot");
    expect(f3.inRange).toBe(true);
    expect(f3.retaliation).toBe(8 - 2 - 2);
    // Snipe (stationary) from a moved-to tile is not usable → out of range from here
    const f4 = b.forecast(archer.id, knight.id, { x: knight.x, y: knight.y + 2 }, "snipe");
    expect(f4.inRange).toBe(false);
  });
});

describe("attacks (four per unit)", () => {
  it("every archetype has exactly four attacks with unique ids and a ±0 baseline first", () => {
    for (const a of ARCHETYPES) {
      const list = ATTACKS[a];
      expect(list).toHaveLength(4);
      expect(new Set(list.map((x) => x.id)).size).toBe(4);
      expect(list[0].power).toBe(0);
      expect(list[0].range).toBeNull();
    }
  });

  it("movement conditions gate the picker and the engine: stationary attacks only without a move, momentum attacks only after one", () => {
    const cfg: BattleConfig = {
      map: { width: 6, height: 1, tiles: Array(6).fill("ground") },
      units: [makeUnit("blue", "fighter", 0, 0), makeUnit("red", "knight", 2, 0)],
      doctrine: { red: { aggression: "balanced", objective: "advance" }, blue: { aggression: "balanced", objective: "advance" } },
      maxTurns: 10,
      firstTeam: "blue",
    };
    const b = new Battle(cfg, 1);
    const [fighter, knight] = b.state.units;
    // standing still at 0: knight at 2 is out of Slash range but Wide Swing (1–2) reaches; Cleave usable, Rush not
    const stay = b.attackOptions(fighter.id, { x: 0, y: 0 });
    expect(stay.find((o) => o.attack.id === "cleave")!.usable).toBe(true);
    expect(stay.find((o) => o.attack.id === "rush")!.usable).toBe(false);
    expect(stay.find((o) => o.attack.id === "wide_swing")!.targets).toEqual([knight.id]);
    expect(stay.find((o) => o.attack.id === "slash")!.targets).toEqual([]);
    // after moving to 1: Rush usable, Cleave not; targetsFrom with an attack id applies the condition
    const moved = b.attackOptions(fighter.id, { x: 1, y: 0 });
    expect(moved.find((o) => o.attack.id === "rush")!.usable).toBe(true);
    expect(moved.find((o) => o.attack.id === "cleave")!.usable).toBe(false);
    expect(b.targetsFrom(fighter.id, { x: 1, y: 0 }, "cleave")).toEqual([]);
    expect(b.targetsFrom(fighter.id, { x: 1, y: 0 }, "rush").map((u) => u.id)).toEqual([knight.id]);
    // best usable after moving = Rush (+2 beats Slash ±0 and Wide Swing −2)
    expect(b.bestAttack(fighter.id, { x: 1, y: 0 }, knight.id)?.id).toBe("rush");
    // the engine refuses an illegal condition and applies the power of a legal one
    expect(() => b.act({ kind: "attack", unit: fighter.id, moveTo: { x: 1, y: 0 }, target: knight.id, attack: "cleave" })).toThrow(/stand still/);
    b.act({ kind: "attack", unit: fighter.id, moveTo: { x: 1, y: 0 }, target: knight.id, attack: "rush" });
    const hit = b.log.find((e) => e.type === "attack");
    expect(hit && hit.type === "attack" && hit.attack).toBe("Rush");
    expect(hit && hit.type === "attack" && hit.damage).toBe(10 + 2 - 6);
    expect(attackUsable(attackById(fighter, "slash"), true)).toBe(true);
    expect(attacksOf(fighter).map((a) => a.id)).toContain("slash");
  });

  it("the AI names the attack it chose and its action carries a legal attack id", () => {
    const b = new Battle(defaultConfig(), 3);
    b.runToEnd();
    const decisions = b.log.filter((e) => e.type === "decision");
    const attacks = decisions.flatMap((d) => (d.type === "decision" ? d.candidates.filter((c) => c.action.kind !== "wait") : []));
    expect(attacks.length).toBeGreaterThan(0);
    for (const c of attacks) {
      const u = b.unit(c.action.unit);
      const a = c.action.kind === "wait" ? null : attackById(u, c.action.attack);
      expect(a).not.toBeNull();
      expect(c.label.startsWith(a!.name)).toBe(true);
    }
  });
});
