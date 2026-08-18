"use client";
import { create } from "zustand";
import { Battle, SimStats, runMany } from "@/sim/battle";
import { Effect, Float, View, applyEvent, initialPlayback, initialView } from "./playback";
import { usePerf } from "@/components/perf/store";
import { pitConfig } from "@/sim/pit";
export type { Effect, EffectStyle, Float, View, ViewUnit } from "./playback";
import { DEFAULT_DOCTRINE, decodeConfig, defaultConfig, emptyMap, encodeConfig, makeUnit } from "@/sim/presets";
import { AttackKind } from "@/sim/attacks";
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
  TERRAIN,
  UnitDef,
} from "@/sim/types";
import { idx, inBounds, terrainAt } from "@/sim/grid";

export type Mode = "manual" | "manager" | "editor";
/** Board dressing: "scene" = textured city map (grid only while a unit is selected); "tiles" = flat coloured blocks with gaps (debug). */
export type BoardView = "scene" | "tiles";
/** FE command flow after a unit is placed: command list → attack picker → target select. */
export type MenuPage = "command" | "attacks" | "target";

/** A map in the editor's library: a whole battle setup (terrain + units + doctrine + turns). Order = play order. */
export interface SavedMap {
  id: string;
  name: string;
  config: BattleConfig;
}
const MAPS_KEY = "tactician.maps";
const loadMaps = (): { maps: SavedMap[]; activeMapId: string | null } => {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(MAPS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { maps: SavedMap[]; activeMapId: string | null };
        if (Array.isArray(parsed.maps) && parsed.maps.length) return parsed;
      }
    }
  } catch {
    /* corrupt / private mode → fresh library */
  }
  return { maps: [{ id: "default", name: "Default battlefield", config: defaultConfig() }], activeMapId: "default" };
};
const persistMaps = (maps: SavedMap[], activeMapId: string | null) => {
  try {
    localStorage.setItem(MAPS_KEY, JSON.stringify({ maps, activeMapId }));
  } catch {
    /* private mode */
  }
};
const newMapId = () => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
export type Tool = { kind: "select" } | { kind: "terrain"; terrain: Terrain } | { kind: "unit"; team: Team; archetype: Archetype } | { kind: "erase" };
/** Terrain kinds that behave as OBJECTS sitting on a tile in the editor (drag them; the tile they leave becomes ground). */
export type Feature = "shrine" | "objective";
export const FEATURES: readonly Feature[] = ["shrine", "objective"];
export const isFeature = (t: Terrain): t is Feature => (FEATURES as readonly string[]).includes(t);
/** An RTS-style editor drag in flight: a unit card or a tile feature being carried; the drop target = groundHover. */
export type Drag = { kind: "unit"; id: string; from: Pos } | { kind: "feature"; terrain: Feature; from: Pos };
/** Where the carried / palette object would land and whether it may (drives the RTS placement ghost). */
export interface DropTarget {
  pos: Pos;
  ok: boolean;
  /** why not — shown in the editor hint */
  reason: string | null;
}

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
  /** the tile under the pointer measured against the GROUND, ignoring cards (cards are tall billboards that
   *  cover the tile behind them) — this drives the Sims-style card cutaway */
  groundHover: Pos | null;
  hoverUnit: string | null;
  showDanger: boolean;
  /** board dressing — see BoardView; persisted in localStorage */
  boardView: BoardView;
  /** debug: draw the tile grid overlay always, not just while a unit is selected */
  showGrid: boolean;
  /** Manual mode: when on, the AI plays YOUR phases too (orders/doctrine drive your units) until you turn it off */
  autoPlay: boolean;
  /** Camera focus request: where to glide the camera; zoom in/out/keep; seq bumps on every request. */
  camFocus: { x: number; y: number; zoom: "in" | "out" | "keep"; seq: number };
  /** phase banner request: which team's phase just began (or a result), seq bumps per show */
  banner: { kind: "phase" | "planning" | "victory" | "defeat" | "draw"; team: Team; seq: number };
  followCam: boolean;
  /** viewing angle from horizontal, radians (30°–70°) */
  camTilt: number;
  camZoom: { factor: number; seq: number };
  edgeScroll: boolean;
  // manual — FE flow: click tile → pendingMove + command menu → Attack → attack picker → target select → commit
  moveTiles: Pos[];
  pendingMove: Pos | null;
  /** which page of the in-board menu is open (null = no unit placed) */
  menuPage: MenuPage | null;
  /** which picker is open / which kind the target step is for ("attack" enemies, "heal" allies) */
  menuKind: AttackKind;
  /** attack chosen in the picker (target-select page); null = none yet */
  pendingAttack: string | null;
  /** attack row under the pointer in the picker — previews its range + forecast */
  hoverAttack: string | null;
  /** legal targets from the pending tile: for pendingAttack when chosen, else for any usable attack */
  targets: string[];
  // manager
  phaseLen: number;
  // editor — map library (localStorage), ordered; the active map receives every config edit
  maps: SavedMap[];
  activeMapId: string | null;
  tool: Tool;
  painting: boolean;
  /** editor drag in flight (unit card or tile feature riding the cursor); null = none */
  drag: Drag | null;
  /** FE deployment: Start battle opens a PLANNING phase (battle not yet built) where you rearrange your own units inside
   *  the deploy zone; Begin battle ends it. Rematch keeps the deployment and skips it. */
  planning: boolean;
  /** a Tower climb in progress: which floor this battle is (null = ordinary skirmish) */
  pit: { floor: number } | null;
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
  setGroundHover: (p: Pos | null) => void;
  setHoverUnit: (id: string | null) => void;
  toggleDanger: () => void;
  toggleBoardView: () => void;
  toggleGrid: () => void;
  toggleAuto: () => void;
  toggleFollow: () => void;
  focusCam: (p: Pos, zoom?: "in" | "out" | "keep") => void;
  overview: () => void;
  setCamTilt: (rad: number) => void;
  zoomCam: (factor: number) => void;
  toggleEdgeScroll: () => void;
  select: (id: string | null) => void;
  /** step back one menu page (target → picker → command → un-place); Esc and the Cancel/Back rows call this */
  cancelPending: () => void;
  openAttacks: (kind?: AttackKind) => void;
  chooseAttack: (id: string) => void;
  setHoverAttack: (id: string | null) => void;
  /** WAIT = end the action on the pending tile (clicking a tile IS the move), or where it stands if none is pending */
  commitWait: () => void;
  /** attack/heal `id` with the chosen attack, else the best usable one from the pending tile */
  commitTarget: (id: string) => void;
  endPhaseAI: () => void;
  /** END TURN: every one of your units that has not acted simply waits where it stands; the enemy phase follows */
  endTurn: () => void;
  // manager
  executePhase: () => void;
  setPhaseLen: (n: number) => void;
  setOrders: (id: string, patch: Partial<Orders>) => void;
  setPersonality: (id: string, patch: Partial<Personality>) => void;
  setDoctrine: (team: Team, patch: Partial<Doctrine>) => void;
  // editor — maps
  /** load the library from localStorage (called once on mount; SSR renders the default) */
  hydrateMaps: () => void;
  selectMap: (id: string) => void;
  /** new entry: a blank ground map (`blank`) or a copy of the current setup (`copy`); becomes active */
  newMap: (kind: "blank" | "copy") => void;
  renameMap: (id: string, name: string) => void;
  deleteMap: (id: string) => void;
  /** move a map one step earlier (-1) or later (+1) in play order */
  moveMap: (id: string, dir: -1 | 1) => void;
  /** store the current (detached) setup as a new map */
  saveAsMap: () => void;
  // editor
  setTool: (t: Tool) => void;
  setPainting: (b: boolean) => void;
  paintTile: (p: Pos) => void;
  /** editor: pick up a unit card (left button on the card) — it rides the cursor until endDrag */
  beginDragUnit: (id: string) => void;
  /** editor: pick up a tile feature (shrine / objective) with the select tool */
  beginDragFeature: (p: Pos) => void;
  /** drop whatever is carried on the current ground-hover tile (snaps back when the drop is illegal) */
  endDrag: () => void;
  cancelDrag: () => void;
  /** planning phase → build the battle and play the opening (the old Start battle) */
  beginBattle: () => void;
  /** planning: swap two of your units' tiles (drop a card onto an ally) */
  swapUnits: (a: string, b: string) => void;
  /** move a shrine / objective to another tile; the tile it leaves becomes ground */
  moveFeature: (from: Pos, to: Pos) => void;
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
  /** The Tower: load floor N's ramped config (Manual mode, you = blue) and open the planning phase */
  startPit: (floor: number) => void;
}

