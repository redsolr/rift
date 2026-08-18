"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/store/game";
import { stickPan } from "./shared";

/** Frames the whole map for the current viewport (portrait phones need a much farther, steeper camera). */
export default function CameraRig({ cx, cz, w, h }: { cx: number; cz: number; w: number; h: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as (THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update: () => void }) | null;
  const camFocus = useGame((s) => s.camFocus);
  const camTilt = useGame((s) => s.camTilt);
  const camZoom = useGame((s) => s.camZoom);
  const edgeScroll = useGame((s) => s.edgeScroll);
  const gl = useThree((s) => s.gl);
  const pointer = useRef<{ x: number; y: number; inside: boolean; mouse: boolean }>({ x: 0, y: 0, inside: false, mouse: false });
  // fixed viewing direction (unit vector from target to camera) + overview distance, recomputed on resize
  const dir = useRef(new THREE.Vector3(0, 1, 1).normalize());
  const fitDist = useRef(20);
  const goal = useRef<{ target: THREE.Vector3; dist: number } | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    (window as unknown as { __cam?: unknown; __controls?: unknown }).__cam = camera;
    (window as unknown as { __cam?: unknown; __controls?: unknown }).__controls = controls;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // Camera sits behind the player's side (high y = near edge) looking toward the enemy.
    const spanAcross = w;
    const spanDeep = h;
    const tilt = aspect < 1 ? Math.max(camTilt, 1.0) : camTilt; // radians from horizontal — the FE-style angle (user-adjustable)
    const halfA = (spanAcross / 2) * 1.1 + 0.5;
    const halfD = (spanDeep / 2) * 1.1 + 0.5;
    const nearOffset = halfD * Math.cos(tilt);
    const needW = halfA / Math.tan(hFov / 2) + nearOffset;
    const needH = (halfD * Math.max(Math.sin(tilt), 0.75)) / Math.tan(vFov / 2) + nearOffset;
    fitDist.current = Math.max(needH, needW, 8);
    dir.current = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const target = new THREE.Vector3(cx, 0, aspect < 1 ? cz + h * 0.09 : cz);
    // snap on first fit / resize; later focus requests glide. A tilt change re-aims from the current target.
    if (initialised.current && controls) {
      const curDist = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).addScaledVector(dir.current, curDist);
      camera.lookAt(controls.target);
      controls.update();
      goal.current = goal.current ? { ...goal.current } : null;
      return;
    }
    if (!initialised.current || !controls) {
      cam.position.copy(target).addScaledVector(dir.current, fitDist.current);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      if (controls) {
        controls.target.copy(target);
        controls.update();
        initialised.current = true;
      }
    } else {
      goal.current = { target, dist: fitDist.current };
    }
  }, [camera, controls, size.width, size.height, cx, cz, w, h, camTilt]);

  // zoom buttons
  useEffect(() => {
    if (!controls || camZoom.seq === 0) return;
    const curDist = camera.position.distanceTo(controls.target);
    goal.current = { target: controls.target.clone(), dist: Math.max(5, Math.min(80, curDist * camZoom.factor)) };
  }, [camZoom, controls, camera]);

  // pointer tracking for RTS edge-scroll (mouse only)
  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, inside: true, mouse: e.pointerType === "mouse" };
    };
    const leave = () => {
      pointer.current.inside = false;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, [gl]);

  // focus requests from the store (acting unit, selection, overview)
  useEffect(() => {
    if (!controls || camFocus.seq === 0) return;
    const curDist = camera.position.distanceTo(controls.target);
    const dist = camFocus.zoom === "in" ? Math.min(curDist, fitDist.current * 0.55) : camFocus.zoom === "out" ? fitDist.current : curDist;
    goal.current = { target: new THREE.Vector3(camFocus.x, 0, camFocus.y), dist };
  }, [camFocus, controls, camera]);

  // a user gesture cancels any in-flight glide so the camera never fights the hand
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls) return;
    // --- RTS edge scroll ---
    const p = pointer.current;
    // pan vector: RTS edge-scroll (mouse) OR the phone camera stick (MobileControls) — same maths
    let ex = 0,
      ey = 0;
    if (edgeScroll && p.inside && p.mouse) {
      const EDGE = 28;
      if (p.x < EDGE) ex = -(1 - p.x / EDGE);
      else if (p.x > size.width - EDGE) ex = 1 - (size.width - p.x) / EDGE;
      if (p.y < EDGE) ey = -(1 - p.y / EDGE);
      else if (p.y > size.height - EDGE) ey = 1 - (size.height - p.y) / EDGE;
    }
    if (stickPan.x || stickPan.y) {
      // the stick is analogue: ease the deflection so small pushes creep and full pushes cruise (not the edge-scroll sprint)
      ex = stickPan.x * Math.abs(stickPan.x) * 0.7;
      ey = stickPan.y * Math.abs(stickPan.y) * 0.7;
    }
    {
      if (ex || ey) {
        goal.current = null;
        const dist = camera.position.distanceTo(controls.target);
        const speed = dt * (0.55 * dist + 4);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        right.y = 0;
        right.normalize();
        const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate();
        fwd.y = 0;
        fwd.normalize();
        controls.target.addScaledVector(right, ex * speed).addScaledVector(fwd, -ey * speed);
        controls.target.setX(Math.max(-2, Math.min(w + 1, controls.target.x)));
        controls.target.setZ(Math.max(-2, Math.min(h + 1, controls.target.z)));
        camera.position.copy(controls.target).addScaledVector(dir.current, dist);
        camera.lookAt(controls.target);
        controls.update();
      }
    }
    const g = goal.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 6);
    controls.target.lerp(g.target, k);
    const curDist = camera.position.distanceTo(controls.target);
    const dist = curDist + (g.dist - curDist) * k;
    camera.position.copy(controls.target).addScaledVector(dir.current, dist);
    camera.lookAt(controls.target);
    controls.update();
    if (controls.target.distanceTo(g.target) < 0.02 && Math.abs(dist - g.dist) < 0.02) goal.current = null;
  });
  return null;
}

