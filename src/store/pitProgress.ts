"use client";

/** The Tower's climb, persisted: highest floor cleared. Floor `cleared + 1` is the next one you may open. */
const KEY = "tactician.pit";

export function pitCleared(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const n = JSON.parse(raw).cleared;
    return typeof n === "number" && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** record a clear; returns the new highest floor */
export function pitRecordClear(floor: number): number {
  const next = Math.max(pitCleared(), floor);
  try {
    localStorage.setItem(KEY, JSON.stringify({ cleared: next }));
  } catch {
    /* private mode */
  }
  return next;
}
