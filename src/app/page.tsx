"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Hud from "@/components/Hud";
import Panel from "@/components/Panel";
import Drawer from "@/components/Drawer";
import MobileControls from "@/components/MobileControls";
import BattleBar, { useDuelPair } from "@/components/BattleBar";
import CharacterPanel from "@/components/CharacterPanel";
import TurnControls from "@/components/TurnControls";
import SkillPanel from "@/components/SkillPanel";
import HudTopRight from "@/components/HudTopRight";
import PerfPanel from "@/components/perf/PerfPanel";
import PitResult from "@/components/PitResult";
import { UiLayoutBar, useUiLayout } from "@/components/ui/UiFrame";
import PhaseBanner from "@/components/PhaseBanner";
import { CharacterScreenHost } from "@/party/CharacterScreen";
import { useGame } from "@/store/game";

const Board = dynamic(() => import("@/components/Board"), { ssr: false });

export default function Home() {
  const loadShareCode = useGame((s) => s.loadShareCode);
  const [mobile, setMobile] = useState(false);
  const [landscape, setLandscape] = useState(true);
  // FE: the character panel yields to the battle bar while an exchange is being forecast
  const dueling = useDuelPair().right !== null;
  const selectedName = useGame((s) => s.config.units.find((u) => u.id === s.selected)?.name ?? null);
  const hint = useGame((s) => {
    const b = s.battle;
    const caughtUp = s.cursor >= s.events.length;
    if (b && s.view.ended) return s.view.winner === "draw" ? "Draw — Rematch?" : `${s.view.winner!.toUpperCase()} wins — Rematch?`;
    if (s.planning) return "Planning — drag your units, then Begin battle";
    if (s.mode === "manual") return b && caughtUp && b.state.activeTeam === s.playerTeam ? `Your move — tap a ${s.playerTeam} unit` : b ? "Enemy turn…" : "Start a battle";
    if (s.mode === "manager") return b && caughtUp && !s.playing ? "Command phase — set orders, then Execute" : b ? "Executing…" : "Set orders, then Start";
    return "Tools · simulate · squads";
  });
  useEffect(() => {
    // phone = coarse pointer and a short side under 900px (covers both orientations)
    const mq = window.matchMedia("(pointer: coarse) and (max-height: 900px) and (max-width: 1100px)");
    const or = window.matchMedia("(orientation: landscape)");
    const apply = () => {
      setMobile(mq.matches);
      setLandscape(or.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    or.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      or.removeEventListener("change", apply);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useGame.getState();
      if (s.drag) s.cancelDrag();
      else if (s.pendingMove) s.cancelPending();
      else s.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    useGame.getState().hydrateMaps();
    useUiLayout.getState().hydrate();
    // The Tower: /?pit=N opens floor N straight into its planning phase
    const pit = Number(new URLSearchParams(location.search).get("pit"));
    if (pit >= 1) useGame.getState().startPit(Math.floor(pit));
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
      <PerfPanel />
      <div className={mobile ? "stage mobile" : "stage"}>
        <div className="board-wrap">
          <Board />
          <HudTopRight />
          <BattleBar />
          {!mobile && <CharacterPanel hidden={dueling} />}
          <TurnControls />
          <SkillPanel />
          <UiLayoutBar />
          <PhaseBanner />
          <PitResult />
          <CharacterScreenHost canOpen={() => !useGame.getState().drag} />
          {mobile && <div className="mobile-hint">{selectedName ?? hint}</div>}
          {mobile && <MobileControls />}
        </div>
        {mobile ? (
          <Drawer title={selectedName ?? "Panel"}>
            <Panel />
          </Drawer>
        ) : (
          <Panel />
        )}
      </div>
      {mobile && !landscape && (
        <div className="rotate-gate" role="dialog" aria-label="Rotate your phone">
          <div className="rotate-icon">⟳</div>
          <div className="rotate-title">Turn your phone sideways</div>
          <div className="rotate-sub">Tactician plays in landscape.</div>
        </div>
      )}
    </main>
  );
}
