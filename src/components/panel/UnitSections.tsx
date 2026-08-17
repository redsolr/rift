"use client";
import { useMemo, useState } from "react";
import { useGame } from "@/store/game";
import { ARCHETYPES, ScoredAction, Stance, TERRAIN, TargetPref, Team, UnitDef } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { Slider } from "./ui";
import { PERSONALITY_KEYS, PREFS, STANCES, STAT_KEYS } from "./options";

export function OrdersEditor({ u }: { u: UnitDef }) {
  const setOrders = useGame((s) => s.setOrders);
  const allUnits = useGame((s) => s.config.units);
  const allies = useMemo(() => allUnits.filter((x) => x.team === u.team && x.id !== u.id), [allUnits, u.team, u.id]);
  const o = u.orders;
  return (
    <div className="orders">
      <label>
        <span>Stance</span>
        <select value={o.stance} onChange={(e) => setOrders(u.id, { stance: e.target.value as Stance })}>
          {STANCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Target</span>
        <select value={o.targetPref} onChange={(e) => setOrders(u.id, { targetPref: e.target.value as TargetPref })}>
          {PREFS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Protect</span>
        <select value={o.protect ?? ""} onChange={(e) => setOrders(u.id, { protect: e.target.value || null })}>
          <option value="">— nobody —</option>
          {allies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={o.avoidArmored} onChange={(e) => setOrders(u.id, { avoidArmored: e.target.checked })} /> Avoid armored (def ≥ 5)
      </label>
      <label className="check">
        <input type="checkbox" checked={o.noPursue} onChange={(e) => setOrders(u.id, { noPursue: e.target.checked })} /> Do not pursue
      </label>
      <Slider label="Retreat below HP %" value={o.retreatHpPct} onChange={(v) => setOrders(u.id, { retreatHpPct: v })} />
    </div>
  );
}

export function PersonalityEditor({ u }: { u: UnitDef }) {
  const setPersonality = useGame((s) => s.setPersonality);
  return (
    <div>
      {PERSONALITY_KEYS.map((k) => (
        <Slider key={k} label={k[0].toUpperCase() + k.slice(1)} value={u.personality[k]} onChange={(v) => setPersonality(u.id, { [k]: v })} />
      ))}
    </div>
  );
}

export function StatsEditor({ u }: { u: UnitDef }) {
  const setUnitStats = useGame((s) => s.setUnitStats);
  const setUnitField = useGame((s) => s.setUnitField);
  const removeUnit = useGame((s) => s.removeUnit);
  return (
    <div>
      <div className="row2">
        <label>
          <span>Name</span>
          <input value={u.name} onChange={(e) => setUnitField(u.id, { name: e.target.value })} />
        </label>
        <label>
          <span>Team</span>
          <select value={u.team} onChange={(e) => setUnitField(u.id, { team: e.target.value as Team })}>
            <option value="red">Red</option>
            <option value="blue">Blue</option>
          </select>
        </label>
      </div>
      <label>
        <span>Archetype</span>
        <select value={u.archetype} onChange={(e) => setUnitField(u.id, { archetype: e.target.value as UnitDef["archetype"] })}>
          {ARCHETYPES.map((a) => (
            <option key={a} value={a}>
              {ARCHETYPE_LABEL[a]}
            </option>
          ))}
        </select>
      </label>
      <div className="stat-grid">
        {STAT_KEYS.map((k) => (
          <label key={k}>
            <span>{k}</span>
            <input type="number" value={u.stats[k]} min={0} onChange={(e) => setUnitStats(u.id, { [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <p className="muted">Click a tile to move this unit there.</p>
      <button className="danger" onClick={() => removeUnit(u.id)}>
        Remove unit
      </button>
    </div>
  );
}

export function Explain({ cands }: { cands: ScoredAction[] }) {
  const [open, setOpen] = useState<number>(0);
  return (
    <div className="explain">
      {cands.map((c, i) => (
        <div key={i} className={`cand ${i === 0 ? "chosen" : ""}`}>
          <button className="cand-head" onClick={() => setOpen(open === i ? -1 : i)}>
            <span className="cand-label">
              {i === 0 ? "✓ " : ""}
              {c.label}
            </span>
            <span className="cand-score">{c.score}</span>
          </button>
          {open === i && (
            <ul className="terms">
              {c.terms.map((t, j) => (
                <li key={j}>
                  <span>{t.label}</span>
                  <span className={t.value >= 0 ? "pos" : "neg"}>
                    {t.value >= 0 ? "+" : ""}
                    {t.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function UnitCard({ u }: { u: UnitDef }) {
  const v = useGame((s) => s.view.units[u.id]);
  const map = useGame((s) => s.config.map);
  const t = v ? TERRAIN[map.tiles[v.y * map.width + v.x]] : null;
  return (
    <div className={`unit-card ${u.team}`}>
      <div className="unit-card-head">
        <span className="unit-card-name">{u.name}</span>
        <span className="unit-card-arch">{ARCHETYPE_LABEL[u.archetype]}</span>
      </div>
      <div className="stat-line">
        <span>
          HP {v ? v.hp : u.stats.hp}/{u.stats.hp}
        </span>
        <span>ATK {u.stats.atk}</span>
        <span>DEF {u.stats.def}{t && t.defense ? ` (+${t.defense} ${t.label.toLowerCase()})` : ""}</span>
        <span>SPD {u.stats.spd}</span>
        <span>MOV {u.stats.mov}</span>
        <span>
          RNG {u.stats.rangeMin}–{u.stats.rangeMax}
        </span>
      </div>
    </div>
  );
}

