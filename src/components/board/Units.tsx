"use client";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { UnitDef } from "@/sim/types";
import { RUNES } from "@/sim/runes";
import { TIER, cardKey, renderCard, tierOf } from "../cards";
import { CardAura, CardFoil } from "./CardFoil";
import SelectionRing, { HpArc } from "./SelectionRing";
import { CARD_H3, CARD_W3, TEAM_GLOW, dragged } from "./shared";

/** Billboarded FUT-style card. Texture is a cached canvas from cards.ts; `dim` marks an acted unit. */
const textureCache = new Map<string, THREE.CanvasTexture>();
function cardTexture(def: UnitDef): THREE.CanvasTexture {
  const key = cardKey(def);
  let t = textureCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(renderCard(def));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textureCache.set(key, t);
  }
  return t;
}

/** Sims-style cutaway: alpha ramp that keeps the bottom of the card and fades the top ~60% out. Built once. */
let cutawayAlpha: THREE.CanvasTexture | null = null;
function cutawayAlphaMap() {
  if (cutawayAlpha) return cutawayAlpha;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  // alphaMap samples the GREEN channel → an opaque black→white ramp (not white-with-alpha)
  g.addColorStop(0, "#141414");
  g.addColorStop(0.55, "#2e2e2e");
  g.addColorStop(0.8, "#ffffff");
  g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  cutawayAlpha = new THREE.CanvasTexture(c);
  return cutawayAlpha;
}

function CardMesh({ def, dim, selected, ghost, cutaway }: { def: UnitDef; dim: boolean; selected: boolean; ghost: boolean; cutaway: boolean }) {
  const texture = useMemo(() => cardTexture(def), [def]);
  const foil = TIER[tierOf(def)].foil;
  // foil sweep: tier intensity, plus a hero boost when selected (even base-tier cards get the sweep then); acted units stay flat
  const boost = selected ? 0.5 : 0;
  return (
    <Billboard follow lockX={false} lockY={false} lockZ={false} position={[0, CARD_H3 / 2 + 0.05, 0]}>
      <mesh>
        <planeGeometry args={[CARD_W3, CARD_H3]} />
        {/* cutaway: the top of the card fades so the unit standing right behind stays readable (Sims roof-off) */}
        <meshBasicMaterial key={cutaway ? "cut" : "full"} map={texture} alphaMap={cutaway ? cutawayAlphaMap() : null} transparent alphaTest={0.05} opacity={ghost ? 0.38 : 1} color={dim ? "#6a6a72" : "#ffffff"} toneMapped={false} depthWrite={!cutaway} />
      </mesh>
      {!dim && !ghost && !cutaway && (foil > 0 || selected) && <CardFoil mask={texture} foil={foil} boost={boost} w={CARD_W3} h={CARD_H3} />}
    </Billboard>
  );
}

