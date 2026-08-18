import { Rng } from "./rng";
import { Archetype, Stats, UnitDef } from "./types";

/**
 * Items + equipment — WoW-shaped: a paper-doll of SLOTS per hero, each holding one item that adds flat stat
 * modifiers. Pure data + pure resolvers: `applyEquipment(base, equipment)` is the ONE definition of "what does this
 * hero's gear add" — the store writes the result into `UnitDef.stats` before a battle (keeping the ungeared numbers
 * in `UnitDef.base`), so the engine, cards, forecast and AI all read geared stats without knowing items exist.
 * Loot is deterministic: `rollLoot(floor)` for a Tower floor is a function of the floor number only.
 */
/** WoW paper-doll: 8 down the left (armour), 8 down the right (legs / feet / jewellery / relic / banner), weapons under the model */
export type Slot = "head" | "neck" | "shoulders" | "back" | "chest" | "wrist" | "hands" | "waist" | "legs" | "feet" | "ring1" | "ring2" | "trinket1" | "trinket2" | "relic" | "banner" | "weapon" | "offhand";
/** which slot(s) an item may sit in — a "ring" fits either ring slot, a "trinket" either trinket slot */
export type SlotKind = "head" | "neck" | "shoulders" | "back" | "chest" | "wrist" | "hands" | "waist" | "legs" | "feet" | "ring" | "trinket" | "relic" | "banner" | "weapon" | "offhand";
export type Rarity = "common" | "uncommon" | "rare" | "epic";

export const SLOTS: Slot[] = ["head", "neck", "shoulders", "back", "chest", "wrist", "hands", "waist", "legs", "feet", "ring1", "ring2", "trinket1", "trinket2", "relic", "banner", "weapon", "offhand"];
export const SLOT_LABEL: Record<Slot, string> = { head: "Head", neck: "Neck", shoulders: "Shoulders", back: "Back", chest: "Chest", wrist: "Wrist", hands: "Hands", waist: "Waist", legs: "Legs", feet: "Feet", ring1: "Ring", ring2: "Ring", trinket1: "Trinket", trinket2: "Trinket", relic: "Relic", banner: "Banner", weapon: "Weapon", offhand: "Off-hand" };
export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic"];
export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic" };

export type ItemMods = Partial<Pick<Stats, "hp" | "atk" | "def" | "spd" | "mov">>;

export interface ItemDef {
  id: string;
  name: string;
  slot: SlotKind;
  rarity: Rarity;
  mods: ItemMods;
  /** who may wear it; undefined = anyone */
  classes?: Archetype[];
  /** small glyph drawn in the slot / bag cell */
  glyph: string;
  flavour: string;
  /** lowest Tower bracket (0 = floors 1–5) that may drop it */
  tier: number;
}

/** slot kind ↔ paper-doll slot */
export const slotKindOf = (s: Slot): SlotKind => (s === "ring1" || s === "ring2" ? "ring" : s === "trinket1" || s === "trinket2" ? "trinket" : s);
export const slotsForKind = (k: SlotKind): Slot[] => (k === "ring" ? ["ring1", "ring2"] : k === "trinket" ? ["trinket1", "trinket2"] : [k]);

const I = (id: string, name: string, slot: SlotKind, rarity: Rarity, mods: ItemMods, glyph: string, flavour: string, tier = 0, classes?: Archetype[]): ItemDef => ({ id, name, slot, rarity, mods, glyph, flavour, tier, classes });

const MELEE: Archetype[] = ["knight", "fighter"];
const CASTER: Archetype[] = ["mage", "healer"];

