"use client";
import { useGame } from "@/store/game";
import { ARCHETYPES, TERRAIN, TERRAINS, Team } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";

export function EditorTools() {
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const map = useGame((s) => s.config.map);
  const resizeMap = useGame((s) => s.resizeMap);
  const clearMap = useGame((s) => s.clearMap);
  const maxTurns = useGame((s) => s.config.maxTurns);
  const setMaxTurns = useGame((s) => s.setMaxTurns);
  const isTerrain = (t: string) => tool.kind === "terrain" && tool.terrain === t;
  const isUnit = (team: Team, a: string) => tool.kind === "unit" && tool.team === team && tool.archetype === a;
  return (
    <div>
      <div className="tool-row">
        <button className={`tool ${tool.kind === "select" ? "active" : ""}`} onClick={() => setTool({ kind: "select" })}>
          Select / move
        </button>
        <button className={`tool ${tool.kind === "erase" ? "active" : ""}`} onClick={() => setTool({ kind: "erase" })}>
          Erase unit
        </button>
      </div>
      <div className="tool-label">Terrain (click-drag to paint)</div>
      <div className="tool-row wrap">
        {TERRAINS.map((t) => (
          <button key={t} className={`tool swatch ${isTerrain(t) ? "active" : ""}`} onClick={() => setTool({ kind: "terrain", terrain: t })}>
            <span className="swatch-dot" style={{ background: TERRAIN[t].color }} />
            {TERRAIN[t].label}
          </button>
        ))}
      </div>
      {(["red", "blue"] as Team[]).map((team) => (
        <div key={team}>
          <div className={`tool-label ${team}`}>Place {team} unit</div>
          <div className="tool-row wrap">
            {ARCHETYPES.map((a) => (
              <button key={a} className={`tool ${team} ${isUnit(team, a) ? "active" : ""}`} onClick={() => setTool({ kind: "unit", team, archetype: a })}>
                {ARCHETYPE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="row3">
        <label>
          <span>Width</span>
          <input type="number" min={4} max={24} value={map.width} onChange={(e) => resizeMap(Math.max(4, Math.min(24, Number(e.target.value))), map.height)} />
        </label>
        <label>
          <span>Height</span>
          <input type="number" min={4} max={24} value={map.height} onChange={(e) => resizeMap(map.width, Math.max(4, Math.min(24, Number(e.target.value))))} />
        </label>
        <label>
          <span>Max turns</span>
          <input type="number" min={1} max={200} value={maxTurns} onChange={(e) => setMaxTurns(Math.max(1, Number(e.target.value)))} />
        </label>
      </div>
      <button className="ghost" onClick={clearMap}>
        Clear terrain
      </button>
    </div>
  );
}

export function SimPanel() {
  const runSims = useGame((s) => s.runSims);
  const stats = useGame((s) => s.simStats);
  const progress = useGame((s) => s.simProgress);
  const seed = useGame((s) => s.seed);
  const pct = (n: number) => (stats && stats.runs ? ((100 * n) / stats.runs).toFixed(1) + "%" : "–");
  const top = (o: Record<string, number>) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  return (
    <div>
      <div className="tool-row">
        {[10, 100, 1000, 5000].map((n) => (
          <button key={n} className="tool" disabled={progress !== null} onClick={() => runSims(n)}>
            Run {n}×
          </button>
        ))}
      </div>
      <p className="muted">Seeds {seed}…{seed + 4999} · same seeds, same results — always.</p>
      {progress !== null && (
        <div className="progress">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {stats && stats.runs > 0 && (
        <div className="sim-results">
          <div className="winbar">
            <div className="red" style={{ width: pct(stats.redWins) }} title={`Red ${pct(stats.redWins)}`} />
            <div className="draw" style={{ width: pct(stats.draws) }} title={`Draw ${pct(stats.draws)}`} />
            <div className="blue" style={{ width: pct(stats.blueWins) }} title={`Blue ${pct(stats.blueWins)}`} />
          </div>
          <div className="stat-line">
            <span className="red">Red {pct(stats.redWins)}</span>
            <span className="blue">Blue {pct(stats.blueWins)}</span>
            <span>Draw {pct(stats.draws)}</span>
            <span>Avg {stats.avgTurns.toFixed(1)} turns</span>
            <span>{stats.runs} runs</span>
          </div>
          <div className="row2">
            <div>
              <div className="tool-label">Most deaths</div>
              {top(stats.deaths).map(([k, v]) => (
                <div key={k} className="kv">
                  <span>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="tool-label">Most survivals</div>
              {top(stats.survivals).map(([k, v]) => (
                <div key={k} className="kv">
                  <span>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

