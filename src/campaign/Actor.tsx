"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Speaker } from "./script";
import { blobTexture } from "./roomTextures";

/**
 * A character in the room as a RAGNAROK-STYLE 2D SPRITE: hand-authored chibi PIXEL ART (drawn in code from the
 * character's `Look`: hair silhouette + colour, dot eyes, outfit) on a 4-frame walk-cycle sheet, billboarded in the
 * 3D room, nearest-filtered so pixels stay crisp, mirrored to face travel direction, an ellipse shadow underneath.
 * Frame = 32×48 px, ~2.3 heads tall — the RO proportion. The sheet layout is the slot for hand-drawn sheets later.
 */
export const ACTOR_H = 1.3; // world height of the sprite (RO chibi: ~1.5 tiles)
const FW = 32;
const FH = 48;
const FRAMES = 4;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

const OUTLINE = "#1a1418";

function drawSheet(sp: Speaker): HTMLCanvasElement {
  const L = sp.look;
  const sheet = document.createElement("canvas");
  sheet.width = FW * FRAMES;
  sheet.height = FH;
  const ctx = sheet.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let fr = 0; fr < FRAMES; fr++) {
    const ox = fr * FW;
    const cx = ox + FW / 2; // 16
    const bob = fr % 2 === 1 ? -1 : 0; // pass frames lift 1px
    const swing = fr === 0 ? 2 : fr === 2 ? -2 : 0; // leg/arm swing
    // ---- legs + boots (outlined)
    px(ctx, cx - 6 + swing, 37 + bob, 5, 7, OUTLINE);
    px(ctx, cx + 1 - swing, 37 + bob, 5, 7, OUTLINE);
    px(ctx, cx - 5 + swing, 37 + bob, 3, 6, L.outfitDark);
    px(ctx, cx + 2 - swing, 37 + bob, 3, 6, L.outfitDark);
    px(ctx, cx - 6 + swing, 43 + bob, 5, 3, OUTLINE);
    px(ctx, cx + 1 - swing, 43 + bob, 5, 3, OUTLINE);
    px(ctx, cx - 5 + swing, 43 + bob, 3, 2, L.boots);
    px(ctx, cx + 2 - swing, 43 + bob, 3, 2, L.boots);
    // ---- long hair back layer (behind the torso) for the long style
    if (L.style === "long") {
      px(ctx, cx - 10, 12 + bob, 20, 20, OUTLINE);
      px(ctx, cx - 9, 13 + bob, 18, 18, L.hairDark);
      px(ctx, cx - 9, 13 + bob, 4, 18, L.hair);
    }
    // ---- torso (outlined box, darker right side, accent sash / collar)
    px(ctx, cx - 7, 26 + bob, 14, 12, OUTLINE);
    px(ctx, cx - 6, 27 + bob, 12, 10, L.outfit);
    px(ctx, cx + 3, 27 + bob, 3, 10, L.outfitDark);
    px(ctx, cx - 1, 27 + bob, 2, 10, L.accent);
    px(ctx, cx - 6, 35 + bob, 12, 1, L.outfitDark);
    // ---- arms (outlined, skin hands), counter-swing
    px(ctx, cx - 10, 27 + bob - swing, 3, 9, OUTLINE);
    px(ctx, cx + 7, 27 + bob + swing, 3, 9, OUTLINE);
    px(ctx, cx - 9, 28 + bob - swing, 1, 6, L.outfit);
    px(ctx, cx + 8, 28 + bob + swing, 1, 6, L.outfit);
    px(ctx, cx - 9, 34 + bob - swing, 1, 1, L.skin);
    px(ctx, cx + 8, 34 + bob + swing, 1, 1, L.skin);
    // ---- head: outline, skin, face
    const hy = 8 + bob; // top of the head box
    px(ctx, cx - 9, hy, 18, 18, OUTLINE);
    px(ctx, cx - 8, hy + 1, 16, 16, L.skin);
    // eyes (2×3, with a 1px glint) + mouth + blush
    px(ctx, cx - 5, hy + 9, 2, 3, OUTLINE);
    px(ctx, cx + 3, hy + 9, 2, 3, OUTLINE);
    px(ctx, cx - 5, hy + 10, 2, 2, L.eyes);
    px(ctx, cx + 3, hy + 10, 2, 2, L.eyes);
    px(ctx, cx - 5, hy + 9, 1, 1, "#ffffff");
    px(ctx, cx + 3, hy + 9, 1, 1, "#ffffff");
    px(ctx, cx - 1, hy + 13, 2, 1, "#b06a5a");
    px(ctx, cx - 7, hy + 12, 2, 1, "#f0a8a0");
    px(ctx, cx + 5, hy + 12, 2, 1, "#f0a8a0");
    // ---- hair front: cap over the top of the head + bangs, highlight streak
    px(ctx, cx - 10, hy - 2, 20, 6, OUTLINE);
    px(ctx, cx - 9, hy - 1, 18, 5, L.hair);
    px(ctx, cx - 8, hy + 1, 16, 5, L.hair);
    px(ctx, cx - 6, hy, 6, 1, L.hairLight);
    // bangs: a few pixel strands over the forehead
    px(ctx, cx - 8, hy + 6, 3, 2, L.hair);
    px(ctx, cx - 4, hy + 6, 2, 3, L.hair);
    px(ctx, cx + 1, hy + 6, 3, 2, L.hair);
    px(ctx, cx + 5, hy + 6, 3, 3, L.hair);
    px(ctx, cx - 9, hy + 6, 1, 4, L.hairDark);
    px(ctx, cx + 8, hy + 6, 1, 4, L.hairDark);
    if (L.style === "short") {
      // side tufts
      px(ctx, cx - 10, hy + 4, 1, 5, OUTLINE);
      px(ctx, cx + 9, hy + 4, 1, 5, OUTLINE);
      px(ctx, cx - 9, hy + 5, 1, 4, L.hairDark);
      px(ctx, cx + 8, hy + 5, 1, 4, L.hairDark);
    } else {
      // long: hair frames the face down past the jaw
      px(ctx, cx - 10, hy + 4, 3, 14, OUTLINE);
      px(ctx, cx + 7, hy + 4, 3, 14, OUTLINE);
      px(ctx, cx - 9, hy + 5, 2, 12, L.hair);
      px(ctx, cx + 7, hy + 5, 2, 12, L.hair);
      px(ctx, cx - 9, hy + 5, 1, 12, L.hairLight);
    }
  }
  return sheet;
}

