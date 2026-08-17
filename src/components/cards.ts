"use client";
import { Archetype, Team, UnitDef } from "@/sim/types";
import { ARCHETYPE_LABEL } from "@/sim/presets";
import { portraitCanvas, portraitFocus, portraitsKey } from "./portraits";

/**
 * Procedural FUT-style unit cards, drawn to a canvas. Used as a billboard texture on the
 * board and blitted into small canvases in HTML panels. Pure presentation — nothing here feeds the sim.
 */

export const CARD_W = 256;
export const CARD_H = 352;

export const POSITION: Record<Archetype, string> = { knight: "KNT", fighter: "FTR", archer: "ARC", mage: "MAG", healer: "HLR" };
export const WEAPON: Record<Archetype, string> = { knight: "Iron Lance", fighter: "Iron Axe", archer: "Iron Bow", mage: "Fire", healer: "Heal" };
export const GLYPH: Record<Archetype, string> = { knight: "♜", fighter: "⚔", archer: "➶", mage: "✦", healer: "✚" };

const FRAME: Record<Team, { a: string; b: string; c: string; ink: string }> = {
  red: { a: "#4a1210", b: "#b8392e", c: "#ff8a6a", ink: "#fff3ea" },
  blue: { a: "#0f1f4a", b: "#2f5fc0", c: "#7fb0ff", ink: "#eef4ff" },
};

/**
 * Card tier — FUT/Hearthstone-style rarity read, derived from the overall rating (data, not archetype).
 * Deliberately scarce: only **gold ≥ 90** is special (Knight + Fighter on default stats = 2 per side); everyone
 * else is a plain card — no stars, no foil, quiet steel trim — so gold actually reads as gold.
 * Gold drives the metallic trim gradient, the ★★★ row, the baked holo band, the animated foil sweep and the ground aura.
 */
