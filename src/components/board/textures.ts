"use client";
import * as THREE from "three";
import { Terrain } from "@/sim/types";

/**
 * Procedural, tileable canvas textures for the "scene" board view (one per terrain, cached).
 * Every tile shares the same material; Tiles.tsx rotates each tile by a hashed quarter-turn
 * so the repetition breaks up. Deterministic: seeded LCG per texture, never Math.random.
 */
const SIZE = 256;
const cache = new Map<string, THREE.Texture>();
const matCache = new Map<Terrain, THREE.MeshStandardMaterial>();

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas() {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  return c;
}

function finish(key: string, c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Fine speckle so flat fills read as material rather than vector. */
function grain(ctx: CanvasRenderingContext2D, rnd: () => number, n: number, alpha: number, light = true) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** Cream plaza paving (FE town square): irregular flagstones on a sandy grout. */
export function cobbleTexture(): THREE.Texture {
  const k = "cobble";
  if (cache.has(k)) return cache.get(k)!;
  const c = canvas();
  const ctx = c.getContext("2d")!;
  const rnd = lcg(11);
  ctx.fillStyle = "#b8a98f"; // grout
  ctx.fillRect(0, 0, SIZE, SIZE);
  const cols = 4;
  const cell = SIZE / cols;
  for (let gy = 0; gy < cols; gy++)
    for (let gx = 0; gx < cols; gx++) {
      const jitter = 3;
      const x0 = gx * cell + 2 + (rnd() - 0.5) * jitter;
      const y0 = gy * cell + 2 + (rnd() - 0.5) * jitter;
      const w = cell - 4 - rnd() * 4;
      const h = cell - 4 - rnd() * 4;
      const l = 78 + rnd() * 10;
      ctx.fillStyle = `hsl(${36 + rnd() * 8}, ${22 + rnd() * 10}%, ${l}%)`;
      ctx.beginPath();
      const r = 5;
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      ctx.arcTo(x0, y0 + h, x0, y0, r);
      ctx.arcTo(x0, y0, x0 + w, y0, r);
      ctx.closePath();
      ctx.fill();
      // bevel: light top-left, dark bottom-right
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + h - 2);
      ctx.lineTo(x0 + 2, y0 + 2);
      ctx.lineTo(x0 + w - 2, y0 + 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(60,40,20,0.25)";
      ctx.beginPath();
      ctx.moveTo(x0 + w - 2, y0 + 2);
      ctx.lineTo(x0 + w - 2, y0 + h - 2);
      ctx.lineTo(x0 + 2, y0 + h - 2);
      ctx.stroke();
    }
  grain(ctx, rnd, 900, 0.18, false);
  grain(ctx, rnd, 600, 0.22, true);
  return finish(k, c);
}

/** Forest floor: dark green mottle with leaf-litter flecks. */
export function grassTexture(): THREE.Texture {
  const k = "grass";
  if (cache.has(k)) return cache.get(k)!;
  const c = canvas();
  const ctx = c.getContext("2d")!;
  const rnd = lcg(23);
  ctx.fillStyle = "#3d6a3a";
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `hsla(${105 + rnd() * 30}, ${35 + rnd() * 20}%, ${24 + rnd() * 16}%, 0.55)`;
    ctx.beginPath();
    ctx.ellipse(rnd() * SIZE, rnd() * SIZE, 6 + rnd() * 16, 4 + rnd() * 10, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, rnd, 1200, 0.15, true);
  grain(ctx, rnd, 600, 0.3, false);
  return finish(k, c);
}

/** Hill: dry earth + sparse grass tufts. */
export function earthTexture(): THREE.Texture {
  const k = "earth";
  if (cache.has(k)) return cache.get(k)!;
  const c = canvas();
  const ctx = c.getContext("2d")!;
  const rnd = lcg(37);
  ctx.fillStyle = "#9c8a66";
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `hsla(${34 + rnd() * 20}, ${25 + rnd() * 15}%, ${40 + rnd() * 25}%, 0.5)`;
    ctx.beginPath();
    ctx.ellipse(rnd() * SIZE, rnd() * SIZE, 8 + rnd() * 20, 5 + rnd() * 12, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `hsla(${95 + rnd() * 25}, 40%, ${30 + rnd() * 15}%, 0.7)`;
    ctx.lineWidth = 1.2;
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 6, y - 4 - rnd() * 6);
    ctx.stroke();
  }
  grain(ctx, rnd, 900, 0.2, false);
  return finish(k, c);
}

