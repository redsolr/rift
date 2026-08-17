"use client";
import { useGame } from "@/store/game";

/**
 * Editor map library: an ORDERED list of battle setups (terrain + units + doctrine + turns).
 * Click a row to work on it; ▲▼ reorder = play order (map 1, then map 2, …); every edit
 * autosaves into the active map (localStorage). Loading a share code / the default setup
 * detaches — "Save as map" files it.
 */
export default function MapsPanel() {
  const maps = useGame((s) => s.maps);
  const activeMapId = useGame((s) => s.activeMapId);
  const selectMap = useGame((s) => s.selectMap);
  const newMap = useGame((s) => s.newMap);
  const renameMap = useGame((s) => s.renameMap);
  const deleteMap = useGame((s) => s.deleteMap);
  const moveMap = useGame((s) => s.moveMap);
  const saveAsMap = useGame((s) => s.saveAsMap);
  const units = useGame((s) => s.config.units.length);
  const active = maps.find((m) => m.id === activeMapId) ?? null;
  return (
    <div className="maps">
      <div className="maps-list">
        {maps.map((m, i) => (
          <div key={m.id} className={`map-row ${m.id === activeMapId ? "active" : ""}`} onClick={() => selectMap(m.id)} role="button">
            <span className="map-no">{i + 1}</span>
            <span className="map-name">{m.name}</span>
            <span className="map-meta">
              {m.config.map.width}×{m.config.map.height} · {m.config.units.length}u
            </span>
            <span className="map-actions" onClick={(e) => e.stopPropagation()}>
              <button className="map-btn" title="Earlier in play order" disabled={i === 0} onClick={() => moveMap(m.id, -1)}>
                ▲
              </button>
              <button className="map-btn" title="Later in play order" disabled={i === maps.length - 1} onClick={() => moveMap(m.id, 1)}>
                ▼
              </button>
              <button className="map-btn del" title="Delete map" disabled={maps.length <= 1} onClick={() => deleteMap(m.id)}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      {active ? (
        <label className="map-rename">
          <span>Name</span>
          <input value={active.name} onChange={(e) => renameMap(active.id, e.target.value)} />
        </label>
      ) : (
        <div className="map-detached">
          Unsaved setup ({units} units) —{" "}
          <button className="link" onClick={saveAsMap}>
            save as map
          </button>
        </div>
      )}
      <div className="tool-row">
        <button className="ghost" onClick={() => newMap("blank")} title="New empty ground map">
          + Blank map
        </button>
        <button className="ghost" onClick={() => newMap("copy")} title="Duplicate the current setup as a new map">
          + Duplicate
        </button>
      </div>
      <p className="muted small">Order = play order. Every edit autosaves into the highlighted map.</p>
    </div>
  );
}
