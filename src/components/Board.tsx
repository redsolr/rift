"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { selectDropTarget, useGame } from "@/store/game";
import { TERRAIN } from "@/sim/types";
import Effects from "./Effects";
import Tiles from "./board/Tiles";
import Scenery from "./board/Scenery";
import Highlights from "./board/Highlights";
import Units from "./board/Units";
import EditorGhost from "./board/EditorGhost";
import Runes from "./board/Runes";
import Arcs from "./board/Arcs";
import ActionMenu from "./board/ActionMenu";
import GroundHover from "./board/GroundHover";
import AttackBand from "./board/AttackBand";
import CameraRig from "./board/CameraRig";
import PerfProbe from "./perf/PerfProbe";

/** Editor placement hint: what the pointer is carrying / about to place and whether the tile under it allows it. */
function EditorHint() {
  const text = useGame((s) => {
    const t = selectDropTarget(s);
    if (!t) return null;
    const d = s.drag;
    const what = d?.kind === "unit" ? (s.config.units.find((u) => u.id === d.id)?.name ?? "unit") : d?.kind === "feature" ? TERRAIN[d.terrain].label : s.tool.kind === "unit" ? `${s.tool.team} ${s.tool.archetype}` : s.tool.kind === "terrain" ? TERRAIN[s.tool.terrain].label : null;
    if (!what) return null;
    if (s.tool.kind === "terrain" && !d) return t.ok ? `Paint ${what} · click-drag` : null;
    return t.ok ? (t.reason ?? `${d ? "Drop" : "Place"} ${what} at ${t.pos.x},${t.pos.y}`) : `✕ ${t.reason ?? "cannot place here"}`;
  });
  const bad = useGame((s) => (selectDropTarget(s)?.ok ?? true) === false);
  if (!text) return null;
  return <div className={`editor-hint ${bad ? "bad" : ""}`}>{text}</div>;
}

export default function Board() {
  const map = useGame((s) => s.config.map);
  const mapName = useGame((s) => s.maps.find((x) => x.id === s.activeMapId)?.name ?? "skirmish");
  const unitCount = useGame((s) => s.config.units.length);
  const setPainting = useGame((s) => s.setPainting);
  const endDrag = useGame((s) => s.endDrag);
  const cancelDrag = useGame((s) => s.cancelDrag);
  const dragging = useGame((s) => s.drag !== null);
  const targeting = useGame((s) => s.menuPage === "target");
  const cx = (map.width - 1) / 2;
  const cz = (map.height - 1) / 2;
  const span = Math.max(map.width, map.height);
  return (
    <div
      className={`board ${targeting ? "targeting" : ""} ${dragging ? "dragging" : ""}`}
      onPointerUp={() => {
        setPainting(false);
        endDrag();
      }}
      onPointerLeave={() => {
        setPainting(false);
        cancelDrag();
      }}
      onPointerCancel={cancelDrag}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [cx, span * 1.25, cz + span * 0.7], fov: 42, near: 0.1, far: 200 }}
        onPointerMissed={() => useGame.getState().select(null)}
        style={{ touchAction: "none" }}
      >
        <CameraRig cx={cx} cz={cz} w={map.width} h={map.height} />
        <PerfProbe scene={`map · ${mapName}`} extra={() => ({ tiles: `${map.width}×${map.height}`, units: unitCount })} />
        <color attach="background" args={["#0d0f14"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[cx - 6, 14, cz - 4]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
        <group>
          <GroundHover />
          <Tiles />
          <Scenery />
          <Highlights />
          <Runes />
          <Units />
          <EditorGhost />
          <ActionMenu />
          <AttackBand />
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
      <EditorHint />
    </div>
  );
}
