"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { selectCaughtUp, useGame } from "@/store/game";
import { parseKey, pathTo, tileHeight, tilesInRange } from "@/sim/grid";
import { attackById, attackRange, tilesInAnyRange } from "@/sim/attacks";
import { Pos, otherTeam } from "@/sim/types";

/** Hollow square frame (outer 0.98, inner 0.86) — the FE tile edge. Built once. */
const FRAME_GEO = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.49, -0.49);
  shape.lineTo(0.49, -0.49);
  shape.lineTo(0.49, 0.49);
  shape.lineTo(-0.49, 0.49);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.43, -0.43);
  hole.lineTo(0.43, -0.43);
  hole.lineTo(0.43, 0.43);
  hole.lineTo(-0.43, 0.43);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
})();

function Highlight({ x, y, color, opacity = 0.45, y0, border, borderOpacity = 0.9, lift = 0.02 }: { x: number; y: number; color: string; opacity?: number; y0?: number; border?: string; borderOpacity?: number; lift?: number }) {
  const map = useGame((s) => s.config.map);
  const h = (y0 ?? tileHeight(map, { x, y })) + lift;
  return (
    <group position={[x, h, y]} rotation={[-Math.PI / 2, 0, 0]}>
      {border && (
        <mesh geometry={FRAME_GEO}>
          <meshBasicMaterial color={border} transparent opacity={borderOpacity} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={border ? [0.86, 0.86] : [0.92, 0.92]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function Highlights() {
  const moveTiles = useGame((s) => s.moveTiles);
  const pendingMove = useGame((s) => s.pendingMove);
  const targets = useGame((s) => s.targets);
  const pendingAttack = useGame((s) => s.pendingAttack);
  const hoverAttack = useGame((s) => s.hoverAttack);
  const menuKind = useGame((s) => s.menuKind);
  const menuPage = useGame((s) => s.menuPage);
  const hover = useGame((s) => s.hover);
  const selected = useGame((s) => s.selected);
  const view = useGame((s) => s.view);
  const config = useGame((s) => s.config);
  const mode = useGame((s) => s.mode);
  const battle = useGame((s) => s.battle);
  const caughtUp = useGame(selectCaughtUp);
  const showDanger = useGame((s) => s.showDanger);
  const playerTeam = useGame((s) => s.playerTeam);

  // FE danger zone: every tile the enemy team could attack on its next activation
  const danger = useMemo(() => {
    if (!showDanger || !battle || !caughtUp || mode === "editor") return [];
    const me = selected ? battle.state.units.find((u) => u.id === selected)?.team ?? playerTeam : playerTeam;
    return [...battle.threatZone(otherTeam(me))].map(parseKey);
  }, [showDanger, battle, caughtUp, mode, selected, playerTeam]);

  // In manager/editor, selecting a unit previews its reach (from the engine when live, from config otherwise)
  const preview = useMemo(() => {
    if (!selected || mode === "manual") return [];
    if (battle && caughtUp) {
      const u = battle.state.units.find((x) => x.id === selected);
      if (!u || !u.alive) return [];
      return battle.standableFor(selected);
    }
    return [];
  }, [selected, mode, battle, caughtUp]);

  const hoverUnit = useGame((s) => s.hoverUnit);
  const hovDef = hoverUnit ? config.units.find((u) => u.id === hoverUnit) ?? null : null;
  const hovView = hoverUnit ? view.units[hoverUnit] : null;
  const focusEnemy = hovDef && hovView && hovView.alive && hovDef.team !== playerTeam ? hovView : null;
  const sel = selected ? view.units[selected] : null;
  const selDef = selected ? config.units.find((u) => u.id === selected) : null;
  const mine = !!selDef && selDef.team === playerTeam;
  // FE paint: blue = tiles this unit can move to; red = tiles it can attack into but not stand on.
  const movable = mode === "manual" ? moveTiles : preview;
  const attackBand = useMemo(() => {
    if (!sel || !selDef || !sel.alive || !battle || !caughtUp) return [];
    if (!movable.length) return [];
    const mv = new Set(movable.map((p) => `${p.x},${p.y}`));
    mv.add(`${sel.x},${sel.y}`);
    const out: { x: number; y: number }[] = [];
    for (const k of battle.threatTiles(selDef.id)) if (!mv.has(k)) out.push(parseKey(k));
    return out;
  }, [sel, selDef, battle, caughtUp, movable]);
  // hovering a reachable tile previews the destination (FE cursor): path + attack squares + arcs
  const hoverPreview = useMemo(() => {
    if (pendingMove || !hover || !movable.length || !selDef || !mine) return null;
    return movable.some((m) => m.x === hover.x && m.y === hover.y) ? hover : null;
  }, [pendingMove, hover, movable, selDef, mine]);
  const previewFrom = pendingMove ?? hoverPreview;
  // FE Three Hopes: the attack range from where the unit STANDS (or will stand) is drawn over the move field
  const attackOrigin = useMemo(() => previewFrom ?? (sel && sel.alive && mine ? { x: sel.x, y: sel.y } : null), [previewFrom, sel, mine]);
  // attack range from the pending / hovered tile: the chosen (or hovered) attack's range, else the union of all four
  const focusAttack = pendingAttack ?? hoverAttack;
  // healing range (green) when a heal is focused / the Heal picker is open / a healer idles; else damage range
  const healing = selDef ? (focusAttack ? attackById(selDef, focusAttack).kind === "heal" : menuPage && menuPage !== "command" ? menuKind === "heal" : selDef.archetype === "healer") : false;
  const pendingRange = useMemo(() => {
    if (!attackOrigin || !selDef) return [];
    if (focusAttack) return tilesInRange(config.map, attackOrigin, ...attackRange(selDef, attackById(selDef, focusAttack)));
    return tilesInAnyRange(config.map, { ...selDef, hp: 0, alive: true, acted: false }, attackOrigin, healing ? "heal" : "attack");
  }, [attackOrigin, selDef, focusAttack, healing, config.map]);
  // movement path to the previewed tile
  const path = useMemo(() => {
    if (!previewFrom || !selected || !battle || !caughtUp) return null;
    const u = battle.state.units.find((x) => x.id === selected);
    if (!u || !u.alive || (u.x === previewFrom.x && u.y === previewFrom.y)) return null;
    const reach = battle.reachFor(selected);
    if (!reach.cost.has(`${previewFrom.x},${previewFrom.y}`)) return null;
    return pathTo(reach, previewFrom);
  }, [previewFrom, selected, battle, caughtUp]);
  const unitAt = (x: number, y: number) => config.units.find((u) => view.units[u.id]?.alive !== false && view.units[u.id]?.x === x && view.units[u.id]?.y === y);
  return (
    <group>
      {danger.map((p) => (
        <Highlight key={`d${p.x},${p.y}`} x={p.x} y={p.y} color="#c04cff" opacity={0.15} />
      ))}
      {attackBand.map((p) => (
        <Highlight key={`a${p.x},${p.y}`} x={p.x} y={p.y} color={mine ? "#ff4a4a" : "#ff2d2d"} opacity={mine ? 0.4 : 0.2} border={mine ? "#ff8a80" : undefined} borderOpacity={0.35} />
      ))}
      {movable.map((p) => (
        <Highlight key={`m${p.x},${p.y}`} x={p.x} y={p.y} color={mine ? "#3d8bff" : "#ff5a5a"} opacity={mine ? 0.55 : 0.32} border={mine ? "#dcecff" : undefined} borderOpacity={0.35} />
      ))}
      {pendingRange.map((p) => (
        <Highlight key={`q${p.x},${p.y}`} x={p.x} y={p.y} color={healing ? "#6cf58a" : "#e26bd0"} opacity={0.5} border={healing ? "#9cffb0" : "#ff8a3c"} borderOpacity={0.9} lift={0.03} />
      ))}
      {targets.map((id) => {
        const u = view.units[id];
        return u ? <Highlight key={`t${id}`} x={u.x} y={u.y} color={selDef && config.units.find((q) => q.id === id)?.team === selDef.team ? "#3ddc6a" : "#ff4040"} opacity={0.6} /> : null;
      })}
      {previewFrom && <Highlight x={previewFrom.x} y={previewFrom.y} color="#ffd54f" opacity={0.7} />}
      {focusEnemy && <FocusTile x={focusEnemy.x} y={focusEnemy.y} color={selected && targets.includes(hoverUnit!) ? "#ffe082" : "#ff6a6a"} />}
      {path && <PathLine path={path} />}
      {sel && sel.alive && <Highlight x={sel.x} y={sel.y} color="#ffe082" opacity={0.5} />}
      {hover && !unitAt(hover.x, hover.y) && <Highlight x={hover.x} y={hover.y} color="#ffffff" opacity={0.18} />}
    </group>
  );
}

/** Pulsing bracket frame on the tile of the enemy under the pointer (FE target focus). */
function FocusTile({ x, y, color }: { x: number; y: number; color: string }) {
  const map = useGame((s) => s.config.map);
  const g = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const k = 1 + 0.06 * Math.sin(t.current * 6);
    g.current?.scale.set(k, 1, k);
  });
  const h = tileHeight(map, { x, y }) + 0.03;
  const L = 0.32, T = 0.07, o = 0.5;
  const corners: [number, number, number, number][] = [
    [-o, -o, 1, 1],
    [o, -o, -1, 1],
    [-o, o, 1, -1],
    [o, o, -1, -1],
  ];
  return (
    <group ref={g} position={[x, h, y]}>
      {corners.map(([cx, cz, sx, sz], i) => (
        <group key={i} position={[cx, 0, cz]}>
          <mesh position={[(sx * L) / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[L, T]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, 0, (sz * L) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[T, L]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
        <planeGeometry args={[0.96, 0.96]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Yellow movement path drawn on the ground (FE cursor arrow). */
function PathLine({ path }: { path: Pos[] }) {
  const map = useGame((s) => s.config.map);
  const pts = useMemo(() => path.map((p) => new THREE.Vector3(p.x, tileHeight(map, p) + 0.06, p.y)), [path, map]);
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

