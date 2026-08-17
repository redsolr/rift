"use client";
import { RUNES, RuneKind } from "@/sim/runes";
import { useEffect, useMemo, useRef } from "react";
import { selectCaughtUp, useGame } from "@/store/game";
import { TERRAIN, TerrainDef, UnitDef } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { WEAPON, overall } from "./cards";
import { attackById, attackRange } from "@/sim/attacks";
import Portrait from "./Portrait";
import { useUiFrame } from "./ui/UiFrame";

/**
 * FE Engage / Three Hopes style battle bar across the bottom of the board — the EXCHANGE view.
 * Left = your selected unit, right = the enemy under the pointer (or the only target in range); each end carries the
 * character bust (portrait) + name / class / HP / weapon. Middle = the forecast: Crit · Hit · HP | HP · Hit · Crit,
 * damage shown on the RECEIVER's side, predicted HP gauges. Opens only for a duel (selected unit + enemy) — the
 * solo character read lives in the top-left CharacterPanel, which yields to this bar while it is up (FE).
 * All numbers come from Battle.forecast — nothing is recomputed here.
 */

/** The pair the bar would show: your selected unit and the enemy being considered (null = no duel on screen). */
export function useDuelPair(): { left: UnitDef | null; right: UnitDef | null } {
  const selected = useGame((s) => s.selected);
  const hoverUnit = useGame((s) => s.hoverUnit);
  const targets = useGame((s) => s.targets);
  const units = useGame((s) => s.config.units);
  const mode = useGame((s) => s.mode);
  const byId = (id: string | null) => (id ? units.find((u) => u.id === id) ?? null : null);
  const left = mode === "editor" ? null : byId(selected);
  const hov = byId(hoverUnit);
  const right = left ? (hov && hov.team !== left.team ? hov : targets.length === 1 ? byId(targets[0]) : null) : null;
  return { left, right };
}

export default function BattleBar() {
  const battle = useGame((s) => s.battle);
  const pendingMove = useGame((s) => s.pendingMove);
  const pendingAttack = useGame((s) => s.pendingAttack);
  const hoverAttack = useGame((s) => s.hoverAttack);
  const caughtUp = useGame(selectCaughtUp);
  const view = useGame((s) => s.view);
  const units = useGame((s) => s.config.units);
  const map = useGame((s) => s.config.map);
  const mode = useGame((s) => s.mode);

  const ref = useRef<HTMLDivElement>(null);
  // publish the bar's height as --bb-h on .board-wrap so the turn controls can sit just above it
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(() => host.style.setProperty("--bb-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.setProperty("--bb-h", "0px");
    };
  });
  const ui = useUiFrame("battle-bar");
  const playerTeam = useGame((s) => s.playerTeam);
  const pair = useDuelPair();
  // UI-layout mode: stand-in pair (your first unit vs the first enemy) so the frame can be placed
  const left = pair.left ?? (ui.editing ? units.find((u) => u.team === playerTeam) ?? units[0] ?? null : null);
  const right = pair.right ?? (ui.editing && left ? units.find((u) => u.team !== left.team) ?? null : null);

  const fc = useMemo(() => {
    if (!battle || !caughtUp || !left || !right) return null;
    if (!view.units[left.id]?.alive || !view.units[right.id]?.alive) return null;
    if (left.team === right.team) return null;
    return battle.forecast(left.id, right.id, pendingMove ?? undefined, pendingAttack ?? hoverAttack ?? undefined);
  }, [battle, caughtUp, left, right, pendingMove, pendingAttack, hoverAttack, view.units]);

  const terrainOf = (x: number, y: number): TerrainDef | null => (x >= 0 && y >= 0 && x < map.width && y < map.height ? TERRAIN[map.tiles[y * map.width + x]] : null);
  const leftPos = left ? (pendingMove ?? { x: view.units[left.id]?.x ?? left.x, y: view.units[left.id]?.y ?? left.y }) : null;
  const rightPos = right ? { x: view.units[right.id]?.x ?? right.x, y: view.units[right.id]?.y ?? right.y } : null;
  const leftTerr = leftPos ? terrainOf(leftPos.x, leftPos.y) : null;
  const rightTerr = rightPos ? terrainOf(rightPos.x, rightPos.y) : null;

  // duel only — the solo read is the CharacterPanel's job (the frame stays up in layout mode with the stand-in pair)
  if (mode === "editor" || !left || (!right && !ui.editing)) return null;
  const lv = left ? view.units[left.id] : null;
  const rv = right ? view.units[right.id] : null;
  const duel = !!(fc && left && right && lv && rv);
  const myHpAfter = duel && fc!.retaliation != null ? Math.max(0, lv!.hp - fc!.retaliation) : lv?.hp ?? 0;

  return (
    <div ref={ref} className={`battle-bar ${duel ? "duel" : "solo"}`} aria-label="Battle forecast" style={ui.style}>
      {lv && <Side u={left} hp={lv.hp} terrain={leftTerr} side="left" attack={fc?.attack ?? null} buff={lv.buff} />}

      {duel && (
        <div className="bb-center">
          <div className="bb-grid">
            <span className="bb-h">Crit</span>
            <span className="bb-h">Hit</span>
            <span className="bb-hp">{lv!.hp}</span>
            <span className="bb-h bb-hp-label">HP</span>
            <span className="bb-hp">{rv!.hp}</span>
            <span className="bb-h">Hit</span>
            <span className="bb-h">Crit</span>

            <span className="bb-v">—</span>
            <span className="bb-v">100</span>
            <span className="bb-dmg">{fc!.retaliation != null ? `-${fc!.retaliation}` : ""}</span>
            <span />
            <span className={`bb-dmg ${fc!.kill ? "kill" : ""}`}>-{fc!.damage}</span>
            <span className="bb-v">{fc!.retaliation != null ? "100" : <span className="bb-x">✕</span>}</span>
            <span className="bb-v">{fc!.retaliation != null ? "—" : ""}</span>
          </div>
          {/* FE Engage bars: light track = missing HP after the exchange; solid colour = HP left, anchored toward the
              centre — yours drains from its LEFT end, the enemy's from its RIGHT end. Plain numbers, no animation. */}
          <div className="bb-bars">
            <div className="bb-bar left">
              <div className="bb-bar-fill" style={{ width: `${(100 * myHpAfter) / left!.stats.hp}%` }} />
            </div>
            <span className={`bb-big ${fc!.retaliationKill ? "dead" : ""}`}>{myHpAfter}</span>
            <span className={`bb-big ${fc!.kill ? "dead" : ""}`}>{fc!.hpAfter}</span>
            <div className="bb-bar right">
              <div className="bb-bar-fill" style={{ width: `${(100 * fc!.hpAfter) / right!.stats.hp}%` }} />
            </div>
          </div>
        </div>
      )}
      {!duel && <div className="bb-center solo-hint">Forecast</div>}

      {right && rv && <Side u={right} hp={rv.hp} terrain={rightTerr} side="right" />}
      {ui.overlay}
    </div>
  );
}

