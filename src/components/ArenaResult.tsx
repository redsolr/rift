"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/game";
import { teamOf } from "@/arena/lineup";

/**
 * Multiplayer replay chrome: a top strip naming the match while a ladder leg is being watched, and the end-of-leg
 * card (agrees with the ladder's verdict — the replay is the same deterministic battle the server scored). Offers
 * the other leg and the way back to the lobby. Ordinary skirmishes never show it (`arena` is null).
 */
export default function ArenaResult() {
  const arena = useGame((s) => s.arena);
  const ended = useGame((s) => !!s.battle && s.view.ended);
  const winner = useGame((s) => s.view.winner);
  const watchArena = useGame((s) => s.watchArena);
  const router = useRouter();
  if (!arena) return null;
  const other = arena.leg === 1 ? 2 : 1;
  const near = arena.leg === 1 ? arena.handles.a : arena.handles.b;
  const far = arena.leg === 1 ? arena.handles.b : arena.handles.a;
  const mySide = arena.mySide;
  const myTeam = mySide ? teamOf(mySide, arena.leg) : null;
  const legVerdict = !ended ? null : winner === "draw" ? "draw" : myTeam ? (winner === myTeam ? "won" : "lost") : winner;
  const matchVerdict = arena.winner === "draw" ? "DRAW" : mySide ? (arena.winner === mySide ? "VICTORY" : "DEFEAT") : `${arena.winner === "a" ? arena.handles.a : arena.handles.b} WINS`;
  const goLeg = (leg: 1 | 2) => {
    history.replaceState(null, "", `/skirmish?match=${arena.matchId}&leg=${leg}`);
    watchArena({ ...arena, leg });
  };
  return (
    <>
      <div className="arena-strip" role="status">
        <span className="arena-kicker">LADDER MATCH · LEG {arena.leg}/2</span>
        <span className="arena-vs">
          <b className="blue">{near}</b> <span className="muted">(blue, moves first)</span> vs <b className="red">{far}</b> <span className="muted">(red)</span>
        </span>
        <button className="ghost" onClick={() => goLeg(other)} title="Watch the other leg (roles swapped, same seed)">
          Leg {other} ▶
        </button>
        <button className="ghost" onClick={() => router.push("/play")} title="Back to the lobby">
          ◀ Multiplayer
        </button>
      </div>
      {ended && (
        <div className={`pit-result arena-result ${legVerdict === "won" ? "won" : legVerdict === "lost" ? "lost" : ""}`} role="status">
          <div className="pit-result-kicker">LEG {arena.leg} OF 2</div>
          <div className="pit-result-title">{legVerdict === "won" ? "LEG WON" : legVerdict === "lost" ? "LEG LOST" : legVerdict === "draw" ? "STALEMATE" : `${String(legVerdict).toUpperCase()} WINS`}</div>
          <div className="pit-result-sub">Match result: {matchVerdict}</div>
          <div className="pit-result-actions">
            <button className="primary" onClick={() => goLeg(other)}>
              Watch leg {other}
            </button>
            <Link className="ghost" href="/play">
              Back to Multiplayer
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
