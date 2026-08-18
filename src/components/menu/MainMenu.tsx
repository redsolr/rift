"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { pitCleared } from "@/store/pitProgress";
import "./menu.css";

interface Entry {
  href: string;
  title: string;
  hint: string;
  glyph: string;
  accent: string;
}

const ENTRIES: Entry[] = [
  { href: "/campaign", title: "Story", hint: "Walk the village, talk, climb the Tower", glyph: "⚔", accent: "gold" },
  { href: "/play", title: "Multiplayer", hint: "Find a match — ranked by MMR", glyph: "◆", accent: "blue" },
  { href: "/skirmish", title: "Skirmish", hint: "Sandbox: manual, manager, editor", glyph: "▦", accent: "green" },
  { href: "/settings", title: "Settings", hint: "Board view, camera, layout, name", glyph: "⚙", accent: "grey" },
];

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/**
 * The title screen. Keyboard: ↑/↓ or W/S move, Enter/Space opens; the pointer works as ever. Old share links
 * (`/#c=…`) still open the skirmish with that setup.
 */
export default function MainMenu() {
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  // the Tower's best floor lives in localStorage — read as an external store so SSR renders 0 and the client hydrates cleanly
  const best = useSyncExternalStore(subscribeStorage, pitCleared, () => 0);
  useEffect(() => {
    const m = location.hash.match(/#c=([A-Za-z0-9_-]+)/);
    if (m) router.replace(`/skirmish#c=${m[1]}`);
  }, [router]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "s") setCursor((c) => (c + 1) % ENTRIES.length);
      else if (k === "arrowup" || k === "w") setCursor((c) => (c + ENTRIES.length - 1) % ENTRIES.length);
      else if (k === "enter" || k === " ") router.push(ENTRIES[cursor].href);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, router]);
  return (
    <main className="menu">
      <div className="menu-sky" aria-hidden />
      <div className="menu-card">
        <div className="menu-brand">
          <span className="menu-kicker">TACTICAL MANAGER</span>
          <h1 className="menu-title">RIFT</h1>
          <span className="menu-tag">Build a squad · write its doctrine · watch it fight · read why it lost · rematch</span>
        </div>
        <nav className="menu-nav" aria-label="Main menu">
          {ENTRIES.map((e, i) => (
            <Link key={e.href} href={e.href} className={`menu-item ${e.accent} ${i === cursor ? "focus" : ""}`} onMouseEnter={() => setCursor(i)} prefetch>
              <span className="menu-glyph">{e.glyph}</span>
              <span className="menu-text">
                <span className="menu-item-title">{e.title}</span>
                <span className="menu-item-hint">{e.href === "/campaign" && best > 0 ? `Tower · best floor ${best} · ${e.hint}` : e.hint}</span>
              </span>
              <span className="menu-arrow">➤</span>
            </Link>
          ))}
        </nav>
        <div className="menu-foot">
          <span>↑↓ choose · Enter play</span>
          <a href="https://github.com/redsolr/rift" target="_blank" rel="noreferrer">
            redsolr/rift
          </a>
        </div>
      </div>
    </main>
  );
}
