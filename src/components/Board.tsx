"use client";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/store/game";
import Effects from "./Effects";
import { cardKey, renderCard } from "./cards";
import { pathTo } from "@/sim/grid";
import { Pos, TERRAIN, Team, UnitDef, otherTeam } from "@/sim/types";

const TEAM_COLOR: Record<Team, string> = { red: "#e0554a", blue: "#4a86e0" };

/** Right-button drag vs click: OrbitControls pans on right-drag, so a context-menu after a drag is not an order. */
const rmb = { x: 0, y: 0, moved: false };
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      rmb.x = e.clientX;
      rmb.y = e.clientY;
      rmb.moved = false;
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (e.buttons & 2 && Math.hypot(e.clientX - rmb.x, e.clientY - rmb.y) > 6) rmb.moved = true;
  });
}
const dragged = () => rmb.moved;

function Tiles() {
  const map = useGame((s) => s.config.map);
  const clickTile = useGame((s) => s.clickTile);
  const rightClickTile = useGame((s) => s.rightClickTile);
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
            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              if (!dragged()) rightClickTile({ x, y });
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
  const showDanger = useGame((s) => s.showDanger);
  const playerTeam = useGame((s) => s.playerTeam);

  // FE danger zone: every tile the enemy team could attack on its next activation
  const danger = useMemo(() => {
    if (!showDanger || !battle || cursor < events.length || mode === "editor") return [];
    const me = selected ? battle.state.units.find((u) => u.id === selected)?.team ?? playerTeam : playerTeam;
    return [...battle.threatZone(otherTeam(me))].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    });
  }, [showDanger, battle, cursor, events.length, mode, selected, playerTeam]);

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
  const mine = !!selDef && selDef.team === playerTeam;
  // FE paint: blue = tiles this unit can move to; red = tiles it can attack into but not stand on.
  const movable = mode === "manual" ? moveTiles : preview;
  const attackBand = useMemo(() => {
    if (!sel || !selDef || !sel.alive || !battle || cursor < events.length) return [];
    if (!movable.length) return [];
    const mv = new Set(movable.map((p) => `${p.x},${p.y}`));
    mv.add(`${sel.x},${sel.y}`);
    const out: { x: number; y: number }[] = [];
    for (const k of battle.threatTiles(selDef.id)) {
      if (mv.has(k)) continue;
      const [x, y] = k.split(",").map(Number);
      out.push({ x, y });
    }
    return out;
  }, [sel, selDef, battle, cursor, events.length, movable]);
  // hovering a reachable tile previews the destination (FE cursor): path + attack squares + arcs
  const hoverPreview = useMemo(() => {
    if (pendingMove || !hover || !movable.length || !selDef || !mine) return null;
    return movable.some((m) => m.x === hover.x && m.y === hover.y) ? hover : null;
  }, [pendingMove, hover, movable, selDef, mine]);
  const previewFrom = pendingMove ?? hoverPreview;
  // attack range from the pending / hovered tile
  const pendingRange = useMemo(() => {
    const pendingMove = previewFrom;
    if (!pendingMove || !selDef) return [];
    const out: { x: number; y: number }[] = [];
    const { rangeMin, rangeMax } = selDef.stats;
    for (let dy = -rangeMax; dy <= rangeMax; dy++)
      for (let dx = -rangeMax; dx <= rangeMax; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < rangeMin || d > rangeMax) continue;
        const x = pendingMove.x + dx, y = pendingMove.y + dy;
        if (x >= 0 && y >= 0 && x < config.map.width && y < config.map.height) out.push({ x, y });
      }
    return out;
  }, [previewFrom, selDef, config.map.width, config.map.height]);
  // movement path to the previewed tile
  const path = useMemo(() => {
    if (!previewFrom || !selected || !battle || cursor < events.length) return null;
    const u = battle.state.units.find((x) => x.id === selected);
    if (!u || !u.alive || (u.x === previewFrom.x && u.y === previewFrom.y)) return null;
    const reach = battle.reachFor(selected);
    if (!reach.cost.has(`${previewFrom.x},${previewFrom.y}`)) return null;
    return pathTo(reach, previewFrom);
  }, [previewFrom, selected, battle, cursor, events.length]);
  const unitAt = (x: number, y: number) => config.units.find((u) => view.units[u.id]?.alive !== false && view.units[u.id]?.x === x && view.units[u.id]?.y === y);
  return (
    <group>
      {danger.map((p) => (
        <Highlight key={`d${p.x},${p.y}`} x={p.x} y={p.y} color="#c04cff" opacity={0.15} />
      ))}
      {attackBand.map((p) => (
        <Highlight key={`a${p.x},${p.y}`} x={p.x} y={p.y} color={mine ? "#ff4a4a" : "#ff2d2d"} opacity={mine ? 0.42 : 0.2} />
      ))}
      {movable.map((p) => (
        <Highlight key={`m${p.x},${p.y}`} x={p.x} y={p.y} color={mine ? "#3d8bff" : "#ff5a5a"} opacity={mine ? 0.5 : 0.32} />
      ))}
      {pendingRange.map((p) => (
        <Highlight key={`q${p.x},${p.y}`} x={p.x} y={p.y} color={selDef?.archetype === "healer" ? "#6cf58a" : "#ff6a6a"} opacity={0.35} />
      ))}
      {targets.map((id) => {
        const u = view.units[id];
        return u ? <Highlight key={`t${id}`} x={u.x} y={u.y} color="#ff4040" opacity={0.6} /> : null;
      })}
      {previewFrom && <Highlight x={previewFrom.x} y={previewFrom.y} color="#ffd54f" opacity={0.7} />}
      {path && <PathLine path={path} />}
      {sel && sel.alive && <Highlight x={sel.x} y={sel.y} color="#ffe082" opacity={0.5} />}
      {hover && !unitAt(hover.x, hover.y) && <Highlight x={hover.x} y={hover.y} color="#ffffff" opacity={0.18} />}
    </group>
  );
}

