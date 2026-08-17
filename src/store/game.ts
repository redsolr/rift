"use client";
import { create } from "zustand";
import { Battle, SimStats, runMany } from "@/sim/battle";
import { Effect, Float, View, applyEvent, initialPlayback, initialView } from "./playback";
export type { Effect, EffectStyle, Float, View, ViewUnit } from "./playback";
import { decodeConfig, defaultConfig, encodeConfig, makeUnit } from "@/sim/presets";
import {
  Action,
  Archetype,
  BattleConfig,
  BattleEvent,
  Doctrine,
  Orders,
  Personality,
  Pos,
  Stats,
  Team,
  Terrain,
  UnitDef,
} from "@/sim/types";

export type Mode = "manual" | "manager" | "editor";
export type Tool = { kind: "select" } | { kind: "terrain"; terrain: Terrain } | { kind: "unit"; team: Team; archetype: Archetype } | { kind: "erase" };

let timer: ReturnType<typeof setTimeout> | null = null;

interface GameState {
  config: BattleConfig;
  mode: Mode;
  playerTeam: Team;
  seed: number;
  battle: Battle | null;
  events: BattleEvent[];
  cursor: number;
  view: View;
  playing: boolean;
  speed: number; // 0.5 .. 4
  floats: Float[];
  effects: Effect[];
  selected: string | null;
  hover: Pos | null;
  hoverUnit: string | null;
  showDanger: boolean;
  /** Camera focus request: where to glide the camera; zoom in/out/keep; seq bumps on every request. */
  camFocus: { x: number; y: number; zoom: "in" | "out" | "keep"; seq: number };
  /** phase banner request: which team's phase just began (or a result), seq bumps per show */
  banner: { kind: "phase" | "victory" | "defeat" | "draw"; team: Team; seq: number };
  followCam: boolean;
  /** viewing angle from horizontal, radians (30°–70°) */
  camTilt: number;
  camZoom: { factor: number; seq: number };
  edgeScroll: boolean;
  // manual
  moveTiles: Pos[];
  pendingMove: Pos | null;
  targets: string[];
  // manager
  phaseLen: number;
  // editor
  tool: Tool;
  painting: boolean;
  simStats: SimStats | null;
  simProgress: number | null;
  shareCode: string | null;

  // lifecycle
  setMode: (m: Mode) => void;
  startBattle: (seed?: number) => void;
  rematch: () => void;
  runOnce: () => void;
  resetToSetup: () => void;
  // playback
  play: () => void;
  pause: () => void;
  step: () => void;
  setSpeed: (s: number) => void;
  // interaction
  clickTile: (p: Pos) => void;
  rightClickTile: (p: Pos) => void;
  clickUnit: (id: string) => void;
  setHover: (p: Pos | null) => void;
  setHoverUnit: (id: string | null) => void;
  toggleDanger: () => void;
  toggleFollow: () => void;
  focusCam: (p: Pos, zoom?: "in" | "out" | "keep") => void;
  overview: () => void;
  setCamTilt: (rad: number) => void;
  zoomCam: (factor: number) => void;
  toggleEdgeScroll: () => void;
  select: (id: string | null) => void;
  cancelPending: () => void;
  commitWait: () => void;
  commitTarget: (id: string) => void;
  endPhaseAI: () => void;
  // manager
  executePhase: () => void;
  setPhaseLen: (n: number) => void;
  setOrders: (id: string, patch: Partial<Orders>) => void;
  setPersonality: (id: string, patch: Partial<Personality>) => void;
  setDoctrine: (team: Team, patch: Partial<Doctrine>) => void;
  // editor
  setTool: (t: Tool) => void;
  setPainting: (b: boolean) => void;
  paintTile: (p: Pos) => void;
  setUnitStats: (id: string, patch: Partial<Stats>) => void;
  setUnitField: (id: string, patch: Partial<Pick<UnitDef, "name" | "team" | "archetype">>) => void;
  moveUnitTo: (id: string, p: Pos) => void;
  removeUnit: (id: string) => void;
  clearMap: () => void;
  resizeMap: (w: number, h: number) => void;
  setMaxTurns: (n: number) => void;
  runSims: (n: number) => void;
  makeShareCode: () => string;
  loadShareCode: (code: string) => boolean;
  loadDefault: () => void;
}

