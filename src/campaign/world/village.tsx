"use client";
import { RefObject, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Character from "../Character";
import { blobTexture, cobbleTexture, grassTexture, stoneTexture, whitewashTexture } from "../roomTextures";
import { ModelName, VILLAGE_AGAIN, VILLAGE_TALK } from "../script";
import type { AABB, Zone } from "./types";
import { CHUNK, COLS, FOUNTAIN_R, HALF, KITCHEN_Z, LANE, ROWS, TOWER, TOWER_DOOR_Z, ChunkData, WELL_ID, chunkData, chunkKey, chunkOf, cottageId, occludersNear, ringKeys, stallId, treeId } from "./villageChunks";
import { occludedIds, sameIds } from "./occlusion";

/**
 * Zone 2 — the village on a bright morning, STREAMED: only the 5×5 chunk ring around the player is mounted
 * (`VillageScene` watches the player's chunk each frame and swaps React state only when it changes); a light haze
 * (fog the colour of the sky) ends before the ring does, so chunks appear / vanish out of sight. Every chunk draws
 * from ONE set of shared geometries + materials (created once, module-level, lazily) — cottages, roofs, fences,
 * crates, hay, trees (InstancedMesh per chunk), lantern posts, the market stalls, the fountain, the tower — so memory
 * stays flat no matter how many chunks the village grows to. The sun is one shadow-casting directional light that
 * follows the player so its frustum stays small. **Sims-style cutaway**: each frame the eye→camera segment is tested
 * against the nearby occluders (`occludersNear`); a cottage in the way renders walls-down, a tree loses its canopy,
 * a stall its awning, the fountain its centrepiece — the camera angle NEVER changes for occlusion.
 * Ambient villagers (the other KayKit bodies) stand about the plaza and lanes — idle animation only, no dialogue.
 */
const RING = 2;

/** live counters for the profiler */
export const villageStats = { loaded: 0 };

/** villagers who are just there — one of each spare body, so the perf table shows what five skinned rigs cost */
interface Ambient {
  id: string;
  model: ModelName;
  x: number;
  z: number;
  facing: number;
  height: number;
}
const AMBIENT: Ambient[] = [
  // each stands in FRONT of a stall (fountain side), facing its counter — never inside a footprint
  { id: "a-rogue", model: "Rogue", x: -3.0, z: -1.6, facing: Math.PI, height: 1.6 },
  { id: "a-hood", model: "Rogue_Hooded", x: -3.0, z: 1.6, facing: 0, height: 1.62 },
  { id: "a-mage", model: "Mage", x: 1.6, z: -3.0, facing: Math.PI / 2, height: 1.58 },
  { id: "a-knight", model: "Knight", x: -1.6, z: 3.0, facing: -Math.PI / 2, height: 1.66 },
  { id: "a-barb", model: "Barbarian", x: 3.2, z: -18.4, facing: -2.2, height: 1.72 },
];
/** villager spots for the minimap */
export const AMBIENT_SPOTS: { x: number; z: number }[] = AMBIENT.map((v) => ({ x: v.x, z: v.z }));
const AMBIENT_OBSTACLES: AABB[] = AMBIENT.map((v) => [v.x - 0.35, v.x + 0.35, v.z - 0.35, v.z + 0.35]);

export const VILLAGE: Zone = {
  id: "village",
  name: "The Village",
  subtitle: "Square & lanes · morning",
  bounds: { minX: -HALF + 0.4, maxX: HALF - 0.4, minZ: -HALF + 0.4, maxZ: HALF - 0.4 },
  obstacles: AMBIENT_OBSTACLES,
  exits: [
    {
      id: "kitchen-door",
      box: [-1.1, 1.1, KITCHEN_Z - 1.2, HALF + 1], // wraps the ring at -0.55
      to: { zone: "kitchen", exit: "arch" },
      spawn: { x: 0, z: KITCHEN_Z - 4.5, heading: Math.PI },
      marker: { x: 0, z: KITCHEN_Z - 0.55, label: "Kitchen" },
    },
  ],
  triggers: [
    {
      id: "tower",
      // the walk-in box wraps the ring (marker at door + 1.0) with margin on every side
      box: [-1.1, 1.1, TOWER_DOOR_Z - 0.3, TOWER_DOOR_Z + 2.1],
      marker: { x: 0, z: TOWER_DOOR_Z + 1.0, label: "The Tower" },
      /** where `/campaign?at=tower` puts you */
      spawn: { x: 0, z: TOWER_DOOR_Z + 3.4, heading: Math.PI },
    },
  ],
  npcs: [
    {
      id: "bram",
      x: 1.9,
      z: 1.6,
      facing: -2.2, // toward the fountain
      height: 1.74,
      approach: { x: 2.8, z: 0.9 },
      scripts: { first: VILLAGE_TALK, again: VILLAGE_AGAIN },
    },
  ],
  spawn: { x: 0, z: KITCHEN_Z - 4.5, heading: Math.PI },
  fog: { color: "#bcd3ea", near: 14, far: 26 },
  camera: { up: 6.5, back: 8 },
  chunks: { size: CHUNK, cols: COLS, rows: ROWS, ring: RING, obstacles: (cx, cz) => chunkData(cx, cz).obstacles },
  Scene: VillageScene,
};

/* ---------- shared assets (one of each, ever) ---------- */
interface Assets {
  grass: THREE.Material;
  cobble: THREE.Material;
  plaster: THREE.Material[];
  roof: THREE.Material;
  wood: THREE.Material;
  darkWood: THREE.Material;
  stone: THREE.Material;
  iron: THREE.Material;
  glass: THREE.Material;
  lanternHead: THREE.Material;
  trunkMat: THREE.Material;
  canopyMat: THREE.Material;
  bushMat: THREE.Material;
  hayMat: THREE.Material;
  water: THREE.Material;
  awning: THREE.Material[];
  glow: THREE.SpriteMaterial;
  ground: THREE.BufferGeometry;
  laneNS: THREE.BufferGeometry;
  laneEW: THREE.BufferGeometry;
  unitBox: THREE.BufferGeometry;
  roofGeo: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  bush: THREE.BufferGeometry;
  hay: THREE.BufferGeometry;
  post: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  fencePost: THREE.BufferGeometry;
  basin: THREE.BufferGeometry;
  waterDisc: THREE.BufferGeometry;
  bowl: THREE.BufferGeometry;
  pillar: THREE.BufferGeometry;
  orb: THREE.BufferGeometry;
  towerBody: THREE.BufferGeometry;
  towerRoof: THREE.BufferGeometry;
  towerBand: THREE.BufferGeometry;
}
let assets: Assets | null = null;
function getAssets(): Assets {
  if (assets) return assets;
  // roof: a triangular prism 1×1×1, scaled per cottage
  const tri = new THREE.Shape();
  tri.moveTo(-0.5, 0);
  tri.lineTo(0.5, 0);
  tri.lineTo(0, 1);
  tri.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
  roofGeo.translate(0, 0, -0.5);
  assets = {
    grass: new THREE.MeshStandardMaterial({ map: grassTexture([CHUNK / 2.5, CHUNK / 2.5]), roughness: 1, color: "#b9d38a" }),
    cobble: new THREE.MeshStandardMaterial({ map: cobbleTexture([2, 5]), roughness: 0.95, color: "#d8d2c6" }),
    plaster: [0, 1, 2].map((i) => new THREE.MeshStandardMaterial({ map: whitewashTexture([2, 1]), roughness: 1, color: ["#ffffff", "#f1e6cf", "#e2dcd6"][i] })),
    roof: new THREE.MeshStandardMaterial({ color: "#7a4a3a", roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: "#8a6540", roughness: 0.9 }),
    darkWood: new THREE.MeshStandardMaterial({ color: "#4a3320", roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTexture([2, 1]), roughness: 1, color: "#d9d9dc" }),
    iron: new THREE.MeshStandardMaterial({ color: "#3a3d46", metalness: 0.5, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: "#8fb3d9", roughness: 0.15, metalness: 0.2 }),
    lanternHead: new THREE.MeshStandardMaterial({ color: "#e8d9b0", roughness: 0.4 }),
    trunkMat: new THREE.MeshStandardMaterial({ color: "#6b4a30", roughness: 1 }),
    canopyMat: new THREE.MeshStandardMaterial({ color: "#4f8a3a", roughness: 1 }),
    bushMat: new THREE.MeshStandardMaterial({ color: "#5c9a44", roughness: 1 }),
    hayMat: new THREE.MeshStandardMaterial({ color: "#d9b85a", roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: "#5aa0d8", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }),
    awning: ["#c8433a", "#3a6fc8", "#d9a53a", "#4a9a5a"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide })),
    glow: new THREE.SpriteMaterial({ map: blobTexture(), color: "#ffffff", transparent: true, depthWrite: false, opacity: 0.35 }),
    ground: new THREE.PlaneGeometry(CHUNK, CHUNK),
    laneNS: new THREE.PlaneGeometry(LANE * 2, CHUNK),
    laneEW: new THREE.PlaneGeometry(CHUNK, LANE * 2),
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    roofGeo,
    trunk: new THREE.CylinderGeometry(0.11, 0.16, 1.3, 6),
    canopy: new THREE.ConeGeometry(1.05, 2.4, 7),
    bush: new THREE.IcosahedronGeometry(0.5, 0),
    hay: new THREE.CylinderGeometry(0.45, 0.45, 0.8, 10),
    post: new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6),
    head: new THREE.BoxGeometry(0.28, 0.32, 0.28),
    fencePost: new THREE.BoxGeometry(0.1, 0.9, 0.1),
    basin: new THREE.CylinderGeometry(FOUNTAIN_R, FOUNTAIN_R + 0.1, 0.55, 18, 1, true),
    waterDisc: new THREE.CircleGeometry(FOUNTAIN_R - 0.08, 18),
    bowl: new THREE.CylinderGeometry(0.75, 0.45, 0.35, 14, 1, true),
    pillar: new THREE.CylinderGeometry(0.22, 0.3, 1.5, 10),
    orb: new THREE.SphereGeometry(0.28, 12, 10),
    towerBody: new THREE.CylinderGeometry(TOWER.r, TOWER.r + 0.25, TOWER.h, 18),
    towerRoof: new THREE.ConeGeometry(TOWER.r + 0.7, 2.6, 18),
    towerBand: new THREE.TorusGeometry(TOWER.r + 0.1, 0.12, 6, 18),
  };
  return assets;
}

