import { describe, expect, it } from "vitest";
import { Battle } from "../battle";
import { standable, reachable } from "../grid";
import { damage } from "../combat";
import { HASTE_MOV, RESPAWN_TURNS, RUNES } from "../runes";
import { DEFAULT_ORDERS, decodeConfig, emptyMap, encodeConfig, makeUnit } from "../presets";
import { BattleConfig, MapDef, Pos } from "../types";

/** Open 8×8 field, blue moves first; a shrine at `shrine`; one blue knight + one red knight far apart. */
function arena(shrine: Pos, extra: Partial<BattleConfig> = {}): BattleConfig {
  const map: MapDef = emptyMap(8, 8);
  map.tiles[shrine.y * map.width + shrine.x] = "shrine";
  return {
    map,
    units: [{ ...makeUnit("blue", "knight", 1, 6, "Ally"), id: "bk1" }, { ...makeUnit("red", "knight", 6, 1, "Foe"), id: "rk2" }],
    doctrine: { red: { aggression: "balanced", objective: "advance" }, blue: { aggression: "balanced", objective: "advance" } },
    maxTurns: 30,
    firstTeam: "blue",
    ...extra,
  };
}

/** A battle whose first spawned rune is `kind` — scan seeds (the type comes from the battle RNG). */
function battleWithRune(kind: "haste" | "double_damage" | "invisibility", shrine: Pos, extra?: Partial<BattleConfig>): Battle {
  for (let seed = 1; seed < 200; seed++) {
    const b = new Battle(arena(shrine, extra), seed);
    if (b.runeAt(shrine) === kind) return b;
  }
  throw new Error("no seed spawned " + kind);
}

