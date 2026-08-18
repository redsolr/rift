"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PerfPanel from "@/components/perf/PerfPanel";
import { usePerf } from "@/components/perf/store";
import CampaignScene from "./CampaignScene";
import Dialogue from "./Dialogue";
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
  const leaving = useCampaign((s) => s.leaving);
  const talk = useCampaign((s) => s.talk);
  const perfOpen = usePerf((s) => s.open);
  const togglePerf = usePerf((s) => s.toggle);
  const router = useRouter();
  const zone = ZONES[zoneId];
  // the first zone's load is measured from the page's first render (lazy initialiser = runs once, before the Canvas mounts)
  useState(() => usePerf.getState().markLoad(`zone · ${zone.name}`));

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
        <button className={`campaign-perf ${perfOpen ? "on" : ""}`} onClick={togglePerf} title="System profiler: fps, frame time, draw calls, triangles, heap + per-zone load/fps table (F3)">
          ⌗ Perf
        </button>
        <Link className="campaign-back" href="/">
          ← Skirmish
        </Link>
      </div>
      {!dialogue && !transition && (
        <div className="campaign-controls">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> walk · click the floor to walk there · <kbd>E</kbd> talk · walk into a gold ring to leave
        </div>
      )}
      {nearNpc && !dialogue && !transition && (
        <button className="campaign-prompt" onClick={talk}>
          <kbd>E</kbd>Talk to {SPEAKERS[nearNpc].name}
        </button>
      )}
      <Dialogue />
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
