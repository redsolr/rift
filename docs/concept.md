# Browser Tactical Manager — Game Concept

Founder brief (2026-08-17), lightly condensed, followed by the sharpening notes agreed the same day. `FEATURES.md` tracks what of this exists.

## 1. Core idea

A lightweight, browser-first tactical strategy game inspired by the board-level gameplay of Fire Emblem/XCOM with almost all expensive presentation removed. Two ways to play on one combat engine:

- **Manual** — you control every unit: select, move on grid, attack/ability/defend/wait, position around terrain. Closest to traditional Fire Emblem.
- **Manager** — you don't move units. You choose the squad, starting positions, tactical behaviour, roles, high-level commands; units execute; you intervene only at command phases. *Build the machine → give it instructions → watch it operate → identify problems → adjust.*

## 2. Design philosophy

**Accessible immediately**: click URL → Play as Guest → understand the board → play, within seconds. No installer, launcher, mandatory account, or giant tutorial. **Hardcore underneath**: complexity from interacting systems, not menus of numbers. Beginner: "forest gives cover." Hardcore: "forest changes threat calculations, target selection, routes, engagement timing and AI behaviour." **2 minutes to understand, hundreds of hours to master.**

## 3. Presentation

Old tactical-JRPG feel; battle always shown from the board; no separate cinematic attack screen. Sprite slides tile→tile (two-frame walk is enough). Attack: hop forward → slash → target flashes/shakes → `-14` → HP drops. Magic: glow → projectile → impact → number. Animations communicate what happened; they are not spectacle.

## 4. Battlefield

12×16 grid. Terrain: ground, forest, wall, water, elevated, structure/objective. Tile carries terrain, movement cost, defense modifier, visibility modifier, occupant, objective status. Later: bridges, doors, hazards, destructibles, height.

## 5. Units

Initial stats: HP, Attack, Defense, Speed, Movement, Range. Later maybe Accuracy, Evasion, Magic, Resistance, Morale, Discipline, Intelligence, Command. Every stat must change actual behaviour — no stat inflation.

## 6. Character types / races

Not one traditional setting: Human, Elf, Orc, Vampire, Werewolf, Undead, Dwarf, Construct, Dragon, Alien, Machine. Visual identity should make a unit understandable before reading numbers (Orc = enormous, heavy weapon → strong melee, aggressive, low discipline; Elf = light armour + bow → mobile, accurate, fragile; Vampire → sustain/manipulation/mobility/night; Construct → armour, low mobility, reliability). Players should think "I want THAT guy."

## 7. Mixed squads

Not faction-locked. Racial strengths/weaknesses, personalities, roles, synergies, conflicts. You're assembling a system, not picking five units.

## 8. Manual combat

Select → movement range → move → attack/ability/defend/wait → done; repeat until the side's turn ends. Initial damage `max(1, atk − def)`; progressively add accuracy, counterattack, crits, ranged, terrain, abilities, buffs, status. Core stays readable.

## 9–10. Manager combat and tactical instructions

Not "Rook → E6 → attack mage" but "Rook → hold centre. Protect Mina. Don't pursue." Team doctrine (Very Defensive … All-Out Attack), tactical objective (Hold / Advance / Capture / Retreat / Protect Area / Focus Left / Right), individual orders (Protect X, Target ranged, Target wounded, Avoid armoured, Hold, Pursue, Do not pursue, Stay near commander, Retreat below 25% HP). Depth comes from combining simple instructions.

## 11. Character personality

Units don't execute orders perfectly. Rook (Aggression 90, Courage 85, Discipline 40, Intelligence 55, Loyalty 80) ordered to hold the bridge sees a nearly-dead enemy flee: Hold +80, Kill wounded +110, Pursuit risk −25, Discipline −20 → chases. That's not bad AI, that's Rook being Rook. Behaviour is part of squad construction.

## 12–13. AI architecture and intelligence

Every candidate action gets a utility score from named terms; highest wins; personality and instructions modify weights → readable, configurable, balanceable, explainable, personality without hardcoded AI. Intelligence tiers: low (nearby enemies, immediate damage, simple orders), veteran (threat range, allies, positioning, one-turn consequences), genius (enemy responses, coordination, objective pressure, formation). AI capability is itself a character trait.

## 14. Command phases

Command phase → turns 1–3 auto → command phase → 4–6 → … Alternative: 3 tactical interventions per battle, timing as a strategic resource.

## 15. Live manager PvP

