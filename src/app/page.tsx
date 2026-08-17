"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import Hud from "@/components/Hud";
import Panel from "@/components/Panel";
import { useGame } from "@/store/game";

const Board = dynamic(() => import("@/components/Board"), { ssr: false });

export default function Home() {
  const loadShareCode = useGame((s) => s.loadShareCode);
  useEffect(() => {
    const m = location.hash.match(/#c=([A-Za-z0-9_-]+)/);
    if (m) loadShareCode(m[1]);
    // dev/e2e hook — the store is the game's public API
    (window as unknown as { __tactician?: typeof useGame }).__tactician = useGame;
  }, [loadShareCode]);
  return (
    <main className="app">
      <Hud />
      <div className="stage">
        <Board />
        <Panel />
      </div>
    </main>
  );
}
