"use client";
import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { attackRange } from "@/sim/attacks";
import { CARD_H3 } from "./shared";

/**
 * FE-style command menu at the unit's pending tile. Three pages, exactly the FE cadence:
 *   command  — Attack (or Heal) · Wait · Cancel, opens the moment the unit is placed
 *   attacks  — the unit's four attacks (power · range · condition · targets in reach)
 *   target   — "pick a target" hint + Back; the red tiles / battle bar do the rest
 */
export default function ActionMenu() {
  const pendingMove = useGame((s) => s.pendingMove);
  const menuPage = useGame((s) => s.menuPage);
  const pendingAttack = useGame((s) => s.pendingAttack);
  const targets = useGame((s) => s.targets);
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const commitWait = useGame((s) => s.commitWait);
  const cancelPending = useGame((s) => s.cancelPending);
  const openAttacks = useGame((s) => s.openAttacks);
  const chooseAttack = useGame((s) => s.chooseAttack);
  const setHoverAttack = useGame((s) => s.setHoverAttack);
  const map = useGame((s) => s.config.map);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);

  const options = useMemo(() => (battle && selected && pendingMove && menuPage ? battle.attackOptions(selected, pendingMove) : []), [battle, selected, pendingMove, menuPage]);

  if (!pendingMove || !selectedDef || !menuPage) return null;
  const th = tileHeight(map, pendingMove);
  const healer = selectedDef.archetype === "healer";
  const verb = healer ? "Heal" : "Attack";
  const chosen = pendingAttack ? options.find((o) => o.attack.id === pendingAttack) : null;

  return (
    // FE: the menu hangs to the RIGHT of the unit, vertically centred on its card, never over it
    <Html position={[pendingMove.x + 0.7, th + CARD_H3 * 0.55, pendingMove.y]} zIndexRange={[2, 0]} style={{ pointerEvents: "auto", transform: "translate(0, -50%)" }}>
      <div className={`action-menu page-${menuPage}`} onPointerLeave={() => setHoverAttack(null)}>
        {menuPage === "command" && (
          <>
            <button className="action-row" onClick={openAttacks} disabled={targets.length === 0} title={targets.length ? `${targets.length} in reach` : "Nothing in reach from here"}>
              <span className="action-cursor">◆</span>
              {verb}
              <span className="action-meta">{targets.length ? targets.length : "—"}</span>
            </button>
            <button className="action-row" onClick={commitWait}>
              <span className="action-cursor">◆</span>Wait
            </button>
            <button className="action-row back" onClick={cancelPending}>
              <span className="action-cursor">◆</span>Cancel
            </button>
          </>
        )}

        {menuPage === "attacks" && (
          <>
            <div className="action-title">{verb}</div>
            {options.map(({ attack, usable, targets: reach }) => {
              const [lo, hi] = attackRange(selectedDef, attack);
              const off = !usable || reach.length === 0;
              const why = !usable ? (attack.cond === "moved" ? "needs a move first" : "must stand still") : reach.length === 0 ? "nothing in reach" : `${reach.length} in reach`;
              return (
                <button key={attack.id} className={`action-row attack ${off ? "off" : ""}`} disabled={off} onClick={() => chooseAttack(attack.id)} onPointerEnter={() => setHoverAttack(attack.id)} title={`${attack.hint} ${why}.`}>
                  <span className="action-cursor">◆</span>
                  <span className="attack-name">{attack.name}</span>
                  <span className="attack-pow">{attack.power > 0 ? `+${attack.power}` : attack.power < 0 ? `${attack.power}` : "±0"}</span>
                  <span className="attack-rng">rng {lo === hi ? hi : `${lo}–${hi}`}</span>
                  <span className="attack-why">{why}</span>
                </button>
              );
            })}
            <button className="action-row back" onClick={cancelPending}>
              <span className="action-cursor">◆</span>Back
            </button>
          </>
        )}

        {menuPage === "target" && (
          <>
            <div className="action-title">{chosen?.attack.name ?? verb}</div>
            <div className="action-hint">
              Click a {healer ? "green" : "red"} target ({targets.length})
            </div>
            <button className="action-row back" onClick={cancelPending}>
              <span className="action-cursor">◆</span>Back
            </button>
          </>
        )}
      </div>
    </Html>
  );
}
