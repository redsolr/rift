"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ATTACKS, ELEMENT_GLYPH } from "@/sim/attacks";
import { Equipment, ItemDef, RARITY_LABEL, SLOT_LABEL, Slot, applyEquipment, canEquip, equipmentDelta, itemOrNull, slotsForKind } from "@/sim/items";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { Stats, UnitDef } from "@/sim/types";
import Portrait from "@/components/Portrait";
import { GLYPH, POSITION, WEAPON, overall } from "@/components/cards";
import { Carry, PARTY, partyMember, useParty } from "./store";
import "./party.css";

/**
 * The CHARACTER SCREEN (`C` / `I`) — FE Engage layout, WoW mechanics. Left: the roster. Centre: the hero — combat
 * stats with the gear delta next to each, then the paper-doll (slots flanking the bust). Right: Skills (the four
 * attacks) over the BAG (32 cells). Items are dragged with the pointer between bag ↔ slots (green/red legality on
 * the target, a ghost riding the pointer, a WoW-style tooltip with the compare line), right-click = equip / unequip,
 * click-pick-then-click-drop works too. Everything legal/illegal is decided by `party/inventory.ts`; this file only
 * draws and routes gestures.
 */
const STAT_ROWS: { k: keyof Pick<Stats, "hp" | "atk" | "def" | "spd" | "mov">; label: string }[] = [
  { k: "hp", label: "HP" },
  { k: "atk", label: "Atk" },
  { k: "def", label: "Def" },
  { k: "spd", label: "Spd" },
  { k: "mov", label: "Mov" },
];
// WoW paper-doll: 8 armour slots down the left edge, 8 down the right (legs / feet / jewellery / relic / banner), weapons under the model
const LEFT_SLOTS: Slot[] = ["head", "neck", "shoulders", "back", "chest", "wrist", "hands", "waist"];
const RIGHT_SLOTS: Slot[] = ["legs", "feet", "ring1", "ring2", "trinket1", "trinket2", "relic", "banner"];
const BOTTOM_SLOTS: Slot[] = ["weapon", "offhand"];
const SLOT_GLYPH: Record<Slot, string> = { head: "🪖", neck: "📿", shoulders: "🧥", back: "🧣", chest: "🥋", wrist: "⌚", hands: "🧤", waist: "🪢", legs: "👖", feet: "👢", ring1: "◯", ring2: "◯", trinket1: "✧", trinket2: "✧", relic: "☥", banner: "⚑", weapon: "⚔", offhand: "🛡" };

const sameCarry = (a: Carry | null, b: Carry | null) => !!a && !!b && ((a.kind === "bag" && b.kind === "bag" && a.cell === b.cell) || (a.kind === "slot" && b.kind === "slot" && a.slot === b.slot));

/** what the pointer is over, from the DOM (`data-drop` = "bag:3" | "slot:head" | "trash") */
function dropAt(x: number, y: number): Carry | { kind: "trash" } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
  if (!el) return null;
  const d = el.dataset.drop!;
  if (d === "trash") return { kind: "trash" };
  const [k, v] = d.split(":");
  return k === "bag" ? { kind: "bag", cell: Number(v) } : { kind: "slot", slot: v as Slot };
}

export default function CharacterScreen() {
  const open = useParty((s) => s.open);
  if (!open) return null;
  return <Screen />;
}