export type Tier = "gold" | "base";
export function tierOf(u: UnitDef): Tier {
  return overall(u) >= 90 ? "gold" : "base";
}
export const TIER: Record<Tier, { trim: string; hi: string; lo: string; stars: number; foil: number; label: string }> = {
  gold: { trim: "#f2c96b", hi: "#fff3c2", lo: "#b8862a", stars: 3, foil: 1, label: "GOLD" },
  base: { trim: "#aab2bf", hi: "#d9dee6", lo: "#6d7480", stars: 0, foil: 0, label: "STANDARD" },
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
  return `${u.team}|${u.archetype}|${u.name}|${s.hp}|${s.atk}|${s.def}|${s.spd}|${s.mov}|${s.rangeMin}|${s.rangeMax}|p${portraitsKey()}`;
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
  const tier = TIER[tierOf(u)];
  ctx.lineWidth = 5;
  const tg = ctx.createLinearGradient(0, 0, W, H);
  tg.addColorStop(0, tier.hi);
  tg.addColorStop(0.35, tier.trim);
  tg.addColorStop(0.55, tier.lo);
  tg.addColorStop(0.75, tier.trim);
  tg.addColorStop(1, tier.hi);
  ctx.strokeStyle = tg;
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
    ctx.fillStyle = i % 3 === 0 ? tier.trim : "#ffffff";
    ctx.fillRect(px, py, 3 + (i % 3), 3 + ((i * 7) % 3));
  }
  ctx.globalAlpha = 1;
  const art = portraitCanvas(u.team, u.archetype);
  if (art) {
    // character bust: cover-fit into the portrait window (right of the rating column, above the name band),
    // cropped around the face, faded out at the bottom so it melts into the frame instead of ending in a hard line
    const win = { x: 44, y: 16, w: W - 58, h: H * 0.6 - 30 };
    const focus = portraitFocus(u.team, u.archetype);
    const k = Math.max(win.w / art.width, win.h / art.height) * 1.08;
    const dw = art.width * k;
    const dh = art.height * k;
    const dx = Math.min(win.x, Math.max(win.x + win.w - dw, win.x + win.w * 0.5 - focus.x * dw));
    const dy = Math.min(win.y, Math.max(win.y + win.h - dh, win.y + win.h * 0.38 - focus.y * dh));
    const pc = document.createElement("canvas");
    pc.width = W;
    pc.height = H;
    const px = pc.getContext("2d")!;
    px.drawImage(art, dx, dy, dw, dh);
    px.globalCompositeOperation = "destination-in";
    const fade = px.createLinearGradient(0, win.y + win.h - 46, 0, win.y + win.h + 6);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    px.fillStyle = fade;
    px.fillRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(pc, 0, 0);
    ctx.restore();
    // ink wash behind the rating column so the numbers stay readable over the art
    const col = ctx.createLinearGradient(0, 0, 118, 0);
    col.addColorStop(0, f.a + "e6");
    col.addColorStop(0.55, f.a + "88");
    col.addColorStop(1, f.a + "00");
    ctx.fillStyle = col;
    ctx.fillRect(6, 6, 118, H * 0.6 - 30);
  } else {
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
  }
  ctx.restore();

  // baked holo band (foil tiers): a diagonal prismatic stripe under everything, the animated sweep rides on top
  if (tier.foil > 0) {
    ctx.save();
    shieldPath(ctx, 6, 6, W - 12, H - 12, 22);
    ctx.clip();
    const hg = ctx.createLinearGradient(0, H, W, 0);
    hg.addColorStop(0.3, "rgba(255,255,255,0)");
    hg.addColorStop(0.42, `rgba(255,120,220,${0.14 * tier.foil})`);
    hg.addColorStop(0.5, `rgba(255,255,255,${0.22 * tier.foil})`);
    hg.addColorStop(0.58, `rgba(120,230,255,${0.14 * tier.foil})`);
    hg.addColorStop(0.7, "rgba(255,255,255,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // rating + position (top-left column)
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = f.ink;
  ctx.font = "800 62px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(String(overall(u)), 52, 92);
  ctx.font = "800 24px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = tier.trim;
  ctx.fillText(POSITION[u.archetype], 52, 122);
  // divider
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(30, 132, 44, 2);
  // small archetype label under position
  ctx.font = "700 13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = f.ink;
  ctx.fillText(ARCHETYPE_LABEL[u.archetype].toUpperCase(), 52, 152);

  // tier stars (FUT rarity read) above the name band
  const bandY = H * 0.6;
  ctx.font = "700 15px 'Segoe UI Symbol', 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = tier.trim;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 4;
  const starW = 16;
  for (let i = 0; i < tier.stars; i++) ctx.fillText("★", W / 2 + (i - (tier.stars - 1) / 2) * starW, bandY - 34);
  ctx.shadowBlur = 0;

  // name band
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(22, bandY - 24, W - 44, 40);
  ctx.fillStyle = tier.trim;
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
    ctx.fillStyle = tier.trim;
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
  ctx.fillStyle = tier.trim;
  ctx.fill();
  ctx.fillStyle = f.a;
  ctx.font = "800 13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(u.team === "red" ? "R" : "B", W / 2, H - 37);

  cache.set(key, c);
  return c;
}

/**
 * Animated foil sweep for the 2D thumbs (battle bar / panels): a diagonal light band that travels across the
 * card, clipped to the card's own pixels. `t` in seconds. Mirrors the shader the board uses. Cheap — one gradient.
 */
export function drawFoilSweep(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, foil: number, boost = 0) {
  const k = ((t * 0.28) % 1.6) - 0.3; // travel −0.3 → 1.3 then restart (a pause between sweeps)
  const x0 = -w * 0.6 + k * (w * 2.2);
  const g = ctx.createLinearGradient(x0, h, x0 + w * 0.7, 0);
  const a = 0.35 * foil + boost;
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.35, `rgba(255,150,230,${a * 0.5})`);
  g.addColorStop(0.5, `rgba(255,255,255,${a})`);
  g.addColorStop(0.65, `rgba(140,235,255,${a * 0.5})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
