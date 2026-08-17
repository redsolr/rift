"use client";
import { useMemo } from "react";
import { useGame } from "@/store/game";
import { AttackDef, Element, attackRange } from "@/sim/attacks";

const ELEMENT_GLYPH: Record<Element, string> = { physical: "⚔", fire: "🔥", ice: "❄", thunder: "⚡", holy: "✚" };
const ELEMENT_LABEL: Record<Element, string> = { physical: "Physical", fire: "Fire", ice: "Ice", thunder: "Thunder", holy: "Holy" };

/**
 * FE-style skill picker: a full-height framed panel on the RIGHT of the board.
 * Top = the list of this unit's skills of the chosen kind (Attack / Heal); bottom = the
 * details of the hovered (else first usable) skill — Dmg · Hit · Crit · Range · Element ·
 * Type · when it can be used. Hovering previews the range on the board and the forecast in
 * the battle bar; clicking picks it and moves to the target step.
 */
export default function SkillPanel() {
  const menuPage = useGame((s) => s.menuPage);
  const menuKind = useGame((s) => s.menuKind);
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const pendingMove = useGame((s) => s.pendingMove);
  const hoverAttack = useGame((s) => s.hoverAttack);
  const pendingAttack = useGame((s) => s.pendingAttack);
  const targets = useGame((s) => s.targets);
  const setHoverAttack = useGame((s) => s.setHoverAttack);
  const chooseAttack = useGame((s) => s.chooseAttack);
  const cancelPending = useGame((s) => s.cancelPending);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);

  const options = useMemo(
    () => (battle && selected && pendingMove && (menuPage === "attacks" || menuPage === "target") ? battle.attackOptions(selected, pendingMove, menuKind) : []),
    [battle, selected, pendingMove, menuPage, menuKind],
  );
  if ((menuPage !== "attacks" && menuPage !== "target") || !selectedDef || !options.length) return null;

  const heal = menuKind === "heal";
  const targeting = menuPage === "target";
  // target step: the panel keeps showing the CHOSEN skill's details (list collapses to a "choose a target" frame)
  const focus = (targeting ? options.find((o) => o.attack.id === pendingAttack) : options.find((o) => o.attack.id === hoverAttack)) ?? options.find((o) => o.usable && o.targets.length) ?? options[0];
  const why = (o: { attack: AttackDef; usable: boolean; targets: string[] }) =>
    !o.usable ? (o.attack.cond === "moved" ? "after a move only" : "standing still only") : o.targets.length === 0 ? "nothing in reach" : `${o.targets.length} in reach`;
  const might = (a: AttackDef) => Math.max(1, selectedDef.stats.atk + a.power);
  const rng = (a: AttackDef) => {
    const [lo, hi] = attackRange(selectedDef, a);
    return lo === hi ? `${hi}` : `${lo}–${hi}`;
  };
  const cond = (a: AttackDef) => (a.cond === "none" ? "Any time" : a.cond === "stationary" ? "Only without moving" : "Only after moving");

  return (
    <aside className="skill-panel" onPointerLeave={() => setHoverAttack(null)}>
      <div className={`sp-frame sp-list ${targeting ? "targeting" : ""}`}>
        <div className="sp-title">{heal ? "Heal" : "Attack"}</div>
        <div className="sp-sub">{targeting ? "Choose a target" : "Skills"}</div>
        {targeting && (
          <div className="sp-targeting">
            <div className="sp-tname">
              <span className={`sp-glyph el-${focus.attack.element}`}>{ELEMENT_GLYPH[focus.attack.element]}</span> {focus.attack.name}
            </div>
            <div className="sp-tline">
              {heal ? "Click a green ally" : "Click a red enemy"} — {targets.length} in reach
            </div>
            <div className="sp-tline dim">Right-click a target to confirm · right-click elsewhere to go back</div>
          </div>
        )}
        {!targeting && options.map((o) => {
          const off = !o.usable || o.targets.length === 0;
          const active = focus.attack.id === o.attack.id;
          return (
            <button key={o.attack.id} className={`sp-row ${off ? "off" : ""} ${active ? "active" : ""}`} disabled={off} onClick={() => chooseAttack(o.attack.id)} onPointerEnter={() => setHoverAttack(o.attack.id)}>
              <span className="sp-cursor">➤</span>
              <span className={`sp-glyph el-${o.attack.element}`}>{ELEMENT_GLYPH[o.attack.element]}</span>
              <span className="sp-name">{o.attack.name}</span>
              <span className="sp-meta">{off ? (o.usable ? "—" : "🔒") : `${o.targets.length} ▸`}</span>
            </button>
          );
        })}
        <div className="sp-fill" />
        <button className="sp-back" onClick={cancelPending}>
          ◂ Back
        </button>
      </div>

      <div className="sp-frame sp-detail">
        <div className="sp-dhead">
          <span className={`sp-glyph big el-${focus.attack.element}`}>{ELEMENT_GLYPH[focus.attack.element]}</span>
          <span className="sp-dname">{focus.attack.name}</span>
          <span className="sp-dtype">
            {ELEMENT_LABEL[focus.attack.element]} · {focus.attack.school === "magic" ? "Magic" : "Physical"}
          </span>
        </div>
        <div className="sp-hint">{focus.attack.hint}</div>
        <div className="sp-stats">
          <div className="sp-stat">
            <span>{heal ? "Heal" : "Dmg"}</span>
            <b>
              {might(focus.attack)}
              {focus.attack.power !== 0 && <small>{focus.attack.power > 0 ? ` +${focus.attack.power}` : ` ${focus.attack.power}`}</small>}
            </b>
          </div>
          <div className="sp-stat">
            <span>Rng</span>
            <b>{rng(focus.attack)}</b>
          </div>
          <div className="sp-stat">
            <span>Hit</span>
            <b>100</b>
          </div>
          <div className="sp-stat">
            <span>Crit</span>
            <b className="dim">—</b>
          </div>
          <div className="sp-stat">
            <span>Cost</span>
            <b className="dim">—</b>
          </div>
          <div className="sp-stat">
            <span>Use</span>
            <b className="small">{cond(focus.attack)}</b>
          </div>
        </div>
        <div className={`sp-status ${!focus.usable || !focus.targets.length ? "off" : ""}`}>{why(focus)}</div>
      </div>
    </aside>
  );
}
