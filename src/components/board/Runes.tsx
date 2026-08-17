"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { RUNES, RuneKind } from "@/sim/runes";

/**
 * Rune shrines + the runes lying on them. Every shrine tile gets a faint ground sigil (so players learn the spots);
 * a shrine holding a rune gets a bright spinning ground circle, a floating rotating glyph and rising motes in the
 * rune's colour. Presence comes from `view.runes` (replayed events) — never from engine state.
 */

const glyphTex = new Map<RuneKind, THREE.CanvasTexture>();
function runeGlyphTexture(kind: RuneKind): THREE.CanvasTexture {
  let t = glyphTex.get(kind);
  if (t) return t;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.font = "bold 72px 'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols 2', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 14;
  ctx.fillText(RUNES[kind].glyph, S / 2, S / 2 + 4);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glyphTex.set(kind, t);
  return t;
}

let sigilTex: THREE.CanvasTexture | null = null;
function sigilTexture(): THREE.CanvasTexture {
  if (sigilTex) return sigilTex;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  // six-point lattice
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = (((i + 2) % 6) / 6) * Math.PI * 2;
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.42, S / 2 + Math.sin(a) * S * 0.42);
    ctx.lineTo(S / 2 + Math.cos(b) * S * 0.42, S / 2 + Math.sin(b) * S * 0.42);
  }
  ctx.stroke();
  // tick marks
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.36, S / 2 + Math.sin(a) * S * 0.36);
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.42, S / 2 + Math.sin(a) * S * 0.42);
    ctx.stroke();
  }
  sigilTex = new THREE.CanvasTexture(c);
  sigilTex.colorSpace = THREE.SRGBColorSpace;
  return sigilTex;
}

function Rune({ x, y, kind }: { x: number; y: number; kind: RuneKind }) {
  const map = useGame((s) => s.config.map);
  const y0 = tileHeight(map, { x, y });
  const glyph = useMemo(() => runeGlyphTexture(kind), [kind]);
  const sigil = useMemo(() => sigilTexture(), []);
  const color = RUNES[kind].color;
  const ring = useRef<THREE.Mesh>(null);
  const spr = useRef<THREE.Sprite>(null);
  const motes = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) ring.current.rotation.z = t * 0.6;
    if (spr.current) {
      spr.current.position.y = y0 + 0.62 + Math.sin(t * 2.2 + x) * 0.08;
      spr.current.material.rotation = Math.sin(t * 1.3) * 0.25;
    }
    motes.current.forEach((m, i) => {
      if (!m) return;
      const k = ((t * 0.5 + i * 0.37) % 1.4) / 1.4;
      m.position.set(x + Math.sin(i * 2.1 + t) * 0.22, y0 + 0.08 + k * 0.9, y + Math.cos(i * 1.7 + t * 0.8) * 0.22);
      (m.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * 0.8;
    });
  });
  return (
    <group>
      <mesh ref={ring} position={[x, y0 + 0.028, y]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.15, 1.15]} />
        <meshBasicMaterial map={sigil} color={color} transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <sprite ref={spr} position={[x, y0 + 0.62, y]} scale={[0.8, 0.8, 0.8]}>
        <spriteMaterial map={glyph} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      {Array.from({ length: 5 }, (_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            motes.current[i] = el;
          }}
          scale={[0.07, 0.07, 0.07]}
        >
          <spriteMaterial map={glyph} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}

function ShrineSigil({ x, y }: { x: number; y: number }) {
  const map = useGame((s) => s.config.map);
  const sigil = useMemo(() => sigilTexture(), []);
  return (
    <mesh position={[x, tileHeight(map, { x, y }) + 0.026, y]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.8, 0.8]} />
      <meshBasicMaterial map={sigil} color="#cdb8ff" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export default function Runes() {
  const map = useGame((s) => s.config.map);
  const runes = useGame((s) => s.view.runes);
  const shrines = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    map.tiles.forEach((t, i) => {
      if (t === "shrine") out.push({ x: i % map.width, y: Math.floor(i / map.width) });
    });
    return out;
  }, [map]);
  return (
    <group>
      {shrines.map((p) => (
        <ShrineSigil key={`s${p.x},${p.y}`} x={p.x} y={p.y} />
      ))}
      {Object.entries(runes).map(([k, kind]) => {
        const [x, y] = k.split(",").map(Number);
        return <Rune key={k} x={x} y={y} kind={kind} />;
      })}
    </group>
  );
}
