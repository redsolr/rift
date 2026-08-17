"use client";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Room, { OBSTACLES, ROOM } from "./Room";
import Actor from "./Actor";
import { SPEAKERS } from "./script";
import { useCampaign } from "./store";

/**
 * Campaign prototype — the walkable room. FE Three Houses monastery feel: third-person camera behind the player at a
 * fixed pitch, WASD / arrows to walk (click or tap the floor to walk there), the NPC prompts "Talk" when close,
 * E / Enter / clicking her opens the dialogue; during a conversation the camera eases in on the pair.
 * Player position is a ref updated per frame — never React state.
 */
const NPC_POS = new THREE.Vector3(-1.4, 0, 1.15); // by the table, facing the door
const PLAYER_START = new THREE.Vector3(2.6, 0, 3.4);
const SPEED = 3.4;
const TALK_DIST = 1.9;
const RADIUS = 0.32;

const keys = new Set<string>();
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
}

function collide(p: THREE.Vector3): void {
  const hx = ROOM.w / 2 - RADIUS;
  const hz = ROOM.d / 2 - RADIUS;
  p.x = Math.max(-hx, Math.min(hx, p.x));
  p.z = Math.max(-hz, Math.min(hz, p.z));
  for (const [x0, x1, z0, z1] of OBSTACLES) {
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
  // the NPC herself
  const d = Math.hypot(p.x - NPC_POS.x, p.z - NPC_POS.z);
  if (d < RADIUS * 2.2 && d > 1e-4) {
    const k = (RADIUS * 2.2) / d;
    p.x = NPC_POS.x + (p.x - NPC_POS.x) * k;
    p.z = NPC_POS.z + (p.z - NPC_POS.z) * k;
  }
}

function World() {
  const playerPos = useRef(PLAYER_START.clone());
  const npcPos = useRef(NPC_POS.clone());
  const moving = useRef(false);
  const facing = useRef(-1);
  const npcFacing = useRef(1);
  const target = useRef<THREE.Vector3 | null>(null);
  const camera = useThree((s) => s.camera);
  const camLook = useRef(new THREE.Vector3(PLAYER_START.x, 1, PLAYER_START.z));
  const setNearNpc = useCampaign((s) => s.setNearNpc);
  const talk = useCampaign((s) => s.talk);

  // probe handle: live player position (read-only)
  useEffect(() => {
    (window as unknown as { __campaignPos?: THREE.Vector3 }).__campaignPos = playerPos.current;
  }, []);
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
    const p = playerPos.current;
    const inDialogue = !!st.dialogue;
    // --- movement
    let vx = 0;
    let vz = 0;
    if (!inDialogue) {
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
    moving.current = len > 0;
    if (len > 0) {
      const step = Math.min(dt, 0.05) * SPEED;
      const before = p.clone();
      p.x += (vx / len) * step;
      p.z += (vz / len) * step;
      collide(p);
      if (Math.abs(p.x - before.x) > 1e-4) facing.current = p.x > before.x ? 1 : -1;
      if (target.current && p.distanceTo(before) < 1e-4) target.current = null; // stuck against something
    }
    // --- NPC faces the player
    npcFacing.current = p.x > npcPos.current.x ? 1 : -1;
    // --- proximity
    setNearNpc(p.distanceTo(npcPos.current) < TALK_DIST);
    // --- camera: behind + above the player; during dialogue ease onto the pair, closer and lower
    const look = camLook.current;
    let want: THREE.Vector3;
    let lookAt: THREE.Vector3;
    if (inDialogue) {
      const mid = p.clone().add(npcPos.current).multiplyScalar(0.5);
      lookAt = new THREE.Vector3(mid.x, 1.15, mid.z);
      want = new THREE.Vector3(mid.x + 0.6, 1.9, mid.z + 3.6);
    } else {
      lookAt = new THREE.Vector3(p.x, 0.9, p.z);
      want = new THREE.Vector3(p.x, 4.6, p.z + 5.6);
    }
    const k = 1 - Math.exp(-dt * (inDialogue ? 3.5 : 6));
    camera.position.lerp(want, k);
    look.lerp(lookAt, k);
    camera.lookAt(look);
  });

  const onFloorClick = (e: ThreeEvent<MouseEvent>) => {
    if (useCampaign.getState().dialogue) return;
    e.stopPropagation();
    target.current = new THREE.Vector3(e.point.x, 0, e.point.z);
  };

  return (
    <>
      <Room />
      {/* click-to-walk catcher over the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} onClick={onFloorClick} visible={false}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshBasicMaterial />
      </mesh>
      <Actor speaker={SPEAKERS.rook} posRef={playerPos} movingRef={moving} facingRef={facing} />
      <group
        onClick={(e) => {
          e.stopPropagation();
          if (useCampaign.getState().nearNpc) talk();
          else target.current = new THREE.Vector3(NPC_POS.x + 1.2, 0, NPC_POS.z + 0.6);
        }}
      >
        <Actor speaker={SPEAKERS.mina} posRef={npcPos} facingRef={npcFacing} scale={0.96} />
      </group>
    </>
  );
}

export default function CampaignScene() {
  const camPos = useMemo<[number, number, number]>(() => [PLAYER_START.x, 4.6, PLAYER_START.z + 5.6], []);
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: camPos, fov: 38, near: 0.1, far: 60 }} style={{ touchAction: "none" }}>
      <color attach="background" args={["#05060a"]} />
      <fog attach="fog" args={["#05060a", 14, 26]} />
      <ambientLight intensity={0.55} color="#8a92b0" />
      <hemisphereLight intensity={0.9} color="#5a6a8a" groundColor="#3a2a1a" />
      {/* warm overhead — a chandelier the camera never sees */}
      <pointLight position={[0, 3.6, 0.5]} color="#ffd9a0" intensity={38} distance={16} decay={2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      <World />
    </Canvas>
  );
}
