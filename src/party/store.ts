"use client";
import { create } from "zustand";
import { Equipment, ItemDef, STARTER_KIT, Slot, rollLoot } from "@/sim/items";
import { pitBracket } from "@/sim/pit";
import { defaultConfig } from "@/sim/presets";
import { UnitDef } from "@/sim/types";
import { useGame } from "@/store/game";
import { Inventory, addToBag, destroyWorn, discard, emptyInventory, equipFromBag, moveInBag, moveSlot, unequipToBag } from "./inventory";

/**
 * The PARTY — your five heroes and what they carry. Persisted (localStorage `tactician.party`), shared by the
 * campaign and the skirmish page, and pushed into the game store (`useGame.setGear`) so every battle config that
 * contains a hero (same unit id as the default squad: bk1 … bh5) is built with geared stats. The character screen
 * (`C` / `I`) edits it. Exposed as `window.__party` for probes.
 */
const KEY = "tactician.party";

/** the roster = the blue side of the default squad (ids are stable: the counter resets in defaultConfig) */
export const PARTY: UnitDef[] = defaultConfig().units.filter((u) => u.team === "blue");
export const PARTY_IDS = PARTY.map((u) => u.id);
export const partyMember = (id: string): UnitDef | null => PARTY.find((u) => u.id === id) ?? null;

export type Carry = { kind: "bag"; cell: number } | { kind: "slot"; slot: Slot };
export type Hover = Carry | null;

export interface PartyState extends Inventory {
  hydrated: boolean;
  /** floors whose first-clear reward has been handed out */
  looted: number[];
  /** the character screen */
  open: boolean;
  hero: string;
  /** item being dragged (pointer) or picked (click) */
  carry: Carry | null;
  /** last drop feedback: shown briefly on the screen */
  notice: { text: string; bad: boolean; seq: number } | null;
  /** most recent loot handed out (the "you found …" toast on the floor-cleared card) */
  lastLoot: { floor: number; item: ItemDef } | null;

  hydrate: () => void;
  openScreen: (hero?: string) => void;
  closeScreen: () => void;
  toggleScreen: () => void;
  setHero: (id: string) => void;
  setCarry: (c: Carry | null) => void;
  /** drop whatever is carried onto a target (bag cell / slot / trash); returns whether it landed */
  dropOn: (target: Carry | { kind: "trash" }) => boolean;
  /** right-click fast path: bag → equip on the hero, slot → unequip */
  quick: (c: Carry) => boolean;
  /** first clear of Tower floor N → one item into the bag (deterministic per floor); returns it, or null if already claimed / bag full */
  grantFloorLoot: (floor: number) => ItemDef | null;
  /** dev / probe: put an item into the bag */
  give: (itemId: string) => boolean;
}

function load(): { inv: Inventory; looted: number[] } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const inv = emptyInventory();
    if (Array.isArray(j.bag)) j.bag.slice(0, inv.bag.length).forEach((v: unknown, i: number) => (inv.bag[i] = typeof v === "string" ? v : null));
    if (j.equipment && typeof j.equipment === "object") inv.equipment = j.equipment as Record<string, Equipment>;
    return { inv, looted: Array.isArray(j.looted) ? j.looted.filter((n: unknown) => typeof n === "number") : [] };
  } catch {
    return null;
  }
}

function persist(s: Pick<PartyState, "bag" | "equipment" | "looted">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ bag: s.bag, equipment: s.equipment, looted: s.looted }));
  } catch {
    /* private mode */
  }
}

export const useParty = create<PartyState>((set, get) => {
  const hero = () => partyMember(get().hero) ?? PARTY[0];
  const commit = (inv: Inventory | null, ok: string, bad: string): boolean => {
    const seq = (get().notice?.seq ?? 0) + 1;
    if (!inv) {
      set({ notice: { text: bad, bad: true, seq }, carry: null });
      return false;
    }
    set({ ...inv, notice: ok ? { text: ok, bad: false, seq } : null, carry: null });
    return true;
  };
  return {
    ...emptyInventory(),
    hydrated: false,
    looted: [],
    open: false,
    hero: PARTY[0].id,
    carry: null,
    notice: null,
    lastLoot: null,

    hydrate: () => {
      if (get().hydrated) return;
      const stored = load();
      if (stored) set({ ...stored.inv, looted: stored.looted, hydrated: true });
      else {
        // first launch: the starter kit in the bag
        let inv = emptyInventory();
        for (const id of STARTER_KIT) inv = addToBag(inv, id) ?? inv;
        set({ ...inv, hydrated: true });
      }
    },
    openScreen: (h) => set({ open: true, hero: h && partyMember(h) ? h : get().hero, carry: null }),
    closeScreen: () => set({ open: false, carry: null }),
    toggleScreen: () => (get().open ? get().closeScreen() : get().openScreen()),
    setHero: (id) => {
      if (partyMember(id)) set({ hero: id, carry: null });
    },
    setCarry: (carry) => set({ carry }),
    dropOn: (target) => {
      const c = get().carry;
      if (!c) return false;
      const u = hero();
      const inv: Inventory = { bag: get().bag, equipment: get().equipment };
      if (target.kind === "trash") {
        if (c.kind === "bag") return commit(discard(inv, c.cell), "Destroyed", "Nothing to destroy");
        return commit(destroyWorn(inv, u, c.slot), "Destroyed", "Nothing to destroy");
      }
      if (c.kind === "bag" && target.kind === "bag") return commit(moveInBag(inv, c.cell, target.cell), "", "");
      if (c.kind === "bag" && target.kind === "slot") return commit(equipFromBag(inv, u, c.cell, target.slot), "Equipped", `${u.name} cannot wear that there`);
      if (c.kind === "slot" && target.kind === "bag") return commit(unequipToBag(inv, u, c.slot, target.cell), "Unequipped", "That does not fit here");
      if (c.kind === "slot" && target.kind === "slot") return commit(moveSlot(inv, u, c.slot, target.slot), "", "That does not fit there");
      return false;
    },
    quick: (c) => {
      const u = hero();
      const inv: Inventory = { bag: get().bag, equipment: get().equipment };
      if (c.kind === "bag") return commit(equipFromBag(inv, u, c.cell), "Equipped", `${u.name} cannot use that`);
      return commit(unequipToBag(inv, u, c.slot), "Unequipped", "Bag is full");
    },
    grantFloorLoot: (floor) => {
      if (get().looted.includes(floor)) return null;
      const item = rollLoot(floor, pitBracket(floor));
      const inv = addToBag({ bag: get().bag, equipment: get().equipment }, item.id);
      if (!inv) return null; // bag full: the reward waits for the next clear (looted not marked)
      set({ ...inv, looted: [...get().looted, floor], lastLoot: { floor, item } });
      return item;
    },
    give: (itemId) => {
      const inv = addToBag({ bag: get().bag, equipment: get().equipment }, itemId);
      if (!inv) return false;
      set(inv);
      return true;
    },
  };
});

// persistence + push the paper-dolls into the game store (it regears every config it loads or holds)
useParty.subscribe((s, prev) => {
  if (!s.hydrated) return;
  if (s.bag !== prev.bag || s.equipment !== prev.equipment || s.looted !== prev.looted) persist(s);
  if (s.equipment !== prev.equipment || s.hydrated !== prev.hydrated) useGame.getState().setGear(s.equipment);
});