/** True when the renderer has replayed every engine event — the only moment input is accepted. */
export const selectCaughtUp = (s: Pick<GameState, "cursor" | "events">) => s.cursor >= s.events.length;

export const useGame = create<GameState>((set, get) => {
  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  /** Apply the next event to the view. Returns the ms to wait before the next one. */
  /** Apply the next event to the view via the pure playback reducer. Returns the dwell ms, or null when caught up. */
  const applyNext = (): number | null => {
    const s = get();
    if (s.cursor >= s.events.length) return null;
    const r = applyEvent({ view: s.view, floats: s.floats, effects: s.effects }, s.events[s.cursor], s.config, s.playerTeam);
    set({
      view: r.view,
      floats: r.floats,
      effects: r.effects,
      cursor: s.cursor + 1,
      camFocus: r.focus && s.followCam ? { ...r.focus, seq: s.camFocus.seq + 1 } : s.camFocus,
      banner: r.banner ? { ...r.banner, seq: s.banner.seq + 1 } : s.banner,
    });
    return r.ms;
  };

  const schedule = () => {
    stopTimer();
    const s = get();
    if (!s.playing) return;
    const ms = applyNext();
    if (ms === null) {
      set({ playing: false });
      afterCatchUp();
      return;
    }
    timer = setTimeout(schedule, ms / s.speed);
  };

  /** Called when the view has caught up with the engine. Drives AI turns in manual mode. */
  const afterCatchUp = () => {
    const s = get();
    if (!s.battle || s.battle.state.ended) return;
    if (s.mode === "manual" && s.battle.state.activeTeam !== s.playerTeam) {
      s.battle.runPhaseAI();
      sync();
      set({ playing: true });
      schedule();
    }
  };

  const sync = () => {
    const b = get().battle;
    if (b) set({ events: [...b.log] });
  };

  const startPlayback = () => {
    set({ playing: true });
    schedule();
  };

  const clearManual = () => set({ moveTiles: [], pendingMove: null, targets: [] });

  /** Everything that resets when a battle starts, ends or the setup changes. */
  const resetPlayback = (cfg: BattleConfig, battle: Battle | null) => ({
    battle,
    events: battle ? [...battle.log] : [],
    cursor: 0,
    ...initialPlayback(cfg),
    playing: false,
    selected: null,
  });

  /** The one way a manual action reaches the engine: act → sync log → clear selection → play it out. */
  const commit = (action: Action) => {
    const b = get().battle;
    if (!b) return;
    b.act(action);
    sync();
    set({ selected: null });
    clearManual();
    startPlayback();
  };

  return {
    config: defaultConfig(),
    mode: "manager",
    playerTeam: "blue",
    seed: 1,
    battle: null,
    events: [],
    cursor: 0,
    view: initialView(defaultConfig()),
    playing: false,
    speed: 1,
    floats: [],
    effects: [],
    selected: null,
    hover: null,
    hoverUnit: null,
    showDanger: false,
    camFocus: { x: 0, y: 0, zoom: "out", seq: 0 },
    banner: { kind: "phase", team: "blue", seq: 0 },
    followCam: true,
    camTilt: typeof localStorage !== "undefined" && localStorage.getItem("tactician.camTilt") ? Number(localStorage.getItem("tactician.camTilt")) : (45 * Math.PI) / 180,
    camZoom: { factor: 1, seq: 0 },
    edgeScroll: true,
    moveTiles: [],
    pendingMove: null,
    targets: [],
    phaseLen: 3,
    tool: { kind: "select" },
    painting: false,
    simStats: null,
    simProgress: null,
    shareCode: null,

    setMode: (mode) => {
      stopTimer();
      set({ mode, ...resetPlayback(get().config, null), tool: { kind: "select" } });
      clearManual();
    },

    startBattle: (seed) => {
      stopTimer();
      const cfg = get().config;
      const s = seed ?? get().seed;
      const battle = new Battle(cfg, s);
      set({ ...resetPlayback(cfg, battle), seed: s, simStats: null });
      clearManual();
      startPlayback();
    },

    rematch: () => {
      const s = get();
      if (s.mode === "editor") {
        set({ seed: s.seed + 1 });
        get().runOnce();
      } else get().startBattle(s.seed + 1);
    },

    runOnce: () => {
      stopTimer();
      const cfg = get().config;
      const battle = new Battle(cfg, get().seed);
      battle.runToEnd();
      set(resetPlayback(cfg, battle));
      clearManual();
      startPlayback();
    },

    resetToSetup: () => {
      stopTimer();
      set(resetPlayback(get().config, null));
      clearManual();
    },

    play: () => startPlayback(),
    pause: () => {
      stopTimer();
      set({ playing: false });
    },
    step: () => {
      stopTimer();
      set({ playing: false });
      applyNext();
      if (get().cursor >= get().events.length) afterCatchUp();
    },
    setSpeed: (speed) => set({ speed }),

    setHover: (hover) => set({ hover }),
    setHoverUnit: (hoverUnit) => set({ hoverUnit }),
    toggleDanger: () => set({ showDanger: !get().showDanger }),
    toggleFollow: () => set({ followCam: !get().followCam }),
    focusCam: (p, zoom = "keep") => set({ camFocus: { x: p.x, y: p.y, zoom, seq: get().camFocus.seq + 1 } }),
    setCamTilt: (rad) => {
      const t = Math.max((30 * Math.PI) / 180, Math.min((70 * Math.PI) / 180, rad));
      set({ camTilt: t });
      try {
        localStorage.setItem("tactician.camTilt", String(t));
      } catch {
        /* private mode */
      }
    },
    zoomCam: (factor) => set({ camZoom: { factor, seq: get().camZoom.seq + 1 } }),
    toggleEdgeScroll: () => set({ edgeScroll: !get().edgeScroll }),
    overview: () => {
      const m = get().config.map;
      set({ camFocus: { x: (m.width - 1) / 2, y: (m.height - 1) / 2, zoom: "out", seq: get().camFocus.seq + 1 } });
    },
    select: (selected) => {
      if (selected && get().mode === "manual") return get().clickUnit(selected);
      set({ selected });
      clearManual();
    },

    clickUnit: (id) => {
      const s = get();
      if (s.mode === "editor") {
        if (s.tool.kind === "erase") return get().removeUnit(id);
        set({ selected: id, tool: { kind: "select" } });
        return;
      }
      // manual: clicking a target while pending
      if (s.pendingMove && s.targets.includes(id)) return get().commitTarget(id);
      // manual: select own unit that can act
      const b = s.battle;
      if (s.mode === "manual" && b && !b.state.ended && b.state.activeTeam === s.playerTeam && s.cursor >= s.events.length) {
        const u = b.unit(id);
        if (u.team === s.playerTeam && u.alive && !u.acted) {
          set({ selected: id, moveTiles: b.standableFor(id), pendingMove: null, targets: [] });
          if (s.followCam) get().focusCam({ x: u.x, y: u.y }, "keep");
          return;
        }
      }
      set({ selected: id });
      clearManual();
    },

    clickTile: (p) => {
      const s = get();
      if (s.mode === "editor") {
        const t = s.tool;
        if (t.kind === "terrain") return get().paintTile(p);
        if (t.kind === "unit") {
          if (s.config.units.some((u) => u.x === p.x && u.y === p.y)) return;
          const cfg = s.config;
          const u = makeUnit(t.team, t.archetype, p.x, p.y);
          u.id = `${t.team[0]}${t.archetype[0]}${Date.now().toString(36)}`;
          set({ config: { ...cfg, units: [...cfg.units, u] }, view: initialView({ ...cfg, units: [...cfg.units, u] }), selected: u.id });
          return;
        }
        if (t.kind === "select" && s.selected) {
          if (!s.config.units.some((u) => u.x === p.x && u.y === p.y)) get().moveUnitTo(s.selected, p);
          return;
        }
        return;
      }
      if (s.mode === "manual" && s.battle && s.selected && s.moveTiles.length) {
        if (!s.moveTiles.some((m) => m.x === p.x && m.y === p.y)) {
          set({ selected: null });
          clearManual();
          return;
        }
        const targets = s.battle.targetsFrom(s.selected, p).map((u) => u.id);
        if (targets.length === 0) {
          // nothing to do from there — just move (FE would ask "Wait", but that is pure friction)
          commit({ kind: "wait", unit: s.selected, moveTo: p });
          return;
        }
        set({ pendingMove: p, targets });
        return;
      }
      set({ selected: null });
      clearManual();
    },

    rightClickTile: (p) => {
      const s = get();
      if (s.mode !== "manual" || !s.battle || !s.selected) return;
      // enemy on the tile? treat as attack from the pending tile / current tile
      const enemy = s.battle.alive().find((u) => u.x === p.x && u.y === p.y && u.id !== s.selected);
      if (enemy) {
        if (s.pendingMove && s.targets.includes(enemy.id)) return get().commitTarget(enemy.id);
        // find any reachable tile from which the enemy is in range, prefer the current tile
        const u = s.battle.unit(s.selected);
        const from = [{ x: u.x, y: u.y }, ...s.moveTiles].find((t) => s.battle!.targetsFrom(u.id, t).some((x) => x.id === enemy.id));
        if (!from) return;
        set({ pendingMove: from, targets: s.battle.targetsFrom(u.id, from).map((x) => x.id) });
        get().commitTarget(enemy.id);
        return;
      }
      if (s.moveTiles.some((m) => m.x === p.x && m.y === p.y)) get().clickTile(p);
    },
    cancelPending: () => {
      const s = get();
      if (s.selected && s.battle) set({ pendingMove: null, targets: [], moveTiles: s.battle.standableFor(s.selected) });
    },

    commitWait: () => {
      const s = get();
      if (!s.battle || !s.selected) return;
      const u = s.battle.unit(s.selected);
      commit({ kind: "wait", unit: u.id, moveTo: s.pendingMove ?? { x: u.x, y: u.y } });
    },

    commitTarget: (id) => {
      const s = get();
      if (!s.battle || !s.selected || !s.pendingMove) return;
      const u = s.battle.unit(s.selected);
      const kind = u.archetype === "healer" && s.battle.unit(id).team === u.team ? "heal" : "attack";
      commit({ kind, unit: u.id, moveTo: s.pendingMove, target: id });
    },

    endPhaseAI: () => {
      const s = get();
      if (!s.battle) return;
      s.battle.runPhaseAI();
      sync();
      set({ selected: null });
      clearManual();
      startPlayback();
    },

    executePhase: () => {
      const s = get();
      if (!s.battle) return get().startBattle();
      if (s.battle.state.ended) return;
      s.battle.runTurns(s.phaseLen);
      sync();
      startPlayback();
    },
    setPhaseLen: (phaseLen) => set({ phaseLen }),

    setOrders: (id, patch) => {
      const s = get();
      const units = s.config.units.map((u) => (u.id === id ? { ...u, orders: { ...u.orders, ...patch } } : u));
      set({ config: { ...s.config, units } });
      if (s.battle) {
        const bu = s.battle.unit(id);
        bu.orders = { ...bu.orders, ...patch };
      }
    },
    setPersonality: (id, patch) => {
      const s = get();
      const units = s.config.units.map((u) => (u.id === id ? { ...u, personality: { ...u.personality, ...patch } } : u));
      set({ config: { ...s.config, units } });
      if (s.battle) {
        const bu = s.battle.unit(id);
        bu.personality = { ...bu.personality, ...patch };
      }
    },
    setDoctrine: (team, patch) => {
      const s = get();
      const doctrine = { ...s.config.doctrine, [team]: { ...s.config.doctrine[team], ...patch } };
      set({ config: { ...s.config, doctrine } });
      if (s.battle) s.battle.config.doctrine[team] = doctrine[team];
    },

    // ---- editor ----
    setTool: (tool) => set({ tool }),
    setPainting: (painting) => set({ painting }),
    paintTile: (p) => {
      const s = get();
      if (s.tool.kind !== "terrain") return;
      const i = p.y * s.config.map.width + p.x;
      if (s.config.map.tiles[i] === s.tool.terrain) return;
      const tiles = [...s.config.map.tiles];
      tiles[i] = s.tool.terrain;
      set({ config: { ...s.config, map: { ...s.config.map, tiles } } });
    },
    setUnitStats: (id, patch) => {
      const s = get();
      const units = s.config.units.map((u) => (u.id === id ? { ...u, stats: { ...u.stats, ...patch } } : u));
      const config = { ...s.config, units };
      set({ config, view: initialView(config) });
    },
    setUnitField: (id, patch) => {
      const s = get();
      const units = s.config.units.map((u) => (u.id === id ? { ...u, ...patch } : u));
      const config = { ...s.config, units };
      set({ config, view: initialView(config) });
    },
    moveUnitTo: (id, p) => {
      const s = get();
      const units = s.config.units.map((u) => (u.id === id ? { ...u, x: p.x, y: p.y } : u));
      const config = { ...s.config, units };
      set({ config, view: initialView(config) });
    },
    removeUnit: (id) => {
      const s = get();
      const units = s.config.units.filter((u) => u.id !== id).map((u) => (u.orders.protect === id ? { ...u, orders: { ...u.orders, protect: null } } : u));
      const config = { ...s.config, units };
      set({ config, view: initialView(config), selected: s.selected === id ? null : s.selected });
    },
    clearMap: () => {
      const s = get();
      const config = { ...s.config, map: { ...s.config.map, tiles: s.config.map.tiles.map(() => "ground" as Terrain) } };
      set({ config });
    },
    resizeMap: (w, h) => {
      const s = get();
      const old = s.config.map;
      const tiles: Terrain[] = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push(x < old.width && y < old.height ? old.tiles[y * old.width + x] : "ground");
      const units = s.config.units.filter((u) => u.x < w && u.y < h);
      const config = { ...s.config, map: { width: w, height: h, tiles }, units };
      set({ config, view: initialView(config) });
    },
    setMaxTurns: (maxTurns) => set({ config: { ...get().config, maxTurns } }),

    runSims: (n) => {
      const cfg = get().config;
      set({ simProgress: 0, simStats: null });
      const seeds = Array.from({ length: n }, (_, i) => get().seed + i);
      const acc: SimStats = { runs: 0, redWins: 0, blueWins: 0, draws: 0, avgTurns: 0, deaths: {}, survivals: {} };
      let turnsTotal = 0;
      let i = 0;
      const chunk = () => {
        const end = Math.min(n, i + 40);
        const part = runMany(cfg, seeds.slice(i, end));
        acc.runs += part.runs;
        acc.redWins += part.redWins;
        acc.blueWins += part.blueWins;
        acc.draws += part.draws;
        turnsTotal += part.avgTurns * part.runs;
        for (const [k, v] of Object.entries(part.deaths)) acc.deaths[k] = (acc.deaths[k] ?? 0) + v;
        for (const [k, v] of Object.entries(part.survivals)) acc.survivals[k] = (acc.survivals[k] ?? 0) + v;
        i = end;
        acc.avgTurns = acc.runs ? turnsTotal / acc.runs : 0;
        if (i < n) {
          set({ simProgress: i / n, simStats: { ...acc } });
          setTimeout(chunk, 0);
        } else set({ simProgress: null, simStats: { ...acc } });
      };
      setTimeout(chunk, 0);
    },

    makeShareCode: () => {
      const code = encodeConfig(get().config);
      set({ shareCode: code });
      return code;
    },
    loadShareCode: (code) => {
      try {
        const config = decodeConfig(code.trim());
        stopTimer();
        set({ config, ...resetPlayback(config, null), simStats: null });
        clearManual();
        return true;
      } catch {
        return false;
      }
    },
    loadDefault: () => {
      const config = defaultConfig();
      stopTimer();
      set({ config, ...resetPlayback(config, null), simStats: null });
      clearManual();
    },
  };
});