export default function Actor({
  speaker,
  posRef,
  movingRef,
  facingRef,
  scale = 1,
}: {
  speaker: Speaker;
  /** live world position (x, z) — written by the controller every frame, never React state */
  posRef: React.RefObject<THREE.Vector3>;
  movingRef?: React.RefObject<boolean>;
  /** +1 faces right (screen), -1 faces left */
  facingRef?: React.RefObject<number>;
  scale?: number;
}) {
  // the sprite sheet is derived from the speaker's look — memoised, disposed when replaced
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = drawSheet(speaker);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.repeat.set(1 / FRAMES, 1);
    return t;
  }, [speaker]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const blob = useMemo(() => blobTexture(), []);
  const group = useRef<THREE.Group>(null);
  const card = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const camera = useThree((s) => s.camera);
  useFrame((_, dt) => {
    t.current += dt;
    const g = group.current;
    const p = posRef.current;
    if (!g || !p) return;
    g.position.set(p.x, 0, p.z);
    // yaw-only billboard toward the camera
    const yaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    g.rotation.y = yaw;
    const moving = movingRef?.current ?? false;
    if (card.current) {
      card.current.position.y = ACTOR_H * scale * 0.5;
      const face = facingRef?.current ?? 1;
      card.current.scale.x = face * Math.abs(card.current.scale.x || 1);
      // walk cycle: 4 frames at ~8 fps while moving, frame 1 (pass pose) when idle
      const frame = moving ? Math.floor(t.current * 8) % FRAMES : 1;
      const m = card.current.material as THREE.MeshBasicMaterial;
      if (m.map) m.map.offset.x = frame / FRAMES;
    }
  });
  const w = ACTOR_H * scale * (FW / FH);
  return (
    <group ref={group}>
      {/* shadow blob */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[0.7 * scale, 0.42 * scale]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.95} />
      </mesh>
      <mesh ref={card} position={[0, (ACTOR_H * scale) / 2, 0]}>
        <planeGeometry args={[w, ACTOR_H * scale]} />
        {tex ? (
          <meshBasicMaterial map={tex} transparent alphaTest={0.5} side={THREE.DoubleSide} toneMapped={false} />
        ) : (
          <meshBasicMaterial color={speaker.look.outfit} transparent opacity={0.6} side={THREE.DoubleSide} />
        )}
      </mesh>
    </group>
  );
}
