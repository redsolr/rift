"use client";
import { RefObject, Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import PerfProbe from "@/components/perf/PerfProbe";
import Character from "./Character";
import { SPEAKERS, SpeakerId } from "./script";
import { useCampaign } from "./store";
import { ZONES } from "./world";
import { villageStats } from "./world/village";
import type { AABB, Zone, ZoneNpc } from "./world/types";
import { inBox } from "./world/types";

/**
 * Campaign — the walkable world. FE Three Houses monastery feel: third-person camera behind the player at a fixed
 * pitch, WASD / arrows to walk (Shift = run; click or tap the floor to walk there — runs when far), NPCs prompt "Talk"
 * when close, E / Enter / clicking one opens the dialogue; during a conversation the camera eases in on the pair.
 * Zone-agnostic: everything (bounds, colliders, exits, NPCs, fog, camera offset, the meshes) comes from `ZONES[zone]`.
 * Walking into an exit box calls `travel` — the store fades, swaps the zone, and bumps `arrivalSeq`, on which the
 * player is re-placed at the arrival spawn. Player position is a ref updated per frame — never React state.
 */
const WALK = 2.6;
const RUN = 5.2;
const TALK_DIST = 1.9;
const RADIUS = 0.32;

const keys = new Set<string>();
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
}

/** colliders that apply around a position: the zone's static boxes + the 3×3 chunk ring's boxes */
function obstaclesAround(z: Zone, x: number, zz: number): AABB[] {
  if (!z.chunks) return z.obstacles;
  const { size, cols, rows, obstacles } = z.chunks;
  const half = (cols * size) / 2;
  const cx = Math.max(0, Math.min(cols - 1, Math.floor((x + half) / size)));
  const cz = Math.max(0, Math.min(rows - 1, Math.floor((zz + half) / size)));
  const out = [...z.obstacles];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const a = cx + dx;
      const b = cz + dz;
      if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
      out.push(...obstacles(a, b));
    }
  return out;
}

function collide(p: THREE.Vector3, z: Zone): void {
  const b = z.bounds;
  p.x = Math.max(b.minX + RADIUS, Math.min(b.maxX - RADIUS, p.x));
  p.z = Math.max(b.minZ + RADIUS, Math.min(b.maxZ - RADIUS, p.z));
  for (const [x0, x1, z0, z1] of obstaclesAround(z, p.x, p.z)) {
    if (p.x > x0 - RADIUS && p.x < x1 + RADIUS && p.z > z0 - RADIUS && p.z < z1 + RADIUS) {
      // push out along the axis of least penetration
      const dl = p.x - (x0 - RADIUS);
      const dr = x1 + RADIUS - p.x;
      const dt = p.z - (z0 - RADIUS);
      const db = z1 + RADIUS - p.z;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) p.x = x0 - RADIUS;
      else if (m === dr) p.x = x1 + RADIUS;
      else if (m === dt) p.z = z0 - RADIUS;
      else p.z = z1 + RADIUS;
    }
  }
  // the NPCs themselves
  for (const n of z.npcs) {
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    if (d < RADIUS * 2.2 && d > 1e-4) {
      const k = (RADIUS * 2.2) / d;
      p.x = n.x + (p.x - n.x) * k;
      p.z = n.z + (p.z - n.z) * k;
    }
  }
}

/** does the segment a→b pass through the box [x0,x1]×[0,h]×[z0,z1]? (slab test) */
function segmentHitsBox(a: THREE.Vector3, b: THREE.Vector3, [x0, x1, z0, z1, h]: [number, number, number, number, number]): boolean {
  let tmin = 0;
  let tmax = 1;
  const axes: [number, number, number, number][] = [
    [a.x, b.x - a.x, x0, x1],
    [a.y, b.y - a.y, 0, h],
    [a.z, b.z - a.z, z0, z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** camera offsets tried in order until the line of sight to the player clears the zone occluders — steeper each step */
const CAM_STEPS: [number, number][] = [
  [1, 1],
  [1.25, 0.72],
  [1.5, 0.45],
  [1.75, 0.2],
  [2.0, 0.02],
];

/** an NPC standing in the zone: faces its idle heading, turns to the player only while talking to them */
function Npc({ npc, playerPos, walkTo }: { npc: ZoneNpc; playerPos: RefObject<THREE.Vector3>; walkTo: (x: number, z: number) => void }) {
  const posRef = useRef(new THREE.Vector3(npc.x, 0, npc.z));
  const gait = useRef<"idle" | "walk" | "run">("idle");
  const heading = useRef(npc.facing);
  const talk = useCampaign((s) => s.talk);
  useFrame(() => {
    const st = useCampaign.getState();
    const p = playerPos.current;
    const talkingToMe = !!st.dialogue && st.nearNpc === npc.id;
    heading.current = talkingToMe && p ? Math.atan2(p.x - npc.x, p.z - npc.z) : npc.facing;
  });
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        if (useCampaign.getState().nearNpc === npc.id) talk();
        else walkTo(npc.approach.x, npc.approach.z);
      }}
    >
      <Character speaker={SPEAKERS[npc.id]} posRef={posRef} gaitRef={gait} headingRef={heading} height={npc.height} />
    </group>
  );
}