function Unit({ def }: { def: UnitDef }) {
  const vu = useGame((s) => s.view.units[def.id]);
  const map = useGame((s) => s.config.map);
  const clickUnit = useGame((s) => s.clickUnit);
  const rightClickTile = useGame((s) => s.rightClickTile);
  const setHoverUnit = useGame((s) => s.setHoverUnit);
  const selected = useGame((s) => s.selected === def.id);
  const hovered = useGame((s) => s.hoverUnit === def.id);
  const battle = useGame((s) => s.battle);
  const mode = useGame((s) => s.mode);
  const floats = useGame((s) => s.floats);
  const group = useRef<THREE.Group>(null);
  const bump = useRef(0);
  const shake = useRef(0);
  const target = useRef(new THREE.Vector3(def.x, 0, def.y));

  const pending = useGame((s) => (s.selected === def.id ? s.pendingMove : null));
  const vx = pending?.x ?? vu?.x ?? def.x;
  const vy = pending?.y ?? vu?.y ?? def.y;
  // Sims-style cutaway, tile rule: whatever tile the pointer is over, the card standing on the tile directly IN FRONT
  // of it (y + 1, one step toward the camera) fades so the pointed-at tile/unit stays readable. Nothing else fades.
  const cutaway = useGame((s) => {
    // a hovered unit's card swallows the tile hover, so the unit under the pointer wins over the (possibly stale) tile
    const hv = s.hoverUnit ? s.view.units[s.hoverUnit] : null;
    const p = hv ? { x: hv.x, y: hv.y } : s.hover;
    return !!p && p.x === vx && p.y === vy - 1;
  });
  const actionSeq = vu?.actionSeq ?? 0;
  const hitSeq = vu?.hitSeq ?? 0;
  const th = tileHeight(map, { x: vx, y: vy });

  useEffect(() => {
    target.current.set(vx, th, vy);
  }, [vx, vy, th]);
  useEffect(() => {
    if (actionSeq > 0) bump.current = 1;
  }, [actionSeq]);
  useEffect(() => {
    if (hitSeq > 0) shake.current = 1;
  }, [hitSeq]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.position.lerp(target.current, Math.min(1, dt * 10));
    let dy = 0,
      dx = 0;
    if (bump.current > 0) {
      dy = Math.sin(bump.current * Math.PI) * 0.35;
      bump.current = Math.max(0, bump.current - dt * 3);
    }
    if (shake.current > 0) {
      dx = Math.sin(shake.current * 40) * 0.08 * shake.current;
      shake.current = Math.max(0, shake.current - dt * 3);
    }
    g.children[0]?.position.set(dx, dy, 0);
  });

  if (!vu || !vu.alive) return null;
  const acted = mode !== "editor" && !!battle && vu.acted && vu.alive;
  const pct = Math.max(0, vu.hp / def.stats.hp);
  const myFloats = floats.filter((f) => f.unit === def.id);

  return (
    <group ref={group} position={[def.x, th, def.y]}>
      <group>
        <group
          onClick={(e) => {
            e.stopPropagation();
            clickUnit(def.id);
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            e.nativeEvent.preventDefault();
            if (!dragged()) rightClickTile({ x: vx, y: vy });
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoverUnit(def.id);
          }}
          onPointerOut={() => setHoverUnit(null)}
        >
          <CardMesh def={def} dim={!!acted} selected={selected} ghost={vu.buff?.kind === "invisibility"} cutaway={cutaway} />
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.34, 20]} />
            <meshBasicMaterial color="#000" transparent opacity={0.35} />
          </mesh>
        </group>
        {/* ground selection ring (team colour): spinning + pulsing when selected, dim static on hover */}
        {selected ? <SelectionRing color={TEAM_GLOW[def.team]} strength={1} spin /> : hovered ? <SelectionRing color={TEAM_GLOW[def.team]} strength={0.4} spin={false} /> : null}
        {/* rune buff aura (rune colour, dense) beats the gold-tier aura (slow golden motes) */}
        {vu.buff ? (
          <CardAura color={RUNES[vu.buff.kind].color} count={12} seed={def.id.length + def.x * 7 + def.y * 13 + 5} />
        ) : (
          !acted && tierOf(def) === "gold" && <CardAura color={TIER.gold.trim} seed={def.id.length + def.x * 7 + def.y * 13} />
        )}
        {/* FE-style HP gauge: curved arc on the ground in front of the unit, always shown for both teams (the card carries the name) */}
        <HpArc pct={pct} color={TEAM_GLOW[def.team]} />
        {myFloats.map((f) => (
          <Html key={f.key} position={[0, CARD_H3 + 0.5, 0]} center distanceFactor={12} zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
            <div className="dmg-float" style={{ color: f.color }}>
              {f.text}
            </div>
          </Html>
        ))}
      </group>
    </group>
  );
}

export default function Units() {
  const units = useGame((s) => s.config.units);
  return (
    <group>
      {units.map((u) => (
        <Unit key={u.id} def={u} />
      ))}
    </group>
  );
}

