"use client";
import * as THREE from "three";

/** Procedural, cached textures for the campaign room (planks, plaster, rug, fire sprite). Deterministic LCG, no Math.random. */
const cache = new Map<string, THREE.Texture>();
const S = 256;

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function make(key: string, draw: (ctx: CanvasRenderingContext2D, rnd: () => number) => void, repeat: [number, number] = [1, 1]): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  draw(c.getContext("2d")!, lcg(key.length * 977 + 13));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
const grain = (ctx: CanvasRenderingContext2D, rnd: () => number, n: number, a: number, light: boolean) => {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${a * rnd()})`;
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
};

/** dark oak planks running along X */
export const plankTexture = (repeat: [number, number]) =>
  make(
    `planks${repeat.join("x")}`,
    (ctx, rnd) => {
      ctx.fillStyle = "#3a2a1c";
      ctx.fillRect(0, 0, S, S);
      const rows = 4;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * (S / 3);
        for (let x = -S; x < S * 2; x += S / 1.5) {
          const l = 22 + rnd() * 10;
          ctx.fillStyle = `hsl(${24 + rnd() * 8}, ${35 + rnd() * 10}%, ${l}%)`;
          ctx.fillRect(x + off + 1.5, r * rh + 1.5, S / 1.5 - 3, rh - 3);
          // wood grain lines
          for (let g = 0; g < 6; g++) {
            ctx.strokeStyle = `rgba(0,0,0,${0.12 + rnd() * 0.15})`;
            ctx.lineWidth = 1;
            const y = r * rh + 4 + rnd() * (rh - 8);
            ctx.beginPath();
            ctx.moveTo(x + off + 2, y);
            ctx.bezierCurveTo(x + off + S / 4, y + (rnd() - 0.5) * 6, x + off + S / 3, y + (rnd() - 0.5) * 6, x + off + S / 1.5 - 2, y + (rnd() - 0.5) * 4);
            ctx.stroke();
          }
        }
      }
      grain(ctx, rnd, 600, 0.12, true);
      grain(ctx, rnd, 900, 0.2, false);
    },
    repeat,
  );

/** cool grey-green plaster with soot towards the top */
export const plasterTexture = (repeat: [number, number]) =>
  make(
    `plaster${repeat.join("x")}`,
    (ctx, rnd) => {
      ctx.fillStyle = "#4b5750";
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = `hsla(${140 + rnd() * 30}, ${8 + rnd() * 10}%, ${28 + rnd() * 18}%, 0.5)`;
        ctx.beginPath();
        ctx.ellipse(rnd() * S, rnd() * S, 8 + rnd() * 24, 6 + rnd() * 16, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      grain(ctx, rnd, 1400, 0.16, false);
      grain(ctx, rnd, 500, 0.12, true);
    },
    repeat,
  );

/** rough ashlar stone for the hearth + arch */
export const stoneTexture = (repeat: [number, number]) =>
  make(
    `stone${repeat.join("x")}`,
    (ctx, rnd) => {
      ctx.fillStyle = "#2b2c31";
      ctx.fillRect(0, 0, S, S);
      const rows = 6;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? rh : 0;
        for (let x = -rh * 2; x < S + rh; x += rh * 2) {
          const l = 30 + rnd() * 14;
          ctx.fillStyle = `hsl(${220 + rnd() * 20}, 6%, ${l}%)`;
          ctx.fillRect(x + off + 2, r * rh + 2, rh * 2 - 4, rh - 4);
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(x + off + 2, r * rh + 2, rh * 2 - 4, 2);
        }
      }
      grain(ctx, rnd, 1200, 0.2, false);
    },
    repeat,
  );

/** deep red woven rug with a pale border + diamond motif */
export const rugTexture = () =>
  make("rug", (ctx, rnd) => {
    ctx.fillStyle = "#6a1e22";
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "#d9b98a";
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, S - 24, S - 24);
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, S - 56, S - 56);
    ctx.fillStyle = "#c9a066";
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const cx = 64 + i * 64;
        const cy = 64 + j * 64;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 18);
        ctx.lineTo(cx + 18, cy);
        ctx.lineTo(cx, cy + 18);
        ctx.lineTo(cx - 18, cy);
        ctx.closePath();
        ctx.fill();
      }
    grain(ctx, rnd, 1600, 0.25, false);
  });

/** soft radial flame sprite (additive) */
export const flameTexture = () =>
  make("flame", (ctx) => {
    const g = ctx.createRadialGradient(S / 2, S * 0.62, 4, S / 2, S * 0.62, S * 0.5);
    g.addColorStop(0, "rgba(255,240,180,1)");
    g.addColorStop(0.25, "rgba(255,170,60,0.9)");
    g.addColorStop(0.55, "rgba(230,80,20,0.45)");
    g.addColorStop(1, "rgba(120,20,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  });

/** soft round shadow blob under an actor */
export const blobTexture = () =>
  make("blob", (ctx) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.6, "rgba(0,0,0,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  });
