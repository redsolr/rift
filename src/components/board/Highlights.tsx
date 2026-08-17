"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { selectCaughtUp, useGame } from "@/store/game";
import { parseKey, pathTo, tileHeight, tilesInRange } from "@/sim/grid";
import { attackById, attackRange, tilesInAnyRange } from "@/sim/attacks";
import { Pos, otherTeam } from "@/sim/types";

/** Hollow square frame (outer 0.98, inner 0.93) — the thin FE tile edge. Built once. */
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
        <planeGeometry args={border ? [0.93, 0.93] : [0.94, 0.94]} />
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
    return tilesInAnyRange(config.map, { ...selDef, hp: 0, alive: true, acted: false, buff: null }, attackOrigin, healing ? "heal" : "attack");
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
        <Highlight key={`a${p.x},${p.y}`} x={p.x} y={p.y} color={mine ? "#ff7a8a" : "#ff5a5a"} opacity={mine ? 0.34 : 0.22} border={mine ? "#ff4a5e" : undefined} borderOpacity={0.8} />
      ))}
      {movable.map((p) => (
        <Highlight key={`m${p.x},${p.y}`} x={p.x} y={p.y} color={mine ? "#6f8fff" : "#ff7a7a"} opacity={mine ? 0.5 : 0.3} border={mine ? "#e8eeff" : undefined} borderOpacity={0.8} />
      ))}
      {pendingRange.map((p) => (
        <Highlight key={`q${p.x},${p.y}`} x={p.x} y={p.y} color={healing ? "#7ff29a" : "#ff6f8c"} opacity={0.36} border={healing ? "#b8ffc8" : "#ff3d5c"} borderOpacity={0.85} lift={0.03} />
      ))}
      {targets.map((id) => {
        const u = view.units[id];
        return u ? <Highlight key={`t${id}`} x={u.x} y={u.y} color={selDef && config.units.find((q) => q.id === id)?.team === selDef.team ? "#3ddc6a" : "#ff4040"} opacity={0.6} /> : null;
      })}
      {previewFrom && <Highlight x={previewFrom.x} y={previewFrom.y} color="#fff3b0" opacity={0.45} border="#ffffff" borderOpacity={0.9} lift={0.035} />}
      {focusEnemy && <FocusTile x={focusEnemy.x} y={focusEnemy.y} color={selected && targets.includes(hoverUnit!) ? "#ffe082" : "#ff6a6a"} />}
      {path && <PathLine path={path} />}
      {sel && sel.alive && <Highlight x={sel.x} y={sel.y} color="#ffffff" opacity={0.28} border="#ffffff" borderOpacity={0.9} lift={0.034} />}
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

/** FE Three Hopes movement path: a flat WHITE ribbon on the ground, square corners, filled arrowhead at the destination. */
function PathLine({ path }: { path: Pos[] }) {
  const map = useGame((s) => s.config.map);
  const W = 0.13; // ribbon width (tiles)
  const geo = useMemo(() => {
    if (path.length < 2) return null;
    const pts = path.map((p) => new THREE.Vector3(p.x, tileHeight(map, p) + 0.045, p.y));
    const geos: THREE.BufferGeometry[] = [];
    const last = pts.length - 1;
    // arrowhead: a filled triangle whose base sits at the tile edge and whose tip lands near the tile centre
    const tip = pts[last];
    const dir = tip.clone().sub(pts[last - 1]).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const headLen = 0.42;
    const headHalf = 0.24;
    const headBase = tip.clone().sub(dir.clone().multiplyScalar(0.02 + headLen));
    const headTip = tip.clone().sub(dir.clone().multiplyScalar(0.02));
    // ribbon segments (each a flat quad); the final one stops at the arrowhead base
    for (let i = 0; i < last; i++) {
      const a = pts[i];
      const b = i === last - 1 ? headBase : pts[i + 1];
      const d = b.clone().sub(a);
      const len = d.length();
      if (len < 1e-4) continue;
      d.normalize();
      const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(W / 2);
      // extend by W/2 at joints so square corners close
      const a2 = i === 0 ? a : a.clone().sub(d.clone().multiplyScalar(W / 2));
      const b2 = i === last - 1 ? b : b.clone().add(d.clone().multiplyScalar(W / 2));
      const q = new THREE.BufferGeometry();
      const y = Math.max(a.y, b.y);
      const v = [a2.x + n.x, y, a2.z + n.z, b2.x + n.x, y, b2.z + n.z, b2.x - n.x, y, b2.z - n.z, a2.x - n.x, y, a2.z - n.z];
      q.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      q.setIndex([0, 1, 2, 0, 2, 3]);
      geos.push(q);
    }
    const h = new THREE.BufferGeometry();
    const l = headBase.clone().add(side.clone().multiplyScalar(headHalf));
    const r = headBase.clone().sub(side.clone().multiplyScalar(headHalf));
    const y = Math.max(headBase.y, headTip.y);
    h.setAttribute("position", new THREE.Float32BufferAttribute([l.x, y, l.z, headTip.x, y, headTip.z, r.x, y, r.z], 3));
    h.setIndex([0, 1, 2]);
    geos.push(h);
    // merge by hand (no BufferGeometryUtils import): concatenate positions + reindex
    const pos: number[] = [];
    const idx: number[] = [];
    for (const g of geos) {
      const base = pos.length / 3;
      pos.push(...Array.from(g.getAttribute("position").array as Float32Array));
      idx.push(...Array.from(g.getIndex()!.array as unknown as number[]).map((i) => i + base));
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setIndex(idx);
    return out;
  }, [path, map]);
  if (!geo) return null;
  return (
    <mesh geometry={geo} renderOrder={5}>
      <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