describe("runes", () => {
  it("every shrine spawns a rune at battle start; a rune_spawn event is logged", () => {
    const b = new Battle(arena({ x: 3, y: 4 }), 1);
    expect(b.runeAt({ x: 3, y: 4 })).not.toBeNull();
    expect(b.log.filter((e) => e.type === "rune_spawn")).toHaveLength(1);
  });

  it("ending a move on a rune picks it up and grants the buff for the rune's turn count", () => {
    const b = battleWithRune("haste", { x: 1, y: 4 });
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 4 } });
    const ally = b.unit("bk1");
    expect(b.log.filter((e) => e.type === "rune_spawn").length).toBeGreaterThan(0);
    expect(b.log[0].type).toBe("rune_spawn"); // on the board before the opening banner
    expect(ally.buff).toEqual({ kind: "haste", turns: RUNES.haste.turns });
    expect(b.runeAt({ x: 1, y: 4 })).toBeNull();
    expect(b.log.some((e) => e.type === "rune_pickup" && e.unit === "bk1" && e.rune === "haste")).toBe(true);
  });

  it("Haste: picking it up lets the unit act again immediately (refresh event), and the extra activation is a real one", () => {
    const b = battleWithRune("haste", { x: 1, y: 4 });
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 4 } });
    expect(b.unit("bk1").acted).toBe(false);
    expect(b.state.activeTeam).toBe("blue");
    expect(b.log.at(-1)).toEqual({ type: "refresh", unit: "bk1" });
    // the bonus activation already enjoys +MOV: from (1,4) it reaches x = 1 + mov + HASTE_MOV
    expect(b.reachFor("bk1").cost.get(`${1 + b.unit("bk1").stats.mov + HASTE_MOV},4`)).toBeDefined();
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 6 } });
    expect(b.state.activeTeam).toBe("red"); // phase ended: no second refresh — only a fresh pickup grants one
  });

  it("Haste: the unit moves further than its base MOV while buffed, and the buff expires after its turns", () => {
    const b = battleWithRune("haste", { x: 1, y: 4 });
    const base = standable(reachable(b.config.map, b.unit("bk1"), b.state.units), b.unit("bk1"), b.state.units).length;
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 4 } });
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 6 } }); // spend the bonus activation off the shrine
    b.runPhaseAI(); // red
    // blue's next phase: still hasted (3 → 2)
    expect(b.unit("bk1").buff?.turns).toBe(RUNES.haste.turns - 1);
    const hasted = standable(reachable(b.config.map, b.unit("bk1"), b.state.units), b.unit("bk1"), b.state.units).length;
    expect(hasted).toBeGreaterThan(base);
    // burn through the remaining phases idling OFF the shrine (idling on it would re-grab the respawn)
    for (let i = 0; i < RUNES.haste.turns; i++) {
      b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 6 } });
      b.runPhaseAI();
    }
    expect(b.unit("bk1").buff).toBeNull();
    expect(b.log.some((e) => e.type === "rune_expire" && e.unit === "bk1" && e.rune === "haste")).toBe(true);
  });

  it("Double Damage: attacks deal twice the offence before defence", () => {
    const b = battleWithRune("double_damage", { x: 1, y: 4 });
    const a = b.unit("bk1");
    const foe = b.unit("rk2");
    const before = damage(b.config.map, a, foe);
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 4 } });
    const after = damage(b.config.map, b.unit("bk1"), foe);
    expect(after).toBe(Math.max(1, a.stats.atk * 2 - foe.stats.def));
    expect(after).toBeGreaterThan(before);
  });

  it("Invisibility: enemies cannot target the unit; attacking breaks it", () => {
    // put the foe adjacent so it would otherwise have a legal attack
    const b = battleWithRune("invisibility", { x: 1, y: 4 }, { units: [{ ...makeUnit("blue", "knight", 1, 5, "Ally"), id: "bk1" }, { ...makeUnit("red", "knight", 2, 4, "Foe"), id: "rk2" }] });
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 4 } });
    expect(b.unit("bk1").buff?.kind).toBe("invisibility");
    // red's phase: no legal target, no attack event
    expect(b.targetsFrom("rk2", { x: 2, y: 4 })).toHaveLength(0);
    expect(() => b.act({ kind: "attack", unit: "rk2", moveTo: { x: 2, y: 4 }, target: "bk1", attack: "shield_bash" })).toThrow(/invisible/);
    b.runPhaseAI();
    expect(b.log.some((e) => e.type === "attack" && e.target === "bk1")).toBe(false);
    expect(b.unit("bk1").hp).toBe(b.unit("bk1").stats.hp);
    // blue attacks → invisibility breaks
    const atk = b.bestAttack("bk1", { x: 1, y: 4 }, "rk2")!;
    b.act({ kind: "attack", unit: "bk1", moveTo: { x: 1, y: 4 }, target: "rk2", attack: atk.id });
    expect(b.unit("bk1").buff).toBeNull();
  });

  it("a taken shrine respawns RESPAWN_TURNS later", () => {
    // (Haste refreshes the unit, so it spends the bonus activation walking off the shrine below)
    // the foe holds still (hold stance + hold doctrine) so it never wanders over and takes the respawn itself
    const holdFoe = { ...makeUnit("red", "knight", 6, 1, "Foe"), id: "rk2", orders: { ...DEFAULT_ORDERS, stance: "hold" as const } };
    const b = battleWithRune("haste", { x: 1, y: 4 }, { units: [{ ...makeUnit("blue", "knight", 1, 6, "Ally"), id: "bk1" }, holdFoe], doctrine: { red: { aggression: "very_defensive", objective: "hold" }, blue: { aggression: "balanced", objective: "advance" } } });
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 4 } });
    const took = b.state.turn;
    // walk away (bonus activation) then idle in place
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 7 } });
    b.runPhaseAI();
    b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 7 } });
    while (b.state.turn < took + RESPAWN_TURNS && !b.state.ended) {
      b.runPhaseAI();
      if (b.state.activeTeam === "blue" && !b.state.ended) {
        if (b.state.turn < took + RESPAWN_TURNS) expect(b.runeAt({ x: 1, y: 4 })).toBeNull();
        else break;
        b.act({ kind: "wait", unit: "bk1", moveTo: { x: 1, y: 7 } });
      }
    }
    expect(b.runeAt({ x: 1, y: 4 })).not.toBeNull();
  });

  it("the AI walks onto a rune it can reach (Grab rune term) and the term is named", () => {
    const b = battleWithRune("haste", { x: 2, y: 5 });
    const cands = b.candidates("bk1");
    const onRune = cands.find((c) => c.action.moveTo.x === 2 && c.action.moveTo.y === 5);
    expect(onRune?.terms.some((t) => t.label.startsWith("Grab rune"))).toBe(true);
  });

  it("shrine survives the share code round-trip", () => {
    const cfg = arena({ x: 3, y: 3 });
    const back = decodeConfig(encodeConfig(cfg));
    expect(back.map.tiles[3 * 8 + 3]).toBe("shrine");
  });

  it("determinism holds with runes in play", () => {
    const a = new Battle(arena({ x: 3, y: 4 }), 7);
    const b = new Battle(arena({ x: 3, y: 4 }), 7);
    a.runToEnd();
    b.runToEnd();
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
  });
});
