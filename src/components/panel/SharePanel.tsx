"use client";
import { useState } from "react";
import { useGame } from "@/store/game";

export default function SharePanel() {
  const makeShareCode = useGame((s) => s.makeShareCode);
  const loadShareCode = useGame((s) => s.loadShareCode);
  const loadDefault = useGame((s) => s.loadDefault);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <div className="tool-row">
        <button
          className="tool"
          onClick={async () => {
            const c = makeShareCode();
            const url = `${location.origin}${location.pathname}#c=${c}`;
            history.replaceState(null, "", `#c=${c}`);
            try {
              await navigator.clipboard.writeText(url);
              setMsg("Link copied to clipboard");
            } catch {
              setMsg("Link is in the address bar");
            }
          }}
        >
          Copy share link
        </button>
        <button className="tool" onClick={loadDefault}>
          Load default setup
        </button>
      </div>
      <div className="tool-row">
        <input placeholder="paste share code or link" value={code} onChange={(e) => setCode(e.target.value)} />
        <button
          className="tool"
          onClick={() => {
            const raw = code.includes("#c=") ? code.split("#c=")[1] : code;
            setMsg(loadShareCode(raw) ? "Loaded" : "Invalid code");
          }}
        >
          Load
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}

