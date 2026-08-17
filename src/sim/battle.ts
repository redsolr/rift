import { scoreActions } from "./ai";
import { damage, healAmount } from "./combat";
import { inRange, pathTo, posKey, reachable, standable, tilesInRange, Reach } from "./grid";
import { Rng } from "./rng";
import {
  Action,
  BattleConfig,
  BattleEvent,
  Forecast,
  Pos,
  ScoredAction,
  Team,
  UnitState,
  otherTeam,
} from "./types";

export interface BattleState {
  turn: number;
  activeTeam: Team;
  units: UnitState[];
  ended: boolean;
  winner: Team | "draw" | null;
}

/**
 * The authoritative engine. Mutable, deterministic given (config, seed, action sequence).
 * Manual mode drives it with `act`; manager mode drives it with `aiAct`/`runTurns`;
 * both append to the same event log the renderer replays.
 */
export class Battle {
  readonly config: BattleConfig;
  readonly seed: number;
  readonly rng: Rng;
  readonly log: BattleEvent[] = [];
  state: BattleState;

  constructor(config: BattleConfig, seed: number) {
    this.config = config;
    this.seed = seed;
    this.rng = new Rng(seed);
    const first = config.firstTeam ?? "red";
    this.state = {
      turn: 1,
      activeTeam: first,
      units: config.units.map((u) => ({ ...u, hp: u.stats.hp, alive: true, acted: false })),
      ended: false,
      winner: null,
    };
    this.emit({ type: "turn_start", turn: 1, team: first });
  }

  private emit(e: BattleEvent) {
    this.log.push(e);
  }

  unit(id: string): UnitState {
    const u = this.state.units.find((x) => x.id === id);
    if (!u) throw new Error(`no unit ${id}`);
    return u;
  }

  alive(team?: Team) {
    return this.state.units.filter((u) => u.alive && (!team || u.team === team));
  }

  pending(team = this.state.activeTeam) {
    return this.alive(team).filter((u) => !u.acted);
  }

  // ---- queries for the UI ----

  reachFor(id: string): Reach {
    return reachable(this.config.map, this.unit(id), this.state.units);
  }

  standableFor(id: string): Pos[] {
    return standable(this.reachFor(id), this.unit(id), this.state.units);
  }

  targetsFrom(id: string, at: Pos): UnitState[] {
    const u = this.unit(id);
    const list = u.archetype === "healer" ? this.alive(u.team).filter((a) => a.id !== id && a.hp < a.stats.hp) : this.alive(otherTeam(u.team));
    return list.filter((t) => inRange(at, t, u.stats.rangeMin, u.stats.rangeMax));
  }

  candidates(id: string): ScoredAction[] {
    return scoreActions({ map: this.config.map, units: this.state.units, doctrine: this.config.doctrine, rng: this.rng }, this.unit(id));
  }

  /**
   * Every tile `id` could attack on its next activation: move to any standable tile
   * (or stay), then hit anything within [rangeMin, rangeMax]. Ignores whether a target
   * is actually there — this is the FE "danger zone" primitive.
   */
  threatTiles(id: string): Set<string> {
    const u = this.unit(id);
    if (!u.alive) return new Set();
    const out = new Set<string>();
    for (const o of [...this.standableFor(id), { x: u.x, y: u.y }])
      for (const p of tilesInRange(this.config.map, o, u.stats.rangeMin, u.stats.rangeMax)) out.add(posKey(p));
    return out;
  }

  /** Union of threatTiles for every living unit of `team`. */
  threatZone(team: Team): Set<string> {
    const out = new Set<string>();
    for (const u of this.alive(team)) for (const k of this.threatTiles(u.id)) out.add(k);
    return out;
  }

  /** Living enemies of `id` that could attack the given tile on their next activation. */
  threatsTo(id: string, at?: Pos): UnitState[] {
    const u = this.unit(id);
    const key = posKey(at ?? u);
    return this.alive(otherTeam(u.team)).filter((e) => this.threatTiles(e.id).has(key));
  }

  /**
   * Combat forecast for attacker → defender with the attacker standing on `from`
   * (defaults to its current tile). `retaliation` is what the defender would deal
   * back on ITS turn if it can reach `from` from where it stands (no counterattacks
   * exist in the engine yet — this is a next-turn threat number, labelled as such).
   */
  forecast(attackerId: string, defenderId: string, from?: Pos): Forecast {
    const a = this.unit(attackerId);
    const d = this.unit(defenderId);
    const at = from ?? { x: a.x, y: a.y };
    const map = this.config.map;
    const inRangeNow = inRange(at, d, a.stats.rangeMin, a.stats.rangeMax);
    const dmg = damage(map, a, d);
    const kill = dmg >= d.hp;
    const hpAfter = Math.max(0, d.hp - dmg);
    let retaliation: number | null = null;
    let retaliationKill = false;
    if (!kill && inRange(d, at, d.stats.rangeMin, d.stats.rangeMax)) {
      const probe: UnitState = { ...a, x: at.x, y: at.y };
      retaliation = damage(map, d, probe);
      retaliationKill = retaliation >= a.hp;
    }
    return { attacker: a.id, defender: d.id, from: at, inRange: inRangeNow, damage: dmg, kill, hpAfter, retaliation, retaliationKill };
  }

  // ---- mutations ----