/* ---------- pieces ---------- */
function CottageMesh({ c, a, cut }: { c: ChunkData["cottages"][number]; a: Assets; cut: boolean }) {
  const h = 2.5;
  if (cut) {
    // walls down (The Sims): knee-high stubs on the same footprint so the plan stays readable, nothing above
    return (
      <group position={[c.x, 0, c.z]} rotation={[0, c.yaw, 0]}>
        <mesh geometry={a.unitBox} material={a.plaster[Math.floor(c.tone * 3) % 3]} position={[0, 0.25, 0]} scale={[c.w, 0.5, c.d]} receiveShadow />
        <mesh geometry={a.unitBox} material={a.darkWood} position={[0, 0.26, c.d / 2 + 0.03]} scale={[0.9, 0.5, 0.08]} />
      </group>
    );
  }
  return (
    <group position={[c.x, 0, c.z]} rotation={[0, c.yaw, 0]}>
      <mesh geometry={a.unitBox} material={a.plaster[Math.floor(c.tone * 3) % 3]} position={[0, h / 2, 0]} scale={[c.w, h, c.d]} castShadow receiveShadow />
      <mesh geometry={a.roofGeo} material={a.roof} position={[0, h - 0.02, 0]} scale={[c.w + 0.7, 1.5, c.d + 0.6]} castShadow />
      {/* door on the +z face, two windows */}
      <mesh geometry={a.unitBox} material={a.darkWood} position={[0, 0.95, c.d / 2 + 0.03]} scale={[0.9, 1.9, 0.08]} />
      <mesh geometry={a.unitBox} material={a.glass} position={[-c.w * 0.3, 1.5, c.d / 2 + 0.03]} scale={[0.6, 0.6, 0.06]} />
      <mesh geometry={a.unitBox} material={a.glass} position={[c.w * 0.3, 1.5, c.d / 2 + 0.03]} scale={[0.6, 0.6, 0.06]} />
      {/* chimney */}
      <mesh geometry={a.unitBox} material={a.stone} position={[c.w * 0.3, h + 1.1, -c.d * 0.15]} scale={[0.5, 1.2, 0.5]} castShadow />
    </group>
  );
}

