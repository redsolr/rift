"use client";
import { CSSProperties, PointerEvent as RPointerEvent, ReactNode, useCallback, useRef } from "react";
import { create } from "zustand";

/**
 * WoW-addon-style UI layout: every HUD overlay is a "frame" with a persisted offset + scale.
 * `useUiFrame(id)` gives the host element its transform and, in layout mode, an editing overlay
 * (drag anywhere = move, corner grip = scale, ↺ = reset). Nothing here touches the game store.
 */

export type UiFrameId = "battle-bar" | "hud-tr" | "turn-controls" | "skill-panel";
export const UI_FRAME_LABEL: Record<UiFrameId, string> = {
  "battle-bar": "Battle forecast",
  "hud-tr": "Minimap & camera",
  "turn-controls": "Turn buttons",
  "skill-panel": "Skill panel",
};
/** which corner the frame is anchored to — scaling grows away from it so the frame stays put */
const ORIGIN: Record<UiFrameId, string> = {
  "battle-bar": "bottom center",
  "hud-tr": "top right",
  "turn-controls": "bottom right",
  "skill-panel": "top right",
};

export interface FrameLayout {
  dx: number;
  dy: number;
  scale: number;
}
const DEFAULT: FrameLayout = { dx: 0, dy: 0, scale: 1 };
const KEY = "tactician.ui";

interface UiLayoutState {
  editing: boolean;
  frames: Partial<Record<UiFrameId, FrameLayout>>;
  toggleEditing: () => void;
  setFrame: (id: UiFrameId, patch: Partial<FrameLayout>) => void;
  resetFrame: (id: UiFrameId) => void;
  resetAll: () => void;
  hydrate: () => void;
}

const persist = (frames: UiLayoutState["frames"]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(frames));
  } catch {
    /* private mode */
  }
};

export const useUiLayout = create<UiLayoutState>((set, get) => ({
  editing: false,
  frames: {},
  toggleEditing: () => set({ editing: !get().editing }),
  setFrame: (id, patch) => {
    const cur = get().frames[id] ?? DEFAULT;
    const next = { ...cur, ...patch };
    next.scale = Math.max(0.5, Math.min(2.2, next.scale));
    const frames = { ...get().frames, [id]: next };
    set({ frames });
    persist(frames);
  },
  resetFrame: (id) => {
    const frames = { ...get().frames };
    delete frames[id];
    set({ frames });
    persist(frames);
  },
  resetAll: () => {
    set({ frames: {} });
    persist({});
  },
  hydrate: () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) set({ frames: JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  },
}));

/**
 * Host hook. Spread `style` on the frame's root (it must be positioned — all HUD overlays are)
 * and render `overlay` as its LAST child.
 */
export function useUiFrame(id: UiFrameId): { style: CSSProperties; overlay: ReactNode; editing: boolean; scale: number } {
  const editing = useUiLayout((s) => s.editing);
  const layout = useUiLayout((s) => s.frames[id]) ?? DEFAULT;
  const setFrame = useUiLayout((s) => s.setFrame);
  const resetFrame = useUiLayout((s) => s.resetFrame);
  const drag = useRef<{ x: number; y: number; dx: number; dy: number; scale: number; mode: "move" | "scale" } | null>(null);

  const start = useCallback(
    (mode: "move" | "scale") => (e: RPointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, dx: layout.dx, dy: layout.dy, scale: layout.scale, mode };
    },
    [layout],
  );
  const move = useCallback(
    (e: RPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === "move") setFrame(id, { dx: d.dx + (e.clientX - d.x), dy: d.dy + (e.clientY - d.y) });
      else setFrame(id, { scale: d.scale + (e.clientX - d.x) / 220 });
    },
    [id, setFrame],
  );
  const end = useCallback(() => {
    drag.current = null;
  }, []);

  const style: CSSProperties = {
    transform: `translate(${layout.dx}px, ${layout.dy}px) scale(${layout.scale})`,
    transformOrigin: ORIGIN[id],
  };
  const overlay = editing ? (
    <div className="ui-edit" onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Drag to move">
      <div className="ui-edit-label">
        {UI_FRAME_LABEL[id]} · {Math.round(layout.scale * 100)}%
        <button
          className="ui-edit-reset"
          title="Reset this frame"
          onPointerDown={(e) => {
            e.stopPropagation();
            resetFrame(id);
          }}
        >
          ↺
        </button>
      </div>
      <div className="ui-edit-grip" onPointerDown={start("scale")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Drag to resize" />
    </div>
  ) : null;

  return { style, overlay, editing, scale: layout.scale };
}

/** Top-centre toolbar shown while in layout mode. */
export function UiLayoutBar() {
  const editing = useUiLayout((s) => s.editing);
  const toggle = useUiLayout((s) => s.toggleEditing);
  const resetAll = useUiLayout((s) => s.resetAll);
  if (!editing) return null;
  return (
    <div className="ui-layout-bar">
      <span>UI layout — drag a frame to move it, drag its corner grip to resize</span>
      <button className="ghost" onClick={resetAll}>
        Reset all
      </button>
      <button className="primary" onClick={toggle}>
        Done
      </button>
    </div>
  );
}
