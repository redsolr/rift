"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { blobTexture, flameTexture, plankTexture, plasterTexture, rugTexture, stoneTexture } from "./roomTextures";

/**
 * The one room: a monastery kitchen at night (FE Three Houses dining-hall / Metaphor kitchen read). Plank floor,
 * plaster walls with a stone arch to a dark corridor, a hearth on the right wall with a flickering fire, a window on
 * the left with cold moonlight, a heavy table with bread, shelves with pots, herbs hanging from the beams, a rug,
 * barrels. Everything procedural — the slot for real assets. Front wall is open (the camera lives there).
 */
export const ROOM = { w: 12, d: 10, h: 4 } as const; // x ∈ [-6, 6], z ∈ [-5, 5]

/** axis-aligned obstacles the player cannot walk through: [minX, maxX, minZ, maxZ] */
export const OBSTACLES: [number, number, number, number][] = [
  [-3.9, -0.9, -1.4, 0.4], // table
  [4.9, 6, -1.6, 1.6], // hearth
  [-6, -5.1, 2.4, 4.6], // barrels
  [-6, -4.6, -5, -4.2], // shelf
];

function Wall({ pos, rot, w, h, arch }: { pos: [number, number, number]; rot: [number, number, number]; w: number; h: number; arch?: { x: number; w: number; h: number } }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h);
    shape.lineTo(-w / 2, h);
    shape.closePath();
    if (arch) {
      const hole = new THREE.Path();
      const r = arch.w / 2;
      hole.moveTo(arch.x - r, 0);
      hole.lineTo(arch.x - r, arch.h - r);
      hole.absarc(arch.x, arch.h - r, r, Math.PI, 0, true);
      hole.lineTo(arch.x + r, 0);
      hole.closePath();
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    // planar UVs in wall units so the plaster tiles evenly
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.5, uv.getY(i) / 2.5);
    return g;
  }, [w, h, arch]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: plasterTexture([1, 1]), roughness: 1 }), []);
  return <mesh geometry={geo} material={mat} position={pos} rotation={rot} receiveShadow castShadow />;
}