/** True when the renderer has replayed every engine event — the only moment input is accepted. */
export const selectCaughtUp = (s: Pick<GameState, "cursor" | "events">) => s.cursor >= s.events.length;

/**
 * RTS placement ghost: where the carried object (drag) or the palette tool (unit / terrain) would land under the
 * pointer, and whether that drop is legal. Keyed off groundHover (the pointer vs the GROUND, ignoring cards).
 * null when nothing is being placed or the pointer is off the board.
 */
/** Planning phase deploy zone: the DEPLOY_ROWS rows on `team`'s side of the map (the side its units start on), passable tiles only. */
export const DEPLOY_ROWS = 4;
export function deployZone(config: BattleConfig, team: Team): Pos[] {
  const map = config.map;
  const mine = config.units.filter((u) => u.team === team);
  // which side is "ours": where our units' centre of mass sits (blue = the near/bottom rows on the default map)
  const avgY = mine.length ? mine.reduce((a, u) => a + u.y, 0) / mine.length : map.height - 1;
  const near = avgY >= (map.height - 1) / 2;
  const rows = Math.min(DEPLOY_ROWS, map.height);
  const y0 = near ? map.height - rows : 0;
  const out: Pos[] = [];
  for (let y = y0; y < y0 + rows; y++) for (let x = 0; x < map.width; x++) if (TERRAIN[terrainAt(map, x, y)].moveCost !== null) out.push({ x, y });
  return out;
}

