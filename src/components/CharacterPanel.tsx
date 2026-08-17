"use client";
import { useGame } from "@/store/game";
import { TERRAIN, TerrainDef, UnitDef } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { RUNES } from "@/sim/runes";
import { WEAPON, overall, tierOf } from "./cards";
import Portrait from "./Portrait";
import { useUiFrame } from "./ui/UiFrame";

/**
 * FE Three Hopes-style character panel, TOP-LEFT of the board: the unit under the pointer, else the selected one.
 * Name banner in the team colour, class, HP (big serif numbers + gauge), the four stat rows, the weapon row and the
 * terrain under it — with the character bust hanging in the right column, head poking above the frame.
 * Reads the replayed view only (HP, buff, position); never the engine. Hidden while the battle bar forecasts a duel
 * (FE swaps the panel for the exchange), in the editor, and on phones (the drawer carries the info there).
 */
export default function CharacterPanel({ hidden = false }: { hidden?: boolean }) {
  const selected = useGame((s) => s.selected);
  const hoverUnit = useGame((s) => s.hoverUnit);
  const pendingMove = useGame((s) => s.pendingMove);
  const view = useGame((s) => s.view);
  const units = useGame((s) => s.config.units);
  const map = useGame((s) => s.config.map);
  const mode = useGame((s) => s.mode);
  const playerTeam = useGame((s) => s.playerTeam);
  const ui = useUiFrame("char-panel");

  const byId = (id: string | null) => (id ? units.find((u) => u.id === id) ?? null : null);
  // hovered wins (FE cursor read); the selected unit stays up while the pointer is on empty ground
  const u: UnitDef | null = byId(hoverUnit) ?? byId(selected) ?? (ui.editing ? units.find((x) => x.team === playerTeam) ?? units[0] ?? null : null);
  if (mode === "editor" || !u || (hidden && !ui.editing)) return null;
  const vu = view.units[u.id];
  const hp = vu?.hp ?? u.stats.hp;
  const pos = u.id === selected && pendingMove ? pendingMove : { x: vu?.x ?? u.x, y: vu?.y ?? u.y };
  const terrain: TerrainDef | null = pos.x >= 0 && pos.y >= 0 && pos.x < map.width && pos.y < map.height ? TERRAIN[map.tiles[pos.y * map.width + pos.x]] : null;
  const buff = vu?.buff ?? null;
  const rng = u.stats.rangeMin === u.stats.rangeMax ? String(u.stats.rangeMax) : `${u.stats.rangeMin}–${u.stats.rangeMax}`;
  const tier = tierOf(u);

  return (
    <div className={`char-panel ${u.team} ${u.team === playerTeam ? "ally" : "enemy"} tier-${tier}`} style={ui.style} aria-label="Character">
      <div className="cp-frame">
        <div className="cp-banner">
          <span className="cp-name">{u.name}</span>
          <span className="cp-ovr" title="Overall rating">
            <span className="cp-ovr-l">OVR</span>
            {overall(u)}
          </span>
        </div>
        <div className="cp-body">
          <div className="cp-info">
            <div className="cp-class">
              <span className="cp-crest">{u.team === "red" ? "✦" : "❖"}</span>
              {ARCHETYPE_LABEL[u.archetype]}
              {tier === "gold" && <span className="cp-tier">★★★</span>}
            </div>
            <div className="cp-hp">
              <span className="cp-hp-l">HP</span>
              <span className={`cp-hp-v ${hp <= u.stats.hp / 4 ? "low" : ""}`}>{hp}</span>
              <span className="cp-hp-max">/ {u.stats.hp}</span>
            </div>
            <div className="cp-gauge">
              <div style={{ width: `${(100 * hp) / u.stats.hp}%` }} />
            </div>
            <div className="cp-stats">
              {(["atk", "def", "spd", "mov"] as const).map((k) => (
                <div key={k} className="cp-stat">
                  <span className="cp-stat-l">{k === "atk" ? "Atk" : k === "def" ? "Def" : k === "spd" ? "Spd" : "Mov"}</span>
                  <span className="cp-stat-v">{u.stats[k]}</span>
                </div>
              ))}
            </div>
          </div>
          <Portrait u={u} className="cp-portrait" />
        </div>
        <div className="cp-weapon">
          <span className="cp-arrow">«</span>
          <span className="cp-wicon">⚔</span>
          <span className="cp-wname">{WEAPON[u.archetype]}</span>
          <span className="cp-rng">rng {rng}</span>
          <span className="cp-arrow">»</span>
        </div>
        {buff && (
          <div className="cp-buff" style={{ color: RUNES[buff.kind].color }}>
            {RUNES[buff.kind].glyph} {RUNES[buff.kind].label} · {buff.turns} turn{buff.turns === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <div className="cp-terrain">
        {terrain ? terrain.label : ""}
        {terrain && terrain.defense ? <span className="cp-terrain-def">+{terrain.defense} Def</span> : null}
      </div>
      {ui.overlay}
    </div>
  );
}