export const ITEMS: ItemDef[] = [
  // ---- weapons (class-bound) ----
  I("steel_lance", "Steel Lance", "weapon", "uncommon", { atk: 2 }, "🔱", "A soldier's lance, honestly forged.", 0, ["knight"]),
  I("silver_lance", "Silver Lance", "weapon", "rare", { atk: 4, spd: -1 }, "🔱", "Bright, heavy, and unforgiving.", 1, ["knight"]),
  I("steel_axe", "Steel Axe", "weapon", "uncommon", { atk: 2 }, "🪓", "Chops wood and worse.", 0, ["fighter"]),
  I("brave_axe", "Brave Axe", "weapon", "epic", { atk: 5, def: -1 }, "🪓", "Swings twice in every story told about it.", 2, ["fighter"]),
  I("steel_bow", "Steel Bow", "weapon", "uncommon", { atk: 2 }, "🏹", "A hunter's bow with a steel core.", 0, ["archer"]),
  I("longbow", "Longbow", "weapon", "rare", { atk: 3, spd: 1 }, "🏹", "Reaches further than the eye trusts.", 1, ["archer"]),
  I("thunder_tome", "Thunder Tome", "weapon", "uncommon", { atk: 2 }, "📖", "The pages crackle when turned.", 0, ["mage"]),
  I("bolganone", "Bolganone", "weapon", "epic", { atk: 5, hp: -2 }, "📖", "A tome that burns the reader a little.", 2, ["mage"]),
  I("mend_staff", "Mend Staff", "weapon", "uncommon", { atk: 2 }, "🪄", "Warm to the touch.", 0, ["healer"]),
  I("physic_staff", "Physic Staff", "weapon", "rare", { atk: 3, mov: 1 }, "🪄", "Light enough to run with.", 1, ["healer"]),
  // ---- off-hand ----
  I("wooden_buckler", "Wooden Buckler", "offhand", "common", { def: 1 }, "🛡️", "Better than a forearm.", 0, MELEE),
  I("iron_shield", "Iron Shield", "offhand", "uncommon", { def: 2, spd: -1 }, "🛡️", "Heavy. Worth it.", 0, MELEE),
  I("tower_shield", "Tower Shield", "offhand", "rare", { def: 4, spd: -2, hp: 4 }, "🛡️", "You are the wall now.", 2, ["knight"]),
  I("quiver_of_wind", "Quiver of Wind", "offhand", "rare", { spd: 2, atk: 1 }, "🎯", "Arrows leave it before you reach for them.", 1, ["archer"]),
  I("focus_crystal", "Focus Crystal", "offhand", "uncommon", { atk: 1, spd: 1 }, "🔮", "Hums at the pitch of a held breath.", 0, CASTER),
  I("orb_of_embers", "Orb of Embers", "offhand", "epic", { atk: 3, hp: 3 }, "🔮", "Never cools.", 3, CASTER),
  // ---- head ----
  I("leather_cap", "Leather Cap", "head", "common", { def: 1 }, "🪖", "Keeps the rain off.", 0),
  I("iron_helm", "Iron Helm", "head", "uncommon", { def: 2, hp: 2 }, "🪖", "Dented by someone else's mistake.", 0, MELEE),
  I("hood_of_stillness", "Hood of Stillness", "head", "rare", { spd: 2, def: 1 }, "🧢", "Footsteps forget to happen.", 1, ["archer", "mage", "healer"]),
  I("circlet_of_insight", "Circlet of Insight", "head", "epic", { atk: 3, hp: 4 }, "👑", "It knows what you are about to do.", 3, CASTER),
  // ---- shoulders ----
  I("padded_shoulders", "Padded Shoulders", "shoulders", "common", { hp: 2 }, "🧥", "Quilted twice.", 0),
  I("steel_pauldrons", "Steel Pauldrons", "shoulders", "uncommon", { def: 2, spd: -1 }, "🧥", "The kind you hear coming.", 1, MELEE),
  I("mantle_of_the_hawk", "Mantle of the Hawk", "shoulders", "rare", { spd: 1, atk: 2 }, "🧥", "Feathers that remember the wind.", 2, ["archer"]),
  // ---- chest ----
  I("leather_jerkin", "Leather Jerkin", "chest", "common", { def: 1, hp: 2 }, "🥋", "Oiled and worn soft.", 0),
  I("chainmail", "Chainmail", "chest", "uncommon", { def: 3, spd: -1, hp: 3 }, "🥋", "Ten thousand small promises.", 0, MELEE),
  I("plate_of_the_bastion", "Plate of the Bastion", "chest", "epic", { def: 5, hp: 8, spd: -2 }, "🥋", "Sieges have broken on it.", 3, ["knight"]),
  I("robe_of_cinders", "Robe of Cinders", "chest", "rare", { atk: 2, hp: 4 }, "🥋", "Smells faintly of a hearth.", 1, CASTER),
  // ---- hands ----
  I("cloth_gloves", "Cloth Gloves", "hands", "common", { spd: 1 }, "🧤", "Thin, but a grip is a grip.", 0),
  I("gauntlets", "Gauntlets", "hands", "uncommon", { atk: 1, def: 1 }, "🧤", "Articulated iron.", 1, MELEE),
  I("gloves_of_the_marksman", "Gloves of the Marksman", "hands", "rare", { atk: 2, spd: 1 }, "🧤", "The string never bites.", 2, ["archer"]),
  // ---- feet ----
  I("worn_boots", "Worn Boots", "feet", "common", { spd: 1 }, "👢", "Broken in by someone taller.", 0),
  I("swift_boots", "Swift Boots", "feet", "rare", { mov: 1 }, "👢", "One more tile. Every time.", 1),
  I("greaves", "Greaves", "feet", "uncommon", { def: 2 }, "👢", "Shins have enemies too.", 0, MELEE),
  I("boots_of_the_gale", "Boots of the Gale", "feet", "epic", { mov: 1, spd: 2 }, "👢", "The ground is a suggestion.", 3),
  // ---- neck ----
  I("cord_of_the_ford", "Cord of the Ford", "neck", "common", { hp: 2 }, "📿", "River-smooth beads.", 0),
  I("amulet_of_focus", "Amulet of Focus", "neck", "uncommon", { atk: 1, spd: 1 }, "📿", "It quiets the hands.", 0),
  I("gorget_of_iron", "Gorget of Iron", "neck", "rare", { def: 2, hp: 3 }, "📿", "The throat is where they aim.", 1, MELEE),
  I("pendant_of_dawn", "Pendant of Dawn", "neck", "epic", { atk: 2, hp: 5 }, "📿", "It warms as the sun rises.", 3, CASTER),
  // ---- back ----
  I("travel_cloak", "Travel Cloak", "back", "common", { hp: 2 }, "🧣", "Rain rolls off it.", 0),
  I("hunters_cape", "Hunter's Cape", "back", "uncommon", { spd: 1, atk: 1 }, "🧣", "Green as the underbrush.", 0, ["archer"]),
  I("cloak_of_shadows", "Cloak of Shadows", "back", "rare", { spd: 2, def: 1 }, "🧣", "It arrives after you do.", 2),
  I("mantle_of_the_wall", "Mantle of the Wall", "back", "rare", { def: 3 }, "🧣", "Woven with wire.", 1, MELEE),
  // ---- wrist ----
  I("leather_bracers", "Leather Bracers", "wrist", "common", { def: 1 }, "⌚", "The forearm's friend.", 0),
  I("iron_vambraces", "Iron Vambraces", "wrist", "uncommon", { def: 1, atk: 1 }, "⌚", "They turn a blade.", 1, MELEE),
  I("silk_bindings", "Silk Bindings", "wrist", "uncommon", { atk: 1, spd: 1 }, "⌚", "Light enough to forget.", 0, CASTER),
  I("bracers_of_the_hawk", "Bracers of the Hawk", "wrist", "epic", { atk: 3, spd: 1 }, "⌚", "The string never slips.", 3, ["archer"]),
  // ---- waist ----
  I("rope_belt", "Rope Belt", "waist", "common", { hp: 1 }, "🪢", "Holds everything up.", 0),
  I("studded_girdle", "Studded Girdle", "waist", "uncommon", { def: 1, hp: 2 }, "🪢", "Rivets like teeth.", 0, MELEE),
  I("sash_of_embers", "Sash of Embers", "waist", "rare", { atk: 2 }, "🪢", "Never quite cool.", 2, CASTER),
  I("belt_of_the_titan", "Belt of the Titan", "waist", "epic", { hp: 6, def: 2 }, "🪢", "Someone very large is missing this.", 3),
  // ---- legs ----
  I("cloth_leggings", "Cloth Leggings", "legs", "common", { spd: 1 }, "👖", "Patched at the knee.", 0),
  I("leather_leggings", "Leather Leggings", "legs", "uncommon", { def: 1, spd: 1 }, "👖", "Creak when you kneel.", 0),
  I("mail_chausses", "Mail Chausses", "legs", "rare", { def: 3, spd: -1 }, "👖", "Ten thousand small promises, lower.", 1, MELEE),
  I("legplates_of_the_bastion", "Legplates of the Bastion", "legs", "epic", { def: 4, hp: 5, spd: -1 }, "👖", "The siege ended before they dented.", 3, ["knight"]),
  // ---- relic (class-bound keepsakes) ----
  I("knights_crest", "Knight's Crest", "relic", "rare", { def: 2, hp: 2 }, "🛡", "An oath in enamel.", 1, ["knight"]),
  I("berserkers_totem", "Berserker's Totem", "relic", "rare", { atk: 3, def: -1 }, "🗿", "It hums before a charge.", 1, ["fighter"]),
  I("hawks_feather", "Hawk's Feather", "relic", "rare", { spd: 2, atk: 1 }, "🪶", "It points at the wind.", 1, ["archer"]),
  I("arcane_focus", "Arcane Focus", "relic", "rare", { atk: 3 }, "🔮", "A lens for the will.", 1, ["mage"]),
  I("saints_relic", "Saint's Relic", "relic", "rare", { atk: 2, hp: 3 }, "📜", "A finger bone in silver.", 1, ["healer"]),
  I("relic_of_the_tower", "Relic of the Tower", "relic", "epic", { atk: 2, def: 2, spd: 1 }, "🏛", "From a floor no one remembers.", 3),
  // ---- banner (the standard you march under) ----
  I("company_pennant", "Company Pennant", "banner", "common", { hp: 2 }, "🚩", "Faded, but yours.", 0),
  I("banner_of_march", "Banner of March", "banner", "uncommon", { mov: 1, def: -1 }, "🚩", "Feet find the road.", 1),
  I("standard_of_iron", "Standard of Iron", "banner", "rare", { def: 2, hp: 2 }, "🚩", "Held, never dropped.", 2),
  I("banner_of_the_vanguard", "Banner of the Vanguard", "banner", "epic", { atk: 2, mov: 1 }, "🚩", "Where it goes, the line goes.", 3),
  // ---- rings ----
  I("ring_of_vigor", "Ring of Vigor", "ring", "common", { hp: 3 }, "💍", "A little more, every morning.", 0),
  I("ring_of_might", "Ring of Might", "ring", "uncommon", { atk: 1 }, "💍", "It tightens before a fight.", 0),
  I("ring_of_the_oak", "Ring of the Oak", "ring", "uncommon", { def: 1 }, "💍", "Carved from a tree that would not fall.", 0),
  I("ring_of_haste", "Ring of Haste", "ring", "rare", { spd: 2 }, "💍", "The clock disagrees with it.", 1),
  I("signet_of_the_tower", "Signet of the Tower", "ring", "epic", { atk: 2, def: 2, hp: 3 }, "💍", "Given to those who climb.", 3),
  // ---- trinkets ----
  I("lucky_coin", "Lucky Coin", "trinket", "common", { spd: 1 }, "🪙", "Heads, so far.", 0),
  I("bear_charm", "Bear Charm", "trinket", "uncommon", { hp: 4 }, "🧸", "A tooth on a cord.", 0),
  I("hourglass_shard", "Hourglass Shard", "trinket", "rare", { mov: 1, hp: -2 }, "⏳", "Time owed, not given.", 2),
  I("dragon_scale", "Dragon Scale", "trinket", "epic", { def: 3, atk: 1 }, "🐉", "Still warm.", 3),
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id: string): ItemDef => {
  const i = BY_ID.get(id);
  if (!i) throw new Error(`unknown item ${id}`);
  return i;
};
export const itemOrNull = (id: string | null | undefined): ItemDef | null => (id ? (BY_ID.get(id) ?? null) : null);

