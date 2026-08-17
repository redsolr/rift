"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { portraitCanvas, portraitFocus, preloadPortraits, usePortraitsVersion } from "@/components/portraits";
import { Speaker } from "./script";
import { blobTexture } from "./roomTextures";

/**
 * A character in the room as a PAPER-DOLL STANDEE (Paper Mario / Octopath read): a billboard that yaws to face the
 * camera, carrying a canvas that stacks the keyed portrait bust over a painted body (tunic in the team colour, legs,
 * boots) so the bust art we already have reads as a full standing figure. Bobs while walking, sways idle, flips to
 * face its travel direction, and casts a soft blob shadow. The slot for real character models later.
 */
export const ACTOR_H = 1.85;

const TEAM_CLOTH: Record<Speaker["team"], { tunic: string; sash: string }> = {
  blue: { tunic: "#243250", sash: "#3f7fe0" },
  red: { tunic: "#4a2426", sash: "#e0554a" },
};

function drawStandee(sp: Speaker): HTMLCanvasElement | null {
  const bust = portraitCanvas(sp.team, sp.archetype);
  if (!bust) return null;
  const W = 512;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const cloth = TEAM_CLOTH[sp.team];
  // ---- body (painted): boots, legs, tunic, belt, sash
  const cx = W / 2;
  ctx.fillStyle = "#1a1410";
  ctx.beginPath(); // boots
  ctx.roundRect(cx - 95, H - 120, 80, 110, 18);
  ctx.roundRect(cx + 15, H - 120, 80, 110, 18);
  ctx.fill();
  ctx.fillStyle = "#2b2622";
  ctx.beginPath(); // legs
  ctx.roundRect(cx - 92, H - 420, 74, 320, 22);
  ctx.roundRect(cx + 18, H - 420, 74, 320, 22);
  ctx.fill();
  // tunic: shoulders wide, hem below the hips
  ctx.fillStyle = cloth.tunic;
  ctx.beginPath();
  ctx.moveTo(cx - 175, 470);
  ctx.quadraticCurveTo(cx - 200, 560, cx - 150, 720);
  ctx.lineTo(cx + 150, 720);
  ctx.quadraticCurveTo(cx + 200, 560, cx + 175, 470);
  ctx.quadraticCurveTo(cx, 430, cx - 175, 470);
  ctx.closePath();
  ctx.fill();
  // belt + sash
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(cx - 150, 640, 300, 26);
  ctx.fillStyle = cloth.sash;
  ctx.beginPath();
  ctx.moveTo(cx - 60, 470);
  ctx.lineTo(cx + 40, 700);
  ctx.lineTo(cx + 90, 700);
  ctx.lineTo(cx - 10, 470);
  ctx.closePath();
  ctx.fill();
  // cloth shading
  const sh = ctx.createLinearGradient(cx - 200, 0, cx + 200, 0);
  sh.addColorStop(0, "rgba(0,0,0,0.35)");
  sh.addColorStop(0.45, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = sh;
  ctx.fillRect(cx - 200, 430, 400, H - 430);
  // ---- bust: cover-fit into the top ~58 %, face centred by its focus, bottom faded into the tunic
  const bw = bust.width;
  const bh = bust.height;
  const f = portraitFocus(sp.team, sp.archetype);
  const targetH = 600;
  const scale = Math.max((W * 0.9) / bw, targetH / bh);
  const dw = bw * scale;
  const dh = bh * scale;
  const dx = cx - f.x * dw;
  const dy = 20 - Math.max(0, f.y * dh - 190); // head near the top of the canvas
  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  const t = tmp.getContext("2d")!;
  t.drawImage(bust, dx, dy, dw, dh);
  // fade the bust out from y=520 → 640 so it melts into the tunic; also clip the sides softly
  t.globalCompositeOperation = "destination-out";
  const fade = t.createLinearGradient(0, 500, 0, 640);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  t.fillStyle = fade;
  t.fillRect(0, 500, W, H - 500);
  t.globalCompositeOperation = "source-over";
  ctx.drawImage(tmp, 0, 0);
  // ---- outline: a soft dark rim so the standee separates from the room (paper-doll edge)
  return c;
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
    const c = drawStandee(speaker);
    if (!c) return null;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
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
    const bob = moving ? Math.abs(Math.sin(t.current * 9)) * 0.06 : Math.sin(t.current * 1.6) * 0.012;
    const tilt = moving ? Math.sin(t.current * 9) * 0.04 : 0;
    if (card.current) {
      card.current.position.y = ACTOR_H * scale * 0.5 + bob;
      card.current.rotation.z = tilt;
      const face = facingRef?.current ?? 1;
      card.current.scale.x = face * Math.abs(card.current.scale.x || 1);
    }
  });
  const w = ACTOR_H * scale * 0.5; // canvas is 1:2
  return (
    <group ref={group}>
      {/* shadow blob */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[1.1 * scale, 0.7 * scale]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} opacity={0.9} />
      </mesh>
      <mesh ref={card} position={[0, (ACTOR_H * scale) / 2, 0]} castShadow>
        <planeGeometry args={[w, ACTOR_H * scale]} />
        {tex ? (
          <meshBasicMaterial map={tex} color="#efe6dc" transparent alphaTest={0.05} side={THREE.DoubleSide} toneMapped={false} />
        ) : (
          <meshStandardMaterial color={TEAM_CLOTH[speaker.team].tunic} transparent opacity={0.6} side={THREE.DoubleSide} />
        )}
      </mesh>
    </group>
  );
}
