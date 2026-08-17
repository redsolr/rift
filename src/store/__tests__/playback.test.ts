import { describe, expect, it } from "vitest";
import { Battle } from "@/sim/battle";
import { defaultConfig } from "@/sim/presets";
import { applyEvent, initialPlayback } from "../playback";

describe("playback reducer", () => {
  it("replaying every event reproduces the engine's final positions and HP", () => {
    const cfg = defaultConfig();
    const b = new Battle(cfg, 3);
    b.runToEnd();
    let st = initialPlayback(cfg);
    for (const e of b.log) st = applyEvent(st, e, cfg, "blue");
    for (const u of b.state.units) {
      const v = st.view.units[u.id];
      expect([v.x, v.y, v.hp, v.alive]).toEqual([u.x, u.y, u.hp, u.alive]);
    }
    expect(st.view.ended).toBe(true);
    expect(st.view.winner).toBe(b.state.winner);
  });

  it("attack produces a damage float, hit/action seqs, and a projectile only when ranged", () => {
    const cfg = defaultConfig();
    const b = new Battle(cfg, 3);
    b.runToEnd();
    let st = initialPlayback(cfg);
    let sawRanged = false,
      sawMelee = false;
    for (const e of b.log) {
      const before = st;
      st = applyEvent(st, e, cfg, "blue");
      if (e.type !== "attack") continue;
      expect(st.floats.at(-1)).toMatchObject({ unit: e.target, text: `-${e.damage}` });
      expect(st.view.units[e.target].hitSeq).toBe(before.view.units[e.target].hitSeq + 1);
      expect(st.view.units[e.attacker].actionSeq).toBe(before.view.units[e.attacker].actionSeq + 1);
      const arch = cfg.units.find((u) => u.id === e.attacker)!.archetype;
      const proj = st.effects.some((f) => f.kind === "projectile" && f.to.x === before.view.units[e.target].x && f.to.y === before.view.units[e.target].y);
      if (arch === "archer" || arch === "mage") {
        expect(proj).toBe(true);
        sawRanged = true;
      } else {
        sawMelee = true;
      }
    }
    expect(sawRanged && sawMelee).toBe(true);
  });

  it("phase starts request a banner for that team; the end requests victory/defeat relative to the player", () => {
    const cfg = defaultConfig();
    const b = new Battle(cfg, 5);
    b.runToEnd();
    let st = initialPlayback(cfg);
    const first = applyEvent(st, b.log[0], cfg, "blue");
    expect(first.banner).toEqual({ kind: "phase", team: cfg.firstTeam ?? "red" });
    for (const e of b.log) st = applyEvent(st, e, cfg, "blue");
    const last = applyEvent(initialPlayback(cfg), b.log.at(-1)!, cfg, "blue");
    const w = b.state.winner;
    expect(last.banner?.kind).toBe(w === "draw" ? "draw" : w === "blue" ? "victory" : "defeat");
    expect(last.focus?.zoom).toBe("out");
  });
});
