/** mulberry32 — tiny, seedable, deterministic. The sim never touches Math.random. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** integer in [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  /** integer in [-r, r] */
  jitter(r: number): number {
    if (r <= 0) return 0;
    return this.int(2 * r + 1) - r;
  }
}