function Fire() {
  const light = useRef<THREE.PointLight>(null);
  const a = useRef<THREE.Sprite>(null);
  const b = useRef<THREE.Sprite>(null);
  const t = useRef(0);
  const tex = useMemo(() => flameTexture(), []);
  useFrame((_, dt) => {
    t.current += dt;
    const k = t.current;
    const flick = 0.75 + 0.25 * Math.sin(k * 11.3) * Math.sin(k * 7.1) + 0.12 * Math.sin(k * 23);
    if (light.current) light.current.intensity = 42 * flick;
    if (a.current) a.current.scale.set(0.9 + 0.12 * Math.sin(k * 9), 1.1 + 0.2 * Math.sin(k * 13 + 1), 1);
    if (b.current) b.current.scale.set(0.6 + 0.1 * Math.sin(k * 15 + 2), 0.8 + 0.15 * Math.sin(k * 10), 1);
  });
  return (
    <group position={[5.35, 0.35, 0]}>
      <pointLight ref={light} color="#ff9a3c" intensity={42} distance={11} decay={2} position={[0, 0.5, 0.2]} castShadow shadow-mapSize={[512, 512]} />
      <sprite ref={a} position={[0, 0.45, 0.1]}>
        <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={b} position={[0.05, 0.3, 0.15]}>
        <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* logs */}
      <mesh position={[0, 0.06, 0.1]} rotation={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.7, 6]} />
        <meshStandardMaterial color="#2a1a10" roughness={1} />
      </mesh>
      <mesh position={[0, 0.16, 0.1]} rotation={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.6, 6]} />
        <meshStandardMaterial color="#3a2414" roughness={1} emissive="#5a1a00" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function Herbs() {
  const items = useMemo(() => {
    const out: { x: number; z: number; len: number; hue: number }[] = [];
    const xs = [-2.2, -1.2, 0.2, 1.4, 2.6];
    xs.forEach((x, i) => out.push({ x, z: -3.6 + (i % 2) * 0.35, len: 0.5 + (i % 3) * 0.12, hue: 95 + i * 9 }));
    return out;
  }, []);
  return (
    <group>
      {items.map((h, i) => (
        <group key={i} position={[h.x, ROOM.h - 0.1, h.z]}>
          <mesh position={[0, -h.len / 2, 0]}>
            <cylinderGeometry args={[0.006, 0.006, h.len, 4]} />
            <meshStandardMaterial color="#8a7a5a" />
          </mesh>
          <mesh position={[0, -h.len - 0.22, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.13, 0.46, 6]} />
            <meshStandardMaterial color={`hsl(${h.hue}, 32%, 30%)`} roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Room() {
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ map: plankTexture([ROOM.w / 2.5, ROOM.d / 2.5]), roughness: 0.85 }), []);
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ map: stoneTexture([2, 2]), roughness: 1 }), []);
  const stoneTall = useMemo(() => new THREE.MeshStandardMaterial({ map: stoneTexture([1, 3]), roughness: 1 }), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5a3f28", roughness: 0.9 }), []);
  const darkWood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a2718", roughness: 1 }), []);
  const rug = useMemo(() => new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }), []);
  const blob = useMemo(() => blobTexture(), []);
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={floorMat} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
      </mesh>
      {/* rug in front of the hearth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.2, 0.006, 0]} material={rug} receiveShadow>
        <planeGeometry args={[2.4, 3.2]} />
      </mesh>
      {/* walls: back (arch), left (window), right (hearth) — front open */}
      <Wall pos={[0, 0, -ROOM.d / 2 - 0.3]} rot={[0, 0, 0]} w={ROOM.w} h={ROOM.h} arch={{ x: 3.2, w: 1.9, h: 2.9 }} />
      <Wall pos={[-ROOM.w / 2 - 0.3, 0, ROOM.d / 2]} rot={[0, Math.PI / 2, 0]} w={ROOM.d} h={ROOM.h} />
      <Wall pos={[ROOM.w / 2 + 0.3, 0, -ROOM.d / 2]} rot={[0, -Math.PI / 2, 0]} w={ROOM.d} h={ROOM.h} />
      {/* stone arch surround + dark corridor beyond, faint blue light */}
      <mesh position={[3.2, 1.55, -ROOM.d / 2 - 0.5]}>
        <planeGeometry args={[1.9, 3.1]} />
        <meshBasicMaterial color="#070912" />
      </mesh>
      <pointLight position={[3.2, 2, -ROOM.d / 2 - 0.4]} color="#5a78c8" intensity={8} distance={6} decay={2} />
      <mesh position={[3.2, 3.2, -ROOM.d / 2 - 0.05]} material={stone} castShadow>
        <boxGeometry args={[2.6, 0.5, 0.5]} />
      </mesh>
      <mesh position={[2.0, 1.4, -ROOM.d / 2 - 0.05]} material={stoneTall} castShadow>
        <boxGeometry args={[0.35, 2.9, 0.5]} />
      </mesh>
      <mesh position={[4.4, 1.4, -ROOM.d / 2 - 0.05]} material={stoneTall} castShadow>
        <boxGeometry args={[0.35, 2.9, 0.5]} />
      </mesh>
      {/* window on the left wall: frame, cold night pane, moonlight */}
      <group position={[-ROOM.w / 2 + 0.02, 2.2, 1.2]}>
        <mesh material={darkWood}>
          <boxGeometry args={[0.1, 1.5, 1.2]} />
        </mesh>
        <mesh position={[0.06, 0, 0]}>
          <boxGeometry args={[0.02, 1.3, 1.0]} />
          <meshStandardMaterial color="#8fb0ff" emissive="#4a6acc" emissiveIntensity={0.9} />
        </mesh>
        <mesh position={[0.08, 0, 0]} material={darkWood}>
          <boxGeometry args={[0.03, 1.3, 0.06]} />
        </mesh>
        <mesh position={[0.08, 0, 0]} material={darkWood}>
          <boxGeometry args={[0.03, 0.06, 1.0]} />
        </mesh>
      </group>
      <pointLight position={[-5.0, 2.6, 1.2]} color="#7f9bff" intensity={22} distance={9} decay={2} />
      {/* hearth: stone mass, opening, mantel, chimney */}
      <group position={[ROOM.w / 2 - 0.5, 0, 0]}>
        <mesh position={[0, 1.15, -1.0]} material={stoneTall} castShadow receiveShadow>
          <boxGeometry args={[1.0, 2.3, 0.6]} />
        </mesh>
        <mesh position={[0, 1.15, 1.0]} material={stoneTall} castShadow receiveShadow>
          <boxGeometry args={[1.0, 2.3, 0.6]} />
        </mesh>
        <mesh position={[0, 2.0, 0]} material={stone} castShadow>
          <boxGeometry args={[1.0, 0.6, 2.6]} />
        </mesh>
        <mesh position={[0, 3.15, 0]} material={stone} castShadow>
          <boxGeometry args={[0.8, 1.7, 1.6]} />
        </mesh>
        <mesh position={[-0.55, 2.35, 0]} material={wood} castShadow>
          <boxGeometry args={[0.2, 0.1, 2.9]} />
        </mesh>
        <mesh position={[0.2, 0.85, 0]}>
          <boxGeometry args={[0.6, 1.7, 1.4]} />
          <meshBasicMaterial color="#120806" />
        </mesh>
        <mesh position={[-0.2, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stone}>
          <planeGeometry args={[1.6, 2.2]} />
        </mesh>
      </group>
      <Fire />
      {/* table + bench + bread basket + candle */}
      <group position={[-2.4, 0, -0.5]}>
        <mesh position={[0, 0.82, 0]} material={wood} castShadow receiveShadow>
          <boxGeometry args={[3.0, 0.1, 1.5]} />
        </mesh>
        {[
          [-1.35, -0.6],
          [1.35, -0.6],
          [-1.35, 0.6],
          [1.35, 0.6],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.4, z]} material={darkWood} castShadow>
            <boxGeometry args={[0.12, 0.8, 0.12]} />
          </mesh>
        ))}
        <mesh position={[0, 0.42, 1.1]} material={wood} castShadow>
          <boxGeometry args={[2.6, 0.08, 0.35]} />
        </mesh>
        <mesh position={[-1.1, 0.2, 1.1]} material={darkWood}>
          <boxGeometry args={[0.1, 0.4, 0.3]} />
        </mesh>
        <mesh position={[1.1, 0.2, 1.1]} material={darkWood}>
          <boxGeometry args={[0.1, 0.4, 0.3]} />
        </mesh>
        {/* basket */}
        <mesh position={[0.7, 0.98, -0.2]} castShadow>
          <cylinderGeometry args={[0.32, 0.26, 0.22, 12, 1, true]} />
          <meshStandardMaterial color="#a8823f" roughness={1} side={THREE.DoubleSide} />
        </mesh>
        {[
          [0.6, 1.06, -0.25],
          [0.8, 1.06, -0.12],
          [0.72, 1.16, -0.2],
        ].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} castShadow>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshStandardMaterial color="#c88a44" roughness={0.9} />
          </mesh>
        ))}
        {/* candle */}
        <mesh position={[-0.8, 0.98, 0.2]}>
          <cylinderGeometry args={[0.04, 0.045, 0.22, 8]} />
          <meshStandardMaterial color="#e9dcb8" />
        </mesh>
        <pointLight position={[-0.8, 1.2, 0.2]} color="#ffcc77" intensity={7} distance={4} decay={2} />
        {/* honey pot */}
        <mesh position={[-0.2, 0.96, -0.3]}>
          <cylinderGeometry args={[0.09, 0.08, 0.16, 10]} />
          <meshStandardMaterial color="#b0742a" roughness={0.5} />
        </mesh>
      </group>
      {/* shelf on the back wall with pots */}
      <group position={[-3.6, 0, -ROOM.d / 2 + 0.05]}>
        {[1.3, 2.1].map((y, i) => (
          <mesh key={i} position={[0, y, 0.2]} material={wood} castShadow>
            <boxGeometry args={[2.6, 0.06, 0.4]} />
          </mesh>
        ))}
        {[
          [-1.0, 1.45, "#6b4a3a", 0.16],
          [-0.5, 1.45, "#7c6a55", 0.12],
          [0.2, 1.45, "#4a5a6a", 0.14],
          [0.9, 1.45, "#6b4a3a", 0.18],
          [-0.8, 2.25, "#8a6a4a", 0.12],
          [0.0, 2.25, "#5a4a3a", 0.16],
          [0.8, 2.25, "#7c6a55", 0.11],
        ].map(([x, y, c, r], i) => (
          <mesh key={i} position={[x as number, (y as number) + (r as number), 0.2]} castShadow>
            <cylinderGeometry args={[r as number, (r as number) * 0.85, (r as number) * 2, 10]} />
            <meshStandardMaterial color={c as string} roughness={0.8} />
          </mesh>
        ))}
        {/* hanging pans */}
        {[-1.2, 0.5].map((x, i) => (
          <mesh key={i} position={[x, 3.0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.05, 16]} />
            <meshStandardMaterial color="#2a2a30" metalness={0.6} roughness={0.5} />
          </mesh>
        ))}
      </group>
      {/* barrels in the far-left corner */}
      {[
        [-5.5, 3.0],
        [-5.5, 4.0],
        [-4.9, 3.6],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.34, 0.9, 12]} />
          <meshStandardMaterial color="#5a4030" roughness={1} />
        </mesh>
      ))}
      {/* ceiling beams */}
      {[-3.6, 0, 3.6].map((z, i) => (
        <mesh key={i} position={[0, ROOM.h - 0.15, z]} material={darkWood}>
          <boxGeometry args={[ROOM.w, 0.3, 0.3]} />
        </mesh>
      ))}
      <Herbs />
      {/* soft contact shadows under the furniture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.4, 0.004, -0.5]}>
        <planeGeometry args={[3.6, 2.2]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.6} />
      </mesh>
    </group>
  );
}
