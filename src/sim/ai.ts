import { AttackDef, AttackKind, attacksReaching } from "./attacks";
import { damage, defenseAt, healAmount } from "./combat";
import { dist, reachable, standable, threatCount } from "./grid";
import { Rng } from "./rng";
import {
  Action,
  Doctrine,
  DoctrineAggression,
  MapDef,
  Pos,
  ScoreTerm,
  ScoredAction,
  Team,
  UnitState,
} from "./types";

/**
 * Utility AI. Every candidate action gets a list of named terms; the sum is its score.
 * Personality, orders and doctrine only ever add/scale terms — there is no per-archetype
 * hardcoded behaviour, so every decision is explainable from the term list alone.
 */

const DOCTRINE_ATTACK: Record<DoctrineAggression, number> = {
  very_defensive: -35,
  defensive: -15,
  balanced: 0,
  aggressive: 15,
  all_out: 35,
};

export interface AiContext {
  map: MapDef;
  units: UnitState[];
  doctrine: Record<Team, Doctrine>;
  rng: Rng;
}

const objectiveTiles = (map: MapDef): Pos[] => {
  const out: Pos[] = [];
  map.tiles.forEach((t, i) => {
    if (t === "objective") out.push({ x: i % map.width, y: Math.floor(i / map.width) });
  });
  return out;
};

const nearest = (from: Pos, list: Pos[]): { p: Pos; d: number } | null => {
  let best: { p: Pos; d: number } | null = null;
  for (const p of list) {
    const d = dist(from, p);
    if (!best || d < best.d) best = { p, d };
  }
  return best;
};

