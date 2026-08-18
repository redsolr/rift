"use client";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { blobTexture, cobbleTexture, grassTexture, stoneTexture, whitewashTexture } from "../roomTextures";
import { VILLAGE_AGAIN, VILLAGE_TALK } from "../script";
import type { Zone } from "./types";
import { useThree } from "@react-three/fiber";
import { CHUNK, COLS, HALF, KITCHEN_Z, LANE, ROWS, ChunkData, WELL_ID, chunkData, chunkKey, chunkOf, cottageId, occludersNear, ringKeys, treeId } from "./villageChunks";
import { occludedIds, sameIds } from "./occlusion";

/**
 * Zone 2 — the village at night, STREAMED: only the 5×5 chunk ring around the player is mounted (`VillageScene` watches
 * the player's chunk each frame and swaps React state only when it changes); fog ends before the ring does, so chunks
 * appear and vanish out of sight. Every chunk draws from ONE set of shared geometries + materials (created once,
 * module-level, lazily) — cottages, roofs, trees (InstancedMesh per chunk), lantern posts, the well — so memory stays
 * flat no matter how many chunks the village grows to. A moon directional light follows the player so its shadow
 * frustum stays small. **Sims-style cutaway**: each frame the eye→camera segment is tested against the nearby
 * occluders (`occludersNear`); a cottage in the way renders as its walls-down footprint (0.5-unit stubs, no roof), a
 * tree in the way loses its canopy, the well loses its roof — the camera angle NEVER changes for occlusion.
 */
const RING = 2;

/** live counters for the profiler */
export const villageStats = { loaded: 0 };

export const VILLAGE: Zone = {
  id: "village",
  name: "The Village",
  subtitle: "Square & lanes · night",
  bounds: { minX: -HALF + 0.4, maxX: HALF - 0.4, minZ: -HALF + 0.4, maxZ: HALF - 0.4 },
  obstacles: [],
  exits: [
    {
      id: "kitchen-door",
      box: [-1.1, 1.1, KITCHEN_Z + 0.55, HALF + 1],
      to: { zone: "kitchen", exit: "arch" },
      spawn: { x: 0, z: KITCHEN_Z - 4.5, heading: Math.PI },
      marker: { x: 0, z: KITCHEN_Z - 0.55, label: "Kitchen" },
    },
  ],
  npcs: [
    {
      id: "bram",
      x: 1.9,
      z: 1.6,
      facing: -2.2, // toward the well
      height: 1.7,
      approach: { x: 3.4, z: 2.6 },
      scripts: { first: VILLAGE_TALK, again: VILLAGE_AGAIN },
    },
  ],
  spawn: { x: 0, z: KITCHEN_Z - 4.5, heading: Math.PI },
  fog: { color: "#0b1020", near: 14, far: 24 },
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
  window: THREE.Material;
  lanternGlow: THREE.Material;
  trunkMat: THREE.Material;
  canopyMat: THREE.Material;
  bushMat: THREE.Material;
  glow: THREE.SpriteMaterial;
  ground: THREE.BufferGeometry;
  laneNS: THREE.BufferGeometry;
  laneEW: THREE.BufferGeometry;
  unitBox: THREE.BufferGeometry;
  roofGeo: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  bush: THREE.BufferGeometry;
  post: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  wellRing: THREE.BufferGeometry;
  wellRoof: THREE.BufferGeometry;
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
    grass: new THREE.MeshStandardMaterial({ map: grassTexture([CHUNK / 2.5, CHUNK / 2.5]), roughness: 1 }),
    cobble: new THREE.MeshStandardMaterial({ map: cobbleTexture([2, 5]), roughness: 0.95 }),
    plaster: [0, 1, 2].map((i) => new THREE.MeshStandardMaterial({ map: whitewashTexture([2, 1]), roughness: 1, color: ["#ffffff", "#e8dcc4", "#d8d0c8"][i] })),
    roof: new THREE.MeshStandardMaterial({ color: "#3a2a2a", roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: "#5a3f28", roughness: 0.9 }),
    darkWood: new THREE.MeshStandardMaterial({ color: "#2e2016", roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTexture([2, 1]), roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ color: "#23252c", metalness: 0.5, roughness: 0.6 }),
    window: new THREE.MeshStandardMaterial({ color: "#ffb75a", emissive: "#ff9a2e", emissiveIntensity: 1.6 }),
    lanternGlow: new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: "#ffb040", emissiveIntensity: 2.2 }),
    trunkMat: new THREE.MeshStandardMaterial({ color: "#3b2a1c", roughness: 1 }),
    canopyMat: new THREE.MeshStandardMaterial({ color: "#1f3a22", roughness: 1 }),
    bushMat: new THREE.MeshStandardMaterial({ color: "#233d24", roughness: 1 }),
    glow: new THREE.SpriteMaterial({ map: blobTexture(), color: "#ffb040", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 }),
    ground: new THREE.PlaneGeometry(CHUNK, CHUNK),
    laneNS: new THREE.PlaneGeometry(LANE * 2, CHUNK),
    laneEW: new THREE.PlaneGeometry(CHUNK, LANE * 2),
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    roofGeo,
    trunk: new THREE.CylinderGeometry(0.11, 0.16, 1.3, 6),
    canopy: new THREE.ConeGeometry(1.05, 2.4, 7),
    bush: new THREE.IcosahedronGeometry(0.5, 0),
    post: new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6),
    head: new THREE.BoxGeometry(0.28, 0.32, 0.28),
    wellRing: new THREE.CylinderGeometry(0.95, 1.0, 0.8, 14, 1, true),
    wellRoof: new THREE.ConeGeometry(1.4, 0.7, 4),
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
      <mesh geometry={a.unitBox} material={a.window} position={[-c.w * 0.3, 1.5, c.d / 2 + 0.03]} scale={[0.6, 0.6, 0.06]} />
      <mesh geometry={a.unitBox} material={a.window} position={[c.w * 0.3, 1.5, c.d / 2 + 0.03]} scale={[0.6, 0.6, 0.06]} />
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
      col.setHSL(0.3 + t.hue * 0.08, 0.35, 0.16 + t.hue * 0.08);
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
      <mesh geometry={a.head} material={a.lanternGlow} position={[0, 2.5, 0]} />
      <sprite material={a.glow} position={[0, 2.5, 0]} scale={[3.2, 3.2, 1]} />
    </group>
  );
}

