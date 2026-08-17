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
- 🟡 Presentation: Three.js board (r3f), archetype-shaped primitives, HP bars, name labels, hop-on-attack, shake-on-hit, floating damage/heal numbers, tile highlights (reach / target / selected / hover). No sprites yet.
- 🚫 Accounts, backend, multiplayer, ranked, campaign — not until "do people press Rematch?" is answered.

## Known balance signal (default map, seeds 1–200)

Blue ~62% / red ~34%: second-mover advantage — red advances into blue's threat range first. Left as-is on purpose; the editor exists to explore this.
