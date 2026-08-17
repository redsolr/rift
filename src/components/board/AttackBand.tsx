"use client";
import { Html } from "@react-three/drei";
import { useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { attackById } from "@/sim/attacks";

/**
 * FE "A Attack" band: during the target step it sits in world space just BELOW the acting
 * unit (on the tile it will attack from), so the confirm hint is where the eye already is.
 * Line 1 = key glyph + verb + skill; line 2 = how to confirm / back out.
 */
export default function AttackBand() {
  const menuPage = useGame((s) => s.menuPage);
  const pendingMove = useGame((s) => s.pendingMove);
  const pendingAttack = useGame((s) => s.pendingAttack);
  const targets = useGame((s) => s.targets);
  const hoverUnit = useGame((s) => s.hoverUnit);
  const map = useGame((s) => s.config.map);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);
  if (menuPage !== "target" || !pendingMove || !pendingAttack || !selectedDef) return null;
  const a = attackById(selectedDef, pendingAttack);
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const armed = !!hoverUnit && targets.includes(hoverUnit);
  const th = tileHeight(map, pendingMove);
  return (
    <Html position={[pendingMove.x, th + 0.02, pendingMove.y + 0.85]} zIndexRange={[3, 0]} center style={{ pointerEvents: "none" }}>
      <div className={`attack-band ${armed ? "armed" : ""}`}>
        <div className="ab-main">
          <span className="ab-key">{coarse ? "TAP" : "R"}</span>
          <span className="ab-verb">{a.kind === "heal" ? "Heal" : "Attack"}</span>
          <span className="ab-skill">{a.name}</span>
        </div>
        <div className="ab-sub">{armed ? (coarse ? "tap again to confirm" : "right-click to confirm") : `${a.kind === "heal" ? "pick a green ally" : "pick a red target"} (${targets.length}) · right-click empty = back`}</div>
      </div>
    </Html>
  );
}
