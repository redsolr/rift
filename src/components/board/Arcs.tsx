"use client";
import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { selectCaughtUp, useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { Pos } from "@/sim/types";

function Arc({ from, to, color, width = 3, dashed = false }: { from: Pos; to: Pos; color: string; width?: number; dashed?: boolean }) {
  const map = useGame((s) => s.config.map);
  const pts = useMemo(() => {
    const yOf = (p: Pos) => tileHeight(map, p) + 0.6;
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

/** Red arcs from every enemy that can hit the selected unit where it stands (or will stand); yellow arc to the target being considered. */
export default function Arcs() {
  const battle = useGame((s) => s.battle);
  const selected = useGame((s) => s.selected);
  const pendingMove = useGame((s) => s.pendingMove);
  const hoverUnit = useGame((s) => s.hoverUnit);
  const targets = useGame((s) => s.targets);
  const caughtUp = useGame(selectCaughtUp);
  const mode = useGame((s) => s.mode);

  const hover = useGame((s) => s.hover);
  const moveTiles = useGame((s) => s.moveTiles);
  const playerTeam = useGame((s) => s.playerTeam);

  const data = useMemo(() => {
    if (!battle || !caughtUp || mode === "editor") return null;
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
  }, [battle, selected, pendingMove, hoverUnit, targets, caughtUp, mode, hover, moveTiles, playerTeam]);

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

