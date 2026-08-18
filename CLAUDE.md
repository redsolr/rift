# Tactician — browser tactical manager

> Standalone venture (one app, one repo — see hq `venture-shape-one-app-one-repo`). No shared backend, no platform dependency. Portfolio doctrine (`D:\App\Jurisimus\platform\CLAUDE.md`) applies for working discipline; this file governs locally.

**One-line pitch:** build a squad, write its doctrine, watch it fight, read *why* it lost, change two things, rematch. Manager mode is the hero; Manual mode is the teaching layer; the Editor is how we (and later players) test maps and AI behaviour.

Concept doc: `docs/concept.md` (the original brief + the sharpening notes). Capability map: `FEATURES.md` — **update it in the SAME commit as any feature-visible change.**

## Stack

Next.js 16 (app router, Turbopack) · React 19 · TypeScript · Three.js via `@react-three/fiber` + `drei` · Zustand · Tailwind v4 (only the reset; the UI is plain CSS in `globals.css`) · Vitest · **Postgres via drizzle** (the multiplayer ladder is the ONLY persistent state; local `docker compose up -d` → :5441, prod = Neon pooled URL in Vercel, `vercel-build` = migrate then build). Port **3030**. No auth / accounts — identity on the ladder is an httpOnly bearer cookie per browser.

**Routes:** `/` main menu · `/campaign` Story · `/play` Multiplayer lobby · `/skirmish` the sandbox (manual / manager / editor; `?pit=N` = Tower floor, `?match=<id>&leg=1|2` = ladder replay, `#c=…` = share code) · `/settings` · `/api/arena/*` (me, match, match/[id]).

## Architecture — the one rule

```
src/sim/          pure, deterministic engine. NO imports from React/Three/store. Ever. version.ts = SIM_VERSION (bump on any rules change)
src/arena/        the multiplayer ladder: lineup.ts (Lineup shape, legality, buildLegConfig = the ONE mirror-leg builder shared by
                  server + client), match.ts (resolveMatch both legs + Elo — pure, uses Battle), bots.ts (house lineups),
                  server.ts (identity cookie, matchmaking, ledger — server-only), client.ts (fetch helpers + wire types)
src/db/           drizzle schema (arena_players, arena_matches) + client; migrations in drizzle/
src/store/        game.ts = Zustand store (Battle instance, cursor, modes, camera/banner signals)
                  playback.ts = PURE event → view reducer (timing, floats, effects, focus, banner) — tested
src/components/   Board.tsx composes board/* (Tiles, Highlights, Units, Arcs, ActionMenu, CameraRig)
                  Panel.tsx composes panel/* (Squad, UnitSections, EditorPanel, BattleLog, SharePanel)
                  Forecast, UnitBadge, PhaseBanner, CameraWidget, Effects, Hud, Drawer, cards.ts
                  perf/ = system profiler (store + PerfProbe inside any Canvas + PerfPanel; F3 / ⌗ Perf) — per-map load + fps table
src/campaign/     the walkable campaign world: CampaignScene (zone-agnostic controller), store (zone / travel / dialogue),
                  world/ = ZONES registry (kitchen.tsx, village.tsx + villageChunks.ts data; types.ts) — Persona-5 doors between
                  zones, only one zone mounted; the village streams a 5×5 chunk ring around the player
                  TowerPanel = the tower floor picker → /skirmish?pit=N (sim/pit.ts builds the ramped floor config; PitResult closes the loop)
src/components/menu/  MainMenu (/), ArenaLobby (/play), SettingsScreen (/settings) + menu.css; components/ArenaResult = replay chrome
src/party/        the PARTY: store (bag + paper-dolls, localStorage `tactician.party`, pushes gear into useGame.setGear),
                  inventory.ts = PURE bag/equip ops (tested), CharacterScreen (C / I) + party.css; sim/items.ts = item table + resolvers
scripts/sim.ts    headless batch runner (npm run sim -- 1000)
```