/** paper-doll: slot → item id */
export type Equipment = Partial<Record<Slot, string>>;

/** may `u` wear `item` at all (class), and does `slot` accept it (kind)? */
export function canEquip(u: Pick<UnitDef, "archetype">, item: ItemDef, slot: Slot): boolean {
  if (slotKindOf(slot) !== item.slot) return false;
  return !item.classes || item.classes.includes(u.archetype);
}

/** the geared stats: base + every equipped item's mods, floored so nothing goes below 1 (mov/spd/def may reach 0) */
export function applyEquipment(base: Stats, eq: Equipment): Stats {
  const out: Stats = { ...base };
  for (const slot of SLOTS) {
    const item = itemOrNull(eq[slot]);
    if (!item) continue;
    for (const k of Object.keys(item.mods) as (keyof ItemMods)[]) out[k] += item.mods[k] ?? 0;
  }
  out.hp = Math.max(1, out.hp);
  out.atk = Math.max(0, out.atk);
  out.def = Math.max(0, out.def);
  out.spd = Math.max(0, out.spd);
  out.mov = Math.max(1, out.mov);
  return out;
}

/** total mods of a set of gear per stat (for the green/blue "+2" read next to each stat) */
export function equipmentDelta(eq: Equipment): ItemMods {
  const d: ItemMods = {};
  for (const slot of SLOTS) {
    const item = itemOrNull(eq[slot]);
    if (!item) continue;
    for (const k of Object.keys(item.mods) as (keyof ItemMods)[]) d[k] = (d[k] ?? 0) + (item.mods[k] ?? 0);
  }
  return d;
}

