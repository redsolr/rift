"use client";
import { Html } from "@react-three/drei";
import { useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { CARD_H3 } from "./shared";

/** FE-style action menu shown at the unit after it previews a move with targets in range. */
export default function ActionMenu() {
  const pendingMove = useGame((s) => s.pendingMove);
  const targets = useGame((s) => s.targets);
  const commitWait = useGame((s) => s.commitWait);
  const cancelPending = useGame((s) => s.cancelPending);
  const map = useGame((s) => s.config.map);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);
  if (!pendingMove || !selectedDef) return null;
  const th = tileHeight(map, pendingMove);
  const verb = selectedDef.archetype === "healer" ? "Heal" : "Attack";
  return (
    <Html position={[pendingMove.x, th + CARD_H3 * 0.6, pendingMove.y - 0.7]} zIndexRange={[2, 0]} style={{ pointerEvents: "auto", transform: "translate(-100%, -50%)" }}>
      <div className="action-menu">
        <div className="action-hint">
          {verb}: click a {selectedDef.archetype === "healer" ? "green" : "red"} target ({targets.length})
        </div>
        <button className="action-btn" onClick={commitWait}>
          Wait
        </button>
        <button className="action-btn ghost" onClick={cancelPending}>
          Cancel
        </button>
      </div>
    </Html>
  );
}