- **Determinism is load-bearing.** `Battle(config, seed)` + the action sequence fully determines the event log. Sim code uses `Rng` (mulberry32) only — never `Math.random`/`Date`. Integer math only. `runMany` with the same seeds must return identical stats; a vitest guards this.
- **Renderer replays events; it never computes combat.** `store/playback.ts#applyEvent` derives `view`/floats/effects/camera-focus/banner from each engine event; the store just advances the cursor. Manual clicks and AI turns both reach the engine through the store's single `commit(action)` path.
- **Shared geometry helpers live in `sim/grid.ts`** (`tileHeight`, `tilesInRange`, `posKey`/`parseKey`, `pathTo`) — never re-derive a range diamond or tile height inline. `selectCaughtUp` is the one definition of "input is allowed now".
- **Every AI decision is explainable.** `scoreActions()` returns candidates with named `terms`; the sum IS the score. Personality/orders/doctrine only add or scale terms — no per-archetype hardcoded branches. The "Why did it do that?" panel is a first-class feature, not a debug view.
- Orders are data (`Orders`, `Doctrine`), so the editor, explain panel, share codes and the ladder's lineups all consume one schema.
- **The ladder trusts only the engine.** A match is stored as (lineupA, lineupB, seed, SIM_VERSION, legs); the server resolves it with `resolveMatch` and the client replays the same leg with the same `buildLegConfig` — no event log crosses the wire, no result is trusted from a client. **Any change that can alter an event log for the same (config, seed) — stat / attack tables, AI scoring, rune rules, map presets — bumps `SIM_VERSION`**, or old replays will disagree with the ledger. Arena is gear-off and always the default map: `lineupFromConfig` drops stats, `lineupError` names anything illegal, `normalizeLineup` coerces hostile input.
- **Gear never reaches the engine as items.** `sim/items.ts#applyEquipment` is the one definition of what gear adds; the store writes the result into `UnitDef.stats` (keeping the ungeared numbers in `UnitDef.base`, the paper-doll in `UnitDef.equipment`) before a battle — engine, cards, forecast, AI all read geared stats without knowing items exist. `gearUnit` is idempotent; the editor edits base.

## Commands

| Command                                      | What                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `npm run dev`                                | http://localhost:3030                             |
| `npm run test`                               | vitest — sim determinism, rules, grid, share-code, arena |
| `npm run docker:up` · `npm run db:migrate`   | local Postgres :5441 + apply migrations (`.env.local` from `.env.example`) |
| `npm run db:generate`                        | drizzle-kit: new migration after a schema change  |
| `npm run sim -- 1000 [seedFrom] [shareCode]` | headless win-rates                                |
| `npm run verify`                             | lint → tsc → test → build — **this is the DoD**   |

## Definition of Done

`npm run verify` exits clean. Any feature-visible change also updates `FEATURES.md` in the same commit. New engine rules get a vitest that asserts the *promise* (e.g. "hold units move less than pursue units"), not the implementation. UI/pixel claims get a headless Playwright screenshot probe before being reported (the store is exposed as `window.__tactician` for exactly this; classroom's Playwright install can drive it — see `docs/concept.md` § probe).

## Testing on a phone (LAN, no tunnel)

`npm run dev` binds `0.0.0.0:3030`. On the phone (same Wi-Fi) open `http://<PC-LAN-IP>:3030` — find the IP with `Get-NetIPAddress -AddressFamily IPv4` (this PC: Ethernet 192.168.1.3; Tailscale 100.70.14.13 works from anywhere if the phone runs Tailscale). One-time, in an **elevated** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Tactician dev 3030" -Direction Inbound -Protocol TCP -LocalPort 3030 -Action Allow -Profile Private,Domain
```

Add to Home Screen on iOS gives a full-screen standalone window (`appleWebApp` metadata is set). **Phones play in landscape**: `page.tsx` matches `(pointer: coarse) and (max-height: 900px) and (max-width: 1100px)` → right-side `Drawer`; portrait shows a rotate gate.

**Headless caveat**: swiftshader Chromium mis-composited an opaque bottom sheet *overlapping* the WebGL canvas (frame looked clipped; DOM/camera were fine). The drawer is in flow; the semi-transparent forecast card overlays the canvas without triggering it. If a screenshot shows a clipped board, hide the overlay and re-shoot before assuming a camera bug.

## Zustand traps (already hit once)

Selectors must return stable references — never `useGame((s) => s.config.units.filter(...))`; select the array and `useMemo` the filter. React-compiler lint forbids reading refs during render; use `useEffect` keyed on the value.

## What NOT to build yet

Story beyond the prologue prototype, accounts (WorkOS), live turn-by-turn PvP / queues / chat / seasons, skill trees, more than 5 archetypes, cosmetics. (Items/inventory shipped 2026-08-18 — founder call — because Tower loot gives the climb a reason; keep it a flat stat layer, no crafting/economy. The async MMR ladder shipped 2026-08-18 — founder call — as the cheapest "do people fight each other's doctrines?" probe; it stays async + mirror + gear-off until it earns more.) The only question that matters right now: **do people press Rematch / Find match again?**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
