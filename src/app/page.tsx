"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Hud from "@/components/Hud";
import Panel from "@/components/Panel";
import Sheet from "@/components/Sheet";
import { useGame } from "@/store/game";

const Board = dynamic(() => import("@/components/Board"), { ssr: false });

export default function Home() {
  const loadShareCode = useGame((s) => s.loadShareCode);
  const [mobile, setMobile] = useState(false);
  const selectedName = useGame((s) => s.config.units.find((u) => u.id === s.selected)?.name ?? null);
  const sheetHint = useGame((s) => {
    const b = s.battle;
    const caughtUp = s.cursor >= s.events.length;
    if (b && s.view.ended) return s.view.winner === "draw" ? "Draw — Rematch?" : `${s.view.winner!.toUpperCase()} wins — Rematch?`;
    if (s.mode === "manual") return b && caughtUp && b.state.activeTeam === s.playerTeam ? "Your move — tap a red unit" : b ? "Enemy turn…" : "Start a battle";
    if (s.mode === "manager") return b && caughtUp && !s.playing ? "Command phase — set orders, then Execute" : b ? "Executing…" : "Set orders, then Start";
    return "Tools · simulate · squads";
  });
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    const m = location.hash.match(/#c=([A-Za-z0-9_-]+)/);
    if (m) loadShareCode(m[1]);
    // dev/e2e hook — the store is the game's public API
    (window as unknown as { __tactician?: typeof useGame }).__tactician = useGame;
  }, [loadShareCode]);
  return (
    <main className="app">
      <Hud />
      <div className={mobile ? "stage mobile" : "stage"}>
        <Board />
        {mobile ? (
          <Sheet title={selectedName ?? sheetHint}>
            <Panel />
          </Sheet>
        ) : (
          <Panel />
        )}
      </div>
    </main>
  );
}
