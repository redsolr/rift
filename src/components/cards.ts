"use client";
import { Archetype, Team, UnitDef } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";

/**
 * Procedural FUT-style unit cards, drawn to a canvas. Used as a billboard texture on the
 * board and as an <img> in HTML panels. Pure presentation — nothing here feeds the sim.
 */

export const CARD_W = 256;
export const CARD_H = 352;

export const POSITION: Record<Archetype, string> = { knight: "KNT", fighter: "FTR", archer: "ARC", mage: "MAG", healer: "HLR" };
export const WEAPON: Record<Archetype, string> = { knight: "Iron Lance", fighter: "Iron Axe", archer: "Iron Bow", mage: "Fire", healer: "Heal" };
export const GLYPH: Record<Archetype, string> = { knight: "♜", fighter: "⚔", archer: "➶", mage: "✦", healer: "✚" };

const FRAME: Record<Team, { a: string; b: string; c: string; ink: string; trim: string }> = {
  red: { a: "#4a1210", b: "#b8392e", c: "#ff8a6a", ink: "#fff3ea", trim: "#f2c96b" },
  blue: { a: "#0f1f4a", b: "#2f5fc0", c: "#7fb0ff", ink: "#eef4ff", trim: "#f2c96b" },
};

/** Overall rating, calibrated so the five archetypes land ~84–92. */
export function overall(u: UnitDef): number {
  const s = u.stats;
  const score = s.hp * 1.2 + s.atk * 3.5 + s.def * 3 + s.spd * 2 + s.mov * 3 + s.rangeMax * 3;
  return Math.max(40, Math.min(99, Math.round(58 + score * 0.32)));
}

const cache = new Map<string, HTMLCanvasElement>();

export function cardKey(u: UnitDef): string {
  const s = u.stats;
  return `${u.team}|${u.archetype}|${u.name}|${s.hp}|${s.atk}|${s.def}|${s.spd}|${s.mov}|${s.rangeMin}|${s.rangeMax}`;
}

function shieldPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  // FUT silhouette: rounded top, straight sides, tapered bottom corners
  const taper = w * 0.14;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - taper * 1.6);
  ctx.quadraticCurveTo(x + w, y + h - taper * 0.6, x + w - taper, y + h - taper * 0.3);
  ctx.lineTo(x + w / 2 + r, y + h);
  ctx.quadraticCurveTo(x + w / 2, y + h + 2, x + w / 2 - r, y + h);
  ctx.lineTo(x + taper, y + h - taper * 0.3);
  ctx.quadraticCurveTo(x, y + h - taper * 0.6, x, y + h - taper * 1.6);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function renderCard(u: UnitDef): HTMLCanvasElement {
  const key = cardKey(u);
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext("2d")!;
  const f = FRAME[u.team];
  const W = CARD_W,
    H = CARD_H;

  // frame
  shieldPath(ctx, 6, 6, W - 12, H - 12, 22);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, f.a);
  g.addColorStop(0.55, f.b);
  g.addColorStop(1, f.a);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = f.trim;
  ctx.stroke();
  // inner bevel
  ctx.save();
  shieldPath(ctx, 14, 14, W - 28, H - 28, 18);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.stroke();
  ctx.restore();

  // portrait glow + glyph
  ctx.save();
  shieldPath(ctx, 6, 6, W - 12, H - 12, 22);
  ctx.clip();
  const rg = ctx.createRadialGradient(W * 0.6, H * 0.34, 10, W * 0.6, H * 0.34, W * 0.55);
  rg.addColorStop(0, "rgba(255,255,255,0.35)");
  rg.addColorStop(0.5, f.c + "66");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  // confetti-ish sparks
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 26; i++) {
    const px = ((i * 97) % 220) + 18;
    const py = ((i * 61) % 170) + 20;
    ctx.fillStyle = i % 3 === 0 ? f.trim : "#ffffff";
    ctx.fillRect(px, py, 3 + (i % 3), 3 + ((i * 7) % 3));
  }
  ctx.globalAlpha = 1;
  ctx.font = "bold 132px 'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols 2', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = f.ink;
  ctx.fillText(GLYPH[u.archetype], W * 0.6, H * 0.36);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();

  // rating + position (top-left column)
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = f.ink;
  ctx.font = "800 62px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(String(overall(u)), 52, 92);
  ctx.font = "800 24px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = f.trim;
  ctx.fillText(POSITION[u.archetype], 52, 122);
  // divider
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(30, 132, 44, 2);
  // small archetype label under position
  ctx.font = "700 13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = f.ink;
  ctx.fillText(ARCHETYPE_LABEL[u.archetype].toUpperCase(), 52, 152);

  // name band
  const bandY = H * 0.6;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(22, bandY - 24, W - 44, 40);
  ctx.fillStyle = f.trim;
  ctx.fillRect(22, bandY - 25, W - 44, 1.5);
  ctx.fillRect(22, bandY + 15, W - 44, 1.5);
  ctx.font = "800 26px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = f.ink;
  ctx.textAlign = "center";
  let name = u.name.toUpperCase();
  while (ctx.measureText(name).width > W - 60 && name.length > 3) name = name.slice(0, -2) + "…";
  ctx.fillText(name, W / 2, bandY + 5);

  // six stats
  const s = u.stats;
  const cols: [string, string][] = [
    ["HP", String(s.hp)],
    ["ATK", String(s.atk)],
    ["DEF", String(s.def)],
    ["SPD", String(s.spd)],
    ["MOV", String(s.mov)],
    ["RNG", s.rangeMin === s.rangeMax ? String(s.rangeMax) : `${s.rangeMin}-${s.rangeMax}`],
  ];
  const left = 26,
    right = W - 26;
  const cw = (right - left) / 6;
  ctx.font = "700 13px 'Segoe UI', system-ui, sans-serif";
  cols.forEach(([lab], i) => {
    ctx.fillStyle = f.trim;
    ctx.fillText(lab, left + cw * (i + 0.5), bandY + 48);
  });
  ctx.font = "800 22px 'Segoe UI', system-ui, sans-serif";
  cols.forEach(([, val], i) => {
    ctx.fillStyle = f.ink;
    ctx.fillText(val, left + cw * (i + 0.5), bandY + 76);
  });
  // footer badge (team crest)
  ctx.beginPath();
  ctx.arc(W / 2, H - 42, 11, 0, Math.PI * 2);
  ctx.fillStyle = f.trim;
  ctx.fill();
  ctx.fillStyle = f.a;
  ctx.font = "800 13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(u.team === "red" ? "R" : "B", W / 2, H - 37);

  cache.set(key, c);
  return c;
}

export function cardDataUrl(u: UnitDef): string {
  return renderCard(u).toDataURL();
}
