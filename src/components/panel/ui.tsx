"use client";
import { useState } from "react";

export function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <button className="section-title" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="chev">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Slider({ label, value, min = 0, max = 100, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-value">{value}</span>
    </label>
  );
}

