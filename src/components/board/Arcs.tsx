"use client";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Line2 } from "three-stdlib";
import { selectCaughtUp, useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { Pos } from "@/sim/types";

/**
 * FFXII-style target line: a SOLID ribbon — wide soft glow under a coloured core under a white-hot spine —
 * with a small bead in the arc colour that travels along it toward the target and a breathing glow at the tip. No dashes,
 * no arrowhead. Threat arcs are thin red; the target arc is gold and a little bolder.
 */
function Arc({ from, to, color, hot, width = 2 }: { from: Pos; to: Pos; color: string; hot: string; width?: number }) {
  const map = useGame((s) => s.config.map);
  const glowA = useRef<Line2>(null);
  const glowB = useRef<Line2>(null);
  const spine = useRef<Line2>(null);
  const tip = useRef<THREE.Mesh>(null);
  const tipGlow = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  // additive blending on drei Lines: the material is created inside Line, so set it after mount
  useEffect(() => {
    for (const r of [glowA, glowB, spine]) {
      const m = r.current?.material as THREE.Material | undefined;
      if (m && m.blending !== THREE.AdditiveBlending) {
        m.blending = THREE.AdditiveBlending;
        m.needsUpdate = true;
      }
    }
  });

  const { pts, curve, len } = useMemo(() => {
    const yOf = (p: Pos) => tileHeight(map, p) + 0.6;
    const a = new THREE.Vector3(from.x, yOf(from), from.y);
    const b = new THREE.Vector3(to.x, yOf(to), to.y);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.9 + a.distanceTo(b) * 0.25;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return { pts: curve.getPoints(40), curve, len: curve.getLength() };
  }, [from, to, map]);
  const end = pts[pts.length - 1];

  useFrame((_, dt) => {
    t.current += dt;
    // pulse: one small bead in the arc colour running start → target, ~2.2 tiles/s
    const speed = 2.2;
    const period = Math.max(0.6, len / speed) + 0.35;
    const k = (t.current % period) / (len / speed);
    if (pulse.current) {
      const vis = k <= 1;
      pulse.current.visible = vis;
      if (vis) {
        pulse.current.position.copy(curve.getPoint(k));
        // fade in over the first 10 %, out over the last 10 %
        const fade = Math.min(1, k / 0.1, (1 - k) / 0.1);
        (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      }
    }
    if (tip.current) tip.current.scale.setScalar(1 + 0.18 * Math.sin(t.current * 6));
    if (tipGlow.current) tipGlow.current.scale.setScalar(1.6 + 0.5 * Math.sin(t.current * 6 + 1));
  });

  return (
    <group>
      {/* soft outer glow → tighter glow → coloured core → white-hot spine */}
      <Line ref={glowA} points={pts} color={color} lineWidth={width * 7} transparent opacity={0.10} depthTest={false} />
      <Line ref={glowB} points={pts} color={color} lineWidth={width * 3} transparent opacity={0.28} depthTest={false} />
      <Line points={pts} color={color} lineWidth={width * 1.25} transparent opacity={0.95} depthTest={false} />
      <Line ref={spine} points={pts} color={hot} lineWidth={Math.max(0.5, width * 0.4)} transparent opacity={0.7} depthTest={false} />
      {/* travelling pulse: a single bead in the arc colour */}
      <mesh ref={pulse}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* tip: coloured bead + breathing halo */}
      <mesh ref={tipGlow} position={end}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={tip} position={end}>
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
        <Arc key={t.id} from={t.from} to={data.at} color="#c41a12" hot="#ff6a55" width={1.8} />
      ))}
      {data.target && <Arc from={data.at} to={data.target.to} color="#e0a020" hot="#fff0b8" width={2.6} />}
    </group>
  );
}

