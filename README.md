# PARCEL-OS // Assembly Line Planner — v0.2.0

Vite + React 18 + TypeScript + Tailwind CSS. Reads `data/game_rules.json` at build time.

```bash
docker compose up -d --build        # http://localhost:8088  (container: parcel-os-planner)
npm install && npm run dev          # local dev on :5173
npm run typecheck                   # tsc --noEmit (not part of the Docker build)
```

## Structure
```
compose.yaml  Dockerfile  nginx.conf
src/lib/engine.ts            footprint, line builder, merge/pivot logic, blueprint template, BOM, throughput, state I/O
src/components/Blueprint.tsx paint grid + tool palette
src/components/ImportModal.tsx state importer
src/App.tsx                  controls, topology engine view, BOM, exporter
data/                        game_rules.json · warehouse_state.json (defaults)
```

## Engine rules
- **Footprint:** 10×20 base + (tier−1) 10×10 expansions stacked two-wide below the base (odd count leaves a hatched half-row).
- **Merge (Auto):** door pairs (D1+D2, D3+D4) share one `JNR → TAG → …` bus when dedicated lines exceed budget or footprint rows. Force with Merge / Dedicated.
- **Tier 12+:** TAG dropped; each door `SPL`s into mirrored A/B arrays around a shared Red spine.
- **Cost** = every tile in the auto-generated template (CNV per belt tile) + off-grid UNL/RACK or dock CNV.
- **Throughput:** chain = 60 / slowest scanner time; TAG bypass cap = min(TAG, chain ÷ (1 − pre-stickered)).

## Blueprint
LMB paint · RMB/E erase · R rotate placement · rotate tool spins placed tiles · ghost tiles = recommended template · Auto-populate replaces, Merge template fills gaps.

## Saving & loading layouts
**Copy state** copies the current setup as minified `warehouse_state.json`. **Import** accepts the same JSON (raw, in a ```json fence, or as a file); the download button saves it to disk.

## License
MIT — see [LICENSE](LICENSE).
