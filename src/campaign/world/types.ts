import type { ComponentType, RefObject } from "react";
import type * as THREE from "three";
import type { Line, SpeakerId } from "../script";

/**
 * The campaign world = a registry of ZONES joined by EXITS (Persona 5 / Three Houses monastery shape: Leblanc, the
 * Yongen street, the station square — each a small self-contained map; walking into an exit marker fades to black,
 * shows the area title, and mounts the next zone). Only ONE zone's meshes exist at a time — that is the whole
 * load-lightness trick for interiors. A big outdoor zone additionally streams itself in CHUNKS (see village.tsx).
 * Everything here is data; the scene component is zone-agnostic and reads it.
 */
export type ZoneId = "kitchen" | "village";

/** axis-aligned box on the floor: [minX, maxX, minZ, maxZ] */
export type AABB = [number, number, number, number];

export interface Spawn {
  x: number;
  z: number;
  /** model heading (radians around Y, atan2(dx, dz)); 0 = facing +z (toward the default camera) */
  heading: number;
}

export interface Exit {
  id: string;
  /** stepping into this box triggers the transition */
  box: AABB;
  /** where the exit leads; `exit` names the exit on the other side whose `spawn` we appear at */
  to: { zone: ZoneId; exit: string };
  /** where a player ARRIVING through this exit stands (just outside the box, facing into the zone) */
  spawn: Spawn;
  /** floor-marker position + label ("→ Village") */
  marker: { x: number; z: number; label: string };
}

export interface ZoneNpc {
  id: SpeakerId;
  x: number;
  z: number;
  /** idle heading */
  facing: number;
  height?: number;
  /** where clicking the NPC from afar walks you to */
  approach: { x: number; z: number };
  scripts: { first: Line[]; again: Line[] };
}

export interface ChunkSpec {
  /** chunk edge length in world units */
  size: number;
  /** grid extent: chunk indices run 0..cols-1 / 0..rows-1, world origin = centre of the grid */
  cols: number;
  rows: number;
  /** how many chunks around the player's chunk stay mounted (1 = 3×3 ring) */
  ring: number;
  /** colliders of one chunk (deterministic, cached by the caller) */
  obstacles: (cx: number, cz: number) => AABB[];
}

export interface Zone {
  id: ZoneId;
  /** area title card */
  name: string;
  subtitle: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** static colliders (whole-zone) */
  obstacles: AABB[];
  exits: Exit[];
  npcs: ZoneNpc[];
  /** where a fresh visit (no exit) starts */
  spawn: Spawn;
  /** scene fog + background */
  fog: { color: string; near: number; far: number };
  /** camera offset behind + above the player */
  camera: { up: number; back: number };
  /** streamed outdoor zone: chunk grid (colliders come per chunk); undefined = one static room */
  chunks?: ChunkSpec;
  /** tall solids near (x, z) that could sit between the camera and the player: [minX, maxX, minZ, maxZ, height] —
   *  the camera rig steepens its pitch until the line of sight clears them */
  occluders?: (x: number, z: number) => [number, number, number, number, number][];
  /** the meshes; gets the live player position (chunk streaming, moon shadow follow) */
  Scene: ComponentType<{ playerPos: RefObject<THREE.Vector3> }>;
}

export const inBox = (x: number, z: number, [x0, x1, z0, z1]: AABB): boolean => x >= x0 && x <= x1 && z >= z0 && z <= z1;
