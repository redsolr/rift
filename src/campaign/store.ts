"use client";
import { create } from "zustand";
import { KITCHEN_AGAIN, KITCHEN_TALK, Line, lineById } from "./script";

/**
 * Campaign prototype state — the bits the 3D scene and the HTML overlay share. Player position stays in the scene
 * (per-frame, never in React state); only the interaction/dialogue machine lives here. Exposed as `window.__campaign`
 * for the headless probe.
 */
export interface CampaignState {
  /** the NPC is within talking distance */
  nearNpc: boolean;
  /** how many times the player has spoken to Mina */
  talks: number;
  /** open conversation, or null while walking */
  dialogue: { script: Line[]; lineId: string; seq: number } | null;
  /** set by the "to-battle" effect: the page navigates to the skirmish */
  leaving: boolean;

  setNearNpc: (b: boolean) => void;
  talk: () => void;
  /** advance: pick the next line (or a choice by index); closes the conversation at the end */
  advance: (choice?: number) => void;
  close: () => void;
}

export const useCampaign = create<CampaignState>((set, get) => ({
  nearNpc: false,
  talks: 0,
  dialogue: null,
  leaving: false,

  setNearNpc: (nearNpc) => {
    if (get().nearNpc !== nearNpc) set({ nearNpc });
  },
  talk: () => {
    if (get().dialogue) return;
    const script = get().talks === 0 ? KITCHEN_TALK : KITCHEN_AGAIN;
    set({ dialogue: { script, lineId: script[0].id, seq: 0 }, talks: get().talks + 1 });
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