const CARD_W3 = 0.92;
const CARD_H3 = CARD_W3 * (352 / 256);

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

function Arc({ from, to, color, width = 3, dashed = false }: { from: Pos; to: Pos; color: string; width?: number; dashed?: boolean }) {
  const map = useGame((s) => s.config.map);
  const pts = useMemo(() => {
    const yOf = (p: Pos) => (TERRAIN[map.tiles[p.y * map.width + p.x]]?.height ?? 0.1) + 0.6;
    const a = new THREE.Vector3(from.x, yOf(from), from.y);
    const b = new THREE.Vector3(to.x, yOf(to), to.y);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.9 + a.distanceTo(b) * 0.25;
    return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(24);
  }, [from, to, map]);
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 3];
  const dir = end.clone().sub(prev).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return (
    <group>
      <Line points={pts} color={color} lineWidth={width} dashed={dashed} dashSize={0.25} gapSize={0.15} transparent opacity={0.95} depthTest={false} />
      <mesh position={end.clone().sub(dir.clone().multiplyScalar(0.12))} quaternion={q}>
        <coneGeometry args={[0.13, 0.32, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

/** Yellow movement path drawn on the ground (FE cursor arrow). */
function PathLine({ path }: { path: Pos[] }) {
  const map = useGame((s) => s.config.map);
  const pts = useMemo(() => path.map((p) => new THREE.Vector3(p.x, (TERRAIN[map.tiles[p.y * map.width + p.x]]?.height ?? 0.1) + 0.06, p.y)), [path, map]);
  if (pts.length < 2) return null;
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dir = end.clone().sub(prev).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return (
    <group>
      <Line points={pts} color="#ffd54f" lineWidth={5} transparent opacity={0.9} depthTest={false} />
      <mesh position={end.clone().sub(dir.clone().multiplyScalar(0.18))} quaternion={q}>
        <coneGeometry args={[0.16, 0.34, 4]} />
        <meshBasicMaterial color="#ffd54f" depthTest={false} />
      </mesh>
    </group>
  );
}

/** Red arcs from every enemy that can hit the selected unit where it stands (or will stand); yellow arc to the target being considered. */
function Arcs() {
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const pendingMove = useGame((s) => s.pendingMove);
  const hoverUnit = useGame((s) => s.hoverUnit);
  const targets = useGame((s) => s.targets);
  const cursor = useGame((s) => s.cursor);
  const events = useGame((s) => s.events);
  const mode = useGame((s) => s.mode);

  const hover = useGame((s) => s.hover);
  const moveTiles = useGame((s) => s.moveTiles);
  const playerTeam = useGame((s) => s.playerTeam);

  const data = useMemo(() => {
    if (!battle || cursor < events.length || mode === "editor") return null;
    // nothing selected: hovering one of your units shows who threatens it
    if (!selected) {
      const hu = hoverUnit ? battle.state.units.find((x) => x.id === hoverUnit) : null;
      if (!hu || !hu.alive || hu.team !== playerTeam) return null;
      const at = { x: hu.x, y: hu.y };
      return { at, threats: battle.threatsTo(hu.id, at).map((e) => ({ id: e.id, from: { x: e.x, y: e.y } })), target: null, team: hu.team };
    }
    const u = battle.state.units.find((x) => x.id === selected);
    if (!u || !u.alive) return null;
    const hoverTile = !pendingMove && hover && moveTiles.some((m) => m.x === hover.x && m.y === hover.y) ? hover : null;
    const at = pendingMove ?? hoverTile ?? { x: u.x, y: u.y };
    const threats = battle.threatsTo(selected, at).map((e) => ({ id: e.id, from: { x: e.x, y: e.y } }));
    let target: { id: string; to: Pos } | null = null;
    const hov = hoverUnit ? battle.state.units.find((x) => x.id === hoverUnit) : null;
    if (hov && hov.alive && hov.team !== u.team) target = { id: hov.id, to: { x: hov.x, y: hov.y } };
    else if (targets.length === 1) {
      const t = battle.unit(targets[0]);
      target = { id: t.id, to: { x: t.x, y: t.y } };
    }
    return { at, threats, target, team: u.team };
  }, [battle, selected, pendingMove, hoverUnit, targets, cursor, events.length, mode, hover, moveTiles, playerTeam]);

  if (!data) return null;
  return (
    <group>
      {data.threats.map((t) => (
        <Arc key={t.id} from={t.from} to={data.at} color="#ff3b3b" width={2.5} dashed />
      ))}
      {data.target && <Arc from={data.at} to={data.target.to} color="#ffd54f" width={4} />}
    </group>
  );
}

/** FE-style action menu shown at the unit after it previews a move with targets in range. */
function ActionMenu() {
  const pendingMove = useGame((s) => s.pendingMove);
  const targets = useGame((s) => s.targets);
  const commitWait = useGame((s) => s.commitWait);
  const cancelPending = useGame((s) => s.cancelPending);
  const map = useGame((s) => s.config.map);
  const selectedDef = useGame((s) => s.config.units.find((u) => u.id === s.selected) ?? null);
  if (!pendingMove || !selectedDef) return null;
  const th = TERRAIN[map.tiles[pendingMove.y * map.width + pendingMove.x]]?.height ?? 0.1;
  const verb = selectedDef.archetype === "healer" ? "Heal" : "Attack";
  return (
    <Html position={[pendingMove.x, th + CARD_H3 * 0.6, pendingMove.y - 0.7]} zIndexRange={[2, 0]} style={{ pointerEvents: "auto", transform: "translate(-100%, -50%)" }}>
      <div className="action-menu">
        <div className="action-hint">
          {verb}: click a {selectedDef.archetype === "healer" ? "green" : "red"} target ({targets.length})
        </div>
        <button className="action-btn" onClick={commitWait}>
          Wait
        </button>
        <button className="action-btn ghost" onClick={cancelPending}>
          Cancel
        </button>
      </div>
    </Html>
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
  const controls = useThree((s) => s.controls) as (THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update: () => void }) | null;
  const camFocus = useGame((s) => s.camFocus);
  const camTilt = useGame((s) => s.camTilt);
  const camZoom = useGame((s) => s.camZoom);
  const edgeScroll = useGame((s) => s.edgeScroll);
  const gl = useThree((s) => s.gl);
  const pointer = useRef<{ x: number; y: number; inside: boolean; mouse: boolean }>({ x: 0, y: 0, inside: false, mouse: false });
  // fixed viewing direction (unit vector from target to camera) + overview distance, recomputed on resize
  const dir = useRef(new THREE.Vector3(0, 1, 1).normalize());
  const fitDist = useRef(20);
  const goal = useRef<{ target: THREE.Vector3; dist: number } | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    (window as unknown as { __cam?: unknown; __controls?: unknown }).__cam = camera;
    (window as unknown as { __cam?: unknown; __controls?: unknown }).__controls = controls;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // Camera sits behind the player's side (high y = near edge) looking toward the enemy.
    const spanAcross = w;
    const spanDeep = h;
    const tilt = aspect < 1 ? Math.max(camTilt, 1.0) : camTilt; // radians from horizontal — the FE-style angle (user-adjustable)
    const halfA = (spanAcross / 2) * 1.1 + 0.5;
    const halfD = (spanDeep / 2) * 1.1 + 0.5;
    const nearOffset = halfD * Math.cos(tilt);
    const needW = halfA / Math.tan(hFov / 2) + nearOffset;
    const needH = (halfD * Math.max(Math.sin(tilt), 0.75)) / Math.tan(vFov / 2) + nearOffset;
    fitDist.current = Math.max(needH, needW, 8);
    dir.current = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const target = new THREE.Vector3(cx, 0, aspect < 1 ? cz + h * 0.09 : cz);
    // snap on first fit / resize; later focus requests glide. A tilt change re-aims from the current target.
    if (initialised.current && controls) {
      const curDist = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).addScaledVector(dir.current, curDist);
      camera.lookAt(controls.target);
      controls.update();
      goal.current = goal.current ? { ...goal.current } : null;
      return;
    }
    if (!initialised.current || !controls) {
      cam.position.copy(target).addScaledVector(dir.current, fitDist.current);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      if (controls) {
        controls.target.copy(target);
        controls.update();
        initialised.current = true;
      }
    } else {
      goal.current = { target, dist: fitDist.current };
    }
  }, [camera, controls, size.width, size.height, cx, cz, w, h, camTilt]);

  // zoom buttons
  useEffect(() => {
    if (!controls || camZoom.seq === 0) return;
    const curDist = camera.position.distanceTo(controls.target);
    goal.current = { target: controls.target.clone(), dist: Math.max(5, Math.min(80, curDist * camZoom.factor)) };
  }, [camZoom, controls, camera]);

  // pointer tracking for RTS edge-scroll (mouse only)
  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, inside: true, mouse: e.pointerType === "mouse" };
    };
    const leave = () => {
      pointer.current.inside = false;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, [gl]);

  // focus requests from the store (acting unit, selection, overview)
  useEffect(() => {
    if (!controls || camFocus.seq === 0) return;
    const curDist = camera.position.distanceTo(controls.target);
    const dist = camFocus.zoom === "in" ? Math.min(curDist, fitDist.current * 0.55) : camFocus.zoom === "out" ? fitDist.current : curDist;
    goal.current = { target: new THREE.Vector3(camFocus.x, 0, camFocus.y), dist };
  }, [camFocus, controls, camera]);

  // a user gesture cancels any in-flight glide so the camera never fights the hand
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls) return;
    // --- RTS edge scroll ---
    const p = pointer.current;
    if (edgeScroll && p.inside && p.mouse) {
      const EDGE = 28;
      let ex = 0,
        ey = 0;
      if (p.x < EDGE) ex = -(1 - p.x / EDGE);
      else if (p.x > size.width - EDGE) ex = 1 - (size.width - p.x) / EDGE;
      if (p.y < EDGE) ey = -(1 - p.y / EDGE);
      else if (p.y > size.height - EDGE) ey = 1 - (size.height - p.y) / EDGE;
      if (ex || ey) {
        goal.current = null;
        const dist = camera.position.distanceTo(controls.target);
        const speed = dt * (0.55 * dist + 4);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        right.y = 0;
        right.normalize();
        const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate();
        fwd.y = 0;
        fwd.normalize();
        controls.target.addScaledVector(right, ex * speed).addScaledVector(fwd, -ey * speed);
        controls.target.setX(Math.max(-2, Math.min(w + 1, controls.target.x)));
        controls.target.setZ(Math.max(-2, Math.min(h + 1, controls.target.z)));
        camera.position.copy(controls.target).addScaledVector(dir.current, dist);
        camera.lookAt(controls.target);
        controls.update();
      }
    }
    const g = goal.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 6);
    controls.target.lerp(g.target, k);
    const curDist = camera.position.distanceTo(controls.target);
    const dist = curDist + (g.dist - curDist) * k;
    camera.position.copy(controls.target).addScaledVector(dir.current, dist);
    camera.lookAt(controls.target);
    controls.update();
    if (controls.target.distanceTo(g.target) < 0.02 && Math.abs(dist - g.dist) < 0.02) goal.current = null;
  });
  return null;
}

export default function Board() {
  const map = useGame((s) => s.config.map);
  const setPainting = useGame((s) => s.setPainting);
  const cx = (map.width - 1) / 2;
  const cz = (map.height - 1) / 2;
  const span = Math.max(map.width, map.height);
  return (
    <div className="board" onPointerUp={() => setPainting(false)} onPointerLeave={() => setPainting(false)} onContextMenu={(e) => e.preventDefault()}>
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
          <ActionMenu />
          <Arcs />
          <Effects />
        </group>
        {/* Fixed viewing angle (FE-style): no rotate. Desktop: wheel = zoom, right/middle drag = pan, left = select.
            Phone: one finger = tap only, two fingers = pan + pinch zoom. The rig glides to whoever is acting. */}
        <OrbitControls
          target={[cx, 0, cz]}
          enableRotate={false}
          enablePan
          enableZoom
          minDistance={5}
          maxDistance={80}
          screenSpacePanning={false}
          mouseButtons={{ LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
          touches={{ ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_PAN }}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