export function scoreActions(ctx: AiContext, unit: UnitState): ScoredAction[] {
  const { map, units, rng } = ctx;
  const doctrine = ctx.doctrine[unit.team];
  const enemies = units.filter((u) => u.alive && u.team !== unit.team);
  const allies = units.filter((u) => u.alive && u.team === unit.team && u.id !== unit.id);
  const p = unit.personality;
  const o = unit.orders;
  const adh = 0.4 + (0.6 * p.discipline) / 100; // order adherence
  const thinks = p.intelligence >= 35; // considers exposure at all
  const clever = p.intelligence >= 70; // focus fire / overkill awareness
  const start: Pos = { x: unit.x, y: unit.y };
  const hpPct = (unit.hp / unit.stats.hp) * 100;
  const retreating = hpPct < o.retreatHpPct;
  const protectee = o.protect ? units.find((u) => u.id === o.protect && u.alive) ?? null : null;
  const objectives = objectiveTiles(map);
  const jitterR = Math.round((15 * (100 - p.discipline)) / 100);

  const reach = reachable(map, unit, units);
  const tiles = standable(reach, unit, units);
  const out: ScoredAction[] = [];

  const positional = (t: Pos, terms: ScoreTerm[]) => {
    const moved = reach.cost.get(`${t.x},${t.y}`) ?? 0;
    const threats = threatCount(t, enemies);
    const terrDef = defenseAt(map, unit, t) - unit.stats.def;
    if (thinks && threats > 0) {
      const fear = (100 - p.courage) / 100;
      const doct = doctrine.aggression === "very_defensive" ? 1.4 : doctrine.aggression === "defensive" ? 1.2 : doctrine.aggression === "all_out" ? 0.6 : 1;
      terms.push({ label: `Exposure (${threats} threats)`, value: -Math.round(12 * threats * (0.4 + fear) * doct) });
      if (terrDef > 0) terms.push({ label: "Cover", value: 6 * terrDef });
    }
    if (o.stance === "hold") terms.push({ label: "Hold position", value: -Math.round(8 * moved * adh) });
    if (protectee) {
      const d = dist(t, protectee);
      terms.push({ label: `Protect ${protectee.name}`, value: -Math.round((6 * d - 12) * adh * (0.5 + p.loyalty / 100)) });
    }
    if (doctrine.objective === "capture" && objectives.length) {
      const n = nearest(t, objectives)!;
      terms.push({ label: "Capture objective", value: 30 - 5 * n.d });
    }
    if (doctrine.objective === "hold" && objectives.length) {
      const n = nearest(t, objectives)!;
      terms.push({ label: "Hold objective", value: 20 - 4 * n.d });
    }
    if (retreating) {
      const n = nearest(t, enemies);
      if (n) terms.push({ label: `Retreat (<${o.retreatHpPct}% HP)`, value: Math.round((25 + 6 * n.d) * adh) });
    }
  };

  /** Best usable attack from tile `t` against `target` by raw value (damage or heal); ties → table order. */
  const pick = (t: Pos, target: UnitState, kind: AttackKind, value: (a: AttackDef) => number): { attack: AttackDef; value: number } | null => {
    const moved = t.x !== start.x || t.y !== start.y;
    let best: { attack: AttackDef; value: number } | null = null;
    for (const a of attacksReaching(unit, t, moved, target)) {
      if (a.kind !== kind) continue;
      const v = value(a);
      if (!best || v > best.value) best = { attack: a, value: v };
    }
    return best;
  };

  for (const t of tiles) {
    // ---- attacks ----
    for (const e of enemies) {
      const choice = pick(t, e, "attack", (a) => damage(map, unit, e, a));
      if (!choice) continue;
      const dmg = choice.value;
      const kill = dmg >= e.hp;
      const terms: ScoreTerm[] = [];
      terms.push({ label: `Damage (${choice.attack.name})`, value: Math.min(45, dmg * 3) });
      if (kill) terms.push({ label: "Kill", value: 70 + Math.round(p.aggression / 4) });
      terms.push({ label: "Aggression", value: Math.round(p.aggression / 5) });
      terms.push({ label: `Doctrine: ${doctrine.aggression.replace("_", " ")}`, value: DOCTRINE_ATTACK[doctrine.aggression] });
      // target preference
      let pref = false;
      switch (o.targetPref) {
        case "weakest": pref = e.hp === Math.min(...enemies.map((x) => x.hp)); break;
        case "wounded": pref = e.hp < e.stats.hp * 0.5; break;
        case "ranged": pref = e.stats.rangeMax > 1; break;
        case "healers": pref = e.archetype === "healer"; break;
        case "nearest": pref = dist(start, e) === Math.min(...enemies.map((x) => dist(start, x))); break;
      }
      if (pref) terms.push({ label: `Target pref: ${o.targetPref}`, value: Math.round(30 * adh) });
      if (o.avoidArmored && e.stats.def >= 5) terms.push({ label: "Avoid armored", value: -Math.round(40 * adh) });
      if (clever && e.hp < e.stats.hp && !kill) terms.push({ label: "Focus fire", value: 12 });
      if (clever && kill && dmg > e.hp * 2) terms.push({ label: "Overkill", value: -8 });
      const chase = dist(t, start) >= 2 && e.hp < e.stats.hp * 0.4;
      if (chase && o.noPursue) terms.push({ label: "Do not pursue", value: -Math.round(50 * adh) });
      if (chase && !o.noPursue) terms.push({ label: "Pursue wounded", value: Math.round(p.aggression / 4) });
      if (retreating) terms.push({ label: "Retreating", value: -Math.round(45 * adh) });
      // counter-attack risk: a target that can hit back from where it stands (its best attack)
      const counterDmg = attacksReaching(e, e, false, t).reduce((m, a) => (a.kind === "attack" ? Math.max(m, damage(map, e, unit, a)) : m), 0);
      if (counterDmg > 0 && thinks) terms.push({ label: "Counter risk", value: -Math.round(counterDmg * 1.5 * ((100 - p.courage) / 100 + 0.3)) });
      positional(t, terms);
      const action: Action = { kind: "attack", unit: unit.id, moveTo: t, target: e.id, attack: choice.attack.id };
      out.push({ action, label: `${choice.attack.name} → ${e.name}${kill ? " (kill)" : ""}`, score: 0, terms });
    }
    // ---- heals (any unit that owns a heal-kind attack) ----
    {
      for (const a of allies) {
        if (a.hp >= a.stats.hp) continue;
        const missing = a.stats.hp - a.hp;
        const choice = pick(t, a, "heal", (x) => Math.min(missing, healAmount(unit, x)));
        if (!choice) continue;
        const amt = choice.value;
        const terms: ScoreTerm[] = [];
        terms.push({ label: `Heal amount (${choice.attack.name})`, value: Math.min(50, amt * 4) });
        if (a.hp < a.stats.hp * 0.35) terms.push({ label: "Ally critical", value: 40 });
        terms.push({ label: "Loyalty", value: Math.round(p.loyalty / 4) });
        if (protectee && a.id === protectee.id) terms.push({ label: "Protectee", value: 25 });
        positional(t, terms);
        const action: Action = { kind: "heal", unit: unit.id, moveTo: t, target: a.id, attack: choice.attack.id };
        out.push({ action, label: `${choice.attack.name} → ${a.name}`, score: 0, terms });
      }
    }
    // ---- move / wait ----
    {
      const terms: ScoreTerm[] = [];
      const ne = nearest(t, enemies);
      const dStart = nearest(start, enemies);
      if (ne && dStart) {
        const closer = dStart.d - ne.d;
        if (o.stance === "advance") terms.push({ label: "Advance", value: Math.round((5 * closer + 5) * adh) });
        if (o.stance === "pursue") terms.push({ label: "Pursue", value: Math.round((8 * closer + 5) * adh) });
        if (doctrine.objective === "advance") terms.push({ label: "Doctrine: advance", value: 4 * closer });
        if (doctrine.aggression === "all_out" || doctrine.aggression === "aggressive")
          terms.push({ label: "Doctrine: press", value: 3 * closer });
        // ranged/healer keep distance
        if (unit.stats.rangeMax > 1 && ne.d < unit.stats.rangeMin) terms.push({ label: "Too close", value: -20 });
      }
      if (unit.archetype === "healer" && allies.length) {
        const na = nearest(t, allies)!;
        terms.push({ label: "Stay with allies", value: -4 * na.d });
      }
      terms.push({ label: "Aggression (idle)", value: -Math.round(p.aggression / 8) });
      positional(t, terms);
      const action: Action = { kind: "wait", unit: unit.id, moveTo: t };
      const label = t.x === start.x && t.y === start.y ? "Wait" : `Move to ${t.x},${t.y}`;
      out.push({ action, label, score: 0, terms });
    }
  }

  for (const c of out) {
    const j = rng.jitter(jitterR);
    if (j !== 0) c.terms.push({ label: "Whim", value: j });
    c.score = c.terms.reduce((s, t) => s + t.value, 0);
  }
  // stable sort desc — ties resolve by generation order (deterministic)
  return out.map((c, i) => ({ c, i })).sort((a, b) => b.c.score - a.c.score || a.i - b.i).map((x) => x.c);
}