20 s formation/doctrine/instructions → execution turns 1–3 → 20 s secret command phase → lock → next phase. Football Manager × Fire Emblem × chess: you're predicting the other manager.

## 16–17. Modes and ranked

Manual Live Ranked (chess clock: 10 min + 5 s/action, or 30 s action limit); Manual Arena (async, defender designs the AI); Manager Live Ranked; Manager Arena (async, press Fight → watch). Separate ladders (Tactician / Commander), Bronze → Grandmaster with rating shown. Rank = skill, not grind.

## 18. Competitive principles

No pay-to-win. Veteran beats beginner through positioning, composition, matchups, AI behaviour, command timing, threat manipulation, opponent tendencies — never "Legendary Rook +14". Progression = tactical options, cosmetics, sidegrades, characters with different behaviour.

## 19. Replays

Every match reproducible from the simulation log; per turn: what each unit considered, scores, selected. "Why did this idiot do that?" → configure → get attacked → watch → understand → adjust.

## 20–21. Editor and simulation tools

Same engine as the game. Map editor (terrain, walls, objectives, spawns, units), unit editor (stats, team, equipment, abilities), AI editor (sliders + weighted rules; Run / Reset + Run). Run 1×/10×/100×/10 000× → win rates, avg duration, most deaths, highest survival.

## 22–24. Browser-first, architecture, multiplayer

URL → Play; initial payload < 3 MB; TypeScript + Canvas/HTML + WebSocket. Simulation completely separate from rendering: Rules → Simulation → Event Log → {Renderer, Replay}; renderer never determines results. Server-authoritative multiplayer: client proposes, server validates and broadcasts.

## 25. Potential hardcore systems

Morale (kill officer → morale drops → formation breaks), command range (outside radius: order delayed a turn), information (see roster/equipment, not instructions), terrain as AI manipulation. Only where the rule is easy and the consequences deep.

## 26. What NOT to build initially

Story, campaign, voice, cinematic combat, open world, hundreds of items, crafting, procedural quests, giant skill trees, dozens of races, 100 characters, elaborate economy, guilds, live-service.

## 27. First prototype

One page, one map, 5v5, Knight/Fighter/Archer/Mage/Healer; grid movement, ranges, attack, HP, death, terrain, simple AI, restart, manager/manual toggle, AI sliders, drag-drop positioning. No accounts, backend, or multiplayer. Just PLAY.

## 28. First real test

Not "is the tech good?" but "**do people voluntarily play another match?**" Measure 1/2/5/10+ battles. Strongest signal: people change squad/instructions and immediately press REMATCH because "I know why I lost."

## 29. Long-term fantasy

Recruit characters I like → understand how each behaves → develop a tactical philosophy → build a squad around it → configure it → ranked → lose to another human's system → understand why → change two things → queue again.

---

# Sharpening notes (2026-08-17)

1. **Manager is the hero mode.** Manual exists as the teaching layer; the §28 test question is asked about *manager* rematches. Ship the Commander ladder first.
2. **Determinism is a first-class rule.** Seeded RNG, no `Date`/`Math.random`, integer math. Async Arena then stores only a seed + two configs and both clients replay locally.
3. **"Explain" is a UI feature, not a log.** Every unit, at any point in a replay, shows its top candidates and colour-coded term deltas.
4. **Orders as a tiny declarative schema** — the editor, explain panel, share codes and PvP order-locking consume one shape; doctrines become shareable text.
5. **Bounded behaviour noise**: discipline = jitter scale (±15 at discipline 0, 0 at 100). Enough that batch sims don't collapse; little enough that players can learn.
6. **Symmetry**: speed-based initiative with deterministic tiebreak so mirrors aren't decided by side.
7. **Sharing before accounts**: squad + doctrine encodable in a URL from day one (`#c=…`).
8. Trims: "genius" AI = evaluation depth not lookahead; fixed command phases for v1; first-paint target is the board (portraits/audio lazy); racial identity initially = personality defaults + one passive.

## Prototype build order (done in the first commit)

1. Deterministic sim + event log + headless `runMany` → 2. Three.js renderer replaying the log → 3. AI sliders + explain panel + Rematch → 4. Manual toggle → 5. Share code → 6. Editor (terrain painting, unit placement, stat editing, batch sims).

## Headless probe

`window.__tactician` exposes the Zustand store; a Playwright script (Chromium with `--use-gl=swiftshader --enable-webgl`) can drive modes, click squad rows, call `clickTile` on the store for 3-D tiles, and screenshot. Use it before making any pixel claim.
