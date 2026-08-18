"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { selectCaughtUp, useGame } from "@/store/game";
import { Element } from "@/sim/attacks";
import { UnitDef } from "@/sim/types";
import Portrait from "./Portrait";
import { stickPan } from "./board/shared";

/**
 * Phone (landscape) control layer — the Genshin-shaped screen over the same store verbs the desktop uses:
 *   right edge   = SQUAD COLUMN: your units as portrait chips (HP ring, dimmed once acted); tap = select / cycle,
 *                  long-press = camera to it
 *   bottom-right = PS-STYLE ACTION CLUSTER: one big contextual primary button (Start · Begin · Attack · Wait · End turn ·
 *                  Rematch…) with Wait / Heal / Back / Auto satellites; the skill picker is a RADIAL of the unit's
 *                  attacks fanned around the primary (replaces the full-height SkillPanel on phones)
 *   bottom-left  = CAMERA STICK: a virtual joystick that pans the camera (one finger stays free to tap the board)
 * Tapping units / tiles on the board keeps working exactly as before — this only adds thumb-zone shortcuts.
 */

const ELEMENT_GLYPH: Record<Element, string> = { physical: "⚔", fire: "🔥", ice: "❄", thunder: "⚡", holy: "✚" };

function SquadChip({ u }: { u: UnitDef }) {
  const vu = useGame((s) => s.view.units[u.id]);
  const selected = useGame((s) => s.selected === u.id);
  const clickUnit = useGame((s) => s.clickUnit);
  const focusCam = useGame((s) => s.focusCam);
  const timer = useRef<number | null>(null);
  const long = useRef(false);
  if (!vu || !vu.alive) return null;
  const pct = Math.max(0, Math.min(1, vu.hp / u.stats.hp));
  const ring = `conic-gradient(var(--chip-ring) ${pct * 360}deg, rgba(255,255,255,0.12) 0)`;
  return (
    <button
      className={`mc-chip ${selected ? "selected" : ""} ${vu.acted ? "acted" : ""}`}
      style={{ backgroundImage: ring }}
      onPointerDown={() => {
        long.current = false;
        timer.current = window.setTimeout(() => {
          long.current = true;
          focusCam({ x: vu.x, y: vu.y }, "keep");
        }, 450);
      }}
      onPointerUp={() => {
        if (timer.current) window.clearTimeout(timer.current);
        if (!long.current) clickUnit(u.id);
      }}
      onPointerCancel={() => timer.current && window.clearTimeout(timer.current)}
      aria-label={u.name}
    >
      <Portrait u={u} className="mc-chip-portrait" />
      <span className="mc-chip-name">{u.name}</span>
    </button>
  );
}

function SquadColumn() {
  const units = useGame((s) => s.config.units);
  const playerTeam = useGame((s) => s.playerTeam);
  const mine = useMemo(() => units.filter((u) => u.team === playerTeam), [units, playerTeam]);
  return (
    <div className="mc-squad">
      {mine.map((u) => (
        <SquadChip key={u.id} u={u} />
      ))}
    </div>
  );
}

