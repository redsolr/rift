"use client";
import { Mode, useGame } from "@/store/game";
import { useUiLayout } from "./ui/UiFrame";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "manual", label: "Manual", hint: "You move every unit" },
  { id: "manager", label: "Manager", hint: "Give orders, watch them execute" },
  { id: "editor", label: "Editor", hint: "Build maps, tune AI, batch-simulate" },
];

export default function Hud() {
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);
  const view = useGame((s) => s.view);
  const battle = useGame((s) => s.battle);
  const playing = useGame((s) => s.playing);
  const cursor = useGame((s) => s.cursor);
  const events = useGame((s) => s.events);
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const play = useGame((s) => s.play);
  const pause = useGame((s) => s.pause);
  const step = useGame((s) => s.step);
  const startBattle = useGame((s) => s.startBattle);
  const rematch = useGame((s) => s.rematch);
  const runOnce = useGame((s) => s.runOnce);
  const resetToSetup = useGame((s) => s.resetToSetup);
  const executePhase = useGame((s) => s.executePhase);
  const phaseLen = useGame((s) => s.phaseLen);
  const setPhaseLen = useGame((s) => s.setPhaseLen);
  const pendingMove = useGame((s) => s.pendingMove);
  const selected = useGame((s) => s.selected);
  const moveTiles = useGame((s) => s.moveTiles);
  const commitWait = useGame((s) => s.commitWait);
  const cancelPending = useGame((s) => s.cancelPending);
  const playerTeam = useGame((s) => s.playerTeam);
  const seed = useGame((s) => s.seed);
  const showDanger = useGame((s) => s.showDanger);
  const toggleDanger = useGame((s) => s.toggleDanger);
  const uiEditing = useUiLayout((s) => s.editing);
  const toggleUiEdit = useUiLayout((s) => s.toggleEditing);
  const boardView = useGame((s) => s.boardView);
  const toggleBoardView = useGame((s) => s.toggleBoardView);
  const showGrid = useGame((s) => s.showGrid);
  const toggleGrid = useGame((s) => s.toggleGrid);

  const caughtUp = cursor >= events.length;
  const live = !!battle && !battle.state.ended;
  const ended = !!battle && view.ended;
  const yourTurn = mode === "manual" && live && caughtUp && battle!.state.activeTeam === playerTeam;
  const commandPhase = mode === "manager" && live && caughtUp && !playing;

  return (
    <div className="hud">
      <div className="hud-left">
        <span className="brand">TACTICIAN</span>
        <nav className="mode-tabs">
          {MODES.map((m) => (
            <button key={m.id} className={m.id === mode ? "tab active" : "tab"} title={m.hint} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
          <a className="tab" href="/campaign" title="Campaign prototype — walk the room, talk to Mina">
            Campaign
          </a>
        </nav>
      </div>

      <div className="hud-center">
        {battle ? (
          <>
            <span className={`turn-pill ${view.activeTeam}`}>
              Turn {view.turn} · {view.activeTeam.toUpperCase()}
            </span>
            {ended && (
              <span className="result-pill">{view.winner === "draw" ? "DRAW" : `${view.winner!.toUpperCase()} WINS`}</span>
            )}
            {yourTurn && !ended && <span className="hint-pill">Your move — click a {playerTeam} unit</span>}
            {commandPhase && !ended && <span className="hint-pill">Command phase — adjust orders, then execute</span>}
          </>
        ) : (
          <span className="hint-pill">
            {mode === "manual" && `Start a battle and control the ${playerTeam} team`}
            {mode === "manager" && "Set orders in the panel, then execute turns"}
            {mode === "editor" && "Paint terrain, place units, tune sliders, simulate"}
          </span>
        )}
      </div>

      <div className="hud-right">
        {battle && (
          <div className="playback">
            <button className="icon" onClick={playing ? pause : play} title={playing ? "Pause" : "Play"} disabled={caughtUp && !playing}>
              {playing ? "❚❚" : "▶"}
            </button>
            <button className="icon" onClick={step} title="Step one event" disabled={caughtUp}>
              ⏭
            </button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} title="Playback speed">
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
            <span className="cursor">
              {cursor}/{events.length}
            </span>
          </div>
        )}

        {mode === "manual" && !battle && (
          <button className="primary" onClick={() => startBattle()}>
            Start battle
          </button>
        )}
        {mode === "manual" && yourTurn && selected && moveTiles.length > 0 && (
          <>
            <button className="primary" onClick={commitWait}>
              {pendingMove ? "Wait here" : "Wait"}
            </button>
            {pendingMove && (
              <button className="ghost" onClick={cancelPending}>
                Cancel
              </button>
            )}
          </>
        )}

        {mode === "manager" && !battle && (
          <button className="primary" onClick={() => startBattle()}>
            Start battle
          </button>
        )}
        {mode === "manager" && commandPhase && !ended && (
          <>
            <select value={phaseLen} onChange={(e) => setPhaseLen(Number(e.target.value))} title="Turns per execution phase">
              <option value={1}>1 turn</option>
              <option value={3}>3 turns</option>
              <option value={5}>5 turns</option>
              <option value={99}>to the end</option>
            </select>
            <button className="primary" onClick={executePhase}>
              Execute
            </button>
          </>
        )}

        {mode === "editor" && !battle && (
          <button className="primary" onClick={runOnce} title="Watch one AI-vs-AI battle on this setup">
            Run once
          </button>
        )}

        <button className={`ghost ui-toggle ${uiEditing ? "on" : ""}`} onClick={toggleUiEdit} title="UI layout: move and resize the HUD frames (WoW-addon style)">
          ⧉<span className="btn-text"> UI</span>
        </button>
        {battle && mode !== "editor" && (
          <button className={`ghost danger-toggle ${showDanger ? "on" : ""}`} onClick={toggleDanger} title="Show every tile the enemy can attack next turn + who can hit your selected unit">
            ◆<span className="btn-text"> Danger</span>
          </button>
        )}
        <button className={`ghost view-toggle ${showGrid ? "on" : ""}`} onClick={toggleGrid} title="Debug: always draw the tile grid (normally it shows only while a unit is selected)">
          ▦<span className="btn-text"> Grid</span>
        </button>
        <button className={`ghost view-toggle ${boardView === "tiles" ? "on" : ""}`} onClick={toggleBoardView} title="Debug: flat coloured terrain blocks instead of the dressed city map">
          ▤<span className="btn-text"> Tiles</span>
        </button>
        {ended && (
          <button className="primary" onClick={rematch} title={`Next seed (${seed + 1})`}>
            Rematch
          </button>
        )}
        {battle && (
          <button className="ghost" onClick={resetToSetup} title="Back to setup">
            ↺<span className="btn-text"> Reset</span>
          </button>
        )}
      </div>
    </div>
  );
}
