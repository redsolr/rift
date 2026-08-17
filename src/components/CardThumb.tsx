"use client";
import { useEffect, useRef } from "react";
import { UnitDef } from "@/sim/types";
import { CARD_H, CARD_W, renderCard } from "./cards";

/** Blits the cached procedural card into a small canvas (same art as the board). */
export default function CardThumb({ u, className = "card-thumb", scale = 0.5 }: { u: UnitDef; className?: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(renderCard(u), 0, 0, c.width, c.height);
  }, [u]);
  return <canvas ref={ref} className={className} width={CARD_W * scale} height={CARD_H * scale} aria-hidden />;
}
