import { BattleConfig, BattleEvent, Pos, ScoredAction, Team, UnitDef } from "@/sim/types";
import { dist } from "@/sim/grid";

/**
 * Pure event → view reducer. The renderer only ever sees `View`, floats and effects; this
 * file is the single place that decides what an engine event LOOKS like (timing, damage
 * numbers, projectiles, camera focus, banners). No React, no Three, no store — testable.
 */

export interface ViewUnit {
  id: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  /** monotonically increasing per attack/heal so the renderer can trigger a bump */
  actionSeq: number;
  hitSeq: number;
  /** finished its activation this phase (attack/heal/wait seen since the last turn_start) */
  acted: boolean;
}

export interface Float {
  key: number;
  unit: string;
  text: string;
  color: string;
}

export type EffectStyle = "arrow" | "magic" | "melee" | "heal";
export type Effect =
  | { key: number; kind: "projectile"; style: EffectStyle; from: Pos; to: Pos; delay: number }
  | { key: number; kind: "burst"; style: EffectStyle; at: Pos; delay: number };

export interface View {
  units: Record<string, ViewUnit>;
  turn: number;
  activeTeam: Team;
  ended: boolean;
  winner: Team | "draw" | null;
  lastDecision: Record<string, ScoredAction[]>; // unit id -> candidates of its latest decision
}

export type CamFocus = { x: number; y: number; zoom: "in" | "out" | "keep" };
export type Banner = { kind: "phase" | "victory" | "defeat" | "draw"; team: Team };

export interface PlaybackState {
  view: View;
  floats: Float[];
  effects: Effect[];
}

export interface PlaybackResult extends PlaybackState {
  /** how long the renderer should dwell on this event (ms at 1× speed) */
  ms: number;
  focus: CamFocus | null;
  banner: Banner | null;
}

const EVENT_MS: Record<BattleEvent["type"], number> = {
  turn_start: 1300,
  decision: 0,
  move: 0, // computed from path
  attack: 420,
  heal: 380,
  wait: 120,
  death: 300,
  end: 1600,
};

const MAX_FLOATS = 12;
const MAX_EFFECTS = 16;

let floatKey = 0;
let effectKey = 0;

export function initialView(cfg: BattleConfig): View {
  const units: Record<string, ViewUnit> = {};
  for (const u of cfg.units) units[u.id] = { id: u.id, x: u.x, y: u.y, hp: u.stats.hp, alive: true, actionSeq: 0, hitSeq: 0, acted: false };
  return { units, turn: 1, activeTeam: cfg.firstTeam ?? "red", ended: false, winner: null, lastDecision: {} };
}

export function initialPlayback(cfg: BattleConfig): PlaybackState {
  return { view: initialView(cfg), floats: [], effects: [] };
}

export function effectStyleOf(units: UnitDef[], id: string): EffectStyle {
  const a = units.find((u) => u.id === id)?.archetype;
  return a === "archer" ? "arrow" : a === "mage" ? "magic" : a === "healer" ? "heal" : "melee";
}

export function applyEvent(prev: PlaybackState, e: BattleEvent, cfg: BattleConfig, playerTeam: Team): PlaybackResult {
  const v: View = { ...prev.view, units: { ...prev.view.units }, lastDecision: { ...prev.view.lastDecision } };
  const floats = [...prev.floats];
  const effects = [...prev.effects];
  let ms = EVENT_MS[e.type];
  let focus: CamFocus | null = null;
  let banner: Banner | null = null;
  const center = (): CamFocus => ({ x: (cfg.map.width - 1) / 2, y: (cfg.map.height - 1) / 2, zoom: "out" });

  switch (e.type) {
    case "turn_start":
      v.turn = e.turn;
      v.activeTeam = e.team;
      for (const id of Object.keys(v.units)) if (v.units[id].acted) v.units[id] = { ...v.units[id], acted: false };
      banner = { kind: "phase", team: e.team };
      break;
    case "decision":
      v.lastDecision[e.unit] = e.candidates;
      break;
    case "move": {
      const end = e.path[e.path.length - 1];
      v.units[e.unit] = { ...v.units[e.unit], x: end.x, y: end.y };
      ms = 90 * Math.max(1, e.path.length - 1) + 120;
      focus = { x: end.x, y: end.y, zoom: "keep" };
      break;
    }
    case "attack": {
      const a = v.units[e.attacker];
      const t = v.units[e.target];
      focus = { x: (a.x + t.x) / 2, y: (a.y + t.y) / 2, zoom: "keep" };
      v.units[e.attacker] = { ...a, actionSeq: a.actionSeq + 1, acted: true };
      v.units[e.target] = { ...t, hp: e.targetHp, hitSeq: t.hitSeq + 1 };
      floats.push({ key: ++floatKey, unit: e.target, text: `-${e.damage}`, color: "#ff5c5c" });
      const s0 = effectStyleOf(cfg.units, e.attacker);
      const style = s0 === "heal" ? "melee" : s0; // a healer swinging its staff is a melee hit
      const from = { x: a.x, y: a.y };
      const to = { x: t.x, y: t.y };
      const ranged = dist(a, t) > 1 || style === "magic";
      if (style === "magic") effects.push({ key: ++effectKey, kind: "burst", style, at: from, delay: 0 });
      if (ranged) effects.push({ key: ++effectKey, kind: "projectile", style, from, to, delay: style === "magic" ? 0.15 : 0.05 });
      effects.push({ key: ++effectKey, kind: "burst", style, at: to, delay: ranged ? (style === "magic" ? 0.5 : 0.35) : 0.12 });
      if (ranged) ms = style === "magic" ? 800 : 620;
      break;
    }
    case "heal": {
      const h = v.units[e.healer];
      const t = v.units[e.target];
      focus = { x: (h.x + t.x) / 2, y: (h.y + t.y) / 2, zoom: "keep" };
      v.units[e.healer] = { ...h, actionSeq: h.actionSeq + 1, acted: true };
      v.units[e.target] = { ...t, hp: e.targetHp };
      floats.push({ key: ++floatKey, unit: e.target, text: `+${e.amount}`, color: "#6cf58a" });
      effects.push({ key: ++effectKey, kind: "burst", style: "heal", at: { x: h.x, y: h.y }, delay: 0 });
      effects.push({ key: ++effectKey, kind: "burst", style: "heal", at: { x: t.x, y: t.y }, delay: 0.2 });
      break;
    }
    case "death":
      v.units[e.unit] = { ...v.units[e.unit], alive: false };
      break;
    case "end":
      v.ended = true;
      v.winner = e.winner;
      focus = center();
      banner = {
        kind: e.winner === "draw" ? "draw" : e.winner === playerTeam ? "victory" : "defeat",
        team: e.winner === "draw" ? playerTeam : e.winner,
      };
      break;
    case "wait": {
      const w = v.units[e.unit];
      v.units[e.unit] = { ...w, acted: true };
      focus = { x: w.x, y: w.y, zoom: "keep" };
      break;
    }
  }
  return { view: v, floats: floats.slice(-MAX_FLOATS), effects: effects.slice(-MAX_EFFECTS), ms, focus, banner };
}
