"use client";
import { useEffect, useRef } from "react";
import { useGame } from "@/store/game";
import { TERRAIN } from "@/sim/types";

const PX = 7;

/** Top-right minimap: terrain + unit dots (blue = you, red = enemy, gold = selected). Click to move the camera there. */
export default function Minimap() {
  const map = useGame((s) => s.config.map);
  const units = useGame((s) => s.config.units);
  const view = useGame((s) => s.view);
  const selected = useGame((s) => s.selected);
  const focusCam = useGame((s) => s.focusCam);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        ctx.fillStyle = TERRAIN[map.tiles[y * map.width + x]].color;
        ctx.fillRect(x * PX, y * PX, PX - 1, PX - 1);
      }
    for (const u of units) {
      const v = view.units[u.id];
      if (!v || !v.alive) continue;
      ctx.beginPath();
      ctx.arc(v.x * PX + PX / 2, v.y * PX + PX / 2, PX * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = u.team === "red" ? "#ff5a4a" : "#5aa0ff";
      ctx.fill();
      if (u.id === selected) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#ffd54f";
        ctx.stroke();
      }
    }
  }, [map, units, view, selected]);

  return (
    <canvas
      ref={ref}
      className="minimap"
      width={map.width * PX}
      height={map.height * PX}
      title="Minimap — click to look there"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * map.width;
        const y = ((e.clientY - r.top) / r.height) * map.height;
        focusCam({ x: Math.floor(x), y: Math.floor(y) }, "keep");
      }}
    />
  );
}
