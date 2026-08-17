"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Effect, EffectStyle, useGame } from "@/store/game";
import { Pos } from "@/sim/types";
import { tileHeight } from "@/sim/grid";

/**
 * Battle effects — spawned from events by the playback reducer, never from engine state.
 * Each effect owns a local clock (starts at -delay) and hides itself outside [0, dur].
 * Particles are deterministic per effect key (tiny LCG) so a replay looks the same twice.
 */

const STYLE_COLOR: Record<EffectStyle, string> = {
  arrow: "#f3e7c9",
  magic: "#c08bff",
  melee: "#ffb347",
  heal: "#6cf58a",
  rune: "#ffffff",
};
const HOT: Record<EffectStyle, string> = {
  arrow: "#ffffff",
  magic: "#ffe9ff",
  melee: "#fff1c9",
  heal: "#eafff0",
  rune: "#ffffff",
};

function useTileY() {
  const map = useGame((s) => s.config.map);
  return (p: Pos) => tileHeight(map, p) + 0.45;
}

/** Deterministic pseudo-random sequence per effect. */
function seeded(seed: number) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** A fan of small glowing particles: sparks (fast, gravity), embers (slow, drift up) or sparkles (twinkle, float). */
function Sparks({ at, seed, color, count = 14, kind = "spark", delay = 0, y = 0.5 }: { at: Pos; seed: number; color: string; count?: number; kind?: "spark" | "ember" | "sparkle"; delay?: number; y?: number }) {
  const tileY = useTileY();
  const group = useRef<THREE.Group>(null);
  const t = useRef(-delay);
  const dur = kind === "spark" ? 0.45 : kind === "ember" ? 0.9 : 0.8;
  const parts = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, () => {
      const a = rnd() * Math.PI * 2;
      const sp = kind === "spark" ? 2 + rnd() * 3 : kind === "ember" ? 0.4 + rnd() * 0.9 : 0.3 + rnd() * 0.6;
      const up = kind === "spark" ? 1.5 + rnd() * 2.5 : kind === "ember" ? 1.2 + rnd() * 1.4 : 1 + rnd() * 1.2;
      return { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: up, size: kind === "spark" ? 0.03 + rnd() * 0.03 : 0.05 + rnd() * 0.05, ph: rnd() * 6 };
    });
  }, [seed, count, kind]);
  const y0 = tileY(at) - 0.45 + y;
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    t.current += dt;
    const k = t.current / dur;
    if (k < 0 || k > 1) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const tt = t.current;
    const grav = kind === "spark" ? -9 : kind === "ember" ? -0.6 : 0.4;
    g.children.forEach((ch, i) => {
      const p = parts[i];
      const wob = kind === "spark" ? 0 : Math.sin(tt * 6 + p.ph) * 0.12;
      ch.position.set(p.vx * tt + wob, p.vy * tt + 0.5 * grav * tt * tt, p.vz * tt);
      const m = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = (1 - k) * (kind === "sparkle" ? 0.6 + 0.4 * Math.sin(tt * 20 + p.ph) : 1);
      ch.scale.setScalar(kind === "spark" ? 1 - k * 0.6 : 1 - k * 0.3);
    });
  });
  return (
    <group ref={group} position={[at.x, y0, at.y]} visible={false}>
      {parts.map((p, i) => (
        <mesh key={i}>
          <sphereGeometry args={[p.size, 6, 5]} />
          <meshBasicMaterial color={color} transparent opacity={1} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

/** Quick expanding, fading flat ring on the ground (shockwave / dust). */
function Shockwave({ at, color, delay = 0, dur = 0.45, from = 0.15, to = 1.1, opacity = 0.9 }: { at: Pos; color: string; delay?: number; dur?: number; from?: number; to?: number; opacity?: number }) {
  const tileY = useTileY();
  const ring = useRef<THREE.Mesh>(null);
  const t = useRef(-delay);
  useFrame((_, dt) => {
    const r = ring.current;
    if (!r) return;
    t.current += dt;
    const k = t.current / dur;
    if (k < 0 || k > 1) {
      r.visible = false;
      return;
    }
    r.visible = true;
    const e = 1 - Math.pow(1 - k, 3);
    r.scale.setScalar(from + (to - from) * e);
    (r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * opacity;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[at.x, tileY(at) - 0.38, at.y]} visible={false}>
      <ringGeometry args={[0.55, 0.7, 32]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Camera-facing hit flash: a bright additive disc that pops and fades. */
function Flash({ at, color, delay = 0, size = 0.7, dur = 0.22, y = 0.5 }: { at: Pos; color: string; delay?: number; size?: number; dur?: number; y?: number }) {
  const tileY = useTileY();
  const m = useRef<THREE.Sprite>(null);
  const t = useRef(-delay);
  useFrame((_, dt) => {
    const s = m.current;
    if (!s) return;
    t.current += dt;
    const k = t.current / dur;
    if (k < 0 || k > 1) {
      s.visible = false;
      return;
    }
    s.visible = true;
    const sc = size * (0.4 + k * 1.2);
    s.scale.set(sc, sc, 1);
    (s.material as THREE.SpriteMaterial).opacity = (1 - k) * 0.95;
  });
  return (
    <sprite ref={m} position={[at.x, tileY(at) - 0.45 + y, at.y]} visible={false}>
      <spriteMaterial color={color} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

/** Arrow: fletched, spinning shaft on a real arc with a fading motion trail. Magic: fireball with halo + ember tail + light. */
function Projectile({ e }: { e: Extract<Effect, { kind: "projectile" }> }) {
  const tileY = useTileY();
  const group = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const t = useRef(-e.delay);
  const dur = e.style === "magic" ? 0.38 : 0.32;
  const from = useMemo(() => new THREE.Vector3(e.from.x, tileY(e.from), e.from.y), [e.from, tileY]);
  const to = useMemo(() => new THREE.Vector3(e.to.x, tileY(e.to), e.to.y), [e.to, tileY]);
  const dist = from.distanceTo(to);
  const arc = e.style === "arrow" ? 0.25 + 0.22 * dist : 0.05;
  const posAt = (k: number) => {
    const p = new THREE.Vector3().lerpVectors(from, to, k);
    p.y += Math.sin(k * Math.PI) * arc;
    return p;
  };
  const TRAIL = 7;
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    t.current += dt;
    const k = t.current / dur;
    if (k < 0 || k > 1) {
      g.visible = false;
      if (trail.current) trail.current.visible = false;
      return;
    }
    g.visible = true;
    g.position.copy(posAt(k));
    g.lookAt(posAt(Math.min(1, k + 0.02)));
    if (e.style === "arrow") g.rotateZ(t.current * 30); // shaft spin
    if (e.style === "magic") {
      g.scale.setScalar(1 + 0.18 * Math.sin(t.current * 45));
      if (light.current) light.current.intensity = 3 + 2 * Math.sin(t.current * 30);
    }
    const tr = trail.current;
    if (tr) {
      tr.visible = true;
      tr.children.forEach((ch, i) => {
        const kk = k - (i + 1) * (e.style === "magic" ? 0.045 : 0.03);
        const m = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (kk < 0) {
          m.opacity = 0;
          return;
        }
        ch.position.copy(posAt(kk));
        ch.lookAt(posAt(Math.min(1, kk + 0.02)));
        m.opacity = (1 - (i + 1) / (TRAIL + 1)) * 0.55;
        const s = 1 - (i / TRAIL) * 0.7;
        ch.scale.set(s, s, 1);
      });
    }
  });
  const color = STYLE_COLOR[e.style];
  return (
    <>
      <group ref={trail} visible={false}>
        {Array.from({ length: TRAIL }, (_, i) =>
          e.style === "arrow" ? (
            <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.5, 5]} />
              <meshBasicMaterial color={HOT.arrow} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          ) : (
            <mesh key={i}>
              <sphereGeometry args={[0.13, 8, 6]} />
              <meshBasicMaterial color={i % 2 ? "#ff9adf" : color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          ),
        )}
      </group>
      <group ref={group} visible={false}>
        {e.style === "arrow" ? (
          <>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.72, 6]} />
              <meshBasicMaterial color="#d9c9a4" />
            </mesh>
            <mesh position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.06, 0.18, 6]} />
              <meshBasicMaterial color="#f4f4f4" />
            </mesh>
            {[0, 2.094, 4.189].map((r, i) => (
              <group key={i} position={[0, 0, -0.3]} rotation={[0, 0, r]}>
                <mesh position={[0.06, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                  <planeGeometry args={[0.16, 0.09]} />
                  <meshBasicMaterial color={i === 0 ? "#e5484d" : "#f3e7c9"} side={THREE.DoubleSide} />
                </mesh>
              </group>
            ))}
          </>
        ) : (
          <>
            <mesh>
              <sphereGeometry args={[0.15, 12, 10]} />
              <meshBasicMaterial color={HOT.magic} />
            </mesh>
            <sprite scale={[0.9, 0.9, 1]}>
              <spriteMaterial color={color} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <pointLight ref={light} color={color} intensity={3.5} distance={3.5} />
          </>
        )}
      </group>
    </>
  );
}

/** Impact / cast bursts per style, plus particle dressing. */
function Burst({ e }: { e: Extract<Effect, { kind: "burst" }> }) {
  const tileY = useTileY();
  const group = useRef<THREE.Group>(null);
  const t = useRef(-e.delay);
  const dur = e.style === "heal" ? 0.7 : e.style === "magic" ? 0.55 : 0.4;
  const color = STYLE_COLOR[e.style];
  const y0 = tileY(e.at) - 0.4;
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    t.current += dt;
    const k = t.current / dur;
    if (k < 0 || k > 1) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.children.forEach((ch) => {
      const m = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      const role = ch.userData.role as string | undefined;
      if (role === "pillar") {
        ch.scale.set(1 + k * 0.4, 0.3 + k * 1.9, 1 + k * 0.4);
        if (m) m.opacity = (1 - k) * 0.7;
      } else if (role === "rune") {
        ch.rotation.z = k * 2.5;
        ch.scale.setScalar(0.6 + k * 0.6);
        if (m) m.opacity = Math.sin(k * Math.PI) * 0.9;
      } else if (role === "slash1" || role === "slash2") {
        const dir = role === "slash1" ? 1 : -1;
        const kk = role === "slash1" ? k : Math.max(0, k - 0.18) / 0.82;
        ch.rotation.z = dir * (-1.4 + kk * 2.6);
        ch.scale.set(0.6 + kk * 0.9, 0.6 + kk * 0.9, 1);
        if (m) m.opacity = kk <= 0 ? 0 : Math.sin(Math.min(1, kk) * Math.PI) * 0.95;
      } else if (role === "healring") {
        ch.position.y = 0.05 + k * 1.1;
        ch.scale.setScalar(0.7 + 0.25 * Math.sin(k * Math.PI));
        if (m) m.opacity = (1 - k) * 0.9;
      } else if (role === "healglow") {
        ch.scale.setScalar(0.5 + k * 1.2);
        if (m) m.opacity = Math.sin(k * Math.PI) * 0.35;
      }
    });
  });
  return (
    <>
      <group ref={group} position={[e.at.x, y0, e.at.y]} visible={false}>
        {e.style === "magic" && (
          <>
            <mesh userData={{ role: "pillar" }} position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.16, 0.3, 1, 14, 1, true]} />
              <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh userData={{ role: "rune" }} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
              <ringGeometry args={[0.36, 0.44, 6]} />
              <meshBasicMaterial color={HOT.magic} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </>
        )}
        {e.style === "melee" && (
          <>
            <mesh userData={{ role: "slash1" }} position={[0, 0.6, 0.06]}>
              <torusGeometry args={[0.38, 0.045, 6, 20, Math.PI * 0.85]} />
              <meshBasicMaterial color={HOT.melee} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh userData={{ role: "slash2" }} position={[0, 0.55, 0.08]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.32, 0.04, 6, 20, Math.PI * 0.8]} />
              <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </>
        )}
        {e.style === "heal" && (
          <>
            <mesh userData={{ role: "healring" }} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
              <ringGeometry args={[0.3, 0.42, 28]} />
              <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh userData={{ role: "healglow" }} position={[0, 0.5, 0]}>
              <sphereGeometry args={[0.32, 12, 10]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </>
        )}
      </group>
      {e.style === "arrow" && (
        <>
          <Flash at={e.at} color={HOT.arrow} delay={e.delay} size={0.55} />
          <Sparks at={e.at} seed={e.key} color={STYLE_COLOR.arrow} count={10} kind="spark" delay={e.delay} />
          <Shockwave at={e.at} color="#cbbf9d" delay={e.delay} dur={0.35} from={0.2} to={0.7} opacity={0.5} />
        </>
      )}
      {e.style === "melee" && (
        <>
          <Flash at={e.at} color={HOT.melee} delay={e.delay + 0.08} size={0.8} />
          <Sparks at={e.at} seed={e.key} color={color} count={16} kind="spark" delay={e.delay + 0.08} />
        </>
      )}
      {e.style === "magic" && (
        <>
          <Flash at={e.at} color={HOT.magic} delay={e.delay} size={1.1} dur={0.3} />
          <Shockwave at={e.at} color={color} delay={e.delay} dur={0.5} from={0.2} to={1.4} />
          <Sparks at={e.at} seed={e.key} color={color} count={18} kind="ember" delay={e.delay + 0.05} y={0.3} />
          <Sparks at={e.at} seed={e.key + 1} color="#ff9adf" count={10} kind="spark" delay={e.delay} />
        </>
      )}
      {e.style === "heal" && <Sparks at={e.at} seed={e.key} color={HOT.heal} count={14} kind="sparkle" delay={e.delay + 0.05} y={0.2} />}
      {e.style === "rune" && (
        <>
          <Flash at={e.at} color={e.color ?? HOT.rune} delay={e.delay} size={0.9} dur={0.35} />
          <Shockwave at={e.at} color={e.color ?? STYLE_COLOR.rune} delay={e.delay} dur={0.6} from={0.15} to={1.1} />
          <Sparks at={e.at} seed={e.key} color={e.color ?? STYLE_COLOR.rune} count={16} kind="ember" delay={e.delay + 0.05} y={0.15} />
        </>
      )}
    </>
  );
}

export default function Effects() {
  const effects = useGame((s) => s.effects);
  return (
    <group>
      {effects.map((e) => (e.kind === "projectile" ? <Projectile key={e.key} e={e} /> : <Burst key={e.key} e={e} />))}
    </group>
  );
}
