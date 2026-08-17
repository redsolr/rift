"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Animated foil overlay for a card billboard: a diagonal prismatic light band sweeps across the card
 * (FUT "special" / Hearthstone golden feel), masked to the card's own alpha. `foil` 0..1 = tier intensity,
 * `boost` adds the selected-hero highlight. Rendered as an additive plane just in front of the card.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform float uTime;
uniform float uFoil;
uniform float uBoost;
varying vec2 vUv;
vec3 hue(float h) { return 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67))); }
void main() {
  float a = texture2D(uMask, vUv).a;
  if (a < 0.05) discard;
  // travelling band: sweeps -0.3 -> 1.3 then pauses, cycle ~5.7s
  float k = mod(uTime * 0.28, 1.6) - 0.3;
  float d = (vUv.x + vUv.y * 0.55) * 0.65 - k;
  float band = smoothstep(0.16, 0.0, abs(d));
  float band2 = smoothstep(0.08, 0.0, abs(d - 0.05)) * 0.6;
  // rainbow shimmer across the band + a slow faint prism over the whole card for foil tiers
  vec3 prism = hue(vUv.x * 0.6 + vUv.y * 0.3 + uTime * 0.05);
  vec3 col = mix(vec3(1.0), prism, 0.55) * (band + band2);
  float glint = pow(max(0.0, 1.0 - abs(d + 0.35) * 6.0), 3.0) * 0.5;
  col += vec3(1.0) * glint;
  col += prism * 0.045 * uFoil * (0.5 + 0.5 * sin(uTime * 1.3 + vUv.y * 4.0));
  float k2 = uFoil * 0.55 + uBoost;
  gl_FragColor = vec4(col * k2, a * k2);
}
`;

export function CardFoil({ mask, foil, boost, w, h }: { mask: THREE.Texture; foil: number; boost: number; w: number; h: number }) {
  const ref = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uMask: { value: mask }, uTime: { value: 0 }, uFoil: { value: foil }, uBoost: { value: boost } }), [mask, foil, boost]);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (m) m.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={[0, 0, 0.002]} raycast={() => null}>
      <planeGeometry args={[w, h]} />
      <shaderMaterial
        key={`${foil}|${boost}`}
        ref={ref}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

let moteTex: THREE.CanvasTexture | null = null;
function moteTexture() {
  if (moteTex) return moteTex;
  const S = 32;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  moteTex = new THREE.CanvasTexture(c);
  return moteTex;
}

/** Slow golden motes drifting up around the card base: the "this one is important" aura for gold-tier units. */
export function CardAura({ color, count = 7, seed = 1 }: { color: string; count?: number; seed?: number }) {
  const tex = useMemo(() => moteTexture(), []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = (n: number) => (((Math.sin(seed * 12.9898 + i * 78.233 + n * 37.719) * 43758.5453) % 1) + 1) % 1;
        return { x: (r(1) - 0.5) * 0.9, z: (r(2) - 0.5) * 0.5, ph: r(3) * 6.28, sp: 0.35 + r(4) * 0.4, s: 0.06 + r(5) * 0.05 };
      }),
    [count, seed],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    parts.forEach((p, i) => {
      const s = refs.current[i];
      if (!s) return;
      const k = ((t * p.sp + p.ph) % 1.6) / 1.6; // 0..1 lifetime
      s.position.set(p.x + Math.sin(t * 1.4 + p.ph) * 0.06, 0.05 + k * 1.1, p.z);
      const a = Math.sin(k * Math.PI);
      (s.material as THREE.SpriteMaterial).opacity = a * 0.85;
      s.scale.setScalar(p.s * (0.7 + 0.5 * a));
    });
  });
  return (
    <group>
      {parts.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          raycast={() => null}
        >
          <spriteMaterial map={tex} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}
