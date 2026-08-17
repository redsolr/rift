"use client";
import { useGame } from "@/store/game";
import { attackById } from "@/sim/attacks";

/**
 * FE target step: the picker is gone; a single centred prompt names the attack and how to
 * confirm / back out. The red tiles show where, the battle bar shows the numbers.
 */
export default function AttackPrompt() {
  const menuPage = useGame((s) => s.menuPage);
  const pendingAttack = useGame((s) => s.pendingAttack);
  const targets = useGame((s) => s.targets);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);
  if (menuPage !== "target" || !pendingAttack || !selectedDef) return null;
  const a = attackById(selectedDef, pendingAttack);
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  return (
    <div className="attack-prompt" aria-live="polite">
      <div className="ap-main">
        <span className="ap-key">{coarse ? "TAP" : "▸"}</span> {a.name}
        <span className="ap-sub">
          {a.kind === "heal" ? "click a green ally" : "click a red target"} ({targets.length})
        </span>
      </div>
      <div className="ap-cancel">{coarse ? "Tap elsewhere · back" : "Right-click empty · back"}</div>
    </div>
  );
}
