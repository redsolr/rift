"use client";
import { useEffect, useRef } from "react";
import { UnitDef } from "@/sim/types";
import { CARD_H, CARD_W, TIER, drawFoilSweep, renderCard, tierOf } from "./cards";

/**
 * Blits the cached procedural card into a small canvas (same art as the board). Foil tiers (gold/silver)
 * get the animated light sweep — a rAF loop redraws base + sweep; base tier draws once.
 */
export default function CardThumb({ u, className = "card-thumb", scale = 0.5 }: { u: UnitDef; className?: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const base = renderCard(u);
    const foil = TIER[tierOf(u)].foil;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(base, 0, 0, c.width, c.height);
      if (foil > 0) drawFoilSweep(ctx, c.width, c.height, t, foil);
    };
    if (foil === 0) {
      draw(0);
      return;
    }
    let raf = 0;
    const loop = (ms: number) => {
      draw(ms / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [u]);
  return <canvas ref={ref} className={className} width={CARD_W * scale} height={CARD_H * scale} aria-hidden />;
}
