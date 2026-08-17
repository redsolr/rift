import { DoctrineAggression, DoctrineObjective, Personality, Stance, Stats, TargetPref } from "@/sim/types";

export const STANCES: { id: Stance; label: string }[] = [
  { id: "hold", label: "Hold position" },
  { id: "advance", label: "Advance" },
  { id: "pursue", label: "Pursue" },
];
export const PREFS: { id: TargetPref; label: string }[] = [
  { id: "nearest", label: "Nearest" },
  { id: "weakest", label: "Weakest" },
  { id: "wounded", label: "Wounded" },
  { id: "ranged", label: "Ranged units" },
  { id: "healers", label: "Healers" },
];
export const AGGR: { id: DoctrineAggression; label: string }[] = [
  { id: "very_defensive", label: "Very defensive" },
  { id: "defensive", label: "Defensive" },
  { id: "balanced", label: "Balanced" },
  { id: "aggressive", label: "Aggressive" },
  { id: "all_out", label: "All-out attack" },
];
export const OBJ: { id: DoctrineObjective; label: string }[] = [
  { id: "hold", label: "Hold" },
  { id: "advance", label: "Advance" },
  { id: "capture", label: "Capture objective" },
  { id: "protect", label: "Protect" },
];
export const PERSONALITY_KEYS: (keyof Personality)[] = ["aggression", "courage", "discipline", "intelligence", "loyalty"];
export const STAT_KEYS: (keyof Stats)[] = ["hp", "atk", "def", "spd", "mov", "rangeMin", "rangeMax"];

