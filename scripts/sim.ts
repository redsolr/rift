/* Headless batch runner. Usage: npm run sim -- [runs=100] [seedFrom=1] [code=<share code>] */
import { runMany } from "../src/sim/battle";
import { decodeConfig, defaultConfig } from "../src/sim/presets";

const runs = Number(process.argv[2] ?? 100);
const from = Number(process.argv[3] ?? 1);
const code = process.argv[4];
const cfg = code ? decodeConfig(code) : defaultConfig();
const t0 = performance.now();
const s = runMany(cfg, Array.from({ length: runs }, (_, i) => from + i));
const ms = performance.now() - t0;
const pct = (n: number) => ((100 * n) / s.runs).toFixed(1) + "%";
console.log(`runs ${s.runs} in ${ms.toFixed(0)}ms (${(ms / s.runs).toFixed(2)}ms/battle)`);
console.log(`red ${pct(s.redWins)} · blue ${pct(s.blueWins)} · draw ${pct(s.draws)} · avg turns ${s.avgTurns.toFixed(1)}`);
const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(`most deaths: ${top(s.deaths)}`);
console.log(`most survivals: ${top(s.survivals)}`);
