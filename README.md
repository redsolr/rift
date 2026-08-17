# Tactician

Browser tactical manager: build a squad, write its doctrine, watch it fight, read *why* it lost, change two things, rematch.

```
npm install
npm run dev        # http://localhost:3030
npm run test       # engine tests (determinism, rules, grid, share codes)
npm run sim -- 500 # headless win-rates for the current default setup
npm run verify     # lint + tsc + test + build  (Definition of Done)
```

- Concept: `docs/concept.md` · What exists today: `FEATURES.md` · Working rules: `CLAUDE.md`
- Modes: **Manager** (orders → execute → adjust), **Manual** (you move red), **Editor** (paint maps, place units, tune AI, batch-simulate)
- Engine (`src/sim`) is pure and deterministic; the Three.js renderer only replays the event log.
