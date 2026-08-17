"use client";
import { selectCaughtUp, useGame } from "@/store/game";

/**
 * Bottom-right of the board (above the battle bar): END TURN hands the rest of your phase to
 * your units' orders; AUTO keeps doing that for every phase until you switch it off.
 */
export default function TurnControls() {
  const mode = useGame((s) => s.mode);
  const battle = useGame((s) => s.battle);
  const playerTeam = useGame((s) => s.playerTeam);
  const caughtUp = useGame(selectCaughtUp);
  const autoPlay = useGame((s) => s.autoPlay);
  const endPhaseAI = useGame((s) => s.endPhaseAI);
  const toggleAuto = useGame((s) => s.toggleAuto);
  const ended = useGame((s) => s.view.ended);
  if (mode !== "manual" || !battle || ended) return null;
  const yourTurn = caughtUp && battle.state.activeTeam === playerTeam && !battle.state.ended;
  return (
    <div className="turn-controls">
      <button className={autoPlay ? "on" : ""} onClick={toggleAuto} title="Let the AI play your phases too, using your units' orders, until switched off">
        {autoPlay ? "■ Auto" : "▶ Auto"}
      </button>
      <button onClick={endPhaseAI} disabled={!yourTurn || autoPlay} title="Your remaining units act on their orders, then the enemy phase begins">
        End turn
      </button>
    </div>
  );
}
