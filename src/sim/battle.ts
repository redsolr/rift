import { scoreActions } from "./ai";
import { AttackDef, AttackKind, attackById, attackRange, attacksOf, attacksReaching, attackUsable, inAnyRange, tilesInAnyRange } from "./attacks";
import { damage, healAmount } from "./combat";
import { inRange, pathTo, posKey, reachable, standable, Reach } from "./grid";
import { Rng } from "./rng";
import { RESPAWN_TURNS, RUNES, RuneKind, isInvisible, pickRune } from "./runes";
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
  /** runes lying on shrine tiles, keyed by posKey */
  runes: Map<string, RuneKind>;
  /** shrine posKey → turn on which it spawns again (after a pickup) */
  respawnAt: Map<string, number>;
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
      units: config.units.map((u) => ({ ...u, hp: u.stats.hp, alive: true, acted: false, buff: null })),
      ended: false,
      winner: null,
      runes: new Map(),
      respawnAt: new Map(),
    };
    // runes are on the board from frame zero — spawn BEFORE the opening phase banner
    for (const p of this.shrines()) this.spawnRune(p);
    this.emit({ type: "turn_start", turn: 1, team: first });
  }

  /** Every shrine tile on the map, row-major (deterministic order). */
  shrines(): Pos[] {
    const out: Pos[] = [];
    const m = this.config.map;
    m.tiles.forEach((t, i) => {
      if (t === "shrine") out.push({ x: i % m.width, y: Math.floor(i / m.width) });
    });
    return out;
  }

  private spawnRune(p: Pos) {
    const rune = pickRune(this.rng);
    this.state.runes.set(posKey(p), rune);
    this.state.respawnAt.delete(posKey(p));
    this.emit({ type: "rune_spawn", rune, at: p });
  }

  /** Rune lying on `p`, if any. */
  runeAt(p: Pos): RuneKind | null {
    return this.state.runes.get(posKey(p)) ?? null;
  }

  /** Picks up the rune under `u` (if any); returns the kind taken. */
  private pickup(u: UnitState): RuneKind | null {
    const key = posKey(u);
    const rune = this.state.runes.get(key);
    if (!rune) return null;
    this.state.runes.delete(key);
    this.state.respawnAt.set(key, this.state.turn + RESPAWN_TURNS);
    if (u.buff) this.emit({ type: "rune_expire", unit: u.id, rune: u.buff.kind });
    u.buff = { kind: rune, turns: RUNES[rune].turns };
    this.emit({ type: "rune_pickup", unit: u.id, rune, at: { x: u.x, y: u.y }, turns: RUNES[rune].turns });
    return rune;
  }

  private expire(u: UnitState) {
    if (!u.buff) return;
    const kind = u.buff.kind;
    u.buff = null;
    this.emit({ type: "rune_expire", unit: u.id, rune: kind });
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

  /** Who an attack of `kind` may target: enemies for damage, wounded allies for heals. */
  private targetPool(u: UnitState, kind: AttackKind): UnitState[] {
    return kind === "heal" ? this.alive(u.team).filter((a) => a.id !== u.id && a.hp < a.stats.hp) : this.alive(otherTeam(u.team)).filter((e) => !isInvisible(e));
  }

  /**
   * Legal targets from `at`. With `attackId`: only that attack (movement condition applied).
   * With `kind`: any usable attack of that kind. With neither: any usable attack of either kind.
   */
  targetsFrom(id: string, at: Pos, attackId?: string, kind?: AttackKind): UnitState[] {
    const u = this.unit(id);
    const moved = at.x !== u.x || at.y !== u.y;
    if (attackId) {
      const a = attackById(u, attackId);
      if (!attackUsable(a, moved)) return [];
      const [lo, hi] = attackRange(u, a);
      return this.targetPool(u, a.kind).filter((t) => inRange(at, t, lo, hi));
    }
    const kinds: AttackKind[] = kind ? [kind] : ["attack", "heal"];
    const out: UnitState[] = [];
    for (const k of kinds)
      for (const t of this.targetPool(u, k)) if (attacksReaching(u, at, moved, t).some((a) => a.kind === k)) out.push(t);
    return out;
  }

  /** The unit's attacks (optionally one kind) with, for standing on `at`, whether each is usable and which targets it reaches. */
  attackOptions(id: string, at: Pos, kind?: AttackKind): { attack: AttackDef; usable: boolean; targets: string[] }[] {
    const u = this.unit(id);
    const moved = at.x !== u.x || at.y !== u.y;
    return attacksOf(u)
      .filter((a) => !kind || a.kind === kind)
      .map((attack) => ({ attack, usable: attackUsable(attack, moved), targets: this.targetsFrom(id, at, attack.id).map((t) => t.id) }));
  }

  /**
   * Best usable attack for `id` standing on `from` against `target`: highest damage
   * (or heal), ties → table order. null when nothing usable reaches. This is what the AI
   * and the one-click (right-click) order use.
   */
  bestAttack(id: string, from: Pos, targetId: string): AttackDef | null {
    const u = this.unit(id);
    const t = this.unit(targetId);
    const moved = from.x !== u.x || from.y !== u.y;
    const kind: AttackKind = t.team === u.team ? "heal" : "attack";
    let best: AttackDef | null = null;
    let bestVal = -1;
    for (const a of attacksReaching(u, from, moved, t).filter((x) => x.kind === kind)) {
      const v = kind === "heal" ? healAmount(u, a) : damage(this.config.map, u, t, a);
      if (v > bestVal) {
        best = a;
        bestVal = v;
      }
    }
    return best;
  }

  candidates(id: string): ScoredAction[] {
    return scoreActions({ map: this.config.map, units: this.state.units, doctrine: this.config.doctrine, rng: this.rng, runes: this.state.runes }, this.unit(id));
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
      for (const p of tilesInAnyRange(this.config.map, u, o)) out.add(posKey(p));
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
  forecast(attackerId: string, defenderId: string, from?: Pos, attackId?: string): Forecast {
    const a = this.unit(attackerId);
    const d = this.unit(defenderId);
    const at = from ?? { x: a.x, y: a.y };
    const map = this.config.map;
    const moved = at.x !== a.x || at.y !== a.y;
    // the attack: the one asked for, else the best usable one that reaches, else the unit's first
    const chosen = attackId ? attackById(a, attackId) : this.bestAttack(attackerId, at, defenderId);
    const atk = chosen ?? attacksOf(a).find((x) => x.kind === "attack") ?? attacksOf(a)[0];
    const [lo, hi] = attackRange(a, atk);
    const inRangeNow = attackUsable(atk, moved) && inRange(at, d, lo, hi);
    const dmg = damage(map, a, d, atk);
    const kill = dmg >= d.hp;
    const hpAfter = Math.max(0, d.hp - dmg);
    let retaliation: number | null = null;
    let retaliationKill = false;
    if (!kill && inAnyRange(d, d, at)) {
      const probe: UnitState = { ...a, x: at.x, y: at.y };
      // the defender answers on ITS turn from where it stands — its best stationary-legal attack
      let best = 0;
      for (const da of attacksReaching(d, d, false, at)) if (da.kind === "attack") best = Math.max(best, damage(map, d, probe, da));
      if (best > 0) {
        retaliation = best;
        retaliationKill = retaliation >= a.hp;
      }
    }
    return { attacker: a.id, defender: d.id, from: at, attack: chosen ? { id: chosen.id, name: chosen.name } : null, inRange: inRangeNow, damage: dmg, kill, hpAfter, retaliation, retaliationKill };
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

    const moved = action.moveTo.x !== u.x || action.moveTo.y !== u.y;

    // Validate the whole action BEFORE mutating anything — a rejected attack must not leave the unit displaced.
    let resolved: { t: UnitState; atk: AttackDef } | null = null;
    if (action.kind !== "wait") {
      const t = this.unit(action.target);
      if (action.kind === "attack" && (!t.alive || t.team === u.team)) throw new Error("bad target");
      if (action.kind === "attack" && isInvisible(t)) throw new Error(`${t.name} is invisible`);
      if (action.kind === "heal" && (!t.alive || t.team !== u.team)) throw new Error("bad heal target");
      const atk = attackById(u, action.attack);
      if (atk.kind !== action.kind) throw new Error(`${atk.name} is a ${atk.kind}, not a ${action.kind}`);
      if (!attackUsable(atk, moved)) throw new Error(`${atk.name} needs ${atk.cond === "moved" ? "a move first" : "to stand still"}`);
      if (!inRange(action.moveTo, t, ...attackRange(u, atk))) throw new Error("out of range");
      resolved = { t, atk };
    }

    if (moved) {
      const path = pathTo(reach, action.moveTo);
      u.x = action.moveTo.x;
      u.y = action.moveTo.y;
      this.emit({ type: "move", unit: u.id, path });
    }
    // standing on a rune (moved onto it, or acting from a shrine that just spawned one) picks it up
    const picked = this.pickup(u);
    // attacking or healing breaks invisibility (Dota rule)
    if (action.kind !== "wait" && isInvisible(u)) this.expire(u);

    if (action.kind === "attack" && resolved) {
      const { t, atk } = resolved;
      const dmg = damage(this.config.map, u, t, atk);
      t.hp = Math.max(0, t.hp - dmg);
      const killed = t.hp === 0;
      this.emit({ type: "attack", attacker: u.id, target: t.id, attack: atk.name, damage: dmg, targetHp: t.hp, killed });
      if (killed) {
        t.alive = false;
        this.emit({ type: "death", unit: t.id });
      }
    } else if (action.kind === "heal" && resolved) {
      const { t, atk } = resolved;
      const amt = Math.min(healAmount(u, atk), t.stats.hp - t.hp);
      t.hp += amt;
      this.emit({ type: "heal", healer: u.id, target: t.id, attack: atk.name, amount: amt, targetHp: t.hp });
    } else {
      this.emit({ type: "wait", unit: u.id });
    }
    u.acted = true;
    // Haste: the unit acts AGAIN right away (FE Galeforce read) on top of the +MOV for the buff's duration
    if (picked === "haste" && u.alive) {
      u.acted = false;
      this.emit({ type: "refresh", unit: u.id });
    }
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
    // buffs count down at the start of the owner's phase; 0 → gone
    for (const u of this.alive(this.state.activeTeam)) {
      if (!u.buff) continue;
      u.buff.turns--;
      if (u.buff.turns <= 0) this.expire(u);
    }
    // shrines respawn on the turn they were scheduled for (once per round, on the first team's phase)
    if (this.state.activeTeam === (this.config.firstTeam ?? "red"))
      for (const p of this.shrines()) {
        const k = posKey(p);
        const at = this.state.respawnAt.get(k);
        if (at !== undefined && this.state.turn >= at && !this.state.runes.has(k)) this.spawnRune(p);
      }
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
