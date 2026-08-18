/**
 * The rules version stamped on every stored arena match. Bump it whenever a change to `src/sim/` can alter the
 * event log for the same (config, seed) — stat tables, attack tables, AI scoring, rune rules, map presets.
 * A stored match whose version differs from the running client's is shown as "replay unavailable" instead of
 * replaying into a different result than the one the ladder recorded.
 */
export const SIM_VERSION = "2026-08-18.1";
