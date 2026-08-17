"use client";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/store/game";
import Effects from "./Effects";
import { Archetype, TERRAIN, Team, UnitDef } from "@/sim/types";

const TEAM_COLOR: Record<Team, string> = { red: "#e0554a", blue: "#4a86e0" };
const TEAM_DARK: Record<Team, string> = { red: "#7a2a24", blue: "#233f75" };

function Tiles() {
  const map = useGame((s) => s.config.map);
  const clickTile = useGame((s) => s.clickTile);
  const setHover = useGame((s) => s.setHover);
  const painting = useGame((s) => s.painting);
  const setPainting = useGame((s) => s.setPainting);
  const paintTile = useGame((s) => s.paintTile);
  const tool = useGame((s) => s.tool);
  const mode = useGame((s) => s.mode);

  const tiles = useMemo(() => {
    const out: { x: number; y: number; t: keyof typeof TERRAIN }[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) out.push({ x, y, t: map.tiles[y * map.width + x] });
    return out;
  }, [map]);

  return (
    <group>
      {tiles.map(({ x, y, t }) => {
        const d = TERRAIN[t];
        return (
          <mesh
            key={`${x},${y}`}
            position={[x, d.height / 2, y]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              clickTile({ x, y });
            }}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              if (mode === "editor" && tool.kind === "terrain") {
                e.stopPropagation();
                setPainting(true);
                paintTile({ x, y });
              }
            }}
            onPointerUp={() => setPainting(false)}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              setHover({ x, y });
              if (painting) paintTile({ x, y });
            }}
            onPointerOut={() => setHover(null)}
          >
            <boxGeometry args={[0.96, d.height, 0.96]} />
            <meshStandardMaterial color={d.color} roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

function Highlight({ x, y, color, opacity = 0.45, y0 }: { x: number; y: number; color: string; opacity?: number; y0?: number }) {
  const map = useGame((s) => s.config.map);
  const t = TERRAIN[map.tiles[y * map.width + x]];
  return (
    <mesh position={[x, (y0 ?? t.height) + 0.02, y]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.92, 0.92]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function Highlights() {
  const moveTiles = useGame((s) => s.moveTiles);
  const pendingMove = useGame((s) => s.pendingMove);
  const targets = useGame((s) => s.targets);
  const hover = useGame((s) => s.hover);
  const selected = useGame((s) => s.selected);
  const view = useGame((s) => s.view);
  const config = useGame((s) => s.config);
  const mode = useGame((s) => s.mode);
  const battle = useGame((s) => s.battle);
  const cursor = useGame((s) => s.cursor);
  const events = useGame((s) => s.events);

  // In manager/editor, selecting a unit previews its reach (from the engine when live, from config otherwise)
  const preview = useMemo(() => {
    if (!selected || mode === "manual") return [];
    if (battle && cursor >= events.length) {
      const u = battle.state.units.find((x) => x.id === selected);
      if (!u || !u.alive) return [];
      return battle.standableFor(selected);
    }
    return [];
  }, [selected, mode, battle, cursor, events.length]);

  const sel = selected ? view.units[selected] : null;
  const selDef = selected ? config.units.find((u) => u.id === selected) : null;
  const rangeTiles = useMemo(() => {
    if (!sel || !selDef || !sel.alive) return [];
    const origin = pendingMove ?? { x: sel.x, y: sel.y };
    const out: { x: number; y: number }[] = [];
    const { rangeMin, rangeMax } = selDef.stats;
    for (let dy = -rangeMax; dy <= rangeMax; dy++)
      for (let dx = -rangeMax; dx <= rangeMax; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < rangeMin || d > rangeMax) continue;
        const x = origin.x + dx, y = origin.y + dy;
        if (x >= 0 && y >= 0 && x < config.map.width && y < config.map.height) out.push({ x, y });
      }
    return out;
  }, [sel, selDef, pendingMove, config.map.width, config.map.height]);
  const unitAt = (x: number, y: number) => config.units.find((u) => view.units[u.id]?.alive !== false && view.units[u.id]?.x === x && view.units[u.id]?.y === y);
  return (
    <group>
      {preview.map((p) => (
        <Highlight key={`p${p.x},${p.y}`} x={p.x} y={p.y} color="#9ad0ff" opacity={0.22} />
      ))}
      {rangeTiles.map((p) => (
        <Highlight key={`r${p.x},${p.y}`} x={p.x} y={p.y} color={selDef?.archetype === "healer" ? "#6cf58a" : "#ff6a5c"} opacity={0.16} />
      ))}
      {moveTiles.map((p) => (
        <Highlight key={`m${p.x},${p.y}`} x={p.x} y={p.y} color="#4fa3ff" opacity={0.4} />
      ))}
      {targets.map((id) => {
        const u = view.units[id];
        return u ? <Highlight key={`t${id}`} x={u.x} y={u.y} color="#ff4040" opacity={0.6} /> : null;
      })}
      {pendingMove && <Highlight x={pendingMove.x} y={pendingMove.y} color="#ffd54f" opacity={0.7} />}
      {sel && sel.alive && <Highlight x={sel.x} y={sel.y} color="#ffe082" opacity={0.5} />}
      {hover && !unitAt(hover.x, hover.y) && <Highlight x={hover.x} y={hover.y} color="#ffffff" opacity={0.18} />}
    </group>
  );
}

function UnitMesh({ archetype, color }: { archetype: Archetype; color: string }) {
  switch (archetype) {
    case "knight":
      return (
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[0.5, 0.7, 0.5]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
        </mesh>
      );
    case "fighter":
      return (
        <mesh position={[0, 0.35, 0]} castShadow>
          <coneGeometry args={[0.32, 0.7, 6]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      );
    case "archer":
      return (
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.26, 0.7, 10]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      );
    case "mage":
      return (
        <mesh position={[0, 0.4, 0]} castShadow>
          <octahedronGeometry args={[0.36]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.4} />
        </mesh>
      );
    case "healer":
      return (
        <mesh position={[0, 0.34, 0]} castShadow>
          <sphereGeometry args={[0.32, 16, 12]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      );
  }
}

function Unit({ def }: { def: UnitDef }) {
  const vu = useGame((s) => s.view.units[def.id]);
  const map = useGame((s) => s.config.map);
  const clickUnit = useGame((s) => s.clickUnit);
  const selected = useGame((s) => s.selected === def.id);
  const battle = useGame((s) => s.battle);
  const mode = useGame((s) => s.mode);
  const floats = useGame((s) => s.floats);
  const group = useRef<THREE.Group>(null);
  const bump = useRef(0);
  const shake = useRef(0);
  const target = useRef(new THREE.Vector3(def.x, 0, def.y));

  const vx = vu?.x ?? def.x;
  const vy = vu?.y ?? def.y;
  const actionSeq = vu?.actionSeq ?? 0;
  const hitSeq = vu?.hitSeq ?? 0;
  const th = TERRAIN[map.tiles[vy * map.width + vx]]?.height ?? 0.1;

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
  const acted = mode !== "editor" && battle ? battle.state.units.find((u) => u.id === def.id)?.acted && battle.state.activeTeam === def.team : false;
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
        >
          <UnitMesh archetype={def.archetype} color={acted ? TEAM_DARK[def.team] : TEAM_COLOR[def.team]} />
          {selected && (
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.36, 0.46, 24]} />
              <meshBasicMaterial color="#ffe082" />
            </mesh>
          )}
        </group>
        {/* HP bar */}
        <group position={[0, 0.95, 0]}>
          <mesh>
            <planeGeometry args={[0.7, 0.09]} />
            <meshBasicMaterial color="#111" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(0.7 * (1 - pct)) / 2, 0, 0.001]}>
            <planeGeometry args={[0.7 * pct, 0.07]} />
            <meshBasicMaterial color={pct > 0.5 ? "#6cf58a" : pct > 0.25 ? "#ffd54f" : "#ff5c5c"} side={THREE.DoubleSide} />
          </mesh>
        </group>
        <Html position={[0, 1.15, 0]} center distanceFactor={12} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className="unit-label" style={{ color: TEAM_COLOR[def.team] }}>
            {def.name}
          </div>
        </Html>
        {myFloats.map((f) => (
          <Html key={f.key} position={[0, 1.3, 0]} center distanceFactor={12} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
            <div className="dmg-float" style={{ color: f.color }}>
              {f.text}
            </div>
          </Html>
        ))}
      </group>
    </group>
  );
}

