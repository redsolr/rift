"use client";
import { Team } from "@/sim/types";

export const TEAM_COLOR: Record<Team, string> = { red: "#e0554a", blue: "#4a86e0" };
export const CARD_W3 = 0.92;
export const CARD_H3 = CARD_W3 * (352 / 256);

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
