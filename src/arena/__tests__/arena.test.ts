import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/sim/presets";
import { Battle } from "@/sim/battle";
import { BOTS } from "../bots";
import { MAX_UNITS, arenaDeployTiles, buildLegConfig, lineupError, lineupFromConfig, normalizeLineup, teamOf } from "../lineup";
import { ELO_K, ELO_START, elo, resolveMatch, runLeg } from "../match";

const skirmishLineup = () => lineupFromConfig(defaultConfig(), "blue");

describe("lineup", () => {
  it("lifts the player's side out of the default skirmish and it is legal", () => {
    const l = skirmishLineup();
    expect(l.units).toHaveLength(5);
    expect(lineupError(l)).toBeNull();
    // gear-off: no stats travel with a lineup
    expect(Object.keys(l.units[0])).not.toContain("stats");
  });

  it("every house bot is legal", () => {
    for (const b of BOTS) expect(lineupError(b.lineup), b.handle).toBeNull();
  });

  it("refuses units outside the deploy zone, stacked units, empty and oversized lineups", () => {
    const l = skirmishLineup();
    expect(lineupError({ ...l, units: [] })).toMatch(/at least one/);
    expect(lineupError({ ...l, units: Array(MAX_UNITS + 1).fill(l.units[0]) })).toMatch(/At most/);
    expect(lineupError({ ...l, units: [{ ...l.units[0], y: 3 }] })).toMatch(/outside the deploy zone/);
    expect(lineupError({ ...l, units: [l.units[0], { ...l.units[1], x: l.units[0].x, y: l.units[0].y }] })).toMatch(/share tile/);
    // the zone is the four near rows, passable only
    const tiles = arenaDeployTiles();
    expect(tiles.every((t) => t.y >= 8 && t.y <= 11)).toBe(true);
  });

  it("normalizes hostile input: bad enums fall back, numbers clamp, protect only points at a lineup id", () => {
    const n = normalizeLineup({
      units: [
        { archetype: "dragon", name: "   ", x: -4, y: 999, orders: { stance: "nope", retreatHpPct: 500, protect: "u1" }, personality: { aggression: 9001 } },
        { archetype: "healer", name: "A very very very long name indeed", x: 1, y: 1, orders: { protect: "u1" } },
      ],
      doctrine: { aggression: "berserk", objective: "protect" },
    });
    expect(n.units[0].archetype).toBe("fighter");
    expect(n.units[0].name).toBe("Fighter");
    expect(n.units[0].x).toBe(0);
    expect(n.units[0].y).toBe(99);
    expect(n.units[0].orders.stance).toBe("advance");
    expect(n.units[0].orders.retreatHpPct).toBe(100);
    expect(n.units[0].orders.protect).toBe("u1");
    expect(n.units[0].personality.aggression).toBe(100);
    expect(n.units[1].name.length).toBeLessThanOrEqual(16);
    expect(n.units[1].orders.protect).toBeNull(); // cannot protect itself
    expect(n.doctrine).toEqual({ aggression: "balanced", objective: "protect" });
  });

  it("builds mirror legs: A is blue-first in leg 1 and red-mirrored in leg 2, protect orders re-pointed", () => {
    const a = skirmishLineup();
    a.units[1].orders.protect = "u0";
    const b = BOTS[0].lineup;
    const leg1 = buildLegConfig(a, b, 1);
    const leg2 = buildLegConfig(a, b, 2);
    expect(leg1.firstTeam).toBe("blue");
    expect(teamOf("a", 1)).toBe("blue");
    expect(teamOf("a", 2)).toBe("red");
    const a1 = leg1.units.filter((u) => u.team === "blue");
    const a2 = leg2.units.filter((u) => u.team === "red");
    expect(a1.map((u) => u.name)).toEqual(a2.map((u) => u.name));
    // point mirror across the 16×12 board
    a1.forEach((u, i) => {
      expect(a2[i].x).toBe(15 - u.x);
      expect(a2[i].y).toBe(11 - u.y);
    });
    expect(a1[1].orders.protect).toBe("blueu0");
    expect(a2[1].orders.protect).toBe("redu0");
    // no id collisions between the two sides
    expect(new Set(leg1.units.map((u) => u.id)).size).toBe(leg1.units.length);
    // both legs are playable to the end
    for (const c of [leg1, leg2]) {
      const bt = new Battle(c, 7);
      bt.runToEnd();
      expect(bt.state.ended).toBe(true);
    }
  });
});

describe("match", () => {
  it("is deterministic and symmetric: swapping the sides swaps the result", () => {
    const a = skirmishLineup();
    const b = BOTS[2].lineup;
    const r1 = resolveMatch(a, b, 42);
    const r2 = resolveMatch(a, b, 42);
    expect(r2).toEqual(r1);
    const swapped = resolveMatch(b, a, 42);
    const flip = (w: string) => (w === "a" ? "b" : w === "b" ? "a" : "draw");
    expect(swapped.winner).toBe(flip(r1.winner));
    expect(swapped.score).toEqual({ a: r1.score.b, b: r1.score.a });
    expect(swapped.legs[0].hpPct).toEqual({ a: r1.legs[1].hpPct.b, b: r1.legs[1].hpPct.a });
  });

  it("a lineup against itself is a draw", () => {
    const a = skirmishLineup();
    const r = resolveMatch(a, a, 3);
    expect(r.winner).toBe("draw");
    expect(r.legs[0].side).toBe(r.legs[1].side === "a" ? "b" : r.legs[1].side === "b" ? "a" : "draw");
  });

  it("legs report turns and hp% within range", () => {
    const l = runLeg(BOTS[0].lineup, BOTS[1].lineup, 1, 11);
    expect(l.turns).toBeGreaterThan(0);
    for (const s of ["a", "b"] as const) {
      expect(l.hpPct[s]).toBeGreaterThanOrEqual(0);
      expect(l.hpPct[s]).toBeLessThanOrEqual(100);
    }
  });
});

describe("elo", () => {
  it("equal ratings: winner +16, loser −16, draw 0", () => {
    expect(elo(ELO_START, ELO_START, "a")).toEqual({ a: ELO_START + ELO_K / 2, b: ELO_START - ELO_K / 2, delta: ELO_K / 2 });
    expect(elo(ELO_START, ELO_START, "b").delta).toBe(-ELO_K / 2);
    expect(elo(ELO_START, ELO_START, "draw").delta).toBe(0);
  });
  it("an upset moves more than a favourite's win, and the pool is conserved", () => {
    const upset = elo(800, 1200, "a");
    const expected = elo(1200, 800, "a");
    expect(upset.delta).toBeGreaterThan(expected.delta);
    expect(upset.a + upset.b).toBe(2000);
  });
});
