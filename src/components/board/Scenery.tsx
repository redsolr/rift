"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "@/store/game";
import { TERRAIN, Terrain } from "@/sim/types";
import { inBounds, terrainAt, tileHeight } from "@/sim/grid";
import { sceneMaterial, tileHash } from "./textures";

/**
 * City dressing for the "scene" board view (FE Three Hopes town-square read): cypress trees on
 * forest tiles, crates + barrels beside walls, terracotta kerbs where the plaza meets other terrain,
 * scrolling water — plus the GRID OVERLAY, which shows only while a unit is selected (FE) or the
 * HUD ▦ Grid debug toggle is on. Everything is deterministic per tile (`tileHash`), all instanced.
 * Terrain heights come from `sim/grid.ts#tileHeight` — nothing here re-derives geometry.
 */

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

interface Inst {
  p: [number, number, number];
  ry?: number;
  s?: [number, number, number];
  rx?: number;
}

function Instanced({ items, geo, mat, castShadow = true }: { items: Inst[]; geo: THREE.BufferGeometry; mat: THREE.Material; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    items.forEach((it, i) => {
      _p.set(...it.p);
      _e.set(it.rx ?? 0, it.ry ?? 0, 0, "YXZ");
      _q.setFromEuler(_e);
      _s.set(...(it.s ?? [1, 1, 1]));
      _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
    });
    im.count = items.length;
    im.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return <instancedMesh key={items.length} ref={ref} args={[geo, mat, Math.max(1, items.length)]} castShadow={castShadow} receiveShadow frustumCulled={false} />;
}

// shared geometries / materials (module singletons — never recreated per render)
const TRUNK_GEO = new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6);
const CONE_LO_GEO = new THREE.ConeGeometry(0.19, 0.55, 7);
const CONE_HI_GEO = new THREE.ConeGeometry(0.13, 0.5, 7);
const PLANTER_GEO = new THREE.BoxGeometry(0.34, 0.16, 0.34);
const CRATE_GEO = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const BARREL_GEO = new THREE.CylinderGeometry(0.1, 0.09, 0.24, 8);
const KERB_GEO = new THREE.PlaneGeometry(1, 0.11);
const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: "#5a3f2a", roughness: 1 });
const CONE_MAT = new THREE.MeshStandardMaterial({ color: "#2f5f34", roughness: 1 });
const CONE_HI_MAT = new THREE.MeshStandardMaterial({ color: "#3a7440", roughness: 1 });
const PLANTER_MAT = new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 1 });
const CRATE_MAT = new THREE.MeshStandardMaterial({ color: "#a67c4e", roughness: 1 });
const BARREL_MAT = new THREE.MeshStandardMaterial({ color: "#6e4a2e", roughness: 1 });
const KERB_MAT = new THREE.MeshBasicMaterial({ color: "#c96f48", transparent: true, opacity: 0.9, depthWrite: false });
const GRID_MAT = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.42, depthWrite: false });

const PLAZA: Terrain[] = ["ground", "objective", "shrine"];

