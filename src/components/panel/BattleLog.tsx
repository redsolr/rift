"use client";
import { useEffect, useMemo, useRef } from "react";
import { useGame } from "@/store/game";

export default function BattleLog() {
  const events = useGame((s) => s.events);
  const cursor = useGame((s) => s.cursor);
  const units = useGame((s) => s.config.units);
  const select = useGame((s) => s.select);
  const bottom = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const name = (id: string) => units.find((u) => u.id === id)?.name ?? id;
    const team = (id: string) => units.find((u) => u.id === id)?.team ?? "red";
    const out: { key: number; cls: string; unit?: string; text: string }[] = [];
    for (let i = 0; i < cursor; i++) {
      const e = events[i];
      switch (e.type) {
        case "turn_start":
          out.push({ key: i, cls: `turn ${e.team}`, text: `— Turn ${e.turn} · ${e.team.toUpperCase()} —` });
          break;
        case "move":
          out.push({ key: i, cls: team(e.unit), unit: e.unit, text: `${name(e.unit)} moves to ${e.path[e.path.length - 1].x},${e.path[e.path.length - 1].y}` });
          break;
        case "attack":
          out.push({ key: i, cls: `hit ${team(e.attacker)}`, unit: e.attacker, text: `${name(e.attacker)} · ${e.attack} → ${name(e.target)} for ${e.damage}${e.killed ? " — KILLED" : ` (${e.targetHp} left)`}` });
          break;
        case "heal":
          out.push({ key: i, cls: `heal ${team(e.healer)}`, unit: e.healer, text: `${name(e.healer)} · ${e.attack} → ${name(e.target)} +${e.amount}` });
          break;
        case "wait":
          out.push({ key: i, cls: `dim ${team(e.unit)}`, unit: e.unit, text: `${name(e.unit)} waits` });
          break;
        case "end":
          out.push({ key: i, cls: "end", text: e.winner === "draw" ? `Draw after ${e.turn} turns` : `${e.winner.toUpperCase()} wins on turn ${e.turn}` });
          break;
        default:
          break;
      }
    }
    return out.slice(-80);
  }, [events, cursor, units]);
  useEffect(() => {
    const el = bottom.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);
  if (!events.length) return <p className="muted">No battle yet.</p>;
  return (
    <div className="log">
      {rows.map((r) => (
        <div key={r.key} className={`log-row ${r.cls}`} onClick={() => r.unit && select(r.unit)} role={r.unit ? "button" : undefined}>
          {r.text}
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}

