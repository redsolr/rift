"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PerfPanel from "@/components/perf/PerfPanel";
import { usePerf } from "@/components/perf/store";
import CampaignScene from "./CampaignScene";
import Dialogue from "./Dialogue";
import TowerPanel from "./TowerPanel";
import { CharacterScreenHost } from "@/party/CharacterScreen";
import { useParty } from "@/party/store";
import Minimap from "./Minimap";
import { SPEAKERS } from "./script";
import { useCampaign } from "./store";
import { ZONES } from "./world";
import "./campaign.css";

/**
 * Campaign page: the world scene, the walk HUD (zone name), the Talk prompt, the dialogue overlay, the zone-travel
 * fade + Persona-style AREA TITLE card, and the system profiler (F3 / ⌗ Perf).
 */
export default function CampaignPage() {
  const zoneId = useCampaign((s) => s.zone);
  const nearNpc = useCampaign((s) => s.nearNpc);
  const dialogue = useCampaign((s) => s.dialogue);
  const transition = useCampaign((s) => s.transition);
  const tower = useCampaign((s) => s.tower);
  const leaving = useCampaign((s) => s.leaving);
  const talk = useCampaign((s) => s.talk);
  const perfOpen = usePerf((s) => s.open);
  const togglePerf = usePerf((s) => s.toggle);
  const charOpen = useParty((s) => s.open);
  const toggleChar = useParty((s) => s.toggleScreen);
  const router = useRouter();
  const zone = ZONES[zoneId];
  // one-time setup BEFORE the Canvas mounts (lazy initialiser): a deep link (`?at=tower` — coming back from a Tower
  // floor) starts you in the village at that spot; then the first zone's load mark
  useState(() => {
    const at = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("at");
    if (at === "tower") {
      const t = ZONES.village.triggers?.find((x) => x.id === "tower");
      if (t) useCampaign.setState({ zone: "village", arrival: t.spawn, arrivalSeq: useCampaign.getState().arrivalSeq + 1 });
    }
    usePerf.getState().markLoad(`zone · ${ZONES[useCampaign.getState().zone].name}`);
    return 0;
  });

  useEffect(() => {
    (window as unknown as { __campaign?: typeof useCampaign }).__campaign = useCampaign;
  }, []);
  // "to-battle" effect: after the last line closes, go to the skirmish
  useEffect(() => {
    if (leaving && !dialogue) router.push("/");
  }, [leaving, dialogue, router]);

  const titleZone = transition ? ZONES[transition.to] : zone;
  const dark = transition?.phase === "out" || transition?.phase === "title";
  return (
    <div className="campaign">
      <CampaignScene />
      <div className="campaign-hud">
        <span className="campaign-brand">TACTICIAN</span>
        <span className="campaign-chapter">
          Prologue · {zone.name} · {zone.subtitle}
        </span>
        <button className={`campaign-perf ${charOpen ? "on" : ""}`} onClick={toggleChar} title="Character screen: heroes, gear, bag (C / I)">
          ⚔ Character
        </button>
        <button className={`campaign-perf ${perfOpen ? "on" : ""}`} onClick={togglePerf} title="System profiler: fps, frame time, draw calls, triangles, heap + per-zone load/fps table (F3)">
          ⌗ Perf
        </button>
        <Link className="campaign-back" href="/">
          ← Skirmish
        </Link>
      </div>
      {!dialogue && !transition && !tower && (
        <div className="campaign-controls">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> walk · <kbd>Shift</kbd> run · click the floor to walk there · wheel = zoom · <kbd>E</kbd> talk · <kbd>C</kbd> character · walk into a gold ring to leave
        </div>
      )}
      {nearNpc && !dialogue && !transition && (
        <button className="campaign-prompt" onClick={talk}>
          <kbd>E</kbd>Talk to {SPEAKERS[nearNpc].name}
        </button>
      )}
      {!dialogue && <Minimap />}
      <Dialogue />
      <TowerPanel />
      <CharacterScreenHost
        canOpen={() => {
          const s = useCampaign.getState();
          return !s.dialogue && !s.tower && !s.transition;
        }}
      />
      {/* zone travel: black fade + area title card (Persona 5 area name read) */}
      <div className={`campaign-fade ${dark ? "dark" : ""} ${transition ? "" : "off"}`} aria-hidden />
      {transition?.phase === "title" && (
        <div className="campaign-title" role="status">
          <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
            <filter id="ct-tear" x="-5%" y="-20%" width="110%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="3" seed="7" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>
          <div className="campaign-title-band">
            <span className="campaign-title-name">{titleZone.name}</span>
          </div>
          <span className="campaign-title-sub">{titleZone.subtitle}</span>
        </div>
      )}
      <PerfPanel />
    </div>
  );
}
