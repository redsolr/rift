"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { selectDropTarget, useGame } from "@/store/game";
import { tileHeight } from "@/sim/grid";
import { makeUnit } from "@/sim/presets";
import { TERRAIN, Terrain } from "@/sim/types";
import { CardMesh } from "./Units";
import { sigilTexture } from "./Runes";

/**
 * RTS-style placement preview for the editor. Whatever is being placed — a carried unit card, a carried shrine /
 * objective, or the palette tool (unit / terrain) — is shown on the tile under the pointer BEFORE it is dropped:
 * a green (legal) or red (illegal) footprint on the ground plus a translucent ghost of the object itself. The
 * carried unit card itself rides the pointer (Units.tsx); this draws the footprint, the feature / palette ghosts
 * and the "from" marker on the tile a carried object came from.
 */

const OK = "#3ddc84";
const BAD = "#ff4d4d";

function Footprint({ x, y, ok }: { x: number; y: number; ok: boolean }) {
  const map = useGame((s) => s.config.map);
  const y0 = tileHeight(map, { x, y });
  const fill = useRef<THREE.Mesh>(null);
  const edge = useRef<THREE.LineSegments>(null);
  const color = ok ? OK : BAD;
  const edgeGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.98, 0.98)), []);
  useFrame(({ clock }) => {
    // gentle breathing so the footprint reads as "live", like an RTS build cursor
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4);
    if (fill.current) (fill.current.material as THREE.MeshBasicMaterial).opacity = 0.22 + k * 0.14;
    if (edge.current) (edge.current.material as THREE.LineBasicMaterial).opacity = 0.7 + k * 0.3;
  });
  return (
    <group position={[x, y0 + 0.03, y]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={fill}>
        <planeGeometry args={[0.98, 0.98]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
      <lineSegments ref={edge} geometry={edgeGeom}>
        <lineBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </lineSegments>
      {!ok && (
        // red cross through the tile: "cannot place here"
        <group>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[0.9, 0.06]} />
            <meshBasicMaterial color={BAD} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <planeGeometry args={[0.9, 0.06]} />
            <meshBasicMaterial color={BAD} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Faint outline on the tile a carried object came from ("it was here"). */
function FromMarker({ x, y }: { x: number; y: number }) {
  const map = useGame((s) => s.config.map);
  const y0 = tileHeight(map, { x, y });
  const edgeGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.9)), []);
  return (
    <lineSegments position={[x, y0 + 0.03, y]} rotation={[-Math.PI / 2, 0, 0]} geometry={edgeGeom}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

/** Translucent block of a terrain kind on a tile: the ghost of a painted tile or a carried shrine / objective. */
function TerrainGhost({ x, y, terrain, ok }: { x: number; y: number; terrain: Terrain; ok: boolean }) {
  const map = useGame((s) => s.config.map);
  const d = TERRAIN[terrain];
  const base = tileHeight(map, { x, y });
  const sigil = useMemo(() => sigilTexture(), []);
  const h = Math.max(0.08, d.height);
  return (
    <group position={[x, base, y]}>
      <mesh position={[0, h / 2 + 0.005, 0]}>
        <boxGeometry args={[0.92, h, 0.92]} />
        <meshBasicMaterial color={ok ? d.color : BAD} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
      {terrain === "shrine" && (
        // the rune sigil, additive so it glows on any ground — this is what a shrine IS on the board
        <mesh position={[0, h + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.05, 1.05]} />
          <meshBasicMaterial map={sigil} color={ok ? "#c9a8ff" : "#ff8a80"} transparent opacity={1} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
      {terrain === "objective" && (
        // gold inlay ring: the objective's read
        <mesh position={[0, h + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.26, 0.36, 32]} />
          <meshBasicMaterial color={ok ? "#ffd86b" : "#ff8a80"} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export default function EditorGhost() {
  const target = useGame((s) => {
    const t = selectDropTarget(s);
    return t ? `${t.pos.x},${t.pos.y},${t.ok ? 1 : 0}` : null;
  });
  const drag = useGame((s) => s.drag);
  const tool = useGame((s) => s.tool);
  const map = useGame((s) => s.config.map);
  const paletteTeam = tool.kind === "unit" ? tool.team : null;
  const paletteArch = tool.kind === "unit" ? tool.archetype : null;
  // one throwaway UnitDef per (team, archetype): the palette ghost card
  const paletteDef = useMemo(() => (paletteTeam && paletteArch ? makeUnit(paletteTeam, paletteArch, 0, 0) : null), [paletteTeam, paletteArch]);
  if (!target) return null;
  const [tx, ty, okN] = target.split(",").map(Number);
  const ok = okN === 1;
  const onTile = (x: number, y: number) => x === tx && y === ty;
  return (
    <group>
      {/* the carried unit card is drawn by Units.tsx riding the pointer — here only its footprint + origin */}
      {drag?.kind === "unit" && (
        <>
          {!onTile(drag.from.x, drag.from.y) && <FromMarker x={drag.from.x} y={drag.from.y} />}
          <Footprint x={tx} y={ty} ok={ok} />
        </>
      )}
      {drag?.kind === "feature" && (
        <>
          {!onTile(drag.from.x, drag.from.y) && <FromMarker x={drag.from.x} y={drag.from.y} />}
          {!onTile(drag.from.x, drag.from.y) && <TerrainGhost x={tx} y={ty} terrain={drag.terrain} ok={ok} />}
          <Footprint x={tx} y={ty} ok={ok} />
        </>
      )}
      {!drag && tool.kind === "unit" && paletteDef && (
        <>
          <Footprint x={tx} y={ty} ok={ok} />
          {ok && (
            <group position={[tx, tileHeight(map, { x: tx, y: ty }), ty]}>
              <CardMesh def={paletteDef} dim={false} selected={false} opacity={0.62} tint="#d8ffe4" lift={0.1} />
            </group>
          )}
        </>
      )}
      {!drag && tool.kind === "terrain" && ok && <TerrainGhost x={tx} y={ty} terrain={tool.terrain} ok />}
    </group>
  );
}
