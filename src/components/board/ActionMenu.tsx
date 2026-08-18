"use client";
import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { CARD_H3 } from "./shared";

/**
 * FE-style command menu at the unit's pending tile. Three pages, exactly the FE cadence:
 *   command  — Attack (or Heal) · Wait · Cancel, opens the moment the unit is placed (clicking a tile IS the move)
 *   attacks  — NOT here: components/SkillPanel (full-height framed panel on the right, FE-style)
 *   target   — NO menu: the centred AttackPrompt (components/AttackPrompt) + red tiles / battle bar carry it
 */
export default function ActionMenu() {
  const pendingMove = useGame((s) => s.pendingMove);
  const menuPage = useGame((s) => s.menuPage);
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const commitWait = useGame((s) => s.commitWait);
  const cancelPending = useGame((s) => s.cancelPending);
  const openAttacks = useGame((s) => s.openAttacks);
  const setHoverAttack = useGame((s) => s.setHoverAttack);
  const map = useGame((s) => s.config.map);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);

  // all four (command page needs both kinds to enable/disable rows); the picker shows one kind
  const options = useMemo(() => (battle && selected && pendingMove && menuPage ? battle.attackOptions(selected, pendingMove) : []), [battle, selected, pendingMove, menuPage]);

  // the target step has no menu — the centred AttackPrompt + the red tiles carry it (FE)
  // only the command page lives at the unit; the skill picker is the right-side SkillPanel, the target step is the AttackPrompt
  if (!pendingMove || !selectedDef || menuPage !== "command") return null;
  const th = tileHeight(map, pendingMove);
  const hasHeals = options.some((o) => o.attack.kind === "heal");
  const nAttack = new Set(options.filter((o) => o.attack.kind === "attack").flatMap((o) => o.targets)).size;
  const nHeal = new Set(options.filter((o) => o.attack.kind === "heal").flatMap((o) => o.targets)).size;

  return (
    // FE: the menu hangs about two tiles to the RIGHT of the unit, level with its card, never over it
    <Html position={[pendingMove.x + 2.1, th + CARD_H3 * 1.15, pendingMove.y]} zIndexRange={[2, 0]} style={{ pointerEvents: "auto", transform: "translate(0, -70%)" }}>
      <div className="action-menu-wrap">
        {/* FE ink/smoke edge: blurred blobs displaced by turbulence, behind the panel */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id="tact-ink" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="46" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </svg>
        <div className="action-smoke" />
      <div className={`action-menu page-${menuPage}`} onPointerLeave={() => setHoverAttack(null)}>
        {menuPage === "command" && (
          <>
            <button className="action-row" onClick={() => openAttacks("attack")} disabled={nAttack === 0} title={nAttack ? `${nAttack} in reach` : "Nothing in reach from here"}>
              <span className="action-cursor">◆</span>
              Attack
              <span className="action-meta">{nAttack || "—"}</span>
            </button>
            {hasHeals && (
              <button className="action-row" onClick={() => openAttacks("heal")} disabled={nHeal === 0} title={nHeal ? `${nHeal} wounded in reach` : "No wounded ally in reach"}>
                <span className="action-cursor">◆</span>
                Heal
                <span className="action-meta">{nHeal || "—"}</span>
              </button>
            )}
            <button className="action-row" onClick={commitWait}>
              <span className="action-cursor">◆</span>Wait
            </button>
            <button className="action-row back" onClick={cancelPending}>
              <span className="action-cursor">◆</span>Cancel
            </button>
          </>
        )}

      </div>
      </div>
    </Html>
  );
}
