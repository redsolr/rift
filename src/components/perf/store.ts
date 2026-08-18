"use client";
import { create } from "zustand";

/**
 * System profiler — one store both scenes (skirmish board, campaign zones) feed. `PerfProbe` (inside a Canvas) samples the
 * renderer every frame and publishes a `live` snapshot ~2×/s; `PerfPanel` (HTML) shows it. Every scene/zone/map is
 * measured as a `SceneRecord`: how long it took to load (mark → first rendered frame) and how it ran during its first
 * seconds (avg / worst fps, draw calls, triangles, JS heap). Records persist in localStorage `tactician.perf` — the
 * per-map table survives reloads, so "how does map X run" is answered by opening the panel. Toggle: F3 or the ⌗ Perf
 * button. Exposed as `window.__perf` for the headless probe.
 */
export interface PerfLive {
  fps: number;
  /** average frame time over the window, ms */
  frameMs: number;
  /** worst frame in the window, ms */
  frameMsMax: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  /** JS heap MB (Chrome only) or null */
  heapMB: number | null;
  /** scene-specific extras (chunks loaded, units, …) */
  extra: Record<string, string | number>;
}

export interface SceneRecord {
  scene: string;
  /** mark → first frame, ms (null when the probe mounted without a mark) */
  loadMs: number | null;
  fpsAvg: number;
  fpsMin: number;
  frameMsMax: number;
  calls: number;
  triangles: number;
  heapMB: number | null;
  /** measured over this many seconds after the first frame */
  window: number;
  at: number;
}

interface PerfState {
  open: boolean;
  scene: string;
  live: PerfLive | null;
  records: SceneRecord[];
  /** pending load mark: scene label + performance.now() when the load began */
  mark: { scene: string; t0: number } | null;
  toggle: () => void;
  setOpen: (b: boolean) => void;
  /** call BEFORE a scene/zone/map begins mounting; the next first frame of that scene closes the mark */
  markLoad: (scene: string) => void;
  publish: (scene: string, live: PerfLive) => void;
  record: (r: SceneRecord) => void;
  clear: () => void;
  hydrate: () => void;
}

const KEY = "tactician.perf";
export const RECORD_WINDOW_S = 3;

export const usePerf = create<PerfState>((set, get) => ({
  open: false,
  scene: "",
  live: null,
  records: [],
  mark: null,
  toggle: () => set({ open: !get().open }),
  setOpen: (open) => set({ open }),
  markLoad: (scene) => set({ mark: { scene, t0: performance.now() } }),
  publish: (scene, live) => set({ scene, live }),
  record: (r) => {
    // one row per scene — the newest measurement replaces the old
    const records = [...get().records.filter((x) => x.scene !== r.scene), r].sort((a, b) => a.scene.localeCompare(b.scene));
    set({ records });
    try {
      localStorage.setItem(KEY, JSON.stringify(records));
    } catch {
      /* private mode */
    }
  },
  clear: () => {
    set({ records: [] });
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
  hydrate: () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SceneRecord[];
        if (Array.isArray(parsed)) set({ records: parsed });
      }
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") (window as unknown as { __perf?: typeof usePerf }).__perf = usePerf;
  },
}));

/** Chrome-only heap read; null elsewhere */
export const heapMB = (): number | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
};