function Side({ u, hp, terrain, side, attack = null, buff = null }: { u: UnitDef; hp: number; terrain: TerrainDef | null; side: "left" | "right"; attack?: { id: string; name: string } | null; buff?: { kind: RuneKind; turns: number } | null }) {
  // the range shown follows the attack being forecast; without one it is the weapon's own
  const [lo, hi] = attack ? attackRange(u, attackById(u, attack.id)) : [u.stats.rangeMin, u.stats.rangeMax];
  return (
    <div className={`bb-side ${side} ${u.team}`}>
      <Portrait u={u} className="bb-portrait" />
      <div className="bb-info">
        <div className="bb-name">
          <span>{u.name}</span>
          <span className="bb-ovr">{overall(u)}</span>
        </div>
        <div className="bb-class">
          <span className="bb-crest">{u.team === "red" ? "✦" : "❖"}</span> {ARCHETYPE_LABEL[u.archetype]}
          <span className="bb-hpline">
            HP {hp}/{u.stats.hp}
          </span>
        </div>
        <div className="bb-weapon">
          <span className="bb-wicon">⚔</span> {WEAPON[u.archetype]}
          {attack && <span className="bb-art">{attack.name}</span>}
          <span className="bb-rng">rng {lo === hi ? hi : `${lo}–${hi}`}</span>
        </div>
        <div className="bb-hpbar">
          <div style={{ width: `${(100 * hp) / u.stats.hp}%` }} />
        </div>
        {buff && (
          <div className="bb-buff" style={{ color: RUNES[buff.kind].color }}>
            {RUNES[buff.kind].glyph} {RUNES[buff.kind].label} · {buff.turns} turn{buff.turns === 1 ? "" : "s"} · {RUNES[buff.kind].blurb}
          </div>
        )}
        <div className="bb-stats">
          {(["atk", "def", "spd", "mov"] as const).map((k) => (
            <span key={k} className="bb-stat">
              <span className="bb-stat-l">{k.toUpperCase()}</span>
              <span className="bb-stat-v">{u.stats[k]}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="bb-terrain">
        {terrain ? terrain.label : ""}
        {terrain && terrain.defense ? ` +${terrain.defense}` : ""}
      </div>
    </div>
  );
}
