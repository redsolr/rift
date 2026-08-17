"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { selectCaughtUp, useGame } from "@/store/game";
import { parseKey, pathTo, tileHeight, tilesInRange } from "@/sim/grid";
import { Pos, otherTeam } from "@/sim/types";

function Highlight({ x, y, color, opacity = 0.45, y0 }: { x: number; y: number; color: string; opacity?: number; y0?: number }) {
  const map = useGame((s) => s.config.map);
  return (
    <mesh position={[x, (y0 ?? tileHeight(map, { x, y })) + 0.02, y]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.92, 0.92]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

export default function Highlights() {
  const moveTiles = useGame((s) => s.moveTiles);
  const pendingMove = useGame((s) => s.pendingMove);
  const targets = useGame((s) => s.targets);
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
  // attack range from the pending / hovered tile
  const pendingRange = useMemo(
    () => (previewFrom && selDef ? tilesInRange(config.map, previewFrom, selDef.stats.rangeMin, selDef.stats.rangeMax) : []),
    [previewFrom, selDef, config.map],
  );
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

