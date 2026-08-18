"use client";
import { useEffect, useRef } from "react";
import { useGame } from "@/store/game";
import { pitRecordClear } from "@/store/pitProgress";
import { PIT_MAX } from "@/sim/pit";

/**
 * The Tower's end-of-floor card: shows once a Tower battle ends. Victory records the clear (localStorage) and offers
 * the next floor; defeat offers a retry. Both offer the way back to the village (the tower door). Ordinary skirmishes
 * never show it (`pit` is null).
 */
export default function PitResult() {
  const pit = useGame((s) => s.pit);
  const ended = useGame((s) => !!s.battle && s.view.ended);
  const winner = useGame((s) => s.view.winner);
  const playerTeam = useGame((s) => s.playerTeam);
  const startPit = useGame((s) => s.startPit);
  const recorded = useRef<number | null>(null);
  const won = ended && winner === playerTeam;
  const floor = pit?.floor ?? 0;
  // the clear is written to localStorage (external system) once per floor
  useEffect(() => {
    if (pit && won && recorded.current !== floor) {
      pitRecordClear(floor);
      recorded.current = floor;
    }
  }, [pit, won, floor]);
  if (!pit || !ended) return null;
  const go = (f: number) => {
    history.replaceState(null, "", `/?pit=${f}`);
    startPit(f);
  };
  return (
    <div className={`pit-result ${won ? "won" : "lost"}`} role="status">
      <div className="pit-result-kicker">THE TOWER · FLOOR {floor}</div>
      <div className="pit-result-title">{won ? "FLOOR CLEARED" : winner === "draw" ? "STALEMATE" : "REPELLED"}</div>
      <div className="pit-result-sub">{won ? (floor >= PIT_MAX ? "The top of the tower. Nothing above you." : `Floor ${floor + 1} is open.`) : "The floor holds. Change two things and try again."}</div>
      <div className="pit-result-actions">
        {won && floor < PIT_MAX && (
          <button className="primary" onClick={() => go(floor + 1)}>
            Climb to floor {floor + 1}
          </button>
        )}
        {!won && (
          <button className="primary" onClick={() => go(floor)}>
            Retry floor {floor}
          </button>
        )}
        <a className="ghost" href="/campaign?at=tower">
          ← Back to the tower door
        </a>
      </div>
    </div>
  );
}
