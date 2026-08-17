"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/store/game";
import { ARCHETYPES, DoctrineAggression, DoctrineObjective, Personality, ScoredAction, Stance, Stats, TERRAIN, TERRAINS, TargetPref, Team, UnitDef } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";

const STANCES: { id: Stance; label: string }[] = [
  { id: "hold", label: "Hold position" },
  { id: "advance", label: "Advance" },
  { id: "pursue", label: "Pursue" },
];
const PREFS: { id: TargetPref; label: string }[] = [
  { id: "nearest", label: "Nearest" },
  { id: "weakest", label: "Weakest" },
  { id: "wounded", label: "Wounded" },
  { id: "ranged", label: "Ranged units" },
  { id: "healers", label: "Healers" },
];
const AGGR: { id: DoctrineAggression; label: string }[] = [
  { id: "very_defensive", label: "Very defensive" },
  { id: "defensive", label: "Defensive" },
  { id: "balanced", label: "Balanced" },
  { id: "aggressive", label: "Aggressive" },
  { id: "all_out", label: "All-out attack" },
];
const OBJ: { id: DoctrineObjective; label: string }[] = [
  { id: "hold", label: "Hold" },
  { id: "advance", label: "Advance" },
  { id: "capture", label: "Capture objective" },
  { id: "protect", label: "Protect" },
];
const PERSONALITY_KEYS: (keyof Personality)[] = ["aggression", "courage", "discipline", "intelligence", "loyalty"];
const STAT_KEYS: (keyof Stats)[] = ["hp", "atk", "def", "spd", "mov", "rangeMin", "rangeMax"];

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <button className="section-title" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="chev">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function Slider({ label, value, min = 0, max = 100, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-value">{value}</span>
    </label>
  );
}

