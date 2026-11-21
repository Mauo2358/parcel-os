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
src/components/ImportModal.tsx state importer (JSON or game .sav)
src/lib/savParser.ts         Parcel Simulator save decoder (UE 5.x GVAS → warehouse_state)
src/App.tsx                  controls, topology engine view, BOM, exporter
data/                        game_rules.json · warehouse_state.json (defaults)
```

## Engine rules
- **Footprint:** matches the game grid — a 4×5 board of 10×10 slots: 20×20 front block (10×20 base + 2 slots) and a 30×40 back block (12 slots). Tier = expansions bought (T14 = 1,600 units). Slots unlock in a default order by tier, or click them on the **EXPANSIONS** board in the Blueprint header to match your game. Templates are laid out in the widest open rectangle anchored at the base.
- **Merge (Auto):** door pairs (D1+D2, D3+D4) share one `JNR → TAG → …` bus when dedicated lines exceed budget or footprint rows. Force with Merge / Dedicated.
- **Tier 12+:** TAG dropped; each door `SPL`s into mirrored A/B arrays around a shared Red spine.
- **Cost** = every tile in the auto-generated template (CNV per belt tile) + off-grid UNL/RACK or dock CNV.
- **Throughput:** chain = 60 / slowest scanner time; TAG bypass cap = min(TAG, chain ÷ (1 − pre-stickered)).

## Blueprint
LMB paint · RMB/E erase · R rotate placement · rotate tool spins placed tiles · ghost tiles = recommended template · Auto-populate replaces, Merge template fills gaps.

## Saving & loading layouts
**Copy state** copies the current setup as minified `warehouse_state.json`. **Import** accepts the same JSON (raw, in a ```json fence, or as a file); the download button saves it to disk.

**Import a game save:** Load file → pick `%LOCALAPPDATA%\parcel\Saved\SaveGames\Save1.sav`. Decoded fully in the browser (nothing uploaded). Maps money → budget, expansions → tier, delivery managers seen on parcels → input doors, placed machines → unlocks, slowest unit per scanner type → level, plus an `owned` hardware count. The **Blueprint is replaced with your real layout**: every belt/machine at its grid cell and facing (mirrored parts handled), racks placed from world position, and expansion slots inferred from where things are built.

## License
MIT — see [LICENSE](LICENSE).