function Well({ a, cut }: { a: Assets; cut: boolean }) {
  return (
    <group>
      <mesh geometry={a.wellRing} material={a.stone} position={[0, 0.4, 0]} castShadow receiveShadow />
      {!cut && (
        <>
          <mesh geometry={a.unitBox} material={a.wood} position={[-0.9, 1.3, 0]} scale={[0.14, 1.9, 0.14]} castShadow />
          <mesh geometry={a.unitBox} material={a.wood} position={[0.9, 1.3, 0]} scale={[0.14, 1.9, 0.14]} castShadow />
          <mesh geometry={a.unitBox} material={a.wood} position={[0, 2.25, 0]} scale={[2.0, 0.1, 0.1]} />
          <mesh geometry={a.wellRoof} material={a.roof} position={[0, 2.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow />
          <mesh geometry={a.unitBox} material={a.iron} position={[0, 1.4, 0]} scale={[0.32, 0.36, 0.32]} />
        </>
      )}
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
      {/* the gate: two posts + a lintel with a hanging lantern; the warm slot is the kitchen door beyond */}
      <mesh geometry={a.unitBox} material={a.darkWood} position={[-1.35, 1.5, -0.6]} scale={[0.36, 3.0, 0.5]} castShadow />
      <mesh geometry={a.unitBox} material={a.darkWood} position={[1.35, 1.5, -0.6]} scale={[0.36, 3.0, 0.5]} castShadow />
      <mesh geometry={a.unitBox} material={a.darkWood} position={[0, 3.05, -0.6]} scale={[3.1, 0.24, 0.5]} castShadow />
      <mesh geometry={a.head} material={a.lanternGlow} position={[0, 2.72, -0.6]} />
      <sprite material={a.glow} position={[0, 2.72, -0.6]} scale={[2.4, 2.4, 1]} />
      <mesh geometry={a.unitBox} material={a.window} position={[0, 0.95, -0.82]} scale={[1.9, 1.9, 0.05]} />
      <pointLight position={[0, 1.7, -1.8]} color="#ffb75a" intensity={16} distance={9} decay={2} />
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
      {d.plaza && <Well a={a} cut={hidden.has(WELL_ID)} />}
      {d.kitchen && <KitchenFacade a={a} />}
      {d.cottages.map((c, i) => (
        <CottageMesh key={i} c={c} a={a} cut={hidden.has(cottageId(cx, cz, i))} />
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

/** the moon: one shadow-casting directional light that follows the player */
function Moon({ playerPos }: { playerPos: RefObject<THREE.Vector3> }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const p = playerPos.current;
    if (!p || !light.current) return;
    light.current.position.set(p.x + 8, 16, p.z + 6);
    target.position.set(p.x, 0, p.z);
    target.updateMatrixWorld();
  });
  return (
    <>
      <directionalLight ref={light} target={target} color="#8fa6ff" intensity={2.8} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-near={1} shadow-camera-far={40} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-bias={-0.0006} />
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
    if (!sameIds(hidden, ids)) setHidden(new Set(ids));
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
      <ambientLight intensity={0.7} color="#7a86b8" />
      <hemisphereLight intensity={1.3} color="#3d4a78" groundColor="#1a1a12" />
      <Moon playerPos={playerPos} />
      {ring.map((k) => (
        <Chunk key={chunkKey(k.cx, k.cz)} cx={k.cx} cz={k.cz} hidden={hidden} />
      ))}
    </>
  );
}