export default function Scenery() {
  const map = useGame((s) => s.config.map);
  const boardView = useGame((s) => s.boardView);
  const showGrid = useGame((s) => s.showGrid);
  const selected = useGame((s) => s.selected);

  const dressing = useMemo(() => {
    const trunks: Inst[] = [];
    const conesLo: Inst[] = [];
    const conesHi: Inst[] = [];
    const planters: Inst[] = [];
    const crates: Inst[] = [];
    const barrels: Inst[] = [];
    const kerbs: Inst[] = [];
    const tree = (x: number, z: number, y: number, k: number, scale = 1) => {
      trunks.push({ p: [x, y + 0.15 * scale, z], s: [scale, scale, scale] });
      conesLo.push({ p: [x, y + 0.45 * scale, z], ry: k * 6.28, s: [scale, scale, scale] });
      conesHi.push({ p: [x, y + 0.85 * scale, z], ry: k * 6.28 + 0.4, s: [scale, scale, scale] });
    };
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const t = terrainAt(map, x, y);
        const h = TERRAIN[t].height;
        if (t === "forest") {
          // two or three cypresses per forest tile, off-centre so a unit card still reads
          const n = 2 + (tileHash(x, y, 1) < 0.4 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const a = tileHash(x, y, 10 + i) * Math.PI * 2;
            const r = 0.24 + tileHash(x, y, 20 + i) * 0.14;
            tree(x + Math.cos(a) * r, y + Math.sin(a) * r, h, tileHash(x, y, 30 + i), 0.85 + tileHash(x, y, 40 + i) * 0.35);
          }
        }
        if (t === "hill" && tileHash(x, y, 2) < 0.3) {
          const a = tileHash(x, y, 11) * Math.PI * 2;
          tree(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, h, tileHash(x, y, 31), 0.7);
        }
        if (PLAZA.includes(t)) {
          // kerbs: terracotta band along any side that meets non-plaza terrain (the FE plaza-border read)
          const sides: [number, number, number][] = [
            [0, -1, 0],
            [1, 0, Math.PI / 2],
            [0, 1, Math.PI],
            [-1, 0, -Math.PI / 2],
          ];
          let nearWall = false;
          for (const [dx, dz, ry] of sides) {
            const nx = x + dx;
            const nz = y + dz;
            const nt = inBounds(map, nx, nz) ? terrainAt(map, nx, nz) : null;
            if (nt === "wall") nearWall = true;
            if (nt !== null && !PLAZA.includes(nt)) kerbs.push({ p: [x + dx * 0.44, h + 0.012, y + dz * 0.44], ry, rx: -Math.PI / 2 });
          }
          // planter trees on quiet plaza tiles (never on objectives/shrines): the tree-lined square
          if (t === "ground" && !nearWall && tileHash(x, y, 3) < 0.07) {
            const cx = x + (tileHash(x, y, 12) < 0.5 ? -0.3 : 0.3);
            const cz = y + (tileHash(x, y, 13) < 0.5 ? -0.3 : 0.3);
            planters.push({ p: [cx, h + 0.08, cz] });
            tree(cx, cz, h + 0.12, tileHash(x, y, 32), 0.75);
          }
          // crates + barrels stacked against walls
          if (nearWall && tileHash(x, y, 4) < 0.45) {
            const cx = x + (tileHash(x, y, 14) - 0.5) * 0.5;
            const cz = y + (tileHash(x, y, 15) - 0.5) * 0.5;
            crates.push({ p: [cx, h + 0.11, cz], ry: tileHash(x, y, 16) * 0.6 });
            if (tileHash(x, y, 5) < 0.6) barrels.push({ p: [cx + 0.24, h + 0.12, cz - 0.1] });
            if (tileHash(x, y, 6) < 0.3) crates.push({ p: [cx, h + 0.33, cz], ry: tileHash(x, y, 17) * 0.6, s: [0.85, 0.85, 0.85] });
          }
        }
      }
    return { trunks, conesLo, conesHi, planters, crates, barrels, kerbs };
  }, [map]);

  // one draw call: every tile's outline at its own height
  const gridGeo = useMemo(() => {
    const pts: number[] = [];
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const h = tileHeight(map, { x, y }) + 0.014;
        const x0 = x - 0.5;
        const x1 = x + 0.5;
        const z0 = y - 0.5;
        const z1 = y + 0.5;
        pts.push(x0, h, z0, x1, h, z0, x1, h, z0, x1, h, z1, x1, h, z1, x0, h, z1, x0, h, z1, x0, h, z0);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [map]);

  // scrolling water
  useFrame((_, dt) => {
    const w = sceneMaterial("water");
    if (w.map) {
      w.map.offset.x = (w.map.offset.x + dt * 0.02) % 1;
      w.map.offset.y = (w.map.offset.y + dt * 0.012) % 1;
    }
  });

  const gridOn = showGrid || (boardView === "scene" && selected !== null);

  return (
    <group>
      {boardView === "scene" && (
        <>
          <Instanced items={dressing.trunks} geo={TRUNK_GEO} mat={TRUNK_MAT} />
          <Instanced items={dressing.conesLo} geo={CONE_LO_GEO} mat={CONE_MAT} />
          <Instanced items={dressing.conesHi} geo={CONE_HI_GEO} mat={CONE_HI_MAT} />
          <Instanced items={dressing.planters} geo={PLANTER_GEO} mat={PLANTER_MAT} />
          <Instanced items={dressing.crates} geo={CRATE_GEO} mat={CRATE_MAT} />
          <Instanced items={dressing.barrels} geo={BARREL_GEO} mat={BARREL_MAT} />
          <Instanced items={dressing.kerbs} geo={KERB_GEO} mat={KERB_MAT} castShadow={false} />
        </>
      )}
      {gridOn && <lineSegments geometry={gridGeo} material={GRID_MAT} frustumCulled={false} />}
    </group>
  );
}
