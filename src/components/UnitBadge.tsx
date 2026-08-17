"use client";
import { useGame } from "@/store/game";
import { TERRAIN } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { WEAPON, overall } from "./cards";
import { CardThumb } from "./Forecast";

/** FE-style character box, bottom-left: the unit under the pointer, else the selected unit. */
export default function UnitBadge() {
  const hoverUnit = useGame((s) => s.hoverUnit);
  const selected = useGame((s) => s.selected);
  const units = useGame((s) => s.config.units);
  const view = useGame((s) => s.view);
  const map = useGame((s) => s.config.map);
  const hover = useGame((s) => s.hover);
  const id = hoverUnit ?? selected;
  const u = id ? units.find((x) => x.id === id) : null;
  const v = u ? view.units[u.id] : null;
  const tilePos = v ? { x: v.x, y: v.y } : hover;
  const terrain = tilePos && tilePos.x >= 0 && tilePos.x < map.width && tilePos.y >= 0 && tilePos.y < map.height ? TERRAIN[map.tiles[tilePos.y * map.width + tilePos.x]] : null;
  if (!u && !terrain) return null;
  return (
    <div className="unit-badge">
      {u && v && (
        <>
          <div className={`ub-name ${u.team}`}>
            <span>{u.name}</span>
            <span className="ub-ovr">{overall(u)}</span>
          </div>
          <div className="ub-body">
            <div className="ub-stats">
              <div className="ub-row">
                <span className="ub-lab">{ARCHETYPE_LABEL[u.archetype]}</span>
                <span className="ub-lab">HP</span>
                <span className={`ub-hp ${v.hp <= u.stats.hp * 0.3 ? "low" : ""}`}>
                  {v.hp}/{u.stats.hp}
                </span>
              </div>
              <div className="ub-hpbar">
                <div style={{ width: `${(100 * v.hp) / u.stats.hp}%` }} />
              </div>
              <div className="ub-weapon">
                <span className="ub-icon">⚔</span> {WEAPON[u.archetype]}
                <span className="ub-rng">rng {u.stats.rangeMin === u.stats.rangeMax ? u.stats.rangeMax : `${u.stats.rangeMin}–${u.stats.rangeMax}`}</span>
              </div>
            </div>
            <div className="ub-portrait">
              <CardThumb u={u} />
            </div>
          </div>
        </>
      )}
      {terrain && (
        <div className="ub-terrain">
          <span className="ub-terrain-dot" style={{ background: terrain.color }} />
          {terrain.label}
          <span className="ub-terrain-mod">{terrain.moveCost === null ? "impassable" : `${terrain.defense ? `+${terrain.defense} Def · ` : ""}cost ${terrain.moveCost}`}</span>
        </div>
      )}
    </div>
  );
}
