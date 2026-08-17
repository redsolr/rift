"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/store/game";

/**
 * FE3H-style phase banner: a rotating rune circle with a star lattice and big text
 * ("PLAYER PHASE" / "ENEMY PHASE" / "VICTORY" / "DEFEAT" / "DRAW"). Driven by store.banner.seq.
 */
export default function PhaseBanner() {
  const banner = useGame((s) => s.banner);
  const playerTeam = useGame((s) => s.playerTeam);
  const speed = useGame((s) => s.speed);
  const [hiddenSeq, setHiddenSeq] = useState(0);
  useEffect(() => {
    if (banner.seq === 0) return;
    const ms = (banner.kind === "phase" ? 1250 : 1800) / Math.max(0.5, speed);
    const t = setTimeout(() => setHiddenSeq(banner.seq), ms);
    return () => clearTimeout(t);
  }, [banner, speed]);
  if (banner.seq === 0 || hiddenSeq >= banner.seq) return null;
  const shown = banner;
  const mine = shown.team === playerTeam;
  const text = shown.kind === "phase" ? (mine ? "PLAYER PHASE" : "ENEMY PHASE") : shown.kind === "victory" ? "VICTORY" : shown.kind === "defeat" ? "DEFEAT" : "DRAW";
  const cls = shown.kind === "phase" ? (mine ? "player" : "enemy") : shown.kind;
  const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ".split("");
  return (
    <div className={`phase-banner ${cls}`} key={shown.seq} aria-live="polite">
      <div className="pb-circle">
        <svg viewBox="-100 -100 200 200" className="pb-ring">
          <circle r="94" className="pb-r1" />
          <circle r="82" className="pb-r2" />
          <circle r="60" className="pb-r3" />
          <g className="pb-star">
            {Array.from({ length: 7 }, (_, i) => {
              const a = (i * 2 * Math.PI) / 7 - Math.PI / 2;
              const b = (((i + 3) % 7) * 2 * Math.PI) / 7 - Math.PI / 2;
              return <line key={i} x1={Math.cos(a) * 60} y1={Math.sin(a) * 60} x2={Math.cos(b) * 60} y2={Math.sin(b) * 60} />;
            })}
          </g>
          <g className="pb-runes">
            {runes.map((r, i) => {
              const a = (i / runes.length) * 360;
              return (
                <text key={i} x="0" y="-88" transform={`rotate(${a})`} textAnchor="middle">
                  {r}
                </text>
              );
            })}
          </g>
        </svg>
        <div className="pb-text">{text}</div>
      </div>
      <div className="pb-flash" />
    </div>
  );
}
