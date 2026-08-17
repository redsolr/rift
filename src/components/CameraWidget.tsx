"use client";
import { useState } from "react";
import { useGame } from "@/store/game";

/** Small camera console docked bottom-right of the board: tilt, zoom, overview, follow, edge-scroll. */
export default function CameraWidget() {
  const [open, setOpen] = useState(false);
  const camTilt = useGame((s) => s.camTilt);
  const setCamTilt = useGame((s) => s.setCamTilt);
  const zoomCam = useGame((s) => s.zoomCam);
  const overview = useGame((s) => s.overview);
  const followCam = useGame((s) => s.followCam);
  const toggleFollow = useGame((s) => s.toggleFollow);
  const edgeScroll = useGame((s) => s.edgeScroll);
  const toggleEdgeScroll = useGame((s) => s.toggleEdgeScroll);
  const deg = Math.round((camTilt * 180) / Math.PI);
  return (
    <div className={`cam-widget ${open ? "open" : ""}`}>
      <div className="cam-row">
        <button className="cam-btn" onClick={() => zoomCam(0.8)} title="Zoom in">
          +
        </button>
        <button className="cam-btn" onClick={() => zoomCam(1.25)} title="Zoom out">
          −
        </button>
        <button className="cam-btn" onClick={overview} title="Show the whole battlefield">
          ⤢
        </button>
        <button className={`cam-btn ${followCam ? "on" : ""}`} onClick={toggleFollow} title="Camera follows whoever is acting">
          ◎
        </button>
        <button className={`cam-btn ${open ? "on" : ""}`} onClick={() => setOpen(!open)} title="Camera settings">
          🎥
        </button>
      </div>
      {open && (
        <div className="cam-settings">
          <label className="cam-slider">
            <span>Angle</span>
            <input type="range" min={30} max={70} step={1} value={deg} onChange={(e) => setCamTilt((Number(e.target.value) * Math.PI) / 180)} />
            <span className="cam-val">{deg}°</span>
          </label>
          <label className="cam-check">
            <input type="checkbox" checked={edgeScroll} onChange={toggleEdgeScroll} /> Edge-scroll with the mouse
          </label>
          <label className="cam-check">
            <input type="checkbox" checked={followCam} onChange={toggleFollow} /> Follow the action
          </label>
          <p className="cam-hint">Wheel = zoom · right/middle-drag = pan · two fingers on touch</p>
        </div>
      )}
    </div>
  );
}
