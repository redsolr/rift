"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PIT_MAX, PIT_STEP, pitArchetypes, pitRosterSize } from "@/sim/pit";
import { pitCleared } from "@/store/pitProgress";
import { useCampaign } from "./store";

/**
 * The Tower's floor picker (Diablo IV Pit read): dark slab, flavour text, an ornament rule, "FLOOR" label, a
 * dropdown of floors (1 … highest cleared + 1; the ones above are locked), the count of floors cleared, one big red
 * OPEN. OPEN sends you to the skirmish with `?pit=<floor>` — floor N's ramped enemy roster in the planning phase.
 * Esc / Close walks away.
 */
export default function TowerPanel() {
  const open = useCampaign((s) => s.tower);
  // the card mounts fresh every time the door opens, so its state initialises from storage without an effect
  return open ? <TowerCard /> : null;
}

function TowerCard() {
  const close = useCampaign((s) => s.closeTower);
  const router = useRouter();
  const [cleared] = useState(() => pitCleared());
  const [floor, setFloor] = useState(() => Math.min(PIT_MAX, pitCleared() + 1));
  const [list, setList] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  const maxOpen = Math.min(PIT_MAX, cleared + 1);
  const floors = useMemo(() => Array.from({ length: Math.min(PIT_MAX, maxOpen + 4) }, (_, i) => i + 1), [maxOpen]);
  const go = () => router.push(`/skirmish?pit=${floor}`);
  const tag = (f: number) => {
    if ((f - 1) % PIT_STEP !== 0 || f === 1) return null;
    const prev = pitArchetypes(f - 1);
    const now = pitArchetypes(f);
    const added = now.filter((a) => !prev.includes(a));
    return added.length ? `— ${added.join(", ")} join` : "— garrison hardens";
  };
  return (
    <div className="tower-root" onClick={close}>
      <div className="tower-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="The Tower">
        <p className="tower-flavour">
          Climb the Tower to test the squad. Each floor is the square, held harder.
          <br />
          Every fifth floor the garrison changes.
        </p>
        <p className="tower-flavour dim">Select a floor to begin.</p>
        <div className="tower-rule" aria-hidden>
          <span />
          <i>◆</i>
          <span />
        </div>
        <div className="tower-label">FLOOR</div>
        <div className="tower-picker">
          <button className={`tower-select ${list ? "open" : ""}`} onClick={() => setList((v) => !v)}>
            <span>Floor {floor}</span>
            <b>{list ? "▲" : "▼"}</b>
          </button>
          <span className="tower-cleared" title="floors cleared">
            {cleared} <i>⚑</i>
          </span>
          {list && (
            <ul className="tower-list">
              {floors.map((f) => {
                const locked = f > maxOpen;
                return (
                  <li key={f}>
                    <button
                      className={`${f === floor ? "cur" : ""} ${locked ? "locked" : ""}`}
                      disabled={locked}
                      onClick={() => {
                        setFloor(f);
                        setList(false);
                      }}
                    >
                      Floor {f}
                      {tag(f) && <small> {tag(f)}</small>}
                      {locked && <em>🔒</em>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="tower-brief">
          Garrison: {pitRosterSize(floor)} · {pitArchetypes(floor).join(" / ")}
        </div>
        <button className="tower-open" onClick={go}>
          OPEN
        </button>
        <button className="tower-close" onClick={close}>
          Walk away <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
