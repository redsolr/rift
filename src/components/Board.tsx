"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "@/store/game";
import Effects from "./Effects";
import Tiles from "./board/Tiles";
import Highlights from "./board/Highlights";
import Units from "./board/Units";
import Runes from "./board/Runes";
import Arcs from "./board/Arcs";
import ActionMenu from "./board/ActionMenu";
import AttackBand from "./board/AttackBand";
import CameraRig from "./board/CameraRig";

export default function Board() {
  const map = useGame((s) => s.config.map);
  const setPainting = useGame((s) => s.setPainting);
  const cx = (map.width - 1) / 2;
  const cz = (map.height - 1) / 2;
  const span = Math.max(map.width, map.height);
  return (
    <div className="board" onPointerUp={() => setPainting(false)} onPointerLeave={() => setPainting(false)} onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [cx, span * 1.25, cz + span * 0.7], fov: 42, near: 0.1, far: 200 }}
        onPointerMissed={() => useGame.getState().select(null)}
        style={{ touchAction: "none" }}
      >
        <CameraRig cx={cx} cz={cz} w={map.width} h={map.height} />
        <color attach="background" args={["#0d0f14"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[cx - 6, 14, cz - 4]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
        <group>
          <Tiles />
          <Highlights />
          <Runes />
          <Units />
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
    </div>
  );
}
