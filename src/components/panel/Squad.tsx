"use client";
import { useMemo } from "react";
import { useGame } from "@/store/game";
import { DoctrineAggression, DoctrineObjective, Team } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { AGGR, OBJ } from "./options";

export function SquadList({ team }: { team: Team }) {
  const allUnits = useGame((s) => s.config.units);
  const units = useMemo(() => allUnits.filter((u) => u.team === team), [allUnits, team]);
  const view = useGame((s) => s.view);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  return (
    <div className="squad">
      {units.map((u) => {
        const v = view.units[u.id];
        const dead = v && !v.alive;
        return (
          <button key={u.id} className={`squad-row ${team} ${selected === u.id ? "active" : ""} ${dead ? "dead" : ""}`} onClick={() => select(u.id)}>
            <span className="squad-name">{u.name}</span>
            <span className="squad-arch">{ARCHETYPE_LABEL[u.archetype]}</span>
            <span className="squad-hp">
              {v ? v.hp : u.stats.hp}/{u.stats.hp}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DoctrineEditor({ team }: { team: Team }) {
  const d = useGame((s) => s.config.doctrine[team]);
  const setDoctrine = useGame((s) => s.setDoctrine);
  return (
    <div className="row2">
      <label>
        <span>Doctrine</span>
        <select value={d.aggression} onChange={(e) => setDoctrine(team, { aggression: e.target.value as DoctrineAggression })}>
          {AGGR.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Objective</span>
        <select value={d.objective} onChange={(e) => setDoctrine(team, { objective: e.target.value as DoctrineObjective })}>
          {OBJ.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

