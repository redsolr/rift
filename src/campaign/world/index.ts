import { KITCHEN } from "./kitchen";
import { VILLAGE } from "./village";
import type { Exit, Spawn, Zone, ZoneId } from "./types";

/** every zone in the campaign world, by id */
export const ZONES: Record<ZoneId, Zone> = { kitchen: KITCHEN, village: VILLAGE };

export const exitOf = (zone: ZoneId, exitId: string): Exit => {
  const e = ZONES[zone].exits.find((x) => x.id === exitId);
  if (!e) throw new Error(`campaign world: zone "${zone}" has no exit "${exitId}"`);
  return e;
};

/** where you stand after walking through `from` in `fromZone` */
export const arrivalOf = (fromZone: ZoneId, from: string): { zone: ZoneId; spawn: Spawn } => {
  const e = exitOf(fromZone, from);
  return { zone: e.to.zone, spawn: exitOf(e.to.zone, e.to.exit).spawn };
};

export type { Zone, ZoneId, Exit, Spawn } from "./types";
