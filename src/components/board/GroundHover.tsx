"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "@/store/game";

/**
 * Which TILE is the pointer over on the GROUND, ignoring the unit cards standing on it?
 * (Cards are tall billboards that visually cover the tile behind them, and r3f's stopPropagation
 * in their hover handlers hides everything beneath from the event system — so this samples the
 * pointer ray against the y=0 plane by hand, every frame the pointer is inside the canvas.)
 * The Sims-style card cutaway in Units.tsx keys off this.
 */
export default function GroundHover() {
  const map = useGame((s) => s.config.map);
  const setGroundHover = useGame((s) => s.setGroundHover);
  const { gl, camera, pointer } = useThree();
  const inside = useRef(false);
  const ray = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const hit = useRef(new THREE.Vector3());

  useEffect(() => {
    const el = gl.domElement;
    const enter = () => (inside.current = true);
    const leave = () => {
      inside.current = false;
      setGroundHover(null);
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointermove", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointermove", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, [gl, setGroundHover]);

  useFrame(() => {
    if (!inside.current) return;
    ray.current.setFromCamera(pointer, camera);
    const p = ray.current.ray.intersectPlane(plane.current, hit.current);
    if (!p) return setGroundHover(null);
    const x = Math.round(p.x);
    const y = Math.round(p.z);
    setGroundHover(x >= 0 && y >= 0 && x < map.width && y < map.height ? { x, y } : null);
  });
  return null;
}
