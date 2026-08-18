"use client";
import { useMemo } from "react";
import { useGame } from "@/store/game";

/**
 * The command page's numbers, computed ONCE for every surface that shows them (in-world ActionMenu, phone
 * ActionCluster, SkillPanel): the selected unit's attack options from the pending tile, how many distinct enemies
 * any attack reaches, how many wounded allies any heal reaches, and whether the unit owns heals at all.
 */
export function useCommandOptions() {
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const pendingMove = useGame((s) => s.pendingMove);
  const menuPage = useGame((s) => s.menuPage);
  const options = useMemo(() => (battle && selected && pendingMove && menuPage ? battle.attackOptions(selected, pendingMove) : []), [battle, selected, pendingMove, menuPage]);
  return useMemo(() => {
    const reach = (kind: "attack" | "heal") => new Set(options.filter((o) => o.attack.kind === kind).flatMap((o) => o.targets)).size;
    return { options, nAttack: reach("attack"), nHeal: reach("heal"), hasHeals: options.some((o) => o.attack.kind === "heal") };
  }, [options]);
}
