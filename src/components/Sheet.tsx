"use client";
import { useEffect, useRef, useState } from "react";

type Snap = "peek" | "half" | "full";
const PEEK_PX = 56;

/**
 * Mobile bottom sheet. Drag the handle (or tap it) to cycle peek → half → full.
 * Snap heights live in CSS; only an active drag sets an inline pixel height.
 */
export default function Sheet({ children, title }: { children: React.ReactNode; title: string }) {
  const [snap, setSnap] = useState<Snap>("peek");
  const [dragH, setDragH] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const stageH = () => ref.current?.parentElement?.clientHeight ?? (typeof window === "undefined" ? 800 : window.innerHeight);
  const currentH = () => ref.current?.getBoundingClientRect().height ?? PEEK_PX;

  const onDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, h: currentH() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const h = Math.max(PEEK_PX, Math.min(stageH() * 0.85, start.current.h + (start.current.y - e.clientY)));
    setDragH(h);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const moved = Math.abs(start.current.y - e.clientY);
    const h = currentH();
    start.current = null;
    setDragH(null);
    if (moved < 6) {
      setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
      return;
    }
    const total = stageH();
    const frac = (h - PEEK_PX) / (total - PEEK_PX);
    setSnap(frac < 0.23 ? "peek" : frac < 0.68 ? "half" : "full");
  };

  useEffect(() => {
    const onResize = () => setDragH(null);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div ref={ref} className={`sheet ${snap} ${dragH !== null ? "dragging" : ""}`} style={dragH !== null ? { height: dragH } : undefined}>
      <div className="sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span className="sheet-grip" />
        <span className="sheet-title">{title}</span>
        <span className="sheet-chev">{snap === "full" ? "▾" : "▴"}</span>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
