"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Effect, EffectStyle, useGame } from "@/store/game";
import { Pos, TERRAIN } from "@/sim/types";

const STYLE_COLOR: Record<EffectStyle, string> = {
  arrow: "#f3e7c9",
  magic: "#c08bff",
  melee: "#ffb347",
  heal: "#6cf58a",
};

function useTileY() {
  const map = useGame((s) => s.config.map);
  return (p: Pos) => (TERRAIN[map.tiles[p.y * map.width + p.x]]?.height ?? 0.1) + 0.45;
}

/** Arrow: straight thin bolt with a slight arc. Magic: glowing orb + trailing orb, straight line. */
function Projectile({ e }: { e: Extract<Effect, { kind: "projectile" }> }) {
  const tileY = useTileY();
  const group = useRef<THREE.Group>(null);
  const t = useRef(-e.delay);
  const dur = e.style === "magic" ? 0.35 : 0.3;
  const from = new THREE.Vector3(e.from.x, tileY(e.from), e.from.y);
  const to = new THREE.Vector3(e.to.x, tileY(e.to), e.to.y);
  const dist = from.distanceTo(to);
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
    g.position.lerpVectors(from, to, k);
    if (e.style === "arrow") g.position.y += Math.sin(k * Math.PI) * 0.35 * Math.min(1, dist / 3);
    // orient along direction of travel
    const dir = to.clone().sub(from);
    if (e.style === "arrow") dir.y += Math.cos(k * Math.PI) * 0.35;
    g.lookAt(g.position.clone().add(dir));
    if (e.style === "magic") {
      const pulse = 1 + 0.25 * Math.sin(t.current * 40);
      g.scale.setScalar(pulse);
    }
  });
  const color = STYLE_COLOR[e.style];
  return (
    <group ref={group} visible={false}>
      {e.style === "arrow" ? (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0, 0, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.07, 0.16, 6]} />
            <meshBasicMaterial color="#e6e6e6" />
          </mesh>
        </>
      ) : (
        <>
          <mesh>
            <sphereGeometry args={[0.16, 12, 10]} />
            <meshBasicMaterial color={color} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, 0, -0.28]}>
            <sphereGeometry args={[0.1, 10, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} />
          </mesh>
          <mesh position={[0, 0, -0.5]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshBasicMaterial color={color} transparent opacity={0.25} />
          </mesh>
          <pointLight color={color} intensity={2.5} distance={3} />
        </>
      )}
    </group>
  );
}

/** Expanding, fading ring (+ vertical flash for magic, rising sparkle ring for heal, slash wedge for melee). */
function Burst({ e }: { e: Extract<Effect, { kind: "burst" }> }) {
  const tileY = useTileY();
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const t = useRef(-e.delay);
  const dur = e.style === "heal" ? 0.6 : 0.4;
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
    const r = ring.current;
    if (r) {
      const sc = e.style === "heal" ? 0.6 + 0.2 * Math.sin(k * Math.PI) : 0.25 + k * 0.9;
      r.scale.setScalar(sc);
      (r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      if (e.style === "heal") r.position.y = 0.05 + k * 0.9;
    }
    g.children.forEach((ch, i) => {
      if (i === 0) return;
      const m = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m) m.opacity = (1 - k) * 0.8;
      if (e.style === "magic") ch.scale.set(1, 0.4 + k * 1.6, 1);
      if (e.style === "melee") ch.rotation.z = -0.8 + k * 1.6;
    });
  });
  return (
    <group ref={group} position={[e.at.x, y0, e.at.y]} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.28, 0.42, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {e.style === "magic" && (
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.18, 0.28, 1, 12, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {e.style === "melee" && (
        <mesh position={[0, 0.55, 0.05]}>
          <torusGeometry args={[0.35, 0.05, 6, 16, Math.PI * 0.9]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
      {e.style === "arrow" && (
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.18, 10, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}
      {e.style === "heal" && (
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.32, 12, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
    </group>
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