function Trees({ trees, a, hidden }: { trees: ChunkData["trees"]; a: Assets; hidden: boolean[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 0.65 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunkRef.current?.setMatrixAt(i, m);
      // a canopy in the camera's way collapses to nothing (scale 0) — the trunk stays as the marker
      const cs = hidden[i] ? 0 : t.s;
      m.compose(new THREE.Vector3(t.x, (1.3 + 1.1) * t.s, t.z), q, new THREE.Vector3(cs, cs, cs));
      canopyRef.current?.setMatrixAt(i, m);
      col.setHSL(0.26 + t.hue * 0.08, 0.45, 0.32 + t.hue * 0.1);
      canopyRef.current?.setColorAt(i, col);
    });
    if (trunkRef.current) trunkRef.current.instanceMatrix.needsUpdate = true;
    if (canopyRef.current) {
      canopyRef.current.instanceMatrix.needsUpdate = true;
      if (canopyRef.current.instanceColor) canopyRef.current.instanceColor.needsUpdate = true;
    }
  }, [trees, hidden]);
  if (trees.length === 0) return null;
  return (
    <>
      <instancedMesh ref={trunkRef} args={[a.trunk, a.trunkMat, trees.length]} castShadow />
      <instancedMesh ref={canopyRef} args={[a.canopy, a.canopyMat, trees.length]} castShadow />
    </>
  );
}

