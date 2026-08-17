"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { portraitCanvas, portraitFocus, preloadPortraits, usePortraitsVersion } from "@/components/portraits";
import { Speaker } from "./script";
import { blobTexture } from "./roomTextures";

/**
 * A character in the room as a RAGNAROK-STYLE 2D SPRITE: a chibi pixel sprite (~2.5 heads tall) billboarded in the
 * 3D room, nearest-filtered so the pixels stay crisp, on a 4-frame walk-cycle sprite sheet, mirrored to face its
 * travel direction. Generated per character from the art we have: the FACE is cropped out of the keyed portrait and
 * downsampled to a pixel head (with a dark outline), the body is drawn in pixels in the team colours. Blob shadow
 * underneath. The slot for hand-drawn RO-style sheets later (same sheet layout: 4 frames × FW, one row).
 */
export const ACTOR_H = 1.35; // world height of the sprite (RO chibi: ~1.5 tiles)
const FW = 40; // frame width (px)
const FH = 60; // frame height (px)
const FRAMES = 4;

const TEAM_CLOTH: Record<Speaker["team"], { tunic: string; tunicDark: string; sash: string; skin: string }> = {
  blue: { tunic: "#2f4a86", tunicDark: "#22355f", sash: "#7fb2ff", skin: "#f0c9a6" },
  red: { tunic: "#8a2f2f", tunicDark: "#5f2020", sash: "#ff9a8a", skin: "#f0c9a6" },
};

/** pixel-art helpers on an integer grid */
function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawSheet(sp: Speaker): HTMLCanvasElement | null {
  const bust = portraitCanvas(sp.team, sp.archetype);
  if (!bust) return null;
  const cloth = TEAM_CLOTH[sp.team];
  const sheet = document.createElement("canvas");
  sheet.width = FW * FRAMES;
  sheet.height = FH;
  const ctx = sheet.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  // --- pixel head from the portrait: crop a square around the face focus, downsample to 22px, round the corners
  const f = portraitFocus(sp.team, sp.archetype);
  const side = Math.min(bust.width, bust.height) * 0.42;
  const sx = Math.max(0, Math.min(bust.width - side, f.x * bust.width - side / 2));
  const sy = Math.max(0, Math.min(bust.height - side, f.y * bust.height - side * 0.55));
  const HEAD = 22;
  const headC = document.createElement("canvas");
  headC.width = headC.height = HEAD;
  const hc = headC.getContext("2d")!;
  hc.imageSmoothingEnabled = true;
  hc.imageSmoothingQuality = "high";
  // two-step downsample keeps the features readable at 22px
  const mid = document.createElement("canvas");
  mid.width = mid.height = 88;
  const mc = mid.getContext("2d")!;
  mc.imageSmoothingQuality = "high";
  mc.drawImage(bust, sx, sy, side, side, 0, 0, 88, 88);
  hc.beginPath();
  hc.roundRect(0, 0, HEAD, HEAD, 7);
  hc.clip();
  hc.drawImage(mid, 0, 0, 88, 88, 0, 0, HEAD, HEAD);
  // pixel-quantise a touch (posterise) so it sits with the pixel body
  const id = hc.getImageData(0, 0, HEAD, HEAD);
  for (let i = 0; i < id.data.length; i += 4) {
    id.data[i] = Math.round(id.data[i] / 12) * 12;
    id.data[i + 1] = Math.round(id.data[i + 1] / 12) * 12;
    id.data[i + 2] = Math.round(id.data[i + 2] / 12) * 12;
  }
  hc.putImageData(id, 0, 0);

  for (let fr = 0; fr < FRAMES; fr++) {
    const ox = fr * FW;
    const cx = ox + FW / 2;
    // walk cycle: 0 = contact, 1 = pass, 2 = contact (other leg), 3 = pass; body bobs 1px on the pass frames
    const bob = fr % 2 === 1 ? -1 : 0;
    const legA = fr === 0 ? 3 : fr === 2 ? -3 : 0; // forward/back swing (px)
    const legB = -legA;
    // legs (dark trousers) + boots
    px(ctx, cx - 7 + legA * 0.5, 44 + bob, 5, 12, "#2a2420");
    px(ctx, cx + 2 + legB * 0.5, 44 + bob, 5, 12, "#2a2420");
    px(ctx, cx - 8 + legA * 0.5, 54 + bob, 7, 4, "#15100c");
    px(ctx, cx + 1 + legB * 0.5, 54 + bob, 7, 4, "#15100c");
    // torso (tunic) with a darker side + belt
    px(ctx, cx - 9, 28 + bob, 18, 18, cloth.tunic);
    px(ctx, cx + 5, 28 + bob, 4, 18, cloth.tunicDark);
    px(ctx, cx - 9, 42 + bob, 18, 3, "#3a2a1c");
    // sash
    px(ctx, cx - 3, 28 + bob, 4, 16, cloth.sash);
    // arms (skin) swinging opposite to the legs
    px(ctx, cx - 12, 30 + bob + legB * 0.6, 3, 12, cloth.skin);
    px(ctx, cx + 9, 30 + bob + legA * 0.6, 3, 12, cloth.skin);
    // collar / neck
    px(ctx, cx - 3, 26 + bob, 6, 3, cloth.skin);
    // head (big, RO chibi) with a 1px dark outline
    const hx = cx - HEAD / 2;
    const hy = 5 + bob;
    ctx.fillStyle = "#1a1418";
    ctx.beginPath();
    ctx.roundRect(hx - 1, hy - 1, HEAD + 2, HEAD + 2, 8);
    ctx.fill();
    ctx.drawImage(headC, hx, hy);
    // body outline (cheap): 1px dark under the torso + legs edges
    px(ctx, cx - 10, 28 + bob, 1, 18, "#1a1418");
    px(ctx, cx + 9, 28 + bob, 1, 18, "#1a1418");
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
  const version = usePortraitsVersion();
  useEffect(() => preloadPortraits(), []);
  // the standee texture is derived from (speaker, portraits loaded) — memoised, disposed when replaced
  const tex = useMemo(() => {
    void version;
    const c = drawSheet(speaker);
    if (!c) return null;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.repeat.set(1 / FRAMES, 1);
    return t;
  }, [speaker, version]);
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
        <planeGeometry args={[0.8 * scale, 0.5 * scale]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.9} />
      </mesh>
      <mesh ref={card} position={[0, (ACTOR_H * scale) / 2, 0]} castShadow>
        <planeGeometry args={[w, ACTOR_H * scale]} />
        {tex ? (
          <meshBasicMaterial map={tex} transparent alphaTest={0.5} side={THREE.DoubleSide} toneMapped={false} />
        ) : (
          <meshStandardMaterial color={TEAM_CLOTH[speaker.team].tunic} transparent opacity={0.6} side={THREE.DoubleSide} />
        )}
      </mesh>
    </group>
  );
}
