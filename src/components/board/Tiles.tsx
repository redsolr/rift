"use client";
import { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { useGame } from "@/store/game";
import { TERRAIN } from "@/sim/types";
import { dragged } from "./shared";

export default function Tiles() {
  const map = useGame((s) => s.config.map);
  const clickTile = useGame((s) => s.clickTile);
  const rightClickTile = useGame((s) => s.rightClickTile);
  const setHover = useGame((s) => s.setHover);
  const painting = useGame((s) => s.painting);
  const setPainting = useGame((s) => s.setPainting);
  const paintTile = useGame((s) => s.paintTile);
  const tool = useGame((s) => s.tool);
  const mode = useGame((s) => s.mode);

  const tiles = useMemo(() => {
    const out: { x: number; y: number; t: keyof typeof TERRAIN }[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) out.push({ x, y, t: map.tiles[y * map.width + x] });
    return out;
  }, [map]);

  return (
    <group>
      {tiles.map(({ x, y, t }) => {
        const d = TERRAIN[t];
        return (
          <mesh
            key={`${x},${y}`}
            position={[x, d.height / 2, y]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              clickTile({ x, y });
            }}
            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              if (!dragged()) rightClickTile({ x, y });
            }}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              if (mode === "editor" && tool.kind === "terrain") {
                e.stopPropagation();
                setPainting(true);
                paintTile({ x, y });
              }
            }}
            onPointerUp={() => setPainting(false)}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              setHover({ x, y });
              if (painting) paintTile({ x, y });
            }}
            onPointerOut={() => setHover(null)}
          >
            <boxGeometry args={[0.96, d.height, 0.96]} />
            <meshStandardMaterial color={d.color} roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

