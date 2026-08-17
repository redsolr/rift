"use client";
import { useMemo } from "react";
import { selectCaughtUp, useGame } from "@/store/game";
import { TERRAIN, TerrainDef, UnitDef } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { WEAPON, overall } from "./cards";
import CardThumb from "./CardThumb";

/**
 * FE Engage / Three Hopes style battle bar across the bottom of the board.
 * Left = your unit (selected, else the unit under the pointer). Right = the enemy under the
 * pointer (or the only target in range). Middle = the forecast: Crit · Hit · HP | HP · Hit · Crit,
 * damage shown on the RECEIVER's side, predicted HP bars, and the confirm prompt.
 * All numbers come from Battle.forecast — nothing is recomputed here.
 */
export default function BattleBar() {
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const hoverUnit = useGame((s) => s.hoverUnit);
  const hover = useGame((s) => s.hover);
  const pendingMove = useGame((s) => s.pendingMove);
  const targets = useGame((s) => s.targets);
  const caughtUp = useGame(selectCaughtUp);
  const view = useGame((s) => s.view);
  const units = useGame((s) => s.config.units);
  const map = useGame((s) => s.config.map);
  const mode = useGame((s) => s.mode);
  const playerTeam = useGame((s) => s.playerTeam);

  const byId = (id: string | null) => (id ? units.find((u) => u.id === id) ?? null : null);
  const hov = byId(hoverUnit);
  const sel = byId(selected);
  // left = my unit: selected, else a hovered friendly; right = hovered enemy, else the only target
  const left = sel ?? (hov && hov.team === playerTeam ? hov : null);
  const right = hov && hov.team !== playerTeam && (!left || hov.id !== left.id) ? hov : left && targets.length === 1 ? byId(targets[0]) : null;

  const fc = useMemo(() => {
    if (!battle || !caughtUp || !left || !right) return null;
    if (!view.units[left.id]?.alive || !view.units[right.id]?.alive) return null;
    if (left.archetype === "healer" || left.team === right.team) return null;
    return battle.forecast(left.id, right.id, pendingMove ?? undefined);
  }, [battle, caughtUp, left, right, pendingMove, view.units]);

  const terrainOf = (x: number, y: number): TerrainDef | null => (x >= 0 && y >= 0 && x < map.width && y < map.height ? TERRAIN[map.tiles[y * map.width + x]] : null);
  const leftPos = left ? (pendingMove ?? { x: view.units[left.id]?.x ?? left.x, y: view.units[left.id]?.y ?? left.y }) : hover;
  const rightPos = right ? { x: view.units[right.id]?.x ?? right.x, y: view.units[right.id]?.y ?? right.y } : null;
  const leftTerr = leftPos ? terrainOf(leftPos.x, leftPos.y) : null;
  const rightTerr = rightPos ? terrainOf(rightPos.x, rightPos.y) : null;

  if (mode === "editor" || (!left && !right)) return null;
  const lv = left ? view.units[left.id] : null;
  const rv = right ? view.units[right.id] : null;
  const duel = !!(fc && left && right && lv && rv);
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const myHpAfter = duel && fc!.retaliation != null ? Math.max(0, lv!.hp - fc!.retaliation) : lv?.hp ?? 0;

  return (
    <div className={`battle-bar ${duel ? "duel" : "solo"}`} aria-label="Battle forecast">
      {left && lv && <Side u={left} hp={lv.hp} terrain={leftTerr} side="left" />}
      {!left && right && rv && <Side u={right} hp={rv.hp} terrain={rightTerr} side="left" />}

      {duel && (
        <div className="bb-center">
          <div className="bb-prompt">{fc!.inRange ? (coarse ? "Tap target ▸ Attack" : "Right-click ▸ Attack") : "Out of range from here"}</div>
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
          <div className="bb-bars">
            <div className="bb-bar left">
              <div className="bb-bar-fill" style={{ width: `${(100 * myHpAfter) / left!.stats.hp}%` }} />
              {fc!.retaliation != null && <div className="bb-bar-loss" style={{ left: `${(100 * myHpAfter) / left!.stats.hp}%`, width: `${(100 * (lv!.hp - myHpAfter)) / left!.stats.hp}%` }} />}
            </div>
            <span className={`bb-big ${fc!.retaliationKill ? "dead" : ""}`}>{myHpAfter}</span>
            <span className={`bb-big ${fc!.kill ? "dead" : ""}`}>{fc!.hpAfter}</span>
            <div className="bb-bar right">
              <div className="bb-bar-fill" style={{ width: `${(100 * fc!.hpAfter) / right!.stats.hp}%` }} />
              <div className="bb-bar-loss" style={{ right: `${(100 * fc!.hpAfter) / right!.stats.hp}%`, width: `${(100 * (rv!.hp - fc!.hpAfter)) / right!.stats.hp}%` }} />
            </div>
          </div>
        </div>
      )}
      {!duel && left && <div className="bb-center solo-hint">{sel ? "Hover an enemy to forecast" : ""}</div>}

      {right && rv && left && <Side u={right} hp={rv.hp} terrain={rightTerr} side="right" />}
    </div>
  );
}

function Side({ u, hp, terrain, side }: { u: UnitDef; hp: number; terrain: TerrainDef | null; side: "left" | "right" }) {
  return (
    <div className={`bb-side ${side} ${u.team}`}>
      <CardThumb u={u} className="bb-portrait" scale={0.75} />
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
          <span className="bb-rng">rng {u.stats.rangeMin === u.stats.rangeMax ? u.stats.rangeMax : `${u.stats.rangeMin}–${u.stats.rangeMax}`}</span>
        </div>
        <div className="bb-hpbar">
          <div style={{ width: `${(100 * hp) / u.stats.hp}%` }} />
        </div>
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
