"use client";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { UnitDef } from "@/sim/types";
import { cardKey, renderCard } from "../cards";
import { CARD_H3, CARD_W3, TEAM_COLOR, dragged } from "./shared";

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

function CardMesh({ def, dim }: { def: UnitDef; dim: boolean }) {
  const texture = useMemo(() => cardTexture(def), [def]);
  return (
    <Billboard follow lockX={false} lockY={false} lockZ={false} position={[0, CARD_H3 / 2 + 0.05, 0]}>
      <mesh>
        <planeGeometry args={[CARD_W3, CARD_H3]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} color={dim ? "#6a6a72" : "#ffffff"} toneMapped={false} />
      </mesh>
      {/* soft shadow blob so the card reads as standing on the tile */}
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
          <CardMesh def={def} dim={!!acted} />
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.34, 20]} />
            <meshBasicMaterial color="#000" transparent opacity={0.35} />
          </mesh>
          {selected && (
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.36, 0.46, 24]} />
              <meshBasicMaterial color="#ffe082" />
            </mesh>
          )}
        </group>
        {/* HP bar */}
        <group position={[0, CARD_H3 + 0.18, 0]}>
          <mesh>
            <planeGeometry args={[0.7, 0.09]} />
            <meshBasicMaterial color="#111" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(0.7 * (1 - pct)) / 2, 0, 0.001]}>
            <planeGeometry args={[0.7 * pct, 0.07]} />
            <meshBasicMaterial color={pct > 0.5 ? "#6cf58a" : pct > 0.25 ? "#ffd54f" : "#ff5c5c"} side={THREE.DoubleSide} />
          </mesh>
        </group>
        <Html position={[0, CARD_H3 + 0.36, 0]} center distanceFactor={12} zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
          <div className="unit-label" style={{ color: TEAM_COLOR[def.team] }}>
            {def.name}
          </div>
        </Html>
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

