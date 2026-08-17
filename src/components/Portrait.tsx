"use client";
import { CSSProperties } from "react";
import { Archetype, UnitDef } from "@/sim/types";
import { GLYPH } from "./cards";
import { portraitFocus, portraitUrl, usePortraitsVersion } from "./portraits";

/**
 * A character bust for the HTML overlays (character panel, battle bar): the keyed portrait cover-fitted into a
 * box, head at the top (FE busts are top-aligned; the horizontal focus centres the face) and faded out at the bottom so it hangs in the frame FE-style instead of ending in
 * a hard rectangle. Falls back to the archetype glyph until the art has loaded.
 */
export default function Portrait({ u, className = "", style }: { u: Pick<UnitDef, "archetype" | "team">; className?: string; style?: CSSProperties }) {
  usePortraitsVersion();
  const url = portraitUrl(u.team, u.archetype);
  const f = portraitFocus(u.team, u.archetype);
  return (
    <div className={`portrait ${u.team} ${className}`} style={style} aria-hidden>
      <div className="portrait-glow" />
      {url ? (
        <div className="portrait-img" style={{ backgroundImage: `url("${url}")`, backgroundPosition: `${f.x * 100}% 0%` }} />
      ) : (
        <span className="portrait-glyph">{GLYPH[u.archetype as Archetype]}</span>
      )}
    </div>
  );
}
