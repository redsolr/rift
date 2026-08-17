"use client";
import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { selectCaughtUp, useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { Pos } from "@/sim/types";

/** Indicator arc: a plain solid line on a gentle bezier hop, with a small bead at the tip. Threat = red, target = gold. */
function Arc({ from, to, color, width = 2 }: { from: Pos; to: Pos; color: string; width?: number }) {
  const map = useGame((s) => s.config.map);
  const pts = useMemo(() => {
    const yOf = (p: Pos) => tileHeight(map, p) + 0.6;
    const a = new THREE.Vector3(from.x, yOf(from), from.y);
    const b = new THREE.Vector3(to.x, yOf(to), to.y);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.9 + a.distanceTo(b) * 0.25;
    return new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(40);
  }, [from, to, map]);
  const end = pts[pts.length - 1];
  return (
    <group>
      <Line points={pts} color={color} lineWidth={width} transparent opacity={0.95} depthTest={false} />
      <mesh position={end}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} depthWrite={false} toneMapped={false} />
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
        <Arc key={t.id} from={t.from} to={data.at} color="#d81f16" width={2} />
      ))}
      {data.target && <Arc from={data.at} to={data.target.to} color="#f0b030" width={2.6} />}
    </group>
  );
}

