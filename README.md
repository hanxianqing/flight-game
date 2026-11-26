# Skyline Courier

A complete 3D bush-plane flight game for the make.fun best-flight-game bounty.
Fly it yourself — no autopilot, no shortcuts.

## Play

Serve `game/` with any static server and open `game/index.html` in desktop
Chrome (or run `node serve.ts` and open http://localhost:8080):

- **W/S or ↑/↓** — pitch
- **A/D or ←/→** — bank
- **Q/E** — rudder
- **Shift / Ctrl** — throttle up / down
- **F** — flaps, **G** — landing gear, **B** — brakes
- **P** — pause, **R** — restart, **M** — menu, **1/2/3** — pick a mission
- **Mouse drag** — look around, **wheel** — zoom the chase camera

## Missions

1. **Ring Run** — thread all 8 rings in order. Smooth flying scores best.
2. **Valley Landing** — take off from Meadow Field, fly the circuit, land
   back on runway 36. Touch down soft and on the centreline.
3. **Island Delivery** — a parcel is due on Gull Island, across the lake.
   Land on the island strip before the clock runs out.

Fuel burns faster at full throttle, hard landings damage the airframe, and a
gentle touchdown on grass is survivable — a bush plane, after all. Score,
timer, victory and game-over screens, and restart are all in the game.

## Tech

- Three.js (r160, vendored under `game/vendor/`) for the 3D valley: a
  procedural heightfield with a lake, two runways, trees, clouds and a ring
  course, all deterministic from a seed.
- A hand-written arcade flight model (`game/src/physics.js`), mission logic
  (`game/src/missions.js`), DOM instruments (`game/src/hud.js`) and
  synthesized WebAudio engine sound (`game/src/audio.js`). No network
  requests: everything the game loads is a file under `game/`.
- `main.ts` hands the entry in: it copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json` with the vendored make.fun
  library. Run it with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

## License

MIT — see `LICENSE`.
