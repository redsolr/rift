/**
 * Deploy-time migration runner (Vercel `vercel-build` step) — ported from
 * the CRM / classroom pattern.
 *
 * The runtime `DATABASE_URL` is the POOLED Neon URL; drizzle-kit wants
 * the DIRECT endpoint (env doctrine: pooled = runtime, direct =
 * migrations). Same credentials, hostname minus the `-pooler` suffix —
 * derived here so the direct URL never needs to be stored anywhere.
 *
 * Fails the build loudly when DATABASE_URL is missing or the migration
 * errors — a deploy must never silently skip its schema.
 */
import { spawnSync } from "node:child_process";

const pooled = process.env.DATABASE_URL;
if (!pooled) {
  console.error("[migrate-deploy] DATABASE_URL is not set — refusing to build");
  process.exit(1);
}
const direct = pooled.replace("-pooler", "");
console.log(
  `[migrate-deploy] running drizzle-kit migrate against ${new URL(direct).hostname}`,
);

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  env: { ...process.env, DATABASE_URL: direct },
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status !== 0) {
  console.error(`[migrate-deploy] migration failed (exit ${result.status})`);
  process.exit(result.status ?? 1);
}
console.log("[migrate-deploy] migrations applied");
