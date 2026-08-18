"use client";
import { Team } from "@/sim/types";

export const TEAM_COLOR: Record<Team, string> = { red: "#e0554a", blue: "#4a86e0" };
/** Saturated variants for additive ground FX (selection ring) — the reference RTS ring is a hot cyan, not the muted UI blue. */
export const TEAM_GLOW: Record<Team, string> = { red: "#ff5a48", blue: "#19e3ff" };
/** FE Three Hopes tile paint: the move field of YOUR unit (periwinkle) vs an ENEMY's (red), fill + hairline edge — one place */
export const MOVE_PAINT = {
  mine: { color: "#6f8fff", opacity: 0.5, border: "#e8eeff" as string | undefined },
  enemy: { color: "#ff7a7a", opacity: 0.3, border: undefined as string | undefined },
};
import { ART_W, CARD_H, CARD_PAD, CARD_W } from "../cards";
/** visible card ART width in tiles; the plane is a little wider because the texture carries a transparent margin (badge room) */
export const ART_W3 = 0.92;
export const CARD_W3 = ART_W3 * (CARD_W / ART_W);
export const CARD_H3 = CARD_W3 * (CARD_H / CARD_W);
/** the margin in world units — the plane is lifted by this so the ART's bottom edge sits on the ground, not the margin's */
export const CARD_PAD3 = CARD_H3 * (CARD_PAD / CARD_H);

/** Right-button drag vs click: OrbitControls pans on right-drag, so a context-menu after a drag is not an order. */
const rmb = { x: 0, y: 0, moved: false };
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      rmb.x = e.clientX;
      rmb.y = e.clientY;
      rmb.moved = false;
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (e.buttons & 2 && Math.hypot(e.clientX - rmb.x, e.clientY - rmb.y) > 6) rmb.moved = true;
  });
}
export const dragged = () => rmb.moved;

/** Phone camera stick (MobileControls): −1..1 pan vector, read by CameraRig every frame. Module-level on purpose — per-frame, never React state. */
export const stickPan = { x: 0, y: 0 };
