"use client";
import { useSyncExternalStore } from "react";
import { Archetype } from "@/sim/types";

/**
 * Character portraits — one bust per archetype (placeholder art in `public/portraits/`; the slot for real
 * character artwork). Loaded once, keyed against their white studio background (near-white, low-saturation pixels
 * → transparent, soft ramp at the edge) and downscaled to ≤ 1024px, then served two ways:
 *   - `portraitCanvas(a)`   → the keyed bitmap for the card generator (`cards.ts` draws it into the card window)
 *   - `portraitUrl(a)`      → a data URL for the HTML panels (character panel top-left, battle bar)
 * Loading is async; `usePortraitsVersion()` ticks once everything is in, so cards / textures re-render with the art.
 * Pure presentation — nothing here feeds the sim.
 */

export const PORTRAIT_SRC: Record<Archetype, string> = {
  knight: "/portraits/knight.jpg",
  fighter: "/portraits/fighter.png",
  archer: "/portraits/archer.jpg",
  mage: "/portraits/mage.webp",
  healer: "/portraits/healer.webp",
};

/** where the face sits in each source, as a fraction of the (keyed) bitmap — the card and the panels crop around it */
export const PORTRAIT_FOCUS: Record<Archetype, { x: number; y: number }> = {
  knight: { x: 0.5, y: 0.3 },
  fighter: { x: 0.52, y: 0.4 },
  archer: { x: 0.55, y: 0.3 },
  mage: { x: 0.5, y: 0.35 },
  healer: { x: 0.5, y: 0.35 },
};

const canvases = new Map<Archetype, HTMLCanvasElement>();
const urls = new Map<Archetype, string>();
let version = 0;
const listeners = new Set<() => void>();
let started = false;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/**
 * Studio-white key: near-white, low-saturation pixels CONNECTED TO THE IMAGE BORDER become transparent (a flood
 * fill from the edges), with a soft alpha ramp so jpeg noise at the silhouette fades instead of stepping. Interior
 * pale pixels — skin highlights, white collars, teeth — are never reached by the fill, so they survive.
 */
function keyWhite(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const n = w * h;
  // 0 = opaque paint, 1 = near-white candidate, 2 = keyed (reached from the border)
  const mark = new Uint8Array(n);
  let alreadyTransparent = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (d[o + 3] < 8) {
      alreadyTransparent++;
      mark[i] = 1; // a transparent png background is part of the outside too
      continue;
    }
    const r = d[o],
      g = d[o + 1],
      b = d[o + 2];
    const lo = Math.min(r, g, b);
    const hi = Math.max(r, g, b);
    if (lo >= 214 && hi - lo <= 22) mark[i] = 1;
  }
  if (alreadyTransparent > n * 0.05) return c; // real alpha channel — nothing to key
  const stack: number[] = [];
  const push = (i: number) => {
    if (mark[i] === 1) {
      mark[i] = 2;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i + w < n) push(i + w);
  }
  for (let i = 0; i < n; i++) {
    if (mark[i] !== 2) continue;
    const o = i * 4;
    const lo = Math.min(d[o], d[o + 1], d[o + 2]);
    // alpha ramps out between 214 and 244 — the jpeg halo at the silhouette fades rather than steps
    const a = lo >= 244 ? 0 : lo <= 214 ? 1 : (244 - lo) / 30;
    d[o + 3] = Math.round(d[o + 3] * a);
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/** Kick off loading (idempotent). Safe to call from any client component. */
export function preloadPortraits() {
  if (started || typeof window === "undefined") return;
  started = true;
  (Object.keys(PORTRAIT_SRC) as Archetype[]).forEach((a) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const c = keyWhite(img);
      canvases.set(a, c);
      urls.set(a, c.toDataURL("image/png"));
      emit();
    };
    img.src = PORTRAIT_SRC[a];
  });
}

export const portraitCanvas = (a: Archetype): HTMLCanvasElement | null => canvases.get(a) ?? null;
export const portraitUrl = (a: Archetype): string | null => urls.get(a) ?? null;
/** cache-key fragment: which portraits are in — cards drawn before the art arrived must not be reused after */
export const portraitsKey = () => (Object.keys(PORTRAIT_SRC) as Archetype[]).map((a) => (canvases.has(a) ? "1" : "0")).join("");

const subscribe = (l: () => void) => {
  listeners.add(l);
  preloadPortraits();
  return () => {
    listeners.delete(l);
  };
};
/** Re-renders the caller whenever a portrait finishes loading (0 on the server / before any art). */
export function usePortraitsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
