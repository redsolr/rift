"use client";
import { useEffect, useMemo, useRef } from "react";
import { live } from "./live";
import { useCampaign } from "./store";
import { ZONES } from "./world";
import { AMBIENT_SPOTS } from "./world/village";
import { CHUNK, COLS, KITCHEN_Z, LANE, ROWS, TOWER, chunkData, cottageHalf } from "./world/villageChunks";
import type { Zone } from "./world/types";

/**
 * Campaign minimap, top-right: a top-down plan of the current zone. The STATIC layer (ground, lanes, cottages, fences,
 * trees, stalls, fountain, tower, walls, exits) is drawn ONCE per zone into an offscreen canvas from the same data the
 * 3D scene reads (whole village, all 49 chunks — the map is data, only the meshes stream); the LIVE layer (player
 * arrow, NPC dots, villagers) is repainted in a rAF loop from `live` — no React state per frame. North is up.
 */
const SIZE = 172;
const PAD = 6;

function drawStatic(ctx: CanvasRenderingContext2D, zone: Zone, s: (x: number, z: number) => [number, number], k: number) {
  const b = zone.bounds;
  const [x0, y0] = s(b.minX, b.minZ);
  const [x1, y1] = s(b.maxX, b.maxZ);
  if (zone.id === "village") {
    ctx.fillStyle = "#7fa25c";
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // lanes
    ctx.fillStyle = "#c9c2b4";
    const [lx0] = s(-LANE, 0);
    const [lx1] = s(LANE, 0);
    ctx.fillRect(lx0, y0, lx1 - lx0, y1 - y0);
    const [, lz0] = s(0, -LANE);
    const [, lz1] = s(0, LANE);
    ctx.fillRect(x0, lz0, x1 - x0, lz1 - lz0);
    // plaza
    const [px0, pz0] = s(-CHUNK / 2, -CHUNK / 2);
    ctx.fillRect(px0, pz0, CHUNK * k, CHUNK * k);
    for (let cz = 0; cz < ROWS; cz++)
      for (let cx = 0; cx < COLS; cx++) {
        const d = chunkData(cx, cz);
        ctx.fillStyle = "#3f7a3a";
        for (const t of d.trees) {
          const [tx, tz] = s(t.x, t.z);
          ctx.beginPath();
          ctx.arc(tx, tz, Math.max(1.2, 1.0 * t.s * k), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#8a5a48";
        for (const c of d.cottages) {
          const [hx, hz] = cottageHalf(c);
          const [cx0, cz0] = s(c.x - hx, c.z - hz);
          ctx.fillRect(cx0, cz0, hx * 2 * k, hz * 2 * k);
        }
        ctx.strokeStyle = "#6b4a2a";
        ctx.lineWidth = 1;
        for (const f of d.fences) {
          const [fx0, fz0] = s(f.x0, f.z0);
          const [fx1, fz1] = s(f.x1, f.z1);
          ctx.beginPath();
          ctx.moveTo(fx0, fz0);
          ctx.lineTo(fx1, fz1);
          ctx.stroke();
        }
        for (const st of d.stalls) {
          ctx.fillStyle = ["#c8433a", "#3a6fc8", "#d9a53a", "#4a9a5a"][st.tone % 4];
          const [sx, sz] = s(st.x, st.z);
          ctx.fillRect(sx - 1.1 * k, sz - 0.9 * k, 2.2 * k, 1.8 * k);
        }
      }
    // fountain
    ctx.fillStyle = "#5aa0d8";
    const [fx, fz] = s(0, 0);
    ctx.beginPath();
    ctx.arc(fx, fz, 1.6 * k, 0, Math.PI * 2);
    ctx.fill();
    // tower
    ctx.fillStyle = "#6c6c74";
    const [tx, tz] = s(TOWER.x, TOWER.z);
    ctx.beginPath();
    ctx.arc(tx, tz, TOWER.r * k, 0, Math.PI * 2);
    ctx.fill();
    // garden wall
    ctx.fillStyle = "#8d8d92";
    const [wx0, wz0] = s(-5.2, KITCHEN_Z);
    ctx.fillRect(wx0, wz0, 10.4 * k, 1.6 * k);
  } else {
    // the kitchen: floor + furniture boxes
    ctx.fillStyle = "#6a4a30";
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = "#3d2a1a";
    for (const [ox0, ox1, oz0, oz1] of zone.obstacles) {
      const [ax, az] = s(ox0, oz0);
      ctx.fillRect(ax, az, (ox1 - ox0) * k, (oz1 - oz0) * k);
    }
    ctx.strokeStyle = "#c9c2b4";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  // exits + triggers: gold rings
  ctx.strokeStyle = "#ffd54f";
  ctx.lineWidth = 2;
  for (const m of [...zone.exits.map((e) => e.marker), ...(zone.triggers ?? []).map((t) => t.marker)]) {
    const [mx, mz] = s(m.x, m.z);
    ctx.beginPath();
    ctx.arc(mx, mz, 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export default function Minimap() {
  const zoneId = useCampaign((s) => s.zone);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zone = ZONES[zoneId];
  // scale: fit the zone into the square (uniform), centred
  const geom = useMemo(() => {
    const b = zone.bounds;
    const w = b.maxX - b.minX;
    const h = b.maxZ - b.minZ;
    const k = (SIZE - PAD * 2) / Math.max(w, h);
    const offX = PAD + ((SIZE - PAD * 2) - w * k) / 2;
    const offZ = PAD + ((SIZE - PAD * 2) - h * k) / 2;
    const s = (x: number, z: number): [number, number] => [offX + (x - b.minX) * k, offZ + (z - b.minZ) * k];
    return { k, s };
  }, [zone]);
  const staticLayer = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = SIZE * 2;
    const ctx = c.getContext("2d")!;
    ctx.scale(2, 2);
    drawStatic(ctx, zone, geom.s, geom.k);
    return c;
  }, [zone, geom]);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !staticLayer) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const paint = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(staticLayer, 0, 0);
      ctx.scale(2, 2);
      const { s } = geom;
      // NPCs (gold) + villagers (white)
      for (const n of zone.npcs) {
        const [nx, nz] = s(n.x, n.z);
        ctx.fillStyle = "#ffd54f";
        ctx.beginPath();
        ctx.arc(nx, nz, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (zone.id === "village")
        for (const v of AMBIENT_SPOTS) {
          const [vx, vz] = s(v.x, v.z);
          ctx.fillStyle = "#f4f1ea";
          ctx.beginPath();
          ctx.arc(vx, vz, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      // player: blue arrow pointing along the heading (heading 0 = +z = down on the map)
      const [px, pz] = s(live.x, live.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-live.heading + Math.PI);
      ctx.fillStyle = "#4da3ff";
      ctx.strokeStyle = "#0b1020";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(4, 4);
      ctx.lineTo(0, 2);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [staticLayer, geom, zone]);
  return (
    <div className="campaign-minimap" title={zone.name}>
      <canvas ref={canvasRef} width={SIZE * 2} height={SIZE * 2} style={{ width: SIZE, height: SIZE }} />
      <span className="campaign-minimap-n">N</span>
    </div>
  );
}
