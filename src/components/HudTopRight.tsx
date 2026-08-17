"use client";
import Minimap from "./Minimap";
import CameraWidget from "./CameraWidget";
import { useUiFrame } from "./ui/UiFrame";

/** Minimap + camera widget, top-right of the board — a movable/resizable UI frame. */
export default function HudTopRight() {
  const ui = useUiFrame("hud-tr");
  return (
    <div className="hud-tr" style={ui.style}>
      <Minimap />
      <CameraWidget />
      {ui.overlay}
    </div>
  );
}