function LanternMesh({ x, z, a }: { x: number; z: number; a: Assets }) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={a.post} material={a.iron} position={[0, 1.2, 0]} castShadow />
      <mesh geometry={a.head} material={a.lanternHead} position={[0, 2.5, 0]} castShadow />
    </group>
  );
}

function FenceMesh({ f, a }: { f: ChunkData["fences"][number]; a: Assets }) {
  const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
  const yaw = Math.atan2(f.x1 - f.x0, f.z1 - f.z0);
  const n = Math.max(2, Math.round(len / 1.1) + 1);
  const posts = Array.from({ length: n }, (_, i) => -len / 2 + (i * len) / (n - 1));
  return (
    <group position={[(f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2]} rotation={[0, yaw, 0]}>
      {posts.map((p, i) => (
        <mesh key={i} geometry={a.fencePost} material={a.wood} position={[0, 0.45, p]} castShadow />
      ))}
      <mesh geometry={a.unitBox} material={a.wood} position={[0, 0.7, 0]} scale={[0.06, 0.08, len]} castShadow />
      <mesh geometry={a.unitBox} material={a.wood} position={[0, 0.35, 0]} scale={[0.06, 0.08, len]} />
    </group>
  );
}

function StallMesh({ s, a, cut }: { s: ChunkData["stalls"][number]; a: Assets; cut: boolean }) {
  return (
    <group position={[s.x, 0, s.z]} rotation={[0, s.yaw, 0]}>
      <mesh geometry={a.unitBox} material={a.wood} position={[0, 0.85, 0]} scale={[2.0, 0.1, 1.2]} castShadow receiveShadow />
      <mesh geometry={a.unitBox} material={a.darkWood} position={[0, 0.42, 0]} scale={[1.8, 0.75, 1.0]} />
      {/* wares */}
      <mesh geometry={a.unitBox} material={a.hayMat} position={[-0.5, 1.02, 0.1]} scale={[0.5, 0.25, 0.5]} />
      <mesh geometry={a.bush} material={a.awning[(s.tone + 1) % 4]} position={[0.45, 1.05, -0.1]} scale={[0.5, 0.35, 0.5]} />
      {!cut && (
        <>
          {[-0.95, 0.95].map((x) =>
            [-0.55, 0.55].map((z) => (
              <mesh key={`${x},${z}`} geometry={a.unitBox} material={a.wood} position={[x, 1.2, z]} scale={[0.08, 2.4, 0.08]} castShadow />
            )),
          )}
          <mesh geometry={a.unitBox} material={a.awning[s.tone % 4]} position={[0, 2.35, 0.1]} rotation={[0.35, 0, 0]} scale={[2.3, 0.05, 1.5]} castShadow />
        </>
      )}
    </group>
  );
}

function Fountain({ a, cut }: { a: Assets; cut: boolean }) {
  return (
    <group>
      <mesh geometry={a.basin} material={a.stone} position={[0, 0.28, 0]} castShadow receiveShadow />
      <mesh geometry={a.waterDisc} material={a.water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.42, 0]} />
      {!cut && (
        <>
          <mesh geometry={a.pillar} material={a.stone} position={[0, 1.15, 0]} castShadow />
          <mesh geometry={a.bowl} material={a.stone} position={[0, 1.95, 0]} castShadow />
          <mesh geometry={a.waterDisc} material={a.water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 2.08, 0]} scale={[0.4, 0.4, 1]} />
          <mesh geometry={a.pillar} material={a.stone} position={[0, 2.5, 0]} scale={[0.5, 0.5, 0.5]} castShadow />
          <mesh geometry={a.orb} material={a.glass} position={[0, 3.05, 0]} castShadow />
        </>
      )}
    </group>
  );
}

