"use client";
import { useMemo } from "react";
import { useGame } from "@/store/game";
import { otherTeam } from "@/sim/types";
import CardThumb from "./CardThumb";

/**
 * FFT-style turn order strip at the top of the board. Blue chips = your units, red = enemy.
 * Order = the active phase's units still to act (speed order — nominal for the player, who may
 * pick freely), then the whole other side in speed order. Derived from the replayed view, so it
 * stays in sync during playback. The next actor is enlarged and marked.
 */
export default function TurnBar() {
  const battle = useGame((s) => s.battle);
  const view = useGame((s) => s.view);
  const units = useGame((s) => s.config.units);
  const playerTeam = useGame((s) => s.playerTeam);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const mode = useGame((s) => s.mode);

  const order = useMemo(() => {
    const bySpeed = (team: string, onlyPending: boolean) =>
      units
        .filter((u) => u.team === team && view.units[u.id]?.alive && (!onlyPending || !view.units[u.id]?.acted))
        .sort((a, b) => b.stats.spd - a.stats.spd || (a.id < b.id ? -1 : 1));
    const active = view.activeTeam;
    return [...bySpeed(active, true), ...bySpeed(otherTeam(active), false)];
  }, [units, view]);

  if (!battle || mode === "editor" || view.ended) return null;
  const mine = view.activeTeam === playerTeam;
  return (
    <div className="turn-bar" aria-label="Turn order">
      <div className={`tb-phase ${mine ? "player" : "enemy"}`}>
        <span className="tb-turn">T{view.turn}</span>
        {mine ? "Player phase" : "Enemy phase"}
      </div>
      <div className="tb-strip">
        {order.map((u, i) => {
          const v = view.units[u.id];
          const isNext = i === 0;
          const boundary = i > 0 && order[i - 1].team !== u.team;
          return (
            <button
              key={u.id}
              className={`tb-chip ${u.team} ${isNext ? "next" : ""} ${selected === u.id ? "sel" : ""} ${boundary ? "boundary" : ""}`}
              title={`${u.name} · ${u.team === playerTeam ? "you" : "enemy"} · HP ${v.hp}/${u.stats.hp} · SPD ${u.stats.spd}`}
              onClick={() => select(u.id)}
            >
              <CardThumb u={u} className="tb-card" scale={0.2} />
              <span className="tb-hp" style={{ width: `${(100 * v.hp) / u.stats.hp}%` }} />
              {isNext && <span className="tb-next">▼</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