function SquadList({ team }: { team: Team }) {
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

function DoctrineEditor({ team }: { team: Team }) {
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

function OrdersEditor({ u }: { u: UnitDef }) {
  const setOrders = useGame((s) => s.setOrders);
  const allUnits = useGame((s) => s.config.units);
  const allies = useMemo(() => allUnits.filter((x) => x.team === u.team && x.id !== u.id), [allUnits, u.team, u.id]);
  const o = u.orders;
  return (
    <div className="orders">
      <label>
        <span>Stance</span>
        <select value={o.stance} onChange={(e) => setOrders(u.id, { stance: e.target.value as Stance })}>
          {STANCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Target</span>
        <select value={o.targetPref} onChange={(e) => setOrders(u.id, { targetPref: e.target.value as TargetPref })}>
          {PREFS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Protect</span>
        <select value={o.protect ?? ""} onChange={(e) => setOrders(u.id, { protect: e.target.value || null })}>
          <option value="">— nobody —</option>
          {allies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={o.avoidArmored} onChange={(e) => setOrders(u.id, { avoidArmored: e.target.checked })} /> Avoid armored (def ≥ 5)
      </label>
      <label className="check">
        <input type="checkbox" checked={o.noPursue} onChange={(e) => setOrders(u.id, { noPursue: e.target.checked })} /> Do not pursue
      </label>
      <Slider label="Retreat below HP %" value={o.retreatHpPct} onChange={(v) => setOrders(u.id, { retreatHpPct: v })} />
    </div>
  );
}

function PersonalityEditor({ u }: { u: UnitDef }) {
  const setPersonality = useGame((s) => s.setPersonality);
  return (
    <div>
      {PERSONALITY_KEYS.map((k) => (
        <Slider key={k} label={k[0].toUpperCase() + k.slice(1)} value={u.personality[k]} onChange={(v) => setPersonality(u.id, { [k]: v })} />
      ))}
    </div>
  );
}

function StatsEditor({ u }: { u: UnitDef }) {
  const setUnitStats = useGame((s) => s.setUnitStats);
  const setUnitField = useGame((s) => s.setUnitField);
  const removeUnit = useGame((s) => s.removeUnit);
  return (
    <div>
      <div className="row2">
        <label>
          <span>Name</span>
          <input value={u.name} onChange={(e) => setUnitField(u.id, { name: e.target.value })} />
        </label>
        <label>
          <span>Team</span>
          <select value={u.team} onChange={(e) => setUnitField(u.id, { team: e.target.value as Team })}>
            <option value="red">Red</option>
            <option value="blue">Blue</option>
          </select>
        </label>
      </div>
      <label>
        <span>Archetype</span>
        <select value={u.archetype} onChange={(e) => setUnitField(u.id, { archetype: e.target.value as UnitDef["archetype"] })}>
          {ARCHETYPES.map((a) => (
            <option key={a} value={a}>
              {ARCHETYPE_LABEL[a]}
            </option>
          ))}
        </select>
      </label>
      <div className="stat-grid">
        {STAT_KEYS.map((k) => (
          <label key={k}>
            <span>{k}</span>
            <input type="number" value={u.stats[k]} min={0} onChange={(e) => setUnitStats(u.id, { [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <p className="muted">Click a tile to move this unit there.</p>
      <button className="danger" onClick={() => removeUnit(u.id)}>
        Remove unit
      </button>
    </div>
  );
}

function Explain({ cands }: { cands: ScoredAction[] }) {
  const [open, setOpen] = useState<number>(0);
  return (
    <div className="explain">
      {cands.map((c, i) => (
        <div key={i} className={`cand ${i === 0 ? "chosen" : ""}`}>
          <button className="cand-head" onClick={() => setOpen(open === i ? -1 : i)}>
            <span className="cand-label">
              {i === 0 ? "✓ " : ""}
              {c.label}
            </span>
            <span className="cand-score">{c.score}</span>
          </button>
          {open === i && (
            <ul className="terms">
              {c.terms.map((t, j) => (
                <li key={j}>
                  <span>{t.label}</span>
                  <span className={t.value >= 0 ? "pos" : "neg"}>
                    {t.value >= 0 ? "+" : ""}
                    {t.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function UnitCard({ u }: { u: UnitDef }) {
  const v = useGame((s) => s.view.units[u.id]);
  const map = useGame((s) => s.config.map);
  const t = v ? TERRAIN[map.tiles[v.y * map.width + v.x]] : null;
  return (
    <div className={`unit-card ${u.team}`}>
      <div className="unit-card-head">
        <span className="unit-card-name">{u.name}</span>
        <span className="unit-card-arch">{ARCHETYPE_LABEL[u.archetype]}</span>
      </div>
      <div className="stat-line">
        <span>
          HP {v ? v.hp : u.stats.hp}/{u.stats.hp}
        </span>
        <span>ATK {u.stats.atk}</span>
        <span>DEF {u.stats.def}{t && t.defense ? ` (+${t.defense} ${t.label.toLowerCase()})` : ""}</span>
        <span>SPD {u.stats.spd}</span>
        <span>MOV {u.stats.mov}</span>
        <span>
          RNG {u.stats.rangeMin}–{u.stats.rangeMax}
        </span>
      </div>
    </div>
  );
}

function EditorTools() {
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

function SimPanel() {
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

function SharePanel() {
  const makeShareCode = useGame((s) => s.makeShareCode);
  const loadShareCode = useGame((s) => s.loadShareCode);
  const loadDefault = useGame((s) => s.loadDefault);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <div className="tool-row">
        <button
          className="tool"
          onClick={async () => {
            const c = makeShareCode();
            const url = `${location.origin}${location.pathname}#c=${c}`;
            history.replaceState(null, "", `#c=${c}`);
            try {
              await navigator.clipboard.writeText(url);
              setMsg("Link copied to clipboard");
            } catch {
              setMsg("Link is in the address bar");
            }
          }}
        >
          Copy share link
        </button>
        <button className="tool" onClick={loadDefault}>
          Load default setup
        </button>
      </div>
      <div className="tool-row">
        <input placeholder="paste share code or link" value={code} onChange={(e) => setCode(e.target.value)} />
        <button
          className="tool"
          onClick={() => {
            const raw = code.includes("#c=") ? code.split("#c=")[1] : code;
            setMsg(loadShareCode(raw) ? "Loaded" : "Invalid code");
          }}
        >
          Load
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}

function BattleLog() {
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
          out.push({ key: i, cls: `hit ${team(e.attacker)}`, unit: e.attacker, text: `${name(e.attacker)} hits ${name(e.target)} for ${e.damage}${e.killed ? " — KILLED" : ` (${e.targetHp} left)`}` });
          break;
        case "heal":
          out.push({ key: i, cls: `heal ${team(e.healer)}`, unit: e.healer, text: `${name(e.healer)} heals ${name(e.target)} +${e.amount}` });
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

export default function Panel() {
  const mode = useGame((s) => s.mode);
  const unit = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);
  const lastDecision = useGame((s) => (s.selected ? s.view.lastDecision[s.selected] : undefined));
  const battle = useGame((s) => s.battle);
  const playerTeam = useGame((s) => s.playerTeam);

  return (
    <aside className="panel">
      {mode === "editor" && (
        <>
          <Section title="Tools">
            <EditorTools />
          </Section>
          <Section title="Simulate">
            <SimPanel />
          </Section>
        </>
      )}

      {unit ? (
        <>
          <Section title={`Unit · ${unit.name}`}>
            <UnitCard u={unit} />
          </Section>
          {mode === "editor" && (
            <Section title="Stats" defaultOpen={false}>
              <StatsEditor u={unit} />
            </Section>
          )}
          {(mode !== "manual" || !battle) && (
            <Section title="Orders">
              <OrdersEditor u={unit} />
            </Section>
          )}
          <Section title="Personality" defaultOpen={mode === "editor"}>
            <PersonalityEditor u={unit} />
          </Section>
          {lastDecision && (
            <Section title="Why did it do that?">
              <Explain cands={lastDecision} />
            </Section>
          )}
        </>
      ) : (
        <Section title="Selection">
          <p className="muted">
            {mode === "manual" && "Click one of your units to move it. Blue tiles = reachable, red = attackable from the chosen tile."}
            {mode === "manager" && "Click any unit to view and edit its orders, personality and last decision."}
            {mode === "editor" && "Pick a tool on the left, or click a unit to edit it."}
          </p>
        </Section>
      )}

      {mode !== "editor" && (
        <>
          <Section title={`Your squad (${playerTeam})`}>
            <DoctrineEditor team={playerTeam} />
            <SquadList team={playerTeam} />
          </Section>
          <Section title="Enemy squad (blue)" defaultOpen={false}>
            <DoctrineEditor team="blue" />
            <SquadList team="blue" />
          </Section>
        </>
      )}
      {mode === "editor" && (
        <>
          <Section title="Red squad" defaultOpen={false}>
            <DoctrineEditor team="red" />
            <SquadList team="red" />
          </Section>
          <Section title="Blue squad" defaultOpen={false}>
            <DoctrineEditor team="blue" />
            <SquadList team="blue" />
          </Section>
        </>
      )}
      {mode !== "editor" || battle ? (
        <Section title="Battle log">
          <BattleLog />
        </Section>
      ) : null}
      <Section title="Share" defaultOpen={false}>
        <SharePanel />
      </Section>
    </aside>
  );
}