  act(action: Action) {
    if (this.state.ended) throw new Error("battle over");
    const u = this.unit(action.unit);
    if (!u.alive) throw new Error(`${u.id} is dead`);
    if (u.team !== this.state.activeTeam) throw new Error(`not ${u.team}'s turn`);
    if (u.acted) throw new Error(`${u.id} already acted`);
    const reach = this.reachFor(u.id);
    const key = posKey(action.moveTo);
    if (!reach.cost.has(key)) throw new Error(`${u.id} cannot reach ${key}`);
    if (this.state.units.some((o) => o.alive && o.id !== u.id && o.x === action.moveTo.x && o.y === action.moveTo.y))
      throw new Error(`${key} occupied`);

    if (action.moveTo.x !== u.x || action.moveTo.y !== u.y) {
      const path = pathTo(reach, action.moveTo);
      u.x = action.moveTo.x;
      u.y = action.moveTo.y;
      this.emit({ type: "move", unit: u.id, path });
    }

    if (action.kind === "attack") {
      const t = this.unit(action.target);
      if (!t.alive || t.team === u.team) throw new Error("bad target");
      if (!inRange(u, t, u.stats.rangeMin, u.stats.rangeMax)) throw new Error("out of range");
      const dmg = damage(this.config.map, u, t);
      t.hp = Math.max(0, t.hp - dmg);
      const killed = t.hp === 0;
      this.emit({ type: "attack", attacker: u.id, target: t.id, damage: dmg, targetHp: t.hp, killed });
      if (killed) {
        t.alive = false;
        this.emit({ type: "death", unit: t.id });
      }
    } else if (action.kind === "heal") {
      const t = this.unit(action.target);
      if (!t.alive || t.team !== u.team) throw new Error("bad heal target");
      if (!inRange(u, t, u.stats.rangeMin, u.stats.rangeMax)) throw new Error("out of range");
      const amt = Math.min(healAmount(u), t.stats.hp - t.hp);
      t.hp += amt;
      this.emit({ type: "heal", healer: u.id, target: t.id, amount: amt, targetHp: t.hp });
    } else {
      this.emit({ type: "wait", unit: u.id });
    }
    u.acted = true;
    this.checkEnd();
    if (!this.state.ended && this.pending().length === 0) this.endTurn();
  }

  aiAct(id: string) {
    const cands = this.candidates(id);
    if (!cands.length) {
      // boxed in with nothing to do — wait in place
      const u = this.unit(id);
      this.act({ kind: "wait", unit: id, moveTo: { x: u.x, y: u.y } });
      return;
    }
    this.emit({ type: "decision", unit: id, turn: this.state.turn, candidates: cands.slice(0, 6), chosen: 0 });
    this.act(cands[0].action);
  }

  /** Speed order, ties by id — deterministic. */
  nextActor(): UnitState | null {
    const p = this.pending();
    if (!p.length) return null;
    return p.sort((a, b) => b.stats.spd - a.stats.spd || (a.id < b.id ? -1 : 1))[0];
  }

  /** Let the AI play out the rest of the active team's phase. */
  runPhaseAI() {
    const team = this.state.activeTeam;
    while (!this.state.ended && this.state.activeTeam === team) {
      const u = this.nextActor();
      if (!u) {
        this.endTurn();
        break;
      }
      this.aiAct(u.id);
    }
  }

  /** Run n full rounds (red + blue) with AI on both sides. */
  runTurns(n: number) {
    const target = this.state.turn + n;
    while (!this.state.ended && this.state.turn < target) this.runPhaseAI();
  }

  runToEnd() {
    while (!this.state.ended) this.runPhaseAI();
  }

  endTurn() {
    if (this.state.ended) return;
    for (const u of this.state.units) u.acted = false;
    if (this.state.activeTeam !== (this.config.firstTeam ?? "red")) this.state.turn++;
    this.state.activeTeam = otherTeam(this.state.activeTeam);
    if (this.state.turn > this.config.maxTurns) {
      this.finish("draw");
      return;
    }
    this.emit({ type: "turn_start", turn: this.state.turn, team: this.state.activeTeam });
  }

  private checkEnd() {
    const red = this.alive("red").length;
    const blue = this.alive("blue").length;
    if (red === 0 && blue === 0) this.finish("draw");
    else if (red === 0) this.finish("blue");
    else if (blue === 0) this.finish("red");
  }

  private finish(winner: Team | "draw") {
    this.state.ended = true;
    this.state.winner = winner;
    this.emit({ type: "end", winner, turn: this.state.turn });
  }
}

export interface SimStats {
  runs: number;
  redWins: number;
  blueWins: number;
  draws: number;
  avgTurns: number;
  deaths: Record<string, number>;
  survivals: Record<string, number>;
}

/** Headless batch runner. Same config + same seeds → identical stats, always. */
export function runMany(config: BattleConfig, seeds: number[]): SimStats {
  const s: SimStats = { runs: 0, redWins: 0, blueWins: 0, draws: 0, avgTurns: 0, deaths: {}, survivals: {} };
  let turns = 0;
  for (const seed of seeds) {
    const b = new Battle(config, seed);
    b.runToEnd();
    s.runs++;
    if (b.state.winner === "red") s.redWins++;
    else if (b.state.winner === "blue") s.blueWins++;
    else s.draws++;
    turns += b.state.turn;
    for (const u of b.state.units) {
      const k = `${u.name} (${u.team})`;
      if (u.alive) s.survivals[k] = (s.survivals[k] ?? 0) + 1;
      else s.deaths[k] = (s.deaths[k] ?? 0) + 1;
    }
  }
  s.avgTurns = s.runs ? turns / s.runs : 0;
  return s;
}