/** Water: deep blue with light ripple strokes (Scenery scrolls the offset). */
export function waterTexture(): THREE.Texture {
  const k = "water";
  if (cache.has(k)) return cache.get(k)!;
  const c = canvas();
  const ctx = c.getContext("2d")!;
  const rnd = lcg(53);
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  g.addColorStop(0, "#2f5f96");
  g.addColorStop(1, "#3a74b3");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(190,225,255,${0.15 + rnd() * 0.3})`;
    ctx.lineWidth = 1 + rnd() * 1.5;
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const w = 12 + rnd() * 30;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y - 3 - rnd() * 4, x + w, y);
    ctx.stroke();
  }
  return finish(k, c);
}

/** Wall: grey ashlar blocks with mortar. */
export function stoneTexture(): THREE.Texture {
  const k = "stone";
  if (cache.has(k)) return cache.get(k)!;
  const c = canvas();
  const ctx = c.getContext("2d")!;
  const rnd = lcg(71);
  ctx.fillStyle = "#3a3a42";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rows = 6;
  const rh = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? rh : 0;
    for (let x = -rh * 2; x < SIZE + rh; x += rh * 2) {
      const l = 42 + rnd() * 12;
      ctx.fillStyle = `hsl(${225 + rnd() * 10}, 6%, ${l}%)`;
      ctx.fillRect(x + off + 2, r * rh + 2, rh * 2 - 4, rh - 4);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x + off + 2, r * rh + 2, rh * 2 - 4, 2);
    }
  }
  grain(ctx, rnd, 1000, 0.18, false);
  grain(ctx, rnd, 400, 0.15, true);
  return finish(k, c);
}

/** Objective: paving with a gold inlaid ring. Shrine: paving with a violet-tinted slab. */
function inlaidTexture(key: string, ring: string, wash: string): THREE.Texture {
  if (cache.has(key)) return cache.get(key)!;
  const base = cobbleTexture().image as HTMLCanvasElement;
  const c = canvas();
  const ctx = c.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  return finish(key, c);
}

/** One shared MeshStandardMaterial per terrain (scene view). Colour-only when there is no DOM (SSR). */
export function sceneMaterial(t: Terrain): THREE.MeshStandardMaterial {
  const hit = matCache.get(t);
  if (hit) return hit;
  const dom = typeof document !== "undefined";
  let m: THREE.MeshStandardMaterial;
  switch (t) {
    case "ground":
      m = new THREE.MeshStandardMaterial({ map: dom ? cobbleTexture() : null, color: "#f1e9d8", roughness: 0.95 });
      break;
    case "forest":
      m = new THREE.MeshStandardMaterial({ map: dom ? grassTexture() : null, color: "#a8c79a", roughness: 1 });
      break;
    case "hill":
      m = new THREE.MeshStandardMaterial({ map: dom ? earthTexture() : null, color: "#e6d9b8", roughness: 1 });
      break;
    case "water":
      m = new THREE.MeshStandardMaterial({ map: dom ? waterTexture() : null, color: "#9fc4ee", roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 });
      break;
    case "wall":
      m = new THREE.MeshStandardMaterial({ map: dom ? stoneTexture() : null, color: "#c9c9d2", roughness: 0.9 });
      break;
    case "objective":
      m = new THREE.MeshStandardMaterial({ map: dom ? inlaidTexture("objective", "#d9b544", "rgba(217,181,68,0.18)") : null, color: "#f1e9d8", roughness: 0.9 });
      break;
    case "shrine":
      m = new THREE.MeshStandardMaterial({ map: dom ? inlaidTexture("shrine", "#8f6fc7", "rgba(120,90,180,0.28)") : null, color: "#e9e0f2", roughness: 0.9 });
      break;
  }
  matCache.set(t, m);
  return m;
}

/** Deterministic 0..1 per (x, y, salt) — prop placement, tile rotation. Never Math.random on the board. */
export function tileHash(x: number, y: number, salt = 0): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt + 1, 1013904223)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
