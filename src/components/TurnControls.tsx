"use client";
import { selectCaughtUp, useGame } from "@/store/game";
import { useUiFrame } from "./ui/UiFrame";

/**
 * Bottom-right of the board (above the battle bar): END TURN = your remaining units wait in place
 * and the enemy phase begins; AUTO = the AI plays your phases (orders) until you switch it off.
 */
export default function TurnControls() {
  const mode = useGame((s) => s.mode);
  const battle = useGame((s) => s.battle);
  const playerTeam = useGame((s) => s.playerTeam);
  const caughtUp = useGame(selectCaughtUp);
  const autoPlay = useGame((s) => s.autoPlay);
  const endTurn = useGame((s) => s.endTurn);
  const toggleAuto = useGame((s) => s.toggleAuto);
  const ended = useGame((s) => s.view.ended);
  const ui = useUiFrame("turn-controls");
  // in UI-layout mode the frame is always shown so it can be placed
  if (!ui.editing && (mode !== "manual" || !battle || ended)) return null;
  const yourTurn = !!battle && caughtUp && battle.state.activeTeam === playerTeam && !battle.state.ended;
  return (
    <div className="turn-controls" style={ui.style}>
      <button className={autoPlay ? "on" : ""} onClick={toggleAuto} title="Let the AI play your phases too, using your units' orders, until switched off">
        {autoPlay ? "■ Auto" : "▶ Auto"}
      </button>
      <button onClick={endTurn} disabled={!yourTurn || autoPlay} title="Your remaining units wait where they stand; the enemy phase begins">
        End turn
      </button>
      {ui.overlay}
    </div>
  );
}
