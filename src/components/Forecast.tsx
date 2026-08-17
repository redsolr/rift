"use client";
import { useMemo } from "react";
import { useGame } from "@/store/game";
import { Archetype, TERRAIN, UnitDef, otherTeam } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";

const WEAPON: Record<Archetype, string> = {
  knight: "Iron Lance",
  fighter: "Iron Axe",
  archer: "Iron Bow",
  mage: "Fire",
  healer: "Heal",
};
const GLYPH: Record<Archetype, string> = { knight: "♜", fighter: "⚔", archer: "➶", mage: "✦", healer: "✚" };

/**
 * FE-style combat forecast, docked to the left of the board. Left column = the selected
 * unit (standing on its pending tile in manual mode); right column = the enemy under the
 * pointer (or the only target in range). Numbers come from Battle.forecast — never
 * recomputed here.
 */
export default function Forecast() {
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const hoverUnit = useGame((s) => s.hoverUnit);
  const pendingMove = useGame((s) => s.pendingMove);
  const targets = useGame((s) => s.targets);
  const cursor = useGame((s) => s.cursor);
  const events = useGame((s) => s.events);
  const view = useGame((s) => s.view);
  const units = useGame((s) => s.config.units);
  const map = useGame((s) => s.config.map);
  const mode = useGame((s) => s.mode);

  const caughtUp = cursor >= events.length;
  const attacker = useMemo(() => units.find((u) => u.id === selected) ?? null, [units, selected]);
  const defenderId = useMemo(() => {
    if (!attacker) return null;
    const hov = hoverUnit ? units.find((u) => u.id === hoverUnit) : null;
    if (hov && hov.team !== attacker.team && view.units[hov.id]?.alive) return hov.id;
    if (targets.length === 1) return targets[0];
    return null;
  }, [attacker, hoverUnit, units, targets, view.units]);
  const defender = useMemo(() => units.find((u) => u.id === defenderId) ?? null, [units, defenderId]);

  const fc = useMemo(() => {
    if (!battle || !caughtUp || !attacker || !defender) return null;
    if (!view.units[attacker.id]?.alive || !view.units[defender.id]?.alive) return null;
    if (attacker.archetype === "healer") return null;
    return battle.forecast(attacker.id, defender.id, pendingMove ?? undefined);
  }, [battle, caughtUp, attacker, defender, pendingMove, view.units]);

  if (!attacker || mode === "editor" || !battle) return null;
  const av = view.units[attacker.id];
  const dv = defender ? view.units[defender.id] : null;
  if (!av?.alive) return null;

  const terrainOf = (x: number, y: number) => TERRAIN[map.tiles[y * map.width + x]];
  const aTile = pendingMove ?? { x: av.x, y: av.y };
  const aTerr = terrainOf(aTile.x, aTile.y);
  const dTerr = dv ? terrainOf(dv.x, dv.y) : null;

  return (
    <aside className={`forecast ${defender ? "duel" : "solo"}`} aria-label="Combat forecast">
      <div className="fc-heads">
        <Head u={attacker} hp={av.hp} side="a" />
        {defender && dv && <Head u={defender} hp={dv.hp} side="d" />}
      </div>

      <div className="fc-hp">
        <HpBar team={attacker.team} hp={av.hp} max={attacker.stats.hp} after={fc?.retaliation != null ? Math.max(0, av.hp - fc.retaliation) : null} />
        <span className="fc-hp-label">HP</span>
        {defender && dv ? <HpBar team={defender.team} hp={dv.hp} max={defender.stats.hp} after={fc ? fc.hpAfter : null} right /> : <span className="fc-hp-empty" />}
      </div>

      <div className="fc-grid">
        <Row label="Dmg" a={fc ? fc.damage : attacker.stats.atk} d={fc ? (fc.retaliation ?? "—") : defender ? defender.stats.atk : "—"} hiA={!!fc?.kill} hiD={!!fc?.retaliationKill} />
        <Row label="Hit" a={100} d={fc ? (fc.retaliation != null ? 100 : "—") : "—"} />
        <Row optional label="Rng" a={`${attacker.stats.rangeMin}–${attacker.stats.rangeMax}`} d={defender ? `${defender.stats.rangeMin}–${defender.stats.rangeMax}` : "—"} />
        <Row optional label="Def" a={attacker.stats.def + (aTerr.defense ? `+${aTerr.defense}` : "")} d={defender ? defender.stats.def + (dTerr && dTerr.defense ? `+${dTerr.defense}` : "") : "—"} />
      </div>

      <div className="fc-banners">
        <Banner cls={ARCHETYPE_LABEL[attacker.archetype]} weapon={WEAPON[attacker.archetype]} team={attacker.team} />
        {defender && <Banner cls={ARCHETYPE_LABEL[defender.archetype]} weapon={WEAPON[defender.archetype]} team={defender.team} right />}
      </div>

      {fc && (
        <div className={`fc-verdict ${fc.kill ? "kill" : fc.retaliationKill ? "danger" : ""}`}>
          {!fc.inRange
            ? "Out of range from here"
            : fc.kill
              ? `Kills ${defender!.name}`
              : fc.retaliation != null
                ? `${defender!.name} can hit back for ${fc.retaliation} on ${otherTeam(attacker.team)}'s turn`
                : `${defender!.name} cannot reach this tile`}
        </div>
      )}
      {!defender && <div className="fc-verdict muted">Hover an enemy to forecast</div>}
    </aside>
  );
}

function Head({ u, hp, side }: { u: UnitDef; hp: number; side: "a" | "d" }) {
  return (
    <div className={`fc-head ${side} ${u.team}`}>
      <div className="fc-diamond">
        <span className="fc-glyph">{GLYPH[u.archetype]}</span>
      </div>
      <div className="fc-name">
        <span>{u.name}</span>
        <span className="fc-hp-num">{hp}</span>
      </div>
    </div>
  );
}

function HpBar({ team, hp, max, after, right }: { team: string; hp: number; max: number; after: number | null; right?: boolean }) {
  const pct = (100 * hp) / max;
  const afterPct = after != null ? (100 * after) / max : pct;
  return (
    <div className={`fc-bar ${team} ${right ? "right" : ""}`}>
      <div className="fc-bar-cur" style={{ width: `${pct}%` }} />
      {after != null && after < hp && <div className="fc-bar-loss" style={{ width: `${pct - afterPct}%`, [right ? "right" : "left"]: `${afterPct}%` }} />}
      <span className="fc-bar-text">
        {hp}
        {after != null && after !== hp ? ` → ${after}` : ""}
      </span>
    </div>
  );
}

function Row({ label, a, d, hiA, hiD, optional }: { label: string; a: number | string; d: number | string; hiA?: boolean; hiD?: boolean; optional?: boolean }) {
  return (
    <div className={`fc-row ${optional ? "optional" : ""}`}>
      <span className={`fc-val ${hiA ? "hi" : ""}`}>{a}</span>
      <span className="fc-lab">{label}</span>
      <span className={`fc-val ${hiD ? "hi" : ""}`}>{d}</span>
    </div>
  );
}

function Banner({ cls, weapon, team, right }: { cls: string; weapon: string; team: string; right?: boolean }) {
  return (
    <div className={`fc-banner ${team} ${right ? "right" : ""}`}>
      <span className="fc-cls">{cls}</span>
      <span className="fc-weapon">{weapon}</span>
    </div>
  );
}
