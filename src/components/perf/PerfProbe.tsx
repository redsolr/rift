"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RECORD_WINDOW_S, heapMB, usePerf } from "./store";

interface Recording {
  scene: string;
  start: number;
  loadMs: number | null;
  frames: number;
  sum: number;
  minFps: number;
  worst: number;
  done: boolean;
  wFrames: number;
  wSum: number;
  wStart: number;
}

/**
 * Mount inside any Canvas. Samples the renderer each frame: frame times → fps window (500 ms), `gl.info` → draw calls /
 * triangles / GPU-side resource counts, heap. On the FIRST frame of a new `scene` label it closes the pending load mark
 * (mark → first frame = the load time the user waited); `RECORD_WINDOW_S` seconds later it files a `SceneRecord` for that
 * scene (avg + worst fps over the window). `extra()` supplies scene-specific counters shown in the panel.
 */
export default function PerfProbe({ scene, extra }: { scene: string; extra?: () => Record<string, string | number> }) {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ t: 0, n: 0, worst: 0 });
  const rec = useRef<Recording | null>(null);
  const extraRef = useRef(extra);
  useEffect(() => {
    extraRef.current = extra;
  }, [extra]);

  // a new scene label: arm the record for it — the next frame is its first frame
  useEffect(() => {
    rec.current = { scene, start: 0, loadMs: null, frames: 0, sum: 0, minFps: Infinity, worst: 0, done: false, wFrames: 0, wSum: 0, wStart: 0 };
  }, [scene]);

  useFrame((_, dt) => {
    const now = performance.now();
    const ms = dt * 1000;
    const r = rec.current;
    if (r && r.frames === 0) {
      // first rendered frame of this scene: close the load mark
      const st = usePerf.getState();
      const mark = st.mark && st.mark.scene === scene ? st.mark : null;
      r.loadMs = mark ? Math.round(now - mark.t0) : null;
      if (mark) usePerf.setState({ mark: null });
      r.start = now;
      r.wStart = now;
      r.frames = 1;
      acc.current = { t: 0, n: 0, worst: 0 };
      return; // the first dt is the load stall, not a frame time
    }
    const a = acc.current;
    a.t += ms;
    a.n += 1;
    if (ms > a.worst) a.worst = ms;
    if (r && !r.done) {
      r.frames += 1;
      r.sum += ms;
      if (ms > r.worst) r.worst = ms;
      // per-second fps minimum
      r.wFrames += 1;
      r.wSum += ms;
      if (now - r.wStart >= 1000) {
        const fps = (r.wFrames * 1000) / r.wSum;
        if (fps < r.minFps) r.minFps = fps;
        r.wFrames = 0;
        r.wSum = 0;
        r.wStart = now;
      }
      if (now - r.start >= RECORD_WINDOW_S * 1000) {
        r.done = true;
        const info = gl.info;
        const avg = (r.frames * 1000) / r.sum;
        usePerf.getState().record({
          scene: r.scene,
          loadMs: r.loadMs,
          fpsAvg: Math.round(avg),
          fpsMin: Math.round(r.minFps === Infinity ? avg : r.minFps),
          frameMsMax: Math.round(r.worst * 10) / 10,
          calls: info.render.calls,
          triangles: info.render.triangles,
          heapMB: heapMB(),
          window: RECORD_WINDOW_S,
          at: Date.now(),
        });
      }
    }
    if (a.t >= 500) {
      const info = gl.info;
      usePerf.getState().publish(scene, {
        fps: Math.round((a.n * 1000) / a.t),
        frameMs: Math.round((a.t / a.n) * 10) / 10,
        frameMsMax: Math.round(a.worst * 10) / 10,
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        heapMB: heapMB(),
        extra: extraRef.current?.() ?? {},
      });
      acc.current = { t: 0, n: 0, worst: 0 };
    }
  });
  return null;
}