function TowerMesh({ a }: { a: Assets }) {
  return (
    <group position={[TOWER.x, 0, TOWER.z]}>
      <mesh geometry={a.towerBody} material={a.stone} position={[0, TOWER.h / 2, 0]} castShadow receiveShadow />
      {[3.2, 6.6].map((y) => (
        <mesh key={y} geometry={a.towerBand} material={a.darkWood} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <mesh geometry={a.towerRoof} material={a.roof} position={[0, TOWER.h + 1.3, 0]} castShadow />
      {/* slit windows on the south face + the door */}
      {[2.4, 5.6, 8.6].map((y) => (
        <mesh key={y} geometry={a.unitBox} material={a.glass} position={[0, y, TOWER.r - 0.02]} scale={[0.35, 0.9, 0.12]} />
      ))}
      <mesh geometry={a.unitBox} material={a.darkWood} position={[0, 1.2, TOWER.r - 0.05]} scale={[1.3, 2.4, 0.16]} />
      <mesh geometry={a.unitBox} material={a.iron} position={[0.35, 1.2, TOWER.r + 0.05]} scale={[0.08, 0.08, 0.06]} />
      {/* banner over the door */}
      <mesh geometry={a.unitBox} material={a.awning[0]} position={[0, 3.4, TOWER.r + 0.1]} scale={[0.9, 1.4, 0.04]} />
    </group>
  );
}

function Chunk({ cx, cz, hidden }: { cx: number; cz: number; hidden: Set<string> }) {
  const a = getAssets();
  const d = useMemo(() => chunkData(cx, cz), [cx, cz]);
  const treeHidden = useMemo(() => d.trees.map((_, i) => hidden.has(treeId(cx, cz, i))), [d, hidden, cx, cz]);
  const mx = d.ox + CHUNK / 2;
  const mz = d.oz + CHUNK / 2;
  return (
    <group>
      <mesh geometry={a.ground} material={d.plaza ? a.cobble : a.grass} rotation={[-Math.PI / 2, 0, 0]} position={[mx, 0, mz]} receiveShadow />
      {!d.plaza && d.laneNS && <mesh geometry={a.laneNS} material={a.cobble} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, mz]} receiveShadow />}
      {!d.plaza && d.laneEW && <mesh geometry={a.laneEW} material={a.cobble} rotation={[-Math.PI / 2, 0, 0]} position={[mx, 0.012, 0]} receiveShadow />}
      {d.plaza && <Fountain a={a} cut={hidden.has(WELL_ID)} />}
      {d.kitchen && <KitchenFacade a={a} />}
      {d.tower && <TowerMesh a={a} />}
      {d.cottages.map((c, i) => (
        <CottageMesh key={i} c={c} a={a} cut={hidden.has(cottageId(cx, cz, i))} />
      ))}
      {d.stalls.map((s, i) => (
        <StallMesh key={i} s={s} a={a} cut={hidden.has(stallId(cx, cz, i))} />
      ))}
      {d.fences.map((f, i) => (
        <FenceMesh key={i} f={f} a={a} />
      ))}
      {d.crates.map((c, i) => (
        <mesh key={i} geometry={a.unitBox} material={a.wood} position={[c.x, c.s / 2, c.z]} rotation={[0, c.yaw, 0]} scale={[c.s, c.s, c.s]} castShadow />
      ))}
      {d.hay.map((h, i) => (
        <mesh key={i} geometry={a.hay} material={a.hayMat} position={[h.x, 0.45, h.z]} rotation={[Math.PI / 2, 0, h.yaw]} castShadow />
      ))}
      <Trees trees={d.trees} a={a} hidden={treeHidden} />
      {d.bushes.map((b, i) => (
        <mesh key={i} geometry={a.bush} material={a.bushMat} position={[b.x, b.s * 0.7, b.z]} scale={[b.s * 1.4, b.s, b.s * 1.4]} castShadow />
      ))}
      {d.lanterns.map((l, i) => (
        <LanternMesh key={i} x={l.x} z={l.z} a={a} />
      ))}
    </group>
  );
}

function KitchenFacade({ a }: { a: Assets }) {
  // the monastery garden wall with the kitchen gate — LOW (2 units): the third-person camera sits 8 back / 6.5 up
  // behind the player, so anything taller than ~2.2 along the south edge would sit between the camera and the player
  return (
    <group position={[0, 0, KITCHEN_Z + 0.8]}>
      <mesh geometry={a.unitBox} material={a.stone} position={[0, 1.0, 0]} scale={[10.4, 2.0, 1.6]} castShadow receiveShadow />
      <mesh geometry={a.unitBox} material={a.stone} position={[0, 2.05, 0]} scale={[10.8, 0.14, 1.9]} castShadow />
      {/* the gate: two posts + a lintel with a hanging lantern; the dark slot is the kitchen door beyond */}
      <mesh geometry={a.unitBox} material={a.darkWood} position={[-1.35, 1.5, -0.6]} scale={[0.36, 3.0, 0.5]} castShadow />
      <mesh geometry={a.unitBox} material={a.darkWood} position={[1.35, 1.5, -0.6]} scale={[0.36, 3.0, 0.5]} castShadow />
      <mesh geometry={a.unitBox} material={a.darkWood} position={[0, 3.05, -0.6]} scale={[3.1, 0.24, 0.5]} castShadow />
      <mesh geometry={a.head} material={a.lanternHead} position={[0, 2.72, -0.6]} />
      <mesh geometry={a.unitBox} material={a.darkWood} position={[0, 0.95, -0.82]} scale={[1.9, 1.9, 0.05]} />
    </group>
  );
}

/** an ambient villager: stands there, idles, faces its heading — no dialogue */
function Villager({ v }: { v: Ambient }) {
  const pos = useRef(new THREE.Vector3(v.x, 0, v.z));
  const gait = useRef<"idle" | "walk" | "run">("idle");
  const heading = useRef(v.facing);
  return <Character model={v.model} posRef={pos} gaitRef={gait} headingRef={heading} height={v.height} />;
}

/** the sun: one shadow-casting directional light that follows the player */
function Sun({ playerPos }: { playerPos: RefObject<THREE.Vector3> }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const p = playerPos.current;
    if (!p || !light.current) return;
    light.current.position.set(p.x + 10, 18, p.z + 7);
    target.position.set(p.x, 0, p.z);
    target.updateMatrixWorld();
  });
  return (
    <>
      <directionalLight ref={light} target={target} color="#fff1d6" intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-near={1} shadow-camera-far={50} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-bias={-0.0004} />
      <primitive object={target} />
    </>
  );
}

