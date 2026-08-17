"use client";
import { useState } from "react";

/** Landscape-phone side drawer: the panel slides in from the right; a slim rail toggles it. */
export default function Drawer({ children, title }: { children: React.ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`drawer ${open ? "open" : ""}`}>
      <button className="drawer-rail" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close panel" : "Open panel"}>
        <span className="drawer-chev">{open ? "›" : "‹"}</span>
        <span className="drawer-title">{title}</span>
      </button>
      <div className="drawer-body">{children}</div>
    </div>
  );
}
