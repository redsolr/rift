"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Speaker } from "./script";
import { blobTexture } from "./roomTextures";

/**
 * A character in the room as a real 3D model: KayKit "Adventurers" (CC0, `public/models/kaykit/`, licence alongside)
 * — rigged low-poly toon figures with baked animations. We use exactly three clips: `Idle`, `Walking_A`, `Running_A`,
 * crossfaded by the controller's live movement state; the model TURNS to face its heading (no billboard any more).
 * Auto-scaled so every model stands `height` world units tall. Blob shadow underneath. Placeholder art — swap the GLBs
 * for real characters later; any rig with those three clip names drops in.
 */
export const CHARACTER_H = 1.62;
const CLIP = { idle: "Idle", walk: "Walking_A", run: "Running_A" } as const;
type Gait = keyof typeof CLIP;

export default function Character({
  speaker,
  posRef,
  gaitRef,
  headingRef,
  height = CHARACTER_H,
}: {
  speaker: Speaker;
  /** live world position — written by the controller every frame */
  posRef: React.RefObject<THREE.Vector3>;
  /** live gait — "idle" | "walk" | "run" */
  gaitRef?: React.RefObject<Gait>;
  /** live heading (radians around Y, atan2(dx, dz)) the model should face */
  headingRef?: React.RefObject<number>;
  height?: number;
}) {
  const url = `/models/kaykit/${speaker.model}.glb`;
  const gltf = useGLTF(url);
  const root = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(gltf.animations, model);
  const cur = useRef<Gait | null>(null);
  const blob = useMemo(() => blobTexture(), []);
  // normalise: stand on y=0, `height` tall, centred on x/z
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = height / Math.max(1e-3, size.y);
    return { s, y: -box.min.y * s, cx: -(box.min.x + box.max.x) / 2, cz: -(box.min.z + box.max.z) / 2 };
  }, [gltf.scene, height]);
  useEffect(() => {
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
  }, [gltf.scene]);

  const play = (g: Gait) => {
    if (cur.current === g) return;
    const next = actions[CLIP[g]];
    if (!next) return;
    const prev = cur.current ? actions[CLIP[cur.current]] : null;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.18).play();
    prev?.fadeOut(0.18);
    cur.current = g;
  };
  useEffect(
    () => () => {
      mixer.stopAllAction();
    },
    [mixer],
  );

  useFrame(() => {
    const g = root.current;
    const p = posRef.current;
    if (!g || !p) return;
    g.position.set(p.x, 0, p.z);
    const gait = gaitRef?.current ?? "idle";
    play(gait);
    // turn smoothly toward the heading
    if (headingRef && model.current) {
      const target = headingRef.current;
      let d = target - model.current.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      model.current.rotation.y += d * 0.25;
    }
  });

  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <planeGeometry args={[0.9, 0.6]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.85} />
      </mesh>
      <group ref={model}>
        <primitive object={gltf.scene} scale={fit.s} position={[fit.cx * fit.s, fit.y, fit.cz * fit.s]} />
      </group>
    </group>
  );
}

useGLTF.preload("/models/kaykit/Knight.glb");
useGLTF.preload("/models/kaykit/Mage.glb");
