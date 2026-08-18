import { describe, expect, it } from "vitest";
import { makeUnit } from "@/sim/presets";
import { BAG_SIZE, addToBag, destroyWorn, discard, emptyInventory, equipFromBag, firstFree, moveInBag, moveSlot, targetSlot, unequipToBag } from "../inventory";

const knight = makeUnit("blue", "knight", 0, 0);
const mage = makeUnit("blue", "mage", 0, 0);

describe("inventory — bag", () => {
  it("adds into the first free cell and refuses when full", () => {
    let inv = emptyInventory();
    expect(inv.bag.length).toBe(BAG_SIZE);
    inv = addToBag(inv, "ring_of_vigor")!;
    expect(inv.bag[0]).toBe("ring_of_vigor");
    for (let i = 1; i < BAG_SIZE; i++) inv = addToBag(inv, "lucky_coin")!;
    expect(firstFree(inv.bag)).toBe(-1);
    expect(addToBag(inv, "lucky_coin")).toBeNull();
  });
  it("moves and swaps cells; a move from an empty cell is illegal", () => {
    let inv = addToBag(addToBag(emptyInventory(), "ring_of_vigor")!, "lucky_coin")!;
    inv = moveInBag(inv, 0, 5)!;
    expect(inv.bag[0]).toBeNull();
    expect(inv.bag[5]).toBe("ring_of_vigor");
    inv = moveInBag(inv, 1, 5)!;
    expect(inv.bag[1]).toBe("ring_of_vigor");
    expect(inv.bag[5]).toBe("lucky_coin");
    expect(moveInBag(inv, 0, 3)).toBeNull();
    expect(moveInBag(inv, 1, 1)).toBeNull();
  });
  it("discards", () => {
    const inv = addToBag(emptyInventory(), "lucky_coin")!;
    expect(discard(inv, 0)!.bag[0]).toBeNull();
    expect(discard(inv, 3)).toBeNull();
  });
});

describe("inventory — paper doll", () => {
  it("equips into the natural slot, swaps what was worn back into the same cell", () => {
    let inv = addToBag(addToBag(emptyInventory(), "steel_lance")!, "silver_lance")!;
    expect(targetSlot(inv, knight, "steel_lance")).toBe("weapon");
    inv = equipFromBag(inv, knight, 0)!;
    expect(inv.equipment[knight.id].weapon).toBe("steel_lance");
    expect(inv.bag[0]).toBeNull();
    inv = equipFromBag(inv, knight, 1)!;
    expect(inv.equipment[knight.id].weapon).toBe("silver_lance");
    expect(inv.bag[1]).toBe("steel_lance"); // the old weapon took the cell
  });
  it("two rings: the second ring goes to the free ring slot; a third swaps ring1", () => {
    let inv = emptyInventory();
    for (const id of ["ring_of_vigor", "ring_of_might", "ring_of_haste"]) inv = addToBag(inv, id)!;
    inv = equipFromBag(inv, knight, 0)!;
    inv = equipFromBag(inv, knight, 1)!;
    expect(inv.equipment[knight.id]).toEqual({ ring1: "ring_of_vigor", ring2: "ring_of_might" });
    inv = equipFromBag(inv, knight, 2)!;
    expect(inv.equipment[knight.id].ring1).toBe("ring_of_haste");
    expect(inv.bag[2]).toBe("ring_of_vigor");
    // rings can trade places
    inv = moveSlot(inv, knight, "ring1", "ring2")!;
    expect(inv.equipment[knight.id]).toEqual({ ring1: "ring_of_might", ring2: "ring_of_haste" });
    expect(moveSlot(inv, knight, "ring1", "head")).toBeNull();
  });
  it("refuses the wrong class and the wrong slot", () => {
    const inv = addToBag(emptyInventory(), "steel_lance")!;
    expect(equipFromBag(inv, mage, 0)).toBeNull();
    expect(equipFromBag(inv, knight, 0, "head")).toBeNull();
    expect(targetSlot(inv, mage, "steel_lance")).toBeNull();
  });
  it("unequips into the first free cell, or a chosen cell; a full bag blocks it", () => {
    let inv = equipFromBag(addToBag(emptyInventory(), "leather_cap")!, knight, 0)!;
    inv = unequipToBag(inv, knight, "head")!;
    expect(inv.equipment[knight.id].head).toBeUndefined();
    expect(inv.bag[0]).toBe("leather_cap");
    inv = equipFromBag(inv, knight, 0)!;
    inv = unequipToBag(inv, knight, "head", 7)!;
    expect(inv.bag[7]).toBe("leather_cap");
    expect(unequipToBag(inv, knight, "head")).toBeNull(); // nothing worn
    let full = equipFromBag(addToBag(emptyInventory(), "leather_cap")!, knight, 0)!;
    for (let i = 0; i < BAG_SIZE; i++) full = addToBag(full, "lucky_coin")!;
    expect(unequipToBag(full, knight, "head")).toBeNull();
  });
  it("dropping a worn item onto an occupied cell swaps only if that item fits the slot", () => {
    let inv = emptyInventory();
    inv = addToBag(inv, "leather_cap")!; // 0
    inv = addToBag(inv, "iron_helm")!; // 1
    inv = addToBag(inv, "lucky_coin")!; // 2
    inv = equipFromBag(inv, knight, 0)!;
    expect(unequipToBag(inv, knight, "head", 2)).toBeNull(); // a coin is not a helmet
    inv = unequipToBag(inv, knight, "head", 1)!;
    expect(inv.equipment[knight.id].head).toBe("iron_helm");
    expect(inv.bag[1]).toBe("leather_cap");
  });
  it("destroys a worn item outright", () => {
    const inv = equipFromBag(addToBag(emptyInventory(), "leather_cap")!, knight, 0)!;
    expect(destroyWorn(inv, knight, "head")!.equipment[knight.id].head).toBeUndefined();
    expect(destroyWorn(inv, knight, "chest")).toBeNull();
  });
});