function VillageScene({ playerPos }: { playerPos: RefObject<THREE.Vector3> }) {
  const p0 = playerPos.current ?? new THREE.Vector3();
  const [centre, setCentre] = useState(() => chunkOf(p0.x, p0.z));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const camera = useThree((st) => st.camera);
  const eye = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const p = playerPos.current;
    if (!p) return;
    const c = chunkOf(p.x, p.z);
    if (c.cx !== centre.cx || c.cz !== centre.cz) setCentre(c);
    // cutaway: whatever stands between the player's head and the camera gets cut down / hidden
    eye.set(p.x, 1.2, p.z);
    const ids = occludedIds(eye, camera.position, occludersNear(p.x, p.z));
    if (!sameIds(hidden, ids)) {
      setHidden(new Set(ids));
      (window as unknown as { __villageHidden?: string[] }).__villageHidden = ids; // probe handle
    }
  });
  const ring = useMemo(() => ringKeys(centre.cx, centre.cz, RING), [centre]);
  useEffect(() => {
    villageStats.loaded = ring.length;
    return () => {
      villageStats.loaded = 0;
    };
  }, [ring]);
  return (
    <>
      <ambientLight intensity={0.55} color="#dbe6ff" />
      <hemisphereLight intensity={1.1} color="#bfd8f7" groundColor="#7d8a55" />
      <Sun playerPos={playerPos} />
      {ring.map((k) => (
        <Chunk key={chunkKey(k.cx, k.cz)} cx={k.cx} cz={k.cz} hidden={hidden} />
      ))}
      <Suspense fallback={null}>
        {AMBIENT.map((v) => (
          <Villager key={v.id} v={v} />
        ))}
      </Suspense>
    </>
  );
}