function Screen() {
  const heroId = useParty((s) => s.hero);
  const bag = useParty((s) => s.bag);
  const equipment = useParty((s) => s.equipment);
  const carry = useParty((s) => s.carry);
  const notice = useParty((s) => s.notice);
  const setHero = useParty((s) => s.setHero);
  const setCarry = useParty((s) => s.setCarry);
  const dropOn = useParty((s) => s.dropOn);
  const quick = useParty((s) => s.quick);
  const close = useParty((s) => s.closeScreen);
  const hero: UnitDef = partyMember(heroId) ?? PARTY[0];
  const eq: Equipment = useMemo(() => equipment[hero.id] ?? {}, [equipment, hero.id]);
  const geared = useMemo(() => applyEquipment(hero.stats, eq), [hero, eq]);
  const delta = useMemo(() => equipmentDelta(eq), [eq]);
  const [hover, setHover] = useState<{ c: Carry; x: number; y: number } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const down = useRef<{ c: Carry; x: number; y: number } | null>(null);

  // pointer drag: pointerdown on an item arms it; a real move turns it into a drag (ghost rides the pointer);
  // pointerup over a target drops; a still click leaves it picked (click-to-drop mode)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!down.current) return;
      const dx = e.clientX - down.current.x,
        dy = e.clientY - down.current.y;
      if (!dragging && dx * dx + dy * dy > 16) setDragging(true);
      if (dragging || dx * dx + dy * dy > 16) setPointer({ x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      if (!down.current) return;
      const target = dropAt(e.clientX, e.clientY);
      const c = down.current;
      down.current = null;
      setPointer(null);
      if (dragging) {
        setDragging(false);
        if (target && !(target.kind !== "trash" && sameCarry(target, c.c))) dropOn(target);
        else setCarry(null);
      }
      // still click: stays picked (carry already set on pointerdown)
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, dropOn, setCarry]);

  const onItemDown = (c: Carry, hasItem: boolean) => (e: React.PointerEvent) => {
    if (e.button === 2) return;
    e.preventDefault();
    e.stopPropagation();
    // something already picked (click mode) → this is the drop
    if (carry && !sameCarry(carry, c)) {
      dropOn(c);
      return;
    }
    if (!hasItem) {
      setCarry(null);
      return;
    }
    if (carry && sameCarry(carry, c)) {
      setCarry(null);
      return;
    }
    down.current = { c, x: e.clientX, y: e.clientY };
    setCarry(c);
  };
  const onContext = (c: Carry, hasItem: boolean) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (hasItem) quick(c);
  };
  const onEnter = (c: Carry) => (e: React.PointerEvent) => setHover({ c, x: e.clientX, y: e.clientY });
  const onLeave = () => setHover(null);
  // functional update: enter + move fire in the same tick, a closure value would overwrite the fresh target
  const onTrack = (e: React.PointerEvent) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h));

  const carried: ItemDef | null = carry ? itemOrNull(carry.kind === "bag" ? bag[carry.cell] : eq[carry.slot]) : null;
  const hovered: ItemDef | null = hover ? itemOrNull(hover.c.kind === "bag" ? bag[hover.c.cell] : eq[hover.c.slot]) : null;
  const legalSlots = new Set<Slot>(carried ? slotsForKind(carried.slot).filter((s) => canEquip(hero, carried, s)) : []);
  const bagUsed = bag.filter(Boolean).length;
  const rng = hero.stats.rangeMin === hero.stats.rangeMax ? String(hero.stats.rangeMax) : `${hero.stats.rangeMin}–${hero.stats.rangeMax}`;

  const renderSlot = (s: Slot) => {
    const item = itemOrNull(eq[s]);
    const isCarried = carry?.kind === "slot" && carry.slot === s;
    const legal = carried ? legalSlots.has(s) : null;
    return (
      <div
        key={s}
        className={`cs-slot ${item ? `has rar-${item.rarity}` : "empty"} ${isCarried ? "carried" : ""} ${carried && !isCarried ? (legal ? "legal" : "illegal") : ""}`}
        data-drop={`slot:${s}`}
        onPointerDown={onItemDown({ kind: "slot", slot: s }, !!item)}
        onContextMenu={onContext({ kind: "slot", slot: s }, !!item)}
        onPointerEnter={onEnter({ kind: "slot", slot: s })}
        onPointerMove={onTrack}
        onPointerLeave={onLeave}
        title={item ? undefined : s === "weapon" ? `${SLOT_LABEL[s]} · ${WEAPON[hero.archetype]} (default)` : SLOT_LABEL[s]}
      >
        <span className="cs-slot-glyph">{item ? item.glyph : SLOT_GLYPH[s]}</span>
        <span className="cs-slot-tag">{item ? item.name : s === "weapon" ? WEAPON[hero.archetype] : SLOT_LABEL[s]}</span>
      </div>
    );
  };

  return (
    <div className="char-screen" role="dialog" aria-label="Character" onContextMenu={(e) => e.preventDefault()}>
      <div className="cs-backdrop" onPointerDown={close} />
      <div className={`cs-frame ${dragging ? "dragging" : ""}`}>
        <div className="cs-top">
          <span className="cs-title">Character</span>
          <span className="cs-sub">
            <kbd>C</kbd> character · <kbd>I</kbd> bag · drag items · right-click = equip / unequip · <kbd>Esc</kbd> close
          </span>
          <button className="cs-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="cs-body">
          {/* ---- roster ---- */}
          <div className="cs-roster">
            {PARTY.map((u) => {
              const g = applyEquipment(u.stats, equipment[u.id] ?? {});
              return (
                <button key={u.id} className={`cs-roster-row arch-${u.archetype} ${u.id === hero.id ? "on" : ""}`} onClick={() => setHero(u.id)}>
                  {/* FE Engage roster read: the bust bleeds across the row under a dark gradient, class badge on the left */}
                  <Portrait u={u} className="cs-roster-art" />
                  <span className="cs-roster-shade" />
                  <span className="cs-roster-badge" title={ARCHETYPE_LABEL[u.archetype]}>
                    {GLYPH[u.archetype]}
                  </span>
                  <span className="cs-roster-text">
                    <span className="cs-roster-name">{u.name}</span>
                    <span className="cs-roster-class">
                      {POSITION[u.archetype]} · {ARCHETYPE_LABEL[u.archetype]}
                    </span>
                  </span>
                  <span className="cs-roster-ovr">{overall({ ...u, stats: g })}</span>
                  <span className="cs-roster-cursor">➤</span>
                </button>
              );
            })}
          </div>

          {/* ---- hero: stats ---- */}
          <div className="cs-stats">
            <div className="cs-banner">
              <span className="cs-name">{hero.name}</span>
              <span className="cs-ovr">
                <span className="cs-ovr-l">OVR</span>
                {overall({ ...hero, stats: geared })}
              </span>
            </div>
            <div className="cs-class">
              <span className="cs-crest">❖</span>
              {ARCHETYPE_LABEL[hero.archetype]} <span className="cs-dim">· Rng {rng}</span>
            </div>
            <div className="cs-sec">Combat stats</div>
            {STAT_ROWS.map(({ k, label }) => {
              const d = delta[k] ?? 0;
              return (
                <div key={k} className="cs-stat">
                  <span className="cs-stat-l">{label}</span>
                  <span className={`cs-stat-v ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{geared[k]}</span>
                  <span className={`cs-stat-d ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{d > 0 ? `+ ${d}` : d < 0 ? `− ${-d}` : ""}</span>
                </div>
              );
            })}
            <div className="cs-sec">Base</div>
            <div className="cs-base">
              {STAT_ROWS.map(({ k, label }) => (
                <span key={k}>
                  {label} {hero.stats[k]}
                </span>
              ))}
            </div>
          </div>

          {/* ---- hero: paper doll ---- */}
          <div className="cs-doll">
            <div className="cs-doll-col">{LEFT_SLOTS.map(renderSlot)}</div>
            <div className="cs-bust">
              <Portrait u={hero} className="cs-bust-img" />
            </div>
            <div className="cs-doll-col right">{RIGHT_SLOTS.map(renderSlot)}</div>
            <div className="cs-doll-bottom">{BOTTOM_SLOTS.map(renderSlot)}</div>
          </div>

          {/* ---- skills + bag ---- */}
          <div className="cs-right">
            <div className="cs-sec">Skills</div>
            <div className="cs-skills">
              {ATTACKS[hero.archetype].map((a) => (
                <div key={a.id} className={`cs-skill el-${a.element}`} title={a.hint}>
                  <span className="cs-skill-glyph">{ELEMENT_GLYPH[a.element]}</span>
                  <span className="cs-skill-name">{a.name}</span>
                  <span className="cs-skill-pow">{a.kind === "heal" ? "+" : ""}{Math.max(1, geared.atk + a.power)}</span>
                </div>
              ))}
            </div>
            <div className="cs-sec cs-bag-head">
              Bag <span className="cs-dim">{bagUsed} / {bag.length}</span>
              <span className={`cs-trash ${carried ? "armed" : ""}`} data-drop="trash" title="Drop here to destroy">
                🗑
              </span>
            </div>
            <div className="cs-bag">
              {bag.map((id, i) => {
                const item = itemOrNull(id);
                const isCarried = carry?.kind === "bag" && carry.cell === i;
                const wearable = item ? slotsForKind(item.slot).some((s) => canEquip(hero, item, s)) : true;
                return (
                  <div
                    key={i}
                    className={`cs-cell ${item ? `has rar-${item.rarity}` : "empty"} ${isCarried ? "carried" : ""} ${item && !wearable ? "unwearable" : ""} ${carried && carry?.kind === "slot" ? "legal" : ""}`}
                    data-drop={`bag:${i}`}
                    onPointerDown={onItemDown({ kind: "bag", cell: i }, !!item)}
                    onContextMenu={onContext({ kind: "bag", cell: i }, !!item)}
                    onPointerEnter={onEnter({ kind: "bag", cell: i })}
                    onPointerMove={onTrack}
                    onPointerLeave={onLeave}
                  >
                    {item && <span className="cs-cell-glyph">{item.glyph}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* drop feedback: the CSS animation fades it out by itself; the seq key restarts it per notice */}
        {notice && notice.text && (
          <div key={notice.seq} className={`cs-toast ${notice.bad ? "bad" : ""}`}>
            {notice.text}
          </div>
        )}
      </div>

      {/* ghost riding the pointer while dragging */}
      {dragging && carried && pointer && (
        <div className={`cs-ghost rar-${carried.rarity}`} style={{ left: pointer.x, top: pointer.y }}>
          {carried.glyph}
        </div>
      )}
      {/* WoW-style tooltip */}
      {hovered && hover && !dragging && <Tooltip item={hovered} hero={hero} eq={eq} at={hover} from={hover.c} />}
    </div>
  );
}

function Tooltip({ item, hero, eq, at, from }: { item: ItemDef; hero: UnitDef; eq: Equipment; at: { x: number; y: number }; from: Carry }) {
  const worn = from.kind === "slot";
  const fits = slotsForKind(item.slot).filter((s) => canEquip(hero, item, s));
  const classOk = !item.classes || item.classes.includes(hero.archetype);
  // compare: what changes if this bag item replaces what the hero wears in its natural slot
  let compare: { k: keyof Stats; d: number }[] = [];
  if (!worn && fits.length) {
    const slot = fits.find((s) => !eq[s]) ?? fits[0];
    const after = applyEquipment(hero.stats, { ...eq, [slot]: item.id });
    const before = applyEquipment(hero.stats, eq);
    compare = (["hp", "atk", "def", "spd", "mov"] as (keyof Stats)[]).map((k) => ({ k, d: after[k] - before[k] })).filter((x) => x.d !== 0);
  }
  const x = Math.min(at.x + 18, window.innerWidth - 270);
  const y = Math.min(at.y + 18, window.innerHeight - 220);
  return (
    <div className={`cs-tip rar-${item.rarity}`} style={{ left: x, top: y }}>
      <div className="cs-tip-name">
        {item.glyph} {item.name}
      </div>
      <div className="cs-tip-meta">
        {RARITY_LABEL[item.rarity]} · {SLOT_LABEL[slotsForKind(item.slot)[0]]}
      </div>
      <div className="cs-tip-mods">
        {(Object.keys(item.mods) as (keyof typeof item.mods)[]).map((k) => (
          <span key={k} className={(item.mods[k] ?? 0) >= 0 ? "up" : "down"}>
            {(item.mods[k] ?? 0) >= 0 ? "+" : "−"}
            {Math.abs(item.mods[k] ?? 0)} {k.toUpperCase()}
          </span>
        ))}
      </div>
      {item.classes && <div className={`cs-tip-class ${classOk ? "" : "bad"}`}>{item.classes.map((c) => ARCHETYPE_LABEL[c]).join(" · ")}</div>}
      {!worn && compare.length > 0 && classOk && (
        <div className="cs-tip-cmp">
          Equip: {compare.map((c) => `${c.d > 0 ? "+" : "−"}${Math.abs(c.d)} ${c.k.toUpperCase()}`).join(" · ")}
        </div>
      )}
      <div className="cs-tip-fl">“{item.flavour}”</div>
      <div className="cs-tip-hint">{worn ? "right-click · unequip" : classOk ? "right-click · equip" : `${hero.name} cannot use this`}</div>
    </div>
  );
}

/** mounts the screen + its hotkeys; `canOpen` gates C / I (dialogue, tower picker, an in-flight drag …) */
export function CharacterScreenHost({ canOpen }: { canOpen?: () => boolean }) {
  const hydrate = useParty((s) => s.hydrate);
  useEffect(() => {
    hydrate();
    (window as unknown as { __party?: typeof useParty }).__party = useParty;
  }, [hydrate]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useParty.getState();
      if (e.key === "Escape" && s.open) {
        e.stopImmediatePropagation();
        if (s.carry) s.setCarry(null);
        else s.closeScreen();
        return;
      }
      if (e.key === "c" || e.key === "C" || e.key === "i" || e.key === "I") {
        if (!s.open && canOpen && !canOpen()) return;
        e.preventDefault();
        s.toggleScreen();
      }
    };
    // capture: the screen wins Esc over the board / dialogue handlers while it is open
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canOpen]);
  return <CharacterScreen />;
}
