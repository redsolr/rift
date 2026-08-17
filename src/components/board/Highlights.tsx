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

/**
 * FE Three Hopes movement path: a slim WHITE ribbon on the ground with ROUNDED turns (quarter arcs) and a swept, notched
 * arrowhead, over a soft glow. Built as ONE mitred triangle strip (no overlapping pieces — overlaps double-blend into
 * visible dots on a transparent mesh). Each triangle knows its distance along the path, so the visible length can be
 * animated: it EASES toward the current path length whenever the path changes — grows out, or shrinks back — never snaps.
 */
interface PathGeo {
  geo: THREE.BufferGeometry;
  /** cumulative path length at the END of each triangle (index i → triangle i); the head triangles carry the total */
  triEnd: number[];
  total: number;
}
function buildPathGeometry(raw: THREE.Vector3[], W: number, headScale: number): PathGeo {
  const R = 0.32; // corner radius (tiles)
  const last = raw.length - 1;
  const dir = raw[last].clone().sub(raw[last - 1]).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const headLen = 0.3 * headScale;
  const headHalf = 0.15 * headScale;
  const notch = 0.09 * headScale;
  const headTip = raw[last].clone().add(dir.clone().multiplyScalar(0.12));
  const headBack = headTip.clone().sub(dir.clone().multiplyScalar(headLen));
  const headNotch = headBack.clone().add(dir.clone().multiplyScalar(notch));
  // centreline
  const line: THREE.Vector3[] = [raw[0].clone()];
  for (let i = 1; i < last; i++) {
    const prev = raw[i - 1];
    const cur = raw[i];
    const next = raw[i + 1];
    const dIn = cur.clone().sub(prev).normalize();
    const dOut = next.clone().sub(cur).normalize();
    if (Math.abs(dIn.dot(dOut)) > 0.999) {
      line.push(cur.clone());
      continue;
    }
    const pIn = cur.clone().sub(dIn.clone().multiplyScalar(R));
    const pOut = cur.clone().add(dOut.clone().multiplyScalar(R));
    const N = 8;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const q = pIn.clone().multiplyScalar((1 - t) * (1 - t)).add(cur.clone().multiplyScalar(2 * (1 - t) * t)).add(pOut.clone().multiplyScalar(t * t));
      q.y = Math.max(pIn.y, pOut.y);
      line.push(q);
    }
  }
  line.push(headNotch.clone());
  // mitred strip: two vertices per centreline point, offset along the averaged normal
  const pos: number[] = [];
  const idx: number[] = [];
  const triEnd: number[] = [];
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + line[i].distanceTo(line[i - 1]));
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const dPrev = i > 0 ? line[i].clone().sub(line[i - 1]).normalize() : line[i + 1].clone().sub(line[i]).normalize();
    const dNext = i < n - 1 ? line[i + 1].clone().sub(line[i]).normalize() : dPrev;
    const t = dPrev.clone().add(dNext).normalize();
    const nrm = new THREE.Vector3(-t.z, 0, t.x);
    // mitre length so the strip keeps constant width through the turn
    const cosHalf = Math.max(0.5, nrm.dot(new THREE.Vector3(-dPrev.z, 0, dPrev.x)));
    const off = nrm.multiplyScalar(W / 2 / cosHalf);
    const y = line[i].y;
    pos.push(line[i].x + off.x, y, line[i].z + off.z, line[i].x - off.x, y, line[i].z - off.z);
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 2, b + 3, b, b + 3, b + 1);
      triEnd.push(cum[i], cum[i]);
    }
  }
  const total = cum[n - 1];
  // swept arrowhead: tip, right barb, notch, left barb (two triangles) — shown once the strip is complete
  const y = headTip.y;
  const l = headBack.clone().add(side.clone().multiplyScalar(headHalf));
  const r = headBack.clone().sub(side.clone().multiplyScalar(headHalf));
  const b0 = pos.length / 3;
  pos.push(headTip.x, y, headTip.z, r.x, y, r.z, headNotch.x, y, headNotch.z, l.x, y, l.z);
  idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  triEnd.push(total, total);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return { geo, triEnd, total };
}

/** number of index entries to draw so that every triangle ending at or before `len` is visible */
function drawCountFor(g: PathGeo, len: number): number {
  let tris = 0;
  while (tris < g.triEnd.length && g.triEnd[tris] <= len + 1e-4) tris++;
  return tris * 3;
}

function PathLine({ path }: { path: Pos[] }) {
  const map = useGame((s) => s.config.map);
  const core = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  /** visible length along the path, in tiles — eases toward the current total */
  const shown = useRef(0);
  const geos = useMemo(() => {
    if (path.length < 2) return null;
    const raw = path.map((p) => new THREE.Vector3(p.x, tileHeight(map, p) + 0.045, p.y));
    return { core: buildPathGeometry(raw, 0.06, 1), glow: buildPathGeometry(raw, 0.16, 1.35) };
  }, [path, map]);
  useFrame((_, dt) => {
    if (!geos) return;
    const target = geos.core.total;
    // exponential ease toward the target length: grows out / shrinks back smoothly, frame-rate independent
    shown.current += (target - shown.current) * (1 - Math.exp(-dt * 14));
    if (Math.abs(target - shown.current) < 0.005) shown.current = target;
    core.current?.geometry.setDrawRange(0, drawCountFor(geos.core, shown.current));
    glow.current?.geometry.setDrawRange(0, drawCountFor(geos.glow, shown.current));
  });
  if (!geos) return null;
  return (
    <group>
      <mesh ref={glow} geometry={geos.glow.geo} renderOrder={4}>
        <meshBasicMaterial color="#cfe6ff" transparent opacity={0.28} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={core} geometry={geos.core.geo} renderOrder={5}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.96} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