export function selectDropTarget(s: Pick<GameState, "mode" | "drag" | "tool" | "groundHover" | "config" | "planning" | "playerTeam">): DropTarget | null {
  if (s.mode !== "editor" && !s.planning) return null;
  const pos = s.groundHover;
  if (!pos) return null;
  const map = s.config.map;
  if (!inBounds(map, pos.x, pos.y)) return null;
  const terrain = terrainAt(map, pos.x, pos.y);
  const occupant = s.config.units.find((u) => u.x === pos.x && u.y === pos.y) ?? null;
  const impassable = TERRAIN[terrain].moveCost === null;
  const d = s.drag;
  if (s.planning) {
    // deployment: your own units only, inside the deploy zone; dropping on an ally swaps the two
    if (d?.kind !== "unit") return null;
    if (occupant && occupant.id === d.id) return { pos, ok: true, reason: null };
    if (!deployZone(s.config, s.playerTeam).some((z) => z.x === pos.x && z.y === pos.y)) return { pos, ok: false, reason: "Outside your deploy zone" };
    if (occupant && occupant.team !== s.playerTeam) return { pos, ok: false, reason: `${occupant.name} is standing here` };
    if (impassable) return { pos, ok: false, reason: `${TERRAIN[terrain].label} — impassable` };
    return { pos, ok: true, reason: occupant ? `Swap with ${occupant.name}` : null };
  }
  if (d?.kind === "unit") {
    if (occupant && occupant.id !== d.id) return { pos, ok: false, reason: `${occupant.name} is standing here` };
    if (impassable) return { pos, ok: false, reason: `${TERRAIN[terrain].label} — impassable` };
    return { pos, ok: true, reason: null };
  }
  if (d?.kind === "feature") {
    if (pos.x === d.from.x && pos.y === d.from.y) return { pos, ok: true, reason: null };
    if (isFeature(terrain)) return { pos, ok: false, reason: `${TERRAIN[terrain].label} is already here` };
    if (impassable) return { pos, ok: false, reason: `${TERRAIN[terrain].label} cannot hold a ${TERRAIN[d.terrain].label.toLowerCase()}` };
    return { pos, ok: true, reason: null };
  }
  if (s.tool.kind === "unit") {
    if (occupant) return { pos, ok: false, reason: `${occupant.name} is standing here` };
    if (impassable) return { pos, ok: false, reason: `${TERRAIN[terrain].label} — impassable` };
    return { pos, ok: true, reason: null };
  }
  if (s.tool.kind === "terrain") return { pos, ok: terrain !== s.tool.terrain, reason: null };
  return null;
}

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
    if (s.mode === "manual" && (s.battle.state.activeTeam !== s.playerTeam || s.autoPlay)) {
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

  const clearManual = () => set({ moveTiles: [], pendingMove: null, menuPage: null, menuKind: "attack", pendingAttack: null, hoverAttack: null, targets: [] });

  /** Place `id` on `p` (preview) and open the FE command menu there. */
  const placeAndOpenMenu = (id: string, p: Pos) => {
    const b = get().battle;
    if (!b) return;
    set({ selected: id, pendingMove: p, menuPage: "command", menuKind: "attack", pendingAttack: null, hoverAttack: null, targets: b.targetsFrom(id, p).map((u) => u.id) });
  };

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

  // SSR-safe: the server and the first client render both start from the default library;
  // `hydrateMaps()` (page mount) swaps in localStorage.
  const cfg0 = defaultConfig();

  return {
    config: cfg0,
    maps: [{ id: "default", name: "Default battlefield", config: cfg0 }],
    activeMapId: "default",
    mode: "manual",
    playerTeam: "blue",
    seed: 1,
    battle: null,
    events: [],
    cursor: 0,
    view: initialView(cfg0),
    playing: false,
    speed: 1,
    floats: [],
    effects: [],
    selected: null,
    hover: null,
    groundHover: null,
    hoverUnit: null,
    showDanger: false,
    boardView: "scene", // hydrateMaps() reads the persisted choice on mount (SSR-safe)
    showGrid: false,
    autoPlay: false,
    camFocus: { x: 0, y: 0, zoom: "out", seq: 0 },
    banner: { kind: "phase", team: "blue", seq: 0 },
    followCam: true,
    camTilt: typeof localStorage !== "undefined" && localStorage.getItem("tactician.camTilt") ? Number(localStorage.getItem("tactician.camTilt")) : (45 * Math.PI) / 180,
    camZoom: { factor: 1, seq: 0 },
    edgeScroll: true,
    moveTiles: [],
    pendingMove: null,
    menuPage: null,
    menuKind: "attack",
    pendingAttack: null,
    hoverAttack: null,
    targets: [],
    phaseLen: 3,
    tool: { kind: "select" },
    painting: false,
    drag: null,
    planning: false,
    pit: null,
    simStats: null,
    simProgress: null,
    shareCode: null,

    setMode: (mode) => {
      stopTimer();
      set({ mode, ...resetPlayback(get().config, null), tool: { kind: "select" }, drag: null, planning: false });
      clearManual();
    },

    // Start battle: in Manual / Manager open the PLANNING phase first (FE deployment); the battle is built by beginBattle.
    startBattle: (seed) => {
      stopTimer();
      const cfg = get().config;
      const s = seed ?? get().seed;
      if (get().mode !== "editor") {
        // the planning phase gets the same rune-circle banner as PLAYER / ENEMY PHASE
        set({ ...resetPlayback(cfg, null), seed: s, simStats: null, planning: true, drag: null, banner: { kind: "planning", team: get().playerTeam, seq: get().banner.seq + 1 } });
        clearManual();
        return;
      }
      set({ seed: s });
      get().beginBattle();
    },
    beginBattle: () => {
      stopTimer();
      const cfg = get().config;
      const s = get().seed;
      const battle = new Battle(cfg, s);
      set({ ...resetPlayback(cfg, battle), seed: s, simStats: null, planning: false, drag: null });
      clearManual();
      startPlayback();
    },
    swapUnits: (a, b) => {
      const s = get();
      const ua = s.config.units.find((u) => u.id === a);
      const ub = s.config.units.find((u) => u.id === b);
      if (!ua || !ub) return;
      const units = s.config.units.map((u) => (u.id === a ? { ...u, x: ub.x, y: ub.y } : u.id === b ? { ...u, x: ua.x, y: ua.y } : u));
      const config = { ...s.config, units };
      set({ config, view: initialView(config) });
    },

    rematch: () => {
      const s = get();
      if (s.mode === "editor") {
        set({ seed: s.seed + 1 });
        get().runOnce();
      } else {
        // rematch keeps your deployment — straight into the next seed, no planning stop
        set({ seed: s.seed + 1 });
        get().beginBattle();
      }
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
      set({ ...resetPlayback(get().config, null), planning: false, drag: null });
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
    setGroundHover: (p) => {
      const g = get().groundHover;
      if ((p?.x ?? -1) !== (g?.x ?? -1) || (p?.y ?? -1) !== (g?.y ?? -1)) set({ groundHover: p });
    },
    setHoverUnit: (hoverUnit) => set({ hoverUnit }),
    toggleDanger: () => set({ showDanger: !get().showDanger }),
    toggleBoardView: () => {
      const boardView: BoardView = get().boardView === "scene" ? "tiles" : "scene";
      set({ boardView });
      if (typeof localStorage !== "undefined") localStorage.setItem("tactician.boardView", boardView);
    },
    toggleGrid: () => set({ showGrid: !get().showGrid }),
    toggleAuto: () => {
      const on = !get().autoPlay;
      set({ autoPlay: on });
      if (!on) return;
      // switched on during your own phase with the board idle → play it out now
      const s = get();
      if (s.battle && !s.battle.state.ended && !s.playing && s.cursor >= s.events.length) {
        set({ selected: null });
        clearManual();
        afterCatchUp();
      }
    },
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
      // manual: clicking a target while pending — from the command page it opens the fight menu (Attack / Heal picker,
      // you choose the skill); from the picker / target step it commits (chosen attack, else the best usable one)
      if (s.pendingMove && s.targets.includes(id)) {
        if (s.menuPage === "command" && s.battle) return get().openAttacks(s.battle.unit(id).team === s.battle.unit(s.selected!).team ? "heal" : "attack");
        return get().commitTarget(id);
      }
      // manual: select own unit that can act
      const b = s.battle;
      if (s.mode === "manual" && b && !b.state.ended && b.state.activeTeam === s.playerTeam && s.cursor >= s.events.length) {
        const u = b.unit(id);
        // clicking the unit that is ALREADY selected (and not yet placed) = cancel the selection (Esc does the same)
        if (s.selected === id && !s.pendingMove) {
          set({ selected: null });
          clearManual();
          return;
        }
        // with one of your actable units selected, LEFT-clicking an enemy it can reach (from where it stands or any
        // reachable tile) = the fight menu: place it on a tile the enemy can be hit from (prefer staying put) and open
        // the Attack picker — same as the right-click fast path; a wounded ally opens the Heal picker for healers
        if (s.selected && s.selected !== id && u.alive) {
          const me = b.unit(s.selected);
          if (me.team === s.playerTeam && me.alive && !me.acted) {
            const kind: AttackKind = u.team === me.team ? "heal" : "attack";
            const from = [s.pendingMove, { x: me.x, y: me.y }, ...s.moveTiles].filter((t): t is Pos => !!t).find((t) => b.targetsFrom(me.id, t, undefined, kind).some((x) => x.id === id));
            if (from) {
              placeAndOpenMenu(me.id, from);
              get().openAttacks(kind);
              return;
            }
          }
        }
        if (u.team === s.playerTeam && u.alive && !u.acted) {
          set({ selected: id, moveTiles: b.standableFor(id), pendingMove: null, menuPage: null, menuKind: "attack", pendingAttack: null, hoverAttack: null, targets: [] });
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
          // same legality as the placement ghost: free tile, passable terrain
          if (s.config.units.some((u) => u.x === p.x && u.y === p.y) || TERRAIN[terrainAt(s.config.map, p.x, p.y)].moveCost === null) return;
          const cfg = s.config;
          const u = makeUnit(t.team, t.archetype, p.x, p.y);
          // unique even when several units land in the same millisecond
          const base = `${t.team[0]}${t.archetype[0]}${Date.now().toString(36)}`;
          let id = base;
          for (let n = 2; cfg.units.some((x) => x.id === id); n++) id = `${base}${n}`;
          u.id = id;
          set({ config: { ...cfg, units: [...cfg.units, u] }, view: initialView({ ...cfg, units: [...cfg.units, u] }), selected: u.id });
          return;
        }
        if (t.kind === "select" && s.selected) {
          // click-to-move (keyboard-free alternative to dragging the card): same legality as the ghost
          if (!s.config.units.some((u) => u.x === p.x && u.y === p.y) && TERRAIN[terrainAt(s.config.map, p.x, p.y)].moveCost !== null) get().moveUnitTo(s.selected, p);
          return;
        }
        return;
      }
      // planning: click-to-move your selected unit inside the deploy zone (the no-drag alternative)
      if (s.planning) {
        const occupant = s.config.units.find((u) => u.x === p.x && u.y === p.y);
        if (occupant) return get().clickUnit(occupant.id);
        const sel = s.selected ? s.config.units.find((u) => u.id === s.selected) : null;
        if (!sel || sel.team !== s.playerTeam) return;
        const t = selectDropTarget({ ...s, drag: { kind: "unit", id: sel.id, from: { x: sel.x, y: sel.y } }, groundHover: p });
        if (t?.ok) get().moveUnitTo(sel.id, p);
        return;
      }
      // a tile with a living unit on it IS that unit (the ray may land on the tile beside a card's foot)
      if (s.mode === "manual" && s.battle) {
        const occupant = s.battle.alive().find((u) => u.x === p.x && u.y === p.y);
        if (occupant && !(s.selected === occupant.id && s.moveTiles.some((m) => m.x === p.x && m.y === p.y))) return get().clickUnit(occupant.id);
      }
      if (s.mode === "manual" && s.battle && s.selected && s.moveTiles.length) {
        if (!s.moveTiles.some((m) => m.x === p.x && m.y === p.y)) {
          set({ selected: null });
          clearManual();
          return;
        }
        // FE: the unit previews on the tile and the command menu opens right away (Attack only if something is in reach)
        placeAndOpenMenu(s.selected, p);
        return;
      }
      set({ selected: null });
      clearManual();
    },

    rightClickTile: (p) => {
      const s = get();
      if (s.mode !== "manual" || !s.battle) return;
      const b = s.battle;
      const here = b.alive().find((u) => u.x === p.x && u.y === p.y);
      // right-click on one of YOUR actable units (none / another selected, or itself): select it and open the
      // command menu at its own tile at once — no left-click first
      const yourTurn = !b.state.ended && b.state.activeTeam === s.playerTeam && s.cursor >= s.events.length;
      if (here && yourTurn && here.team === s.playerTeam && !here.acted && (!s.selected || here.id === s.selected || !s.pendingMove || s.menuPage === "command")) {
        if (s.selected !== here.id) set({ moveTiles: b.standableFor(here.id) });
        placeAndOpenMenu(here.id, { x: here.x, y: here.y });
        return;
      }
      if (!s.selected) return;
      // target step: right-click on anything that is not a target = back (FE "B")
      if (s.menuPage === "target" && !(here && s.targets.includes(here.id))) return get().cancelPending();
      // enemy (or, for a heal, wounded ally) on the tile? treat as attack from the pending tile / current tile
      const enemy = here && here.id !== s.selected && (here.team !== s.playerTeam || (s.pendingMove && s.targets.includes(here.id))) ? here : null;
      if (enemy) {
        // target step with this enemy legal → confirm
        if (s.menuPage === "target" && s.pendingMove && s.targets.includes(enemy.id)) return get().commitTarget(enemy.id);
        // otherwise: move to a tile the enemy can be hit from (prefer staying put) and open the picker for
        // the right kind — the player still chooses the attack, FE-style
        const u = s.battle.unit(s.selected);
        const kind: AttackKind = enemy.team === u.team ? "heal" : "attack";
        const from = [s.pendingMove, { x: u.x, y: u.y }, ...s.moveTiles].filter((t): t is Pos => !!t).find((t) => s.battle!.targetsFrom(u.id, t, undefined, kind).some((x) => x.id === enemy.id));
        if (!from) return;
        placeAndOpenMenu(u.id, from);
        get().openAttacks(kind);
        return;
      }
      if (s.moveTiles.some((m) => m.x === p.x && m.y === p.y)) get().clickTile(p);
    },
    cancelPending: () => {
      const s = get();
      if (!s.selected || !s.battle) return;
      if (s.menuPage === "target" && s.pendingMove) {
        set({ menuPage: "attacks", pendingAttack: null, hoverAttack: null, targets: s.battle.targetsFrom(s.selected, s.pendingMove, undefined, s.menuKind).map((u) => u.id) });
        return;
      }
      if (s.menuPage === "attacks" && s.pendingMove) {
        set({ menuPage: "command", menuKind: "attack", hoverAttack: null, targets: s.battle.targetsFrom(s.selected, s.pendingMove).map((u) => u.id) });
        return;
      }
      set({ pendingMove: null, menuPage: null, menuKind: "attack", pendingAttack: null, hoverAttack: null, targets: [], moveTiles: s.battle.standableFor(s.selected) });
    },
    openAttacks: (kind = "attack") => {
      const s = get();
      if (s.battle && s.selected && s.pendingMove && s.menuPage === "command")
        set({ menuPage: "attacks", menuKind: kind, hoverAttack: null, targets: s.battle.targetsFrom(s.selected, s.pendingMove, undefined, kind).map((u) => u.id) });
    },
    chooseAttack: (id) => {
      const s = get();
      if (!s.battle || !s.selected || !s.pendingMove) return;
      const targets = s.battle.targetsFrom(s.selected, s.pendingMove, id).map((u) => u.id);
      if (!targets.length) return;
      set({ menuPage: "target", pendingAttack: id, hoverAttack: null, targets });
    },
    setHoverAttack: (hoverAttack) => set({ hoverAttack }),

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
      const kind = s.battle.unit(id).team === u.team ? "heal" : "attack";
      const attack = s.pendingAttack ?? s.battle.bestAttack(u.id, s.pendingMove, id)?.id;
      if (!attack) return;
      commit({ kind, unit: u.id, moveTo: s.pendingMove, target: id, attack });
    },

    endTurn: () => {
      const s = get();
      const b = s.battle;
      if (!b || b.state.ended || b.state.activeTeam !== s.playerTeam || s.cursor < s.events.length) return;
      for (const u of b.pending()) {
        if (b.state.ended || b.state.activeTeam !== s.playerTeam) break;
        b.act({ kind: "wait", unit: u.id, moveTo: { x: u.x, y: u.y } });
      }
      sync();
      set({ selected: null });
      clearManual();
      startPlayback();
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

    // ---- editor: map library ----
    hydrateMaps: () => {
      const stored = loadMaps();
      // the library entry named "default" ALWAYS carries the code's current default map — a stale localStorage copy
      // (e.g. the pre-2026-08-18 river) must never resurrect terrain the code has since changed
      const lib = { ...stored, maps: stored.maps.map((m) => (m.id === "default" ? { ...m, config: defaultConfig() } : m)) };
      const active = lib.maps.find((m) => m.id === lib.activeMapId) ?? null;
      const config = active?.config ?? get().config;
      stopTimer();
      usePerf.getState().markLoad(`map · ${active?.name ?? "skirmish"}`);
      const bv =typeof localStorage !== "undefined" ? localStorage.getItem("tactician.boardView") : null;
      set({ maps: lib.maps, activeMapId: active?.id ?? null, config, ...resetPlayback(config, null), ...(bv === "tiles" ? { boardView: "tiles" as BoardView } : {}) });
      clearManual();
    },
    selectMap: (id) => {
      const s = get();
      const m = s.maps.find((x) => x.id === id);
      if (!m) return;
      stopTimer();
      usePerf.getState().markLoad(`map · ${m.name}`);
      set({ config: m.config, activeMapId: id, pit: null, ...resetPlayback(m.config, null), simStats: null });
      clearManual();
      persistMaps(s.maps, id);
    },
    newMap: (kind) => {
      const s = get();
      const config: BattleConfig = kind === "copy" ? JSON.parse(JSON.stringify(s.config)) : { map: emptyMap(), units: [], doctrine: { red: { ...DEFAULT_DOCTRINE }, blue: { ...DEFAULT_DOCTRINE } }, maxTurns: 30, firstTeam: "blue" };
      const m: SavedMap = { id: newMapId(), name: kind === "copy" ? `${s.maps.find((x) => x.id === s.activeMapId)?.name ?? "Setup"} (copy)` : `Map ${s.maps.length + 1}`, config };
      const maps = [...s.maps, m];
      stopTimer();
      set({ maps, config, activeMapId: m.id, ...resetPlayback(config, null), simStats: null });
      clearManual();
      persistMaps(maps, m.id);
    },
    renameMap: (id, name) => {
      const maps = get().maps.map((m) => (m.id === id ? { ...m, name } : m));
      set({ maps });
      persistMaps(maps, get().activeMapId);
    },
    deleteMap: (id) => {
      const s = get();
      if (s.maps.length <= 1) return;
      const i = s.maps.findIndex((m) => m.id === id);
      const maps = s.maps.filter((m) => m.id !== id);
      if (s.activeMapId === id) {
        const next = maps[Math.max(0, i - 1)];
        stopTimer();
        set({ maps, config: next.config, activeMapId: next.id, ...resetPlayback(next.config, null), simStats: null });
        clearManual();
        persistMaps(maps, next.id);
      } else {
        set({ maps });
        persistMaps(maps, s.activeMapId);
      }
    },
    moveMap: (id, dir) => {
      const s = get();
      const i = s.maps.findIndex((m) => m.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.maps.length) return;
      const maps = [...s.maps];
      [maps[i], maps[j]] = [maps[j], maps[i]];
      set({ maps });
      persistMaps(maps, s.activeMapId);
    },
    saveAsMap: () => {
      const s = get();
      const m: SavedMap = { id: newMapId(), name: `Map ${s.maps.length + 1}`, config: s.config };
      const maps = [...s.maps, m];
      set({ maps, activeMapId: m.id });
      persistMaps(maps, m.id);
    },

    // ---- editor ----
    setTool: (tool) => set({ tool, drag: null }),
    setPainting: (painting) => set({ painting }),
    beginDragUnit: (id) => {
      const s = get();
      const u = s.config.units.find((x) => x.id === id);
      if (!u) return;
      if (s.planning) {
        if (u.team !== s.playerTeam) return; // deployment: only your own units move
        set({ drag: { kind: "unit", id, from: { x: u.x, y: u.y } }, selected: id });
        return;
      }
      if (s.mode !== "editor" || s.tool.kind === "erase") return;
      set({ drag: { kind: "unit", id, from: { x: u.x, y: u.y } }, selected: id, tool: { kind: "select" }, painting: false });
    },
    beginDragFeature: (p) => {
      const s = get();
      if (s.mode !== "editor" || s.tool.kind !== "select") return;
      const t = terrainAt(s.config.map, p.x, p.y);
      if (!isFeature(t)) return;
      // picking up a shrine / objective is a new focus: drop the unit selection so its range paint doesn't bury the ghost
      set({ drag: { kind: "feature", terrain: t, from: p }, painting: false, selected: null });
    },
    endDrag: () => {
      const s = get();
      const d = s.drag;
      if (!d) return;
      const t = selectDropTarget(s);
      set({ drag: null });
      if (!t || !t.ok) return;
      if (d.kind === "unit") {
        const occupant = s.config.units.find((u) => u.x === t.pos.x && u.y === t.pos.y);
        if (occupant && occupant.id !== d.id) get().swapUnits(d.id, occupant.id);
        else get().moveUnitTo(d.id, t.pos);
      } else get().moveFeature(d.from, t.pos);
    },
    cancelDrag: () => {
      if (get().drag) set({ drag: null });
    },
    moveFeature: (from, to) => {
      const s = get();
      const map = s.config.map;
      const t = terrainAt(map, from.x, from.y);
      if (!isFeature(t) || (from.x === to.x && from.y === to.y)) return;
      const tiles = [...map.tiles];
      tiles[idx(map, from.x, from.y)] = "ground";
      tiles[idx(map, to.x, to.y)] = t;
      set({ config: { ...s.config, map: { ...map, tiles } } });
    },
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
        set({ config, activeMapId: null, ...resetPlayback(config, null), simStats: null });
        clearManual();
        persistMaps(get().maps, null);
        return true;
      } catch {
        return false;
      }
    },
    startPit: (floor) => {
      const config = pitConfig(floor);
      stopTimer();
      usePerf.getState().markLoad(`tower · floor ${floor}`);
      set({ config, activeMapId: null, mode: "manual", playerTeam: "blue", pit: { floor }, ...resetPlayback(config, null), simStats: null });
      clearManual();
      get().startBattle();
    },
    loadDefault: () => {
      const config = defaultConfig();
      stopTimer();
      set({ config, activeMapId: null, pit: null, ...resetPlayback(config, null), simStats: null });
      clearManual();
      persistMaps(get().maps, null);
    },
  };
});

// Every config edit flows into the active map (autosave) — the library IS the setup, no "save" button to forget.
useGame.subscribe((s, prev) => {
  if (s.config === prev.config || !s.activeMapId) return;
  const maps = s.maps.map((m) => (m.id === s.activeMapId ? { ...m, config: s.config } : m));
  useGame.setState({ maps });
  persistMaps(maps, s.activeMapId);
});
