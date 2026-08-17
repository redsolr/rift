"use client";
import { useEffect, useRef, useState } from "react";
import { portraitUrl, usePortraitsVersion } from "@/components/portraits";
import { SPEAKERS, SpeakerId } from "./script";
import { currentLine, useCampaign } from "./store";

/**
 * Atlus / Metaphor-style conversation overlay: a white slab with torn ink edges low on the screen, the speaker's
 * name on a small tab, serif typewriter text, ▼ blink when it is your turn to click, Persona 3 Reload choices when the
 * line has choices (slanted ink ribbons fanned on the RIGHT over the scene — the focused one big and hot pink with white
 * text, the others small, dark and dim; ↑↓ / hover moves focus, Enter / click confirms), ONE bust — the speaker's — large on the left (Metaphor never shows a second one; the right side is
 * only the button hints), and Skip / button hints bottom-right. Click / Space / Enter: finish the typewriter, then advance.
 */
const CPS = 46; // typewriter characters per second

function Bust({ id, side, active }: { id: SpeakerId; side: "left" | "right"; active: boolean }) {
  usePortraitsVersion();
  const sp = SPEAKERS[id];
  const url = portraitUrl(sp.team, sp.archetype);
  return (
    <div className={`cd-bust ${side} ${active ? "active" : "idle"}`} aria-hidden>
      {url && <div className="cd-bust-img" style={{ backgroundImage: `url("${url}")` }} />}
    </div>
  );
}

export default function Dialogue() {
  const dialogue = useCampaign((s) => s.dialogue);
  const advance = useCampaign((s) => s.advance);
  const close = useCampaign((s) => s.close);
  const line = useCampaign(currentLine);
  const seq = dialogue?.seq ?? -1;
  const text = line?.text ?? "";
  // typewriter progress is keyed by the line sequence: a new line reads as 0 without any reset-in-effect
  const [tw, setTw] = useState({ seq: -1, n: 0 });
  const shown = tw.seq === seq ? tw.n : 0;
  const setShown = (n: number) => setTw({ seq, n });
  const done = !!line && shown >= line.text.length;
  // focused choice (P3R: one option is always the loud one), keyed by line seq so a new line starts on the first option
  const [focusSt, setFocusSt] = useState({ seq: -1, i: 0 });
  const focus = focusSt.seq === seq ? focusSt.i : 0;
  const setFocus = (i: number) => setFocusSt({ seq, i });
  const lineRef = useRef(line);
  useEffect(() => {
    lineRef.current = line;
  }, [line]);

  // typewriter: restart on every new line (seq bumps per line, so a repeated text still restarts)
  useEffect(() => {
    if (!text) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setTw((cur) => (cur.seq === seq && cur.n >= text.length ? cur : { seq, n }));
      if (n >= text.length) window.clearInterval(id);
    }, 1000 / CPS);
    return () => window.clearInterval(id);
  }, [seq, text]);

  const onNext = () => {
    const l = lineRef.current;
    if (!l) return;
    if (shown < l.text.length) {
      setShown(l.text.length);
      return;
    }
    if (l.choices) return; // choices need a pick
    advance();
  };

  useEffect(() => {
    if (!dialogue) return;
    const onKey = (e: KeyboardEvent) => {
      const l = lineRef.current;
      const choosing = !!l?.choices && shown >= l.text.length;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (choosing) advance(focus);
        else onNext();
      } else if (e.key === "Escape") close();
      else if (choosing && (e.key === "ArrowDown" || e.key === "s" || e.key === "S")) setFocus((focus + 1) % l!.choices!.length);
      else if (choosing && (e.key === "ArrowUp" || e.key === "w" || e.key === "W")) setFocus((focus - 1 + l!.choices!.length) % l!.choices!.length);
      else if (/^[1-3]$/.test(e.key) && choosing && Number(e.key) - 1 < l!.choices!.length) advance(Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!dialogue || !line) return null;
  const speaker = line.speaker;
  return (
    <div className="cd-root" onClick={onNext}>
      <div className="cd-vignette" />
      {/* Metaphor: ONE bust, always on the left — the speaker; narration shows none */}
      {speaker && <Bust id={speaker} side="left" active />}
      <div className={`cd-box ${speaker ? "" : "narration"}`}>
        <svg className="cd-ink-defs" width="0" height="0" aria-hidden>
          <filter id="cd-tear" x="-5%" y="-20%" width="110%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        {speaker && <div className="cd-name">{SPEAKERS[speaker].name}</div>}
        <div className="cd-slab">
          <p className="cd-text">
            {line.text.slice(0, shown)}
            {done && !line.choices && <span className="cd-caret">▼</span>}
          </p>
        </div>
      </div>
      {/* P3R choices: fanned slanted ribbons on the right, over the scene — never inside the slab */}
      {done && line.choices && (
        <ol className="cd-choices" onClick={(e) => e.stopPropagation()}>
          {line.choices.map((c, i) => (
            <li key={i} className={i === focus ? "focus" : ""} style={{ "--i": i } as React.CSSProperties}>
              <button onMouseEnter={() => setFocus(i)} onFocus={() => setFocus(i)} onClick={() => advance(i)}>
                <span className="cd-choice-band" aria-hidden />
                <span className="cd-choice-label">{c.label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="cd-hints" onClick={(e) => e.stopPropagation()}>
        <button className="cd-hint" onClick={close}>
          <span className="cd-key">≡</span> Skip
        </button>
        <span className="cd-hint">
          <span className="cd-key">␣</span> Next
        </span>
      </div>
      <div className="cd-sigil" aria-hidden />
    </div>
  );
}
