# Tactician — capability map

What the product does **today**. Update in the same commit as any feature-visible change. ✅ shipped · 🟡 partial · 🔲 planned (see `docs/concept.md`) · 🚫 deliberately not now.

## Engine (`src/sim`) — 2026-08-17

- ✅ Deterministic battle: `Battle(config, seed)`; mulberry32 RNG; identical logs for identical inputs (vitest-guarded).
- ✅ Grid: 12×16 default; terrain = ground / forest (+2 def, cost 2) / hill (+1 def, cost 2) / water (impassable) / wall (impassable) / objective (+1 def). Dijkstra movement; enemies block, allies pass-through.
- ✅ Combat: `damage = max(1, atk − (def + terrain))`; healer heals `atk`; death; win when a side is wiped; draw at `maxTurns`.
- ✅ Turns: red phase → blue phase; speed order within a phase (ties by id).
- ✅ Five archetypes: Knight, Fighter, Archer (range 2–3), Mage (1–2), Healer (1–2), each with default stats + personality.
- ✅ Utility AI with named score terms per candidate (attack / heal / move / wait); `decision` events carry the top-6 candidates.
- ✅ Personality (aggression, courage, discipline, intelligence, loyalty): discipline = order adherence + whim jitter; intelligence gates exposure/counter-risk (≥35) and focus-fire/overkill (≥70); courage scales exposure fear.
- ✅ Orders per unit: stance (hold/advance/pursue), target preference (nearest/weakest/wounded/ranged/healers), protect <ally>, avoid armored, do-not-pursue, retreat-below-HP%.
- ✅ Doctrine per team: aggression (very defensive → all-out) + objective (hold/advance/capture/protect).
- ✅ Event log = the only renderer input: turn_start, decision, move(path), attack, heal, wait, death, end.
- ✅ `runMany(config, seeds)` batch stats: win rates, avg turns, deaths/survivals per unit. `npm run sim -- N`. ~3.5 ms/battle.
- ✅ Share codes: config ⇄ URL-safe base64 (`#c=…`).
- 🔲 Counterattacks, accuracy/crit, status effects, morale, command range, height, fog — only after the loop proves fun.

## Modes (`src/store`, `src/components`)

- ✅ **Manager (default)**: set orders/doctrine → Start → command phase → Execute 1/3/5/all turns → watch → adjust → repeat. Both sides AI.
- ✅ **Manual**: you control red; click unit → blue reachable tiles → click tile → red attackable targets (or "Wait") → blue AI plays. "End turn (AI finishes)" delegates the rest of your phase to your own units' orders.
- ✅ **Editor**: click-drag terrain painting, place/erase/move units for either team, edit stats/name/team/archetype, resize map, max turns, clear terrain; **Run once** (watch), **Run 10/100/1000/5000×** with win bar + deaths/survivals; live personality sliders + orders on any unit.
- ✅ Playback: play/pause/step, 0.5–4× speed, event cursor; Rematch = next seed; Reset = back to setup.
- ✅ "Why did it do that?" — selected unit's last decision: ranked candidates, expandable term breakdown (Explain panel).
- ✅ Share: copy link (`#c=code`), paste to load, load default setup.
- 🟡 Presentation: Three.js board (r3f), archetype-shaped primitives, HP bars, name labels, hop-on-attack, shake-on-hit, floating damage/heal numbers, tile highlights (reach / target / selected / hover / **attack-range diamond of the selected unit**). **Effects (2026-08-17)**: archer = arcing arrow projectile + impact flash; mage = cast glow → glowing bolt with trail + point light → vertical impact flash; melee = slash arc; heal = rising green ring at healer and target. Effects are spawned from events (never from engine state). No sprites yet.
- ✅ Battle log (panel section): human-readable turn-by-turn feed derived from the replayed events (moves, hits with damage/HP-left/KILLED, heals, waits, result); auto-scrolls; click a row to select that unit.
- ✅ **Mobile = LANDSCAPE (2026-08-17)**: coarse-pointer devices get a phone layout; portrait shows a "turn your phone sideways" gate. Landscape: single-row compact HUD (icon buttons, no speed select), the panel lives in a right-side **drawer** (34px rail → tap to open, ~320px), the board fills the rest, a contextual hint pill sits top-center ("Your move — tap a red unit", "Command phase — set orders, then Execute", result). One-finger pan, two-finger pinch/rotate; 40px touch targets; 16px inputs (no iOS zoom); safe-area insets; `apple-mobile-web-app-capable`. Solo forecast card hidden on phones (duel card only).
- ✅ **FE3H-style camera (2026-08-17)**: fixed viewing angle, no orbit anywhere. Opens on the whole battlefield; during playback it glides to whoever is acting (move end / attack midpoint / heal midpoint, zooming to ~55 % of the fit distance), pans (no zoom change) to a unit you select in Manual, and pulls back to overview when the view catches up (command phase / your turn) or the battle ends. Any user gesture cancels an in-flight glide. Desktop: wheel = zoom, right/middle-drag = pan, left = select only. Phone: one finger = tap, two fingers = pan + pinch-zoom. HUD **⤢ Overview** (snap back) and **◎ Follow** toggle (off = camera never moves by itself).
- ✅ **Sideways board**: when the viewport is wider than tall and the map is taller than wide, the camera views the map sideways — red on the left, blue on the right — so the board fills the screen (desktop too). Camera fit accounts for the near edge.
- ✅ **FE-style combat forecast (2026-08-17)** — card docked top-left of the board when a unit is selected (Manual/Manager): diamond portrait + name + HP for attacker and the enemy under the pointer (or the only target in range), HP bars with blinking "damage to come" segment and `34 → 32`, rows Dmg / Hit / Rng / Def (terrain bonus shown as +N), class + weapon banners, verdict line ("Kills X", "X can hit back for N on blue's turn", "X cannot reach this tile", "Out of range from here"). Numbers come from `Battle.forecast()` (engine, tested) — Hit is 100 until accuracy exists; retaliation = next-turn threat (no counterattacks in the engine yet).
- ✅ **Threat arcs + danger zone**: red dashed arcs from every enemy that could attack the selected unit where it stands (or the tile it is about to move to), yellow arc to the target being considered; FE-style **danger zone** (every tile the enemy team can attack next activation, `Battle.threatZone`) as a red wash; selected unit's attack range as a strong orange diamond. HUD **◆ Danger** toggle.
- ✅ LAN testing: `npm run dev` binds `0.0.0.0:3030` — open `http://<PC-LAN-IP>:3030` on the phone (one-time Windows Firewall inbound rule for TCP 3030 required; see CLAUDE.md).
- 🚫 Accounts, backend, multiplayer, ranked, campaign — not until "do people press Rematch?" is answered.

## Known balance signal (default map, seeds 1–200)

Blue ~62% / red ~34%: second-mover advantage — red advances into blue's threat range first. Left as-is on purpose; the editor exists to explore this.
