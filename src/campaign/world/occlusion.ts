import type * as THREE from "three";

/**
 * Sims-style cutaway support: a zone lists tall solids near the player as OCCLUDERS (id + floor box + height); each
 * frame the scene tests the eye→camera segment against them and HIDES / cuts down whatever is in the way. The camera
 * angle never changes for occlusion — the world gets out of the way instead.
 */
export interface Occluder {
  id: string;
  /** [minX, maxX, minZ, maxZ, height] */
  box: [number, number, number, number, number];
}

/** does the segment a→b pass through the box [x0,x1]×[0,h]×[z0,z1]? (slab test) */
export function segmentHitsBox(a: THREE.Vector3, b: THREE.Vector3, [x0, x1, z0, z1, h]: [number, number, number, number, number]): boolean {
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

/** ids of the occluders the eye→camera segment passes through */
export function occludedIds(eye: THREE.Vector3, cam: THREE.Vector3, occ: Occluder[]): string[] {
  const out: string[] = [];
  for (const o of occ) if (segmentHitsBox(eye, cam, o.box)) out.push(o.id);
  return out;
}

export const sameIds = (a: Set<string>, b: string[]): boolean => a.size === b.length && b.every((x) => a.has(x));