function Units() {
  const units = useGame((s) => s.config.units);
  return (
    <group>
      {units.map((u) => (
        <Unit key={u.id} def={u} />
      ))}
    </group>
  );
}

/** Frames the whole map for the current viewport (portrait phones need a much farther, steeper camera). */
function CameraRig({ cx, cz, w, h }: { cx: number; cz: number; w: number; h: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    (window as unknown as { __cam?: unknown; __controls?: unknown }).__cam = camera;
    (window as unknown as { __cam?: unknown; __controls?: unknown }).__controls = controls;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // camera looks down at ~62° (portrait) / ~55° (landscape); footprint on screen ≈ map w × h*cos
    const tilt = aspect < 1 ? 1.08 : 0.95; // radians from horizontal
    const needH = (h * 1.15) / 2 / Math.tan(vFov / 2);
    const needW = (w * 1.15) / 2 / Math.tan(hFov / 2);
    const dist = Math.max(needH, needW, 8);
    // portrait: the bottom sheet covers the last ~56px, so aim a little below centre to lift the map
    const tz = aspect < 1 ? cz + h * 0.09 : cz;
    cam.position.set(cx, Math.sin(tilt) * dist, tz + Math.cos(tilt) * dist);
    cam.lookAt(cx, 0, tz);
    cam.updateProjectionMatrix();
    if (controls) {
      controls.target.set(cx, 0, tz);
      controls.update();
    }
  }, [camera, controls, size.width, size.height, cx, cz, w, h]);
  return null;
}

export default function Board() {
  const map = useGame((s) => s.config.map);
  const setPainting = useGame((s) => s.setPainting);
  const cx = (map.width - 1) / 2;
  const cz = (map.height - 1) / 2;
  const span = Math.max(map.width, map.height);
  return (
    <div className="board" onPointerUp={() => setPainting(false)} onPointerLeave={() => setPainting(false)}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [cx, span * 1.25, cz + span * 0.7], fov: 42, near: 0.1, far: 200 }}
        onPointerMissed={() => useGame.getState().select(null)}
        style={{ touchAction: "none" }}
      >
        <CameraRig cx={cx} cz={cz} w={map.width} h={map.height} />
        <color attach="background" args={["#0d0f14"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[cx - 6, 14, cz - 4]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
        <group>
          <Tiles />
          <Highlights />
          <Units />
          <Effects />
        </group>
        <OrbitControls
          target={[cx, 0, cz]}
          minPolarAngle={0.2}
          maxPolarAngle={1.25}
          minDistance={6}
          maxDistance={60}
          enablePan
          touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
