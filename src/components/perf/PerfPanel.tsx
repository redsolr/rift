"use client";
import { useEffect } from "react";
import { usePerf } from "./store";

/**
 * The profiler overlay (F3 / ⌗ Perf): live fps + frame time + draw calls + triangles + GPU resources + JS heap for the
 * scene on screen, then the per-scene table — every map / zone measured so far (load time, avg / worst fps, calls, tris,
 * heap). "How long will the user wait, and how smooth is it once in" — per map, at a glance.
 */
export default function PerfPanel() {
  const open = usePerf((s) => s.open);
  const live = usePerf((s) => s.live);
  const scene = usePerf((s) => s.scene);
  const records = usePerf((s) => s.records);
  const toggle = usePerf((s) => s.toggle);
  const clear = usePerf((s) => s.clear);
  useEffect(() => {
    usePerf.getState().hydrate();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  if (!open) return null;
  const extras = live ? Object.entries(live.extra) : [];
  return (
    <div className="perf" data-scene={scene}>
      <div className="perf-head">
        <span className="perf-title">⌗ SYSTEM</span>
        <span className="perf-scene">{scene || "—"}</span>
        <button className="perf-x" onClick={toggle} title="Close (F3)">
          ×
        </button>
      </div>
      {live ? (
        <div className="perf-live">
          <div className={`perf-big ${live.fps < 30 ? "bad" : live.fps < 50 ? "warn" : ""}`}>
            <b>{live.fps}</b>
            <i>fps</i>
          </div>
          <dl>
            <dt>frame</dt>
            <dd>
              {live.frameMs} ms <small>· worst {live.frameMsMax}</small>
            </dd>
            <dt>draw calls</dt>
            <dd>{live.calls}</dd>
            <dt>triangles</dt>
            <dd>{fmt(live.triangles)}</dd>
            <dt>gpu</dt>
            <dd>
              {live.geometries} geo · {live.textures} tex · {live.programs} prog
            </dd>
            <dt>js heap</dt>
            <dd>{live.heapMB === null ? "n/a (Chrome only)" : `${live.heapMB} MB`}</dd>
            {extras.map(([k, v]) => (
              <Row key={k} k={k} v={v} />
            ))}
          </dl>
        </div>
      ) : (
        <div className="perf-empty">sampling…</div>
      )}
      <div className="perf-records">
        <div className="perf-sub">
          per map <small>(load → first frame · first {records[0]?.window ?? 3} s)</small>
          {records.length > 0 && (
            <button className="perf-clear" onClick={clear}>
              clear
            </button>
          )}
        </div>
        {records.length === 0 ? (
          <div className="perf-empty">no map measured yet — open one</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>map</th>
                <th>load</th>
                <th>fps</th>
                <th>min</th>
                <th>worst</th>
                <th>calls</th>
                <th>tris</th>
                <th>heap</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.scene} className={r.scene === scene ? "cur" : ""}>
                  <td>{r.scene}</td>
                  <td>{r.loadMs === null ? "—" : `${r.loadMs} ms`}</td>
                  <td>{r.fpsAvg}</td>
                  <td>{r.fpsMin}</td>
                  <td>{r.frameMsMax} ms</td>
                  <td>{r.calls}</td>
                  <td>{fmt(r.triangles)}</td>
                  <td>{r.heapMB === null ? "—" : `${r.heapMB} MB`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);