/** Virtual joystick: drag the knob; the offset (−1..1) drives the camera pan in CameraRig every frame. */
function CameraStick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  useEffect(
    () => () => {
      stickPan.x = 0;
      stickPan.y = 0;
    },
    [],
  );
  const R = 44;
  const move = (cx: number, cy: number) => {
    let dx = cx - origin.current.x;
    let dy = cy - origin.current.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    stickPan.x = dx / R;
    stickPan.y = dy / R;
  };
  return (
    <div
      className="mc-stick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = true;
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active.current && move(e.clientX, e.clientY)}
      onPointerUp={() => {
        active.current = false;
        setKnob({ x: 0, y: 0 });
        stickPan.x = 0;
        stickPan.y = 0;
      }}
      onPointerCancel={() => {
        active.current = false;
        setKnob({ x: 0, y: 0 });
        stickPan.x = 0;
        stickPan.y = 0;
      }}
      onLostPointerCapture={() => {
        active.current = false;
        setKnob({ x: 0, y: 0 });
        stickPan.x = 0;
        stickPan.y = 0;
      }}
      aria-label="Camera stick"
    >
      <div className="mc-stick-ring" />
      <div className="mc-stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function ActionCluster() {
  const mode = useGame((s) => s.mode);
  const battle = useGame((s) => s.battle);
  const planning = useGame((s) => s.planning);
  const playerTeam = useGame((s) => s.playerTeam);
  const caughtUp = useGame(selectCaughtUp);
  const ended = useGame((s) => s.view.ended);
  const selected = useGame((s) => s.selected);
  const pendingMove = useGame((s) => s.pendingMove);
  const menuPage = useGame((s) => s.menuPage);
  const menuKind = useGame((s) => s.menuKind);
  const targets = useGame((s) => s.targets);
  const pendingAttack = useGame((s) => s.pendingAttack);
  const autoPlay = useGame((s) => s.autoPlay);
  const startBattle = useGame((s) => s.startBattle);
  const beginBattle = useGame((s) => s.beginBattle);
  const rematch = useGame((s) => s.rematch);
  const endTurn = useGame((s) => s.endTurn);
  const toggleAuto = useGame((s) => s.toggleAuto);
  const commitWait = useGame((s) => s.commitWait);
  const commitTarget = useGame((s) => s.commitTarget);
  const openAttacks = useGame((s) => s.openAttacks);
  const chooseAttack = useGame((s) => s.chooseAttack);
  const cancelPending = useGame((s) => s.cancelPending);
  const executePhase = useGame((s) => s.executePhase);
  const select = useGame((s) => s.select);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);

  const yourTurn = !!battle && caughtUp && battle.state.activeTeam === playerTeam && !battle.state.ended;
  const options = useMemo(() => (battle && selected && pendingMove && menuPage ? battle.attackOptions(selected, pendingMove) : []), [battle, selected, pendingMove, menuPage]);
  const nAttack = new Set(options.filter((o) => o.attack.kind === "attack").flatMap((o) => o.targets)).size;
  const nHeal = new Set(options.filter((o) => o.attack.kind === "heal").flatMap((o) => o.targets)).size;
  const hasHeals = options.some((o) => o.attack.kind === "heal");
  const radial = menuPage === "attacks" ? options.filter((o) => o.attack.kind === menuKind) : [];

  if (mode === "editor") return null;

  // ---- the primary button + satellites, by state ----
  let primary: { label: string; sub?: string; onClick: () => void; disabled?: boolean; tone?: string } | null = null;
  const sats: { key: string; label: string; onClick: () => void; disabled?: boolean; on?: boolean }[] = [];

  if (planning) primary = { label: "Begin", sub: "battle", onClick: beginBattle, tone: "gold" };
  else if (!battle) primary = { label: "Start", sub: "battle", onClick: () => startBattle(), tone: "gold" };
  else if (ended) primary = { label: "Rematch", onClick: rematch, tone: "gold" };
  else if (mode === "manager") {
    if (caughtUp) primary = { label: "Execute", onClick: executePhase, tone: "gold" };
  } else if (!yourTurn) {
    sats.push({ key: "auto", label: autoPlay ? "■ Auto" : "▶ Auto", onClick: toggleAuto, on: autoPlay });
  } else if (menuPage === "target") {
    // one legal target → the primary strikes it; else it is Back (tap the red tile to strike)
    if (targets.length === 1) primary = { label: menuKind === "heal" ? "Heal" : "Strike", sub: pendingAttack ?? undefined, onClick: () => commitTarget(targets[0]), tone: menuKind === "heal" ? "green" : "red" };
    else primary = { label: "Back", sub: `${targets.length} targets — tap one`, onClick: cancelPending };
    sats.push({ key: "back", label: "Back", onClick: cancelPending });
  } else if (menuPage === "attacks") {
    primary = { label: "Back", sub: menuKind === "heal" ? "pick a heal" : "pick an attack", onClick: cancelPending };
  } else if (menuPage === "command" && pendingMove) {
    if (nAttack > 0) primary = { label: "Attack", sub: `${nAttack} in reach`, onClick: () => openAttacks("attack"), tone: "red" };
    else primary = { label: "Wait", sub: "here", onClick: commitWait };
    if (nAttack > 0) sats.push({ key: "wait", label: "Wait", onClick: commitWait });
    if (hasHeals) sats.push({ key: "heal", label: "Heal", onClick: () => openAttacks("heal"), disabled: nHeal === 0 });
    sats.push({ key: "back", label: "Back", onClick: cancelPending });
  } else if (selected && selectedDef?.team === playerTeam) {
    primary = { label: "Wait", sub: "stay put", onClick: commitWait };
    sats.push({ key: "cancel", label: "Cancel", onClick: () => select(null) });
    sats.push({ key: "end", label: "End turn", onClick: endTurn });
  } else {
    primary = { label: "End", sub: "turn", onClick: endTurn, disabled: autoPlay };
    sats.push({ key: "auto", label: autoPlay ? "■ Auto" : "▶ Auto", onClick: toggleAuto, on: autoPlay });
  }

  return (
    <div className="mc-cluster">
      {/* satellites arc up-left of the primary */}
      {sats.map((b, i) => (
        <button key={b.key} className={`mc-sat ${b.on ? "on" : ""}`} style={{ "--i": i } as React.CSSProperties} onClick={b.onClick} disabled={b.disabled}>
          {b.label}
        </button>
      ))}
      {/* radial skill picker: the unit's attacks fanned around the primary */}
      {radial.map((o, i) => {
        const off = !o.usable || o.targets.length === 0;
        return (
          <button key={o.attack.id} className={`mc-skill el-${o.attack.element} ${off ? "off" : ""}`} style={{ "--i": i, "--n": radial.length } as React.CSSProperties} disabled={off} onClick={() => chooseAttack(o.attack.id)} title={o.attack.name}>
            <span className="mc-skill-glyph">{ELEMENT_GLYPH[o.attack.element]}</span>
            <span className="mc-skill-name">{o.attack.name}</span>
            <span className="mc-skill-meta">{off ? (o.usable ? "—" : "🔒") : o.targets.length}</span>
          </button>
        );
      })}
      {primary && (
        <button className={`mc-primary ${primary.tone ?? ""}`} onClick={primary.onClick} disabled={primary.disabled}>
          <span className="mc-primary-label">{primary.label}</span>
          {primary.sub && <span className="mc-primary-sub">{primary.sub}</span>}
        </button>
      )}
    </div>
  );
}

export default function MobileControls() {
  return (
    <>
      <SquadColumn />
      <CameraStick />
      <ActionCluster />
    </>
  );
}

