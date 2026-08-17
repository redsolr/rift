"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * RTS/MOBA-style ground selection ring: soft additive glow ring + a bright arc that spins + a faint radar
 * sweep inside + a slow breathing pulse. `strength` 1 = selected (spins), ~0.45 = hover (dimmer, slower).
 * Pure presentation, sits under the unit card at y≈0.
 */

let glowTex: THREE.CanvasTexture | null = null;
let sweepTex: THREE.CanvasTexture | null = null;

function ringGlowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  g.addColorStop(0.62, "rgba(255,255,255,0.35)");
  g.addColorStop(0.68, "rgba(255,255,255,1)");
  g.addColorStop(0.74, "rgba(255,255,255,0.45)");
  g.addColorStop(0.9, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

function radarSweepTexture(): THREE.CanvasTexture {
  if (sweepTex) return sweepTex;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  // conic: bright leading edge fading around the disc, masked to the inner disc
  const g = ctx.createConicGradient(0, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.18, "rgba(255,255,255,0.18)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.31, 0, Math.PI * 2);
  ctx.fill();
  // fade the disc centre so it reads as a sweep, not a pie
  const m = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.31);
  m.addColorStop(0, "rgba(0,0,0,0.9)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = m;
  ctx.fillRect(0, 0, S, S);
  sweepTex = new THREE.CanvasTexture(c);
  sweepTex.colorSpace = THREE.SRGBColorSpace;
  return sweepTex;
}

export default function SelectionRing({ color, strength = 1, spin = true }: { color: string; strength?: number; spin?: boolean }) {
  const glow = useMemo(() => ringGlowTexture(), []);
  const sweep = useMemo(() => radarSweepTexture(), []);
  const root = useRef<THREE.Group>(null);
  const arc = useRef<THREE.Group>(null);
  const radar = useRef<THREE.Mesh>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const tt = t.current;
    const pulse = 1 + Math.sin(tt * 2.6) * 0.035;
    root.current?.scale.set(pulse, pulse, pulse);
    if (glowMat.current) glowMat.current.opacity = strength * (0.75 + 0.2 * Math.sin(tt * 2.6));
    if (spin) {
      if (arc.current) arc.current.rotation.z = -tt * 1.6;
      if (radar.current) radar.current.rotation.z = tt * 1.1;
    }
  });
  const R = 0.36; // well inside the tile (tile = 1.0); the HP arc sits just outside it
  return (
    <group ref={root} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* soft glow ring */}
      <mesh>
        <planeGeometry args={[R * 2.6, R * 2.6]} />
        <meshBasicMaterial ref={glowMat} map={glow} color={color} transparent opacity={strength} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* crisp core ring */}
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[R * 0.86, R * 0.94, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.8 * strength} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* spinning bright arcs */}
      <group ref={arc} position={[0, 0, 0.002]}>
        <mesh>
          <ringGeometry args={[R * 0.8, R * 1.0, 40, 1, 0, Math.PI * 0.55]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85 * strength} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI]}>
          <ringGeometry args={[R * 0.84, R * 0.96, 40, 1, 0, Math.PI * 0.35]} />
          <meshBasicMaterial color={color} transparent opacity={0.6 * strength} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
      {/* radar sweep inside */}
      {spin && (
        <mesh ref={radar} position={[0, 0, 0.0005]}>
          <planeGeometry args={[R * 2.6, R * 2.6]} />
          <meshBasicMaterial map={sweep} color={color} transparent opacity={0.5 * strength} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * FE Three Hopes-style HP gauge: a curved arc on the ground in FRONT of the unit (toward the fixed camera, +z),
 * team-coloured fill over a dark track, always visible for both teams. Local -y maps to world +z after the -π/2 tilt.
 */
export function HpArc({ pct, color }: { pct: number; color: string }) {
  const span = Math.PI * 0.72; // ~130°
  const start = -Math.PI / 2 - span / 2;
  const fill = Math.max(0, Math.min(1, pct)) * span;
  const low = pct <= 0.25;
  return (
    <group position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.42, 0.5, 40, 1, start - 0.03, span + 0.06]} />
        <meshBasicMaterial color="#05070c" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {fill > 0 && (
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.435, 0.485, 40, 1, start, fill]} />
          <meshBasicMaterial color={low ? "#ffb347" : color} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {fill > 0 && (
        <mesh position={[0, 0, 0.002]}>
          <ringGeometry args={[0.44, 0.48, 40, 1, start, fill]} />
          <meshBasicMaterial color={low ? "#ffb347" : color} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
