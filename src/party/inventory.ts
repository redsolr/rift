import { Equipment, Slot, canEquip, itemById, slotsForKind } from "@/sim/items";
import { UnitDef } from "@/sim/types";

/**
 * Pure inventory operations (WoW shape): ONE shared bag of fixed-size cells (null = empty) + a paper-doll per hero.
 * Every op returns a new state or `null` when the move is illegal — the store and the screen never decide legality
 * themselves. Tested in `__tests__/inventory.test.ts`.
 */
export const BAG_SIZE = 32;

export interface Inventory {
  bag: (string | null)[];
  /** hero id → paper-doll */
  equipment: Record<string, Equipment>;
}

export const emptyInventory = (): Inventory => ({ bag: Array(BAG_SIZE).fill(null), equipment: {} });

export const firstFree = (bag: (string | null)[]): number => bag.findIndex((c) => c === null);

/** put an item in the first free cell; null when the bag is full */
export function addToBag(inv: Inventory, itemId: string): Inventory | null {
  const i = firstFree(inv.bag);
  if (i < 0) return null;
  const bag = [...inv.bag];
  bag[i] = itemId;
  return { ...inv, bag };
}

/** move / swap two bag cells */
export function moveInBag(inv: Inventory, from: number, to: number): Inventory | null {
  if (from === to || from < 0 || to < 0 || from >= inv.bag.length || to >= inv.bag.length || inv.bag[from] === null) return null;
  const bag = [...inv.bag];
  [bag[from], bag[to]] = [bag[to], bag[from]];
  return { ...inv, bag };
}

/** the slot an item from the bag would go to for `u`: an empty matching slot first, else the first matching one (swap) */
export function targetSlot(inv: Inventory, u: UnitDef, itemId: string): Slot | null {
  const item = itemById(itemId);
  const slots = slotsForKind(item.slot).filter((s) => canEquip(u, item, s));
  if (!slots.length) return null;
  const eq = inv.equipment[u.id] ?? {};
  return slots.find((s) => !eq[s]) ?? slots[0];
}

/** equip bag cell `from` onto `u` at `slot` (or the natural slot); whatever was worn goes back into that cell */
export function equipFromBag(inv: Inventory, u: UnitDef, from: number, slot?: Slot): Inventory | null {
  const itemId = inv.bag[from];
  if (!itemId) return null;
  const s = slot ?? targetSlot(inv, u, itemId);
  if (!s || !canEquip(u, itemById(itemId), s)) return null;
  const eq = { ...(inv.equipment[u.id] ?? {}) };
  const bag = [...inv.bag];
  bag[from] = eq[s] ?? null;
  eq[s] = itemId;
  return { bag, equipment: { ...inv.equipment, [u.id]: eq } };
}

/** take the item off `slot` into bag cell `to` (or the first free cell); null when the bag is full / slot empty */
export function unequipToBag(inv: Inventory, u: UnitDef, slot: Slot, to?: number): Inventory | null {
  const eq = { ...(inv.equipment[u.id] ?? {}) };
  const itemId = eq[slot];
  if (!itemId) return null;
  const bag = [...inv.bag];
  const cell = to ?? firstFree(bag);
  if (cell < 0 || cell >= bag.length) return null;
  if (bag[cell] !== null) {
    // dropping onto an occupied cell = swap only if that item fits the slot
    const other = bag[cell]!;
    if (!canEquip(u, itemById(other), slot)) return null;
    eq[slot] = other;
  } else delete eq[slot];
  bag[cell] = itemId;
  return { bag, equipment: { ...inv.equipment, [u.id]: eq } };
}

/** move a worn item between two slots of the same hero (ring1 ↔ ring2), swapping */
export function moveSlot(inv: Inventory, u: UnitDef, from: Slot, to: Slot): Inventory | null {
  if (from === to) return null;
  const eq = { ...(inv.equipment[u.id] ?? {}) };
  const a = eq[from];
  if (!a) return null;
  const b = eq[to];
  if (!canEquip(u, itemById(a), to) || (b && !canEquip(u, itemById(b), from))) return null;
  eq[to] = a;
  if (b) eq[from] = b;
  else delete eq[from];
  return { ...inv, equipment: { ...inv.equipment, [u.id]: eq } };
}

/** destroy a bag item */
export function discard(inv: Inventory, cell: number): Inventory | null {
  if (inv.bag[cell] === null) return null;
  const bag = [...inv.bag];
  bag[cell] = null;
  return { ...inv, bag };
}

/** destroy a worn item outright */
export function destroyWorn(inv: Inventory, u: UnitDef, slot: Slot): Inventory | null {
  const eq = { ...(inv.equipment[u.id] ?? {}) };
  if (!eq[slot]) return null;
  delete eq[slot];
  return { ...inv, equipment: { ...inv.equipment, [u.id]: eq } };
}
