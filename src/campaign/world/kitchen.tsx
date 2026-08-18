"use client";
import Room, { OBSTACLES, ROOM } from "../Room";
import { KITCHEN_AGAIN, KITCHEN_TALK } from "../script";
import type { Zone } from "./types";

/** Zone 1 — the monastery kitchen (the original one room). Its stone arch is the door to the village. */
export const KITCHEN: Zone = {
  id: "kitchen",
  name: "The Kitchen",
  subtitle: "Monastery · the night before the square",
  bounds: { minX: -ROOM.w / 2, maxX: ROOM.w / 2, minZ: -ROOM.d / 2, maxZ: ROOM.d / 2 },
  obstacles: OBSTACLES,
  exits: [
    {
      id: "arch",
      box: [2.4, 4.0, -ROOM.d / 2 - 1, -ROOM.d / 2 + 1.1], // wraps the ring at +0.6
      to: { zone: "village", exit: "kitchen-door" },
      spawn: { x: 3.2, z: -ROOM.d / 2 + 1.3, heading: 0 },
      marker: { x: 3.2, z: -ROOM.d / 2 + 0.6, label: "Village" },
    },
  ],
  npcs: [
    {
      id: "mina",
      x: -1.4,
      z: 1.15,
      facing: 0.55, // toward the hearth side of the room
      height: 1.56,
      approach: { x: -0.2, z: 1.75 },
      scripts: { first: KITCHEN_TALK, again: KITCHEN_AGAIN },
    },
  ],
  spawn: { x: 2.6, z: 3.4, heading: 0 },
  fog: { color: "#05060a", near: 14, far: 26 },
  camera: { up: 4.6, back: 5.6 },
  Scene: KitchenScene,
};

function KitchenScene() {
  return (
    <>
      <ambientLight intensity={0.55} color="#8a92b0" />
      <hemisphereLight intensity={0.9} color="#5a6a8a" groundColor="#3a2a1a" />
      {/* warm overhead — a chandelier the camera never sees */}
      <pointLight position={[0, 3.6, 0.5]} color="#ffd9a0" intensity={38} distance={16} decay={2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      <Room />
    </>
  );
}