/**
 * Write gear into a unit: `base` = the ungeared stats (kept so re-applying is idempotent and un-equipping restores),
 * `stats` = geared. A unit with no gear gets its base back and drops the field.
 */
export function gearUnit(u: UnitDef, eq: Equipment): UnitDef {
  const base = u.base ?? u.stats;
  const worn = SLOTS.filter((s) => eq[s]);
  if (worn.length === 0) {
    if (!u.base && !u.equipment) return u;
    const { base: _b, equipment: _e, ...rest } = u;
    void _b;
    void _e;
    return { ...rest, stats: { ...base } };
  }
  const equipment: Equipment = {};
  for (const s of worn) equipment[s] = eq[s];
  return { ...u, base: { ...base }, equipment, stats: applyEquipment(base, equipment) };
}

// ---- loot ----

const RARITY_WEIGHT: Record<Rarity, number> = { common: 50, uncommon: 32, rare: 14, epic: 4 };

/** every item that may drop on a floor of `bracket` (0-based) */
export const lootPool = (bracket: number): ItemDef[] => ITEMS.filter((i) => i.tier <= bracket);

/**
 * The reward for clearing Tower floor `floor` (first clear only — the store enforces that): ONE item, chosen by the
 * floor number alone (mulberry32 seeded by the floor), rarity-weighted, higher brackets unlocking better tiers and
 * shifting weight toward the good stuff. Deterministic: floor 7 always drops the same item.
 */
export function rollLoot(floor: number, bracket: number): ItemDef {
  const rng = new Rng(0x9e37 + floor * 7919);
  const pool = lootPool(bracket);
  const boost = 1 + bracket * 0.35; // deeper floors: rare/epic weigh more
  const weights = pool.map((i) => Math.round(RARITY_WEIGHT[i.rarity] * (i.rarity === "rare" || i.rarity === "epic" ? boost : 1) * (i.tier === bracket ? 1.6 : 1)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.int(total);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** what a fresh party carries before the first climb — enough to learn the screen with */
export const STARTER_KIT: string[] = ["leather_cap", "leather_jerkin", "worn_boots", "wooden_buckler", "ring_of_vigor", "lucky_coin", "cloth_gloves", "padded_shoulders", "travel_cloak", "rope_belt", "cord_of_the_ford", "cloth_leggings", "leather_bracers", "company_pennant"];
