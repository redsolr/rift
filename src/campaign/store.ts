"use client";
import { create } from "zustand";
import { usePerf } from "@/components/perf/store";
import { Line, lineById, SpeakerId } from "./script";
import { arrivalOf, ZONES } from "./world";
import type { Spawn, ZoneId } from "./world/types";

/**
 * Campaign prototype state — the bits the 3D scene and the HTML overlay share. Player position stays in the scene
 * (per-frame, never in React state); only the zone / transition / interaction / dialogue machine lives here. Exposed as
 * `window.__campaign` for the headless probe.
 *
 * Zone travel (Persona 5 doors): `travel(exitId)` → `out` (fade to black, 380 ms) → swap `zone` + `arrival`, `title`
 * (area title card while the new zone mounts, 1100 ms) → `in` (fade back, 500 ms) → null. `arrivalSeq` bumps every
 * arrival so the scene re-places the player even when re-entering the same zone.
 */
export type TransitionPhase = "out" | "title" | "in";

export interface CampaignState {
  zone: ZoneId;
  /** where the player stands on arrival — read by the scene once per `arrivalSeq` */
  arrival: Spawn;
  arrivalSeq: number;
  transition: { phase: TransitionPhase; to: ZoneId } | null;
  /** the NPC within talking distance, or null */
  nearNpc: SpeakerId | null;
  /** how many times the player has spoken to each NPC */
  talks: Partial<Record<SpeakerId, number>>;
  /** open conversation, or null while walking */
  dialogue: { script: Line[]; lineId: string; seq: number } | null;
  /** set by the "to-battle" effect: the page navigates to the skirmish */
  leaving: boolean;
  /** the tower's floor picker is open (movement frozen) */
  tower: boolean;

  setNearNpc: (id: SpeakerId | null) => void;
  travel: (exitId: string) => void;
  openTower: () => void;
  closeTower: () => void;
  talk: () => void;
  /** advance: pick the next line (or a choice by index); closes the conversation at the end */
  advance: (choice?: number) => void;
  close: () => void;
}

const OUT_MS = 380;
const TITLE_MS = 1100;
const IN_MS = 500;

export const useCampaign = create<CampaignState>((set, get) => ({
  zone: "kitchen",
  arrival: ZONES.kitchen.spawn,
  arrivalSeq: 0,
  transition: null,
  nearNpc: null,
  talks: {},
  dialogue: null,
  leaving: false,
  tower: false,

  setNearNpc: (nearNpc) => {
    if (get().nearNpc !== nearNpc) set({ nearNpc });
  },
  travel: (exitId) => {
    if (get().transition || get().dialogue) return;
    const { zone, spawn } = arrivalOf(get().zone, exitId);
    set({ transition: { phase: "out", to: zone }, nearNpc: null });
    window.setTimeout(() => {
      usePerf.getState().markLoad(`zone · ${ZONES[zone].name}`);
      set({ zone, arrival: spawn, arrivalSeq: get().arrivalSeq + 1, transition: { phase: "title", to: zone } });
      window.setTimeout(() => {
        set({ transition: { phase: "in", to: zone } });
        window.setTimeout(() => set({ transition: null }), IN_MS);
      }, TITLE_MS);
    }, OUT_MS);
  },
  openTower: () => {
    if (get().transition || get().dialogue) return;
    set({ tower: true });
  },
  closeTower: () => set({ tower: false }),
  talk: () => {
    const id = get().nearNpc;
    if (get().dialogue || !id || get().transition || get().tower) return;
    const npc = ZONES[get().zone].npcs.find((n) => n.id === id);
    if (!npc) return;
    const n = get().talks[id] ?? 0;
    const script = n === 0 ? npc.scripts.first : npc.scripts.again;
    set({ dialogue: { script, lineId: script[0].id, seq: 0 }, talks: { ...get().talks, [id]: n + 1 } });
  },
  advance: (choice) => {
    const d = get().dialogue;
    if (!d) return;
    const line = lineById(d.script, d.lineId);
    let nextId: string | undefined;
    if (line.choices) {
      if (choice === undefined) return; // choices need a pick, not a click-through
      nextId = line.choices[choice]?.next;
    } else nextId = line.next;
    if (!nextId) {
      set({ dialogue: null });
      return;
    }
    const next = lineById(d.script, nextId);
    set({ dialogue: { script: d.script, lineId: nextId, seq: d.seq + 1 } });
    if (next.effect === "to-battle") set({ leaving: true });
  },
  close: () => set({ dialogue: null }),
}));

export const currentLine = (s: CampaignState): Line | null => (s.dialogue ? lineById(s.dialogue.script, s.dialogue.lineId) : null);
