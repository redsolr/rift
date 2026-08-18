"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { arenaApi } from "@/arena/client";
import { useUiLayout } from "@/components/ui/UiFrame";
import { useGame } from "@/store/game";
import "./menu.css";

/**
 * Settings: the persisted preferences that used to live only behind HUD toggles, gathered on one screen — board
 * dressing, grid, camera angle, follow / edge-scroll, the HUD layout reset — plus your ladder name. Everything writes
 * straight to the same store (and localStorage keys) the game reads, so a change here is live on the next board.
 */
export default function SettingsScreen() {
  const boardView = useGame((s) => s.boardView);
  const toggleBoardView = useGame((s) => s.toggleBoardView);
  const showGrid = useGame((s) => s.showGrid);
  const toggleGrid = useGame((s) => s.toggleGrid);
  const camTilt = useGame((s) => s.camTilt);
  const setCamTilt = useGame((s) => s.setCamTilt);
  const followCam = useGame((s) => s.followCam);
  const toggleFollow = useGame((s) => s.toggleFollow);
  const edgeScroll = useGame((s) => s.edgeScroll);
  const toggleEdgeScroll = useGame((s) => s.toggleEdgeScroll);
  const hydrateMaps = useGame((s) => s.hydrateMaps);
  const resetUi = useUiLayout((s) => s.resetAll);
  const hydrateUi = useUiLayout((s) => s.hydrate);
  const [handle, setHandle] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    hydrateMaps();
    hydrateUi();
    arenaApi
      .me()
      .then((d) => setHandle(d.me.handle))
      .catch(() => setOnline(false));
  }, [hydrateMaps, hydrateUi]);
  const rename = async () => {
    try {
      const r = await arenaApi.rename(handle);
      setHandle(r.me.handle);
      setSaved("saved");
    } catch (e) {
      setSaved((e as Error).message);
    }
    setTimeout(() => setSaved(null), 1800);
  };
  const deg = Math.round((camTilt * 180) / Math.PI);
  return (
    <main className="settings">
      <div className="menu-sky" aria-hidden />
      <div className="settings-card">
        <div className="screen-head">
          <Link className="screen-back" href="/">
            ← Menu
          </Link>
          <h1>SETTINGS</h1>
        </div>
        <div className="settings-group">
          <h2>PLAYER</h2>
          <div className="setting-row">
            <span className="setting-label">
              Ladder name
              <span className="setting-hint">{online ? "shown on the multiplayer ladder" : "ladder offline — name unavailable"}</span>
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="text" value={handle} maxLength={20} disabled={!online} onChange={(e) => setHandle(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
              {saved && <span className="setting-hint">{saved}</span>}
            </span>
          </div>
        </div>
        <div className="settings-group">
          <h2>BOARD</h2>
          <div className="setting-row">
            <span className="setting-label">
              Board dressing
              <span className="setting-hint">scene = the textured city map · tiles = flat coloured blocks with gaps</span>
            </span>
            <span className="seg">
              <button className={boardView === "scene" ? "on" : ""} onClick={() => boardView !== "scene" && toggleBoardView()}>
                Scene
              </button>
              <button className={boardView === "tiles" ? "on" : ""} onClick={() => boardView !== "tiles" && toggleBoardView()}>
                Tiles
              </button>
            </span>
          </div>
          <div className="setting-row">
            <span className="setting-label">
              Grid overlay
              <span className="setting-hint">always draw the tile grid (normally only while a unit is selected)</span>
            </span>
            <span className="seg">
              <button className={showGrid ? "" : "on"} onClick={() => showGrid && toggleGrid()}>
                On select
              </button>
              <button className={showGrid ? "on" : ""} onClick={() => !showGrid && toggleGrid()}>
                Always
              </button>
            </span>
          </div>
        </div>
        <div className="settings-group">
          <h2>CAMERA</h2>
          <div className="setting-row">
            <span className="setting-label">
              Viewing angle · {deg}°
              <span className="setting-hint">fixed FE-style pitch, 30–70°</span>
            </span>
            <input type="range" min={30} max={70} value={deg} onChange={(e) => setCamTilt((Number(e.target.value) * Math.PI) / 180)} />
          </div>
          <div className="setting-row">
            <span className="setting-label">
              Follow the action
              <span className="setting-hint">the camera glides to whoever is acting</span>
            </span>
            <span className="seg">
              <button className={followCam ? "on" : ""} onClick={() => !followCam && toggleFollow()}>
                On
              </button>
              <button className={followCam ? "" : "on"} onClick={() => followCam && toggleFollow()}>
                Off
              </button>
            </span>
          </div>
          <div className="setting-row">
            <span className="setting-label">
              Edge scroll
              <span className="setting-hint">RTS-style panning when the pointer touches the board edge</span>
            </span>
            <span className="seg">
              <button className={edgeScroll ? "on" : ""} onClick={() => !edgeScroll && toggleEdgeScroll()}>
                On
              </button>
              <button className={edgeScroll ? "" : "on"} onClick={() => edgeScroll && toggleEdgeScroll()}>
                Off
              </button>
            </span>
          </div>
        </div>
        <div className="settings-group">
          <h2>HUD</h2>
          <div className="setting-row">
            <span className="setting-label">
              HUD layout
              <span className="setting-hint">frames moved / resized in ⧉ UI mode go back to their defaults</span>
            </span>
            <button className="ghost" onClick={resetUi}>
              Reset layout
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