/** Persona-style exit marker: a gold ring on the floor with a bobbing arrow — walk in to travel */
function ExitMarker({ x, z }: { x: number; z: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const arrow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring.current) (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.25 * Math.sin(t * 3);
    if (arrow.current) arrow.current.position.y = 1.35 + 0.12 * Math.sin(t * 3);
  });
  return (
    <group position={[x, 0, z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[0.45, 0.62, 32]} />
        <meshBasicMaterial color="#ffd54f" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <mesh ref={arrow} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.16, 0.36, 4]} />
        <meshBasicMaterial color="#ffd54f" />
      </mesh>
    </group>
  );
}

function World() {
  const zoneId = useCampaign((s) => s.zone);
  const arrivalSeq = useCampaign((s) => s.arrivalSeq);
  const zone = ZONES[zoneId];
  const playerPos = useRef(new THREE.Vector3(zone.spawn.x, 0, zone.spawn.z));
  const gait = useRef<"idle" | "walk" | "run">("idle");
  const heading = useRef(zone.spawn.heading);
  const target = useRef<THREE.Vector3 | null>(null);
  const camera = useThree((s) => s.camera);
  const camLook = useRef(new THREE.Vector3(zone.spawn.x, 1, zone.spawn.z));
  const setNearNpc = useCampaign((s) => s.setNearNpc);
  const talk = useCampaign((s) => s.talk);
  const travel = useCampaign((s) => s.travel);

  // probe handle: live player position (read-only)
  useEffect(() => {
    (window as unknown as { __campaignPos?: THREE.Vector3 }).__campaignPos = playerPos.current;
  }, []);
  // arrival: place the player at the spawn, snap the camera behind them
  useEffect(() => {
    const st = useCampaign.getState();
    const z = ZONES[st.zone];
    const a = st.arrival;
    playerPos.current.set(a.x, 0, a.z);
    heading.current = a.heading;
    target.current = null;
    gait.current = "idle";
    camLook.current.set(a.x, 0.9, a.z);
    camera.position.set(a.x, z.camera.up, a.z + z.camera.back);
    camera.lookAt(camLook.current);
  }, [arrivalSeq, camera]);
  // E / Enter to talk when close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") && useCampaign.getState().nearNpc && !useCampaign.getState().dialogue) {
        e.preventDefault();
        talk();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [talk]);

  useFrame((_, dt) => {
    const st = useCampaign.getState();
    const z = ZONES[st.zone];
    const p = playerPos.current;
    const frozen = !!st.dialogue || !!st.transition;
    // --- movement
    let vx = 0;
    let vz = 0;
    if (!frozen) {
      if (keys.has("w") || keys.has("arrowup")) vz -= 1;
      if (keys.has("s") || keys.has("arrowdown")) vz += 1;
      if (keys.has("a") || keys.has("arrowleft")) vx -= 1;
      if (keys.has("d") || keys.has("arrowright")) vx += 1;
      if (vx || vz) target.current = null;
      else if (target.current) {
        const dx = target.current.x - p.x;
        const dz = target.current.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) target.current = null;
        else {
          vx = dx / d;
          vz = dz / d;
        }
      }
    }
    const len = Math.hypot(vx, vz);
    const running = keys.has("shift") || (!!target.current && target.current.distanceTo(p) > 3.5);
    gait.current = len > 0 ? (running ? "run" : "walk") : "idle";
    if (len > 0) {
      const step = Math.min(dt, 0.05) * (running ? RUN : WALK);
      const before = p.clone();
      p.x += (vx / len) * step;
      p.z += (vz / len) * step;
      collide(p, z);
      heading.current = Math.atan2(vx, vz);
      if (target.current && p.distanceTo(before) < 1e-4) target.current = null; // stuck against something
      // --- exits: step into a marker box → travel
      if (!st.transition) {
        for (const ex of z.exits) {
          if (inBox(p.x, p.z, ex.box)) {
            travel(ex.id);
            break;
          }
        }
      }
    }
    // --- proximity to NPCs
    let near: SpeakerId | null = null;
    let best = TALK_DIST;
    for (const n of z.npcs) {
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      if (d < best) {
        best = d;
        near = n.id;
      }
    }
    if (!st.dialogue) setNearNpc(near);
    // --- camera: behind + above the player; during dialogue ease onto the pair, closer and lower
    const look = camLook.current;
    let want: THREE.Vector3;
    let lookAt: THREE.Vector3;
    const partner = st.dialogue && st.nearNpc ? z.npcs.find((n) => n.id === st.nearNpc) : null;
    if (partner) {
      const mx = (p.x + partner.x) / 2;
      const mz = (p.z + partner.z) / 2;
      lookAt = new THREE.Vector3(mx, 1.15, mz);
      want = new THREE.Vector3(mx + 0.6, 1.9, mz + 3.6);
    } else {
      lookAt = new THREE.Vector3(p.x, 0.9, p.z);
      want = new THREE.Vector3(p.x, z.camera.up, p.z + z.camera.back);
      // occlusion: if a cottage / the well sits between the camera and the player, steepen the pitch until it clears
      const occ = z.occluders?.(p.x, p.z);
      if (occ && occ.length) {
        const eye = new THREE.Vector3(p.x, 1.2, p.z);
        for (const [ku, kb] of CAM_STEPS) {
          want.set(p.x, z.camera.up * ku, p.z + z.camera.back * kb);
          if (!occ.some((box) => segmentHitsBox(eye, want, box))) break;
        }
      }
    }
    const k = 1 - Math.exp(-dt * (partner ? 3.5 : 6));
    camera.position.lerp(want, k);
    look.lerp(lookAt, k);
    camera.lookAt(look);
  });

  const onFloorClick = (e: ThreeEvent<MouseEvent>) => {
    const st = useCampaign.getState();
    if (st.dialogue || st.transition) return;
    e.stopPropagation();
    target.current = new THREE.Vector3(e.point.x, 0, e.point.z);
  };
  const walkTo = (x: number, z: number) => {
    target.current = new THREE.Vector3(x, 0, z);
  };
  const b = zone.bounds;
  const Scene = zone.Scene;
  return (
    <>
      {/* fog + background per zone */}
      <color key={`bg-${zone.id}`} attach="background" args={[zone.fog.color]} />
      <fog key={`fog-${zone.id}`} attach="fog" args={[zone.fog.color, zone.fog.near, zone.fog.far]} />
      <PerfProbe scene={`zone · ${zone.name}`} extra={() => ({ zone: zone.id, chunks: zone.chunks ? `${villageStats.loaded} / ${zone.chunks.cols * zone.chunks.rows}` : "—", npcs: zone.npcs.length })} />
      <Scene key={zone.id} playerPos={playerPos} />
      {/* click-to-walk catcher over the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(b.minX + b.maxX) / 2, 0.002, (b.minZ + b.maxZ) / 2]} onClick={onFloorClick} visible={false}>
        <planeGeometry args={[b.maxX - b.minX, b.maxZ - b.minZ]} />
        <meshBasicMaterial />
      </mesh>
      {zone.exits.map((ex) => (
        <ExitMarker key={ex.id} x={ex.marker.x} z={ex.marker.z} />
      ))}
      <Suspense fallback={null}>
        <Character speaker={SPEAKERS.rook} posRef={playerPos} gaitRef={gait} headingRef={heading} />
        {zone.npcs.map((n) => (
          <Npc key={`${zone.id}:${n.id}`} npc={n} playerPos={playerPos} walkTo={walkTo} />
        ))}
      </Suspense>
    </>
  );
}

export default function CampaignScene() {
  const camPos = useMemo<[number, number, number]>(() => {
    const st = useCampaign.getState();
    const z = ZONES[st.zone];
    return [st.arrival.x, z.camera.up, st.arrival.z + z.camera.back];
  }, []);
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: camPos, fov: 38, near: 0.1, far: 60 }} style={{ touchAction: "none" }}>
      <World />
    </Canvas>
  );
}
