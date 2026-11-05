# Pumpkin Party

A Halloween party-knockout platformer for the web, built with Three.js. You race, dodge and survive through five rounds against AI rivals for the crown.

It's single-player, runs with no server, and is built for CrazyGames. Every model, texture, sound and piece of music is generated from code, so the whole game is about 1.2 MB.

## Commands

```bash
npm install
npm run dev          # http://127.0.0.1:5173 (add ?menu=1 to skip the first-run flow)
npm test             # physics, levels, economy
npm run simulate     # headless bots on every level: round lengths, falls, hits
npm run build        # Basic Launch build (ads off) into dist/
npm run build:full   # Full Launch build (ads on, through the SDK only)
npm run check        # tests + build + CrazyGames limits
npx playwright test  # compliance and playthrough suites, against dist/ (port 4317, or set E2E_PORT)
npm run art          # re-render logo, loading screen and level thumbnails (dev server must be running)
npm run promo        # re-render CrazyGames covers and preview videos (dev server must be running)
```

Useful URL flags in development: `?tier=low|medium|high`, `?bot=1` (autopilot), `?speed=3`.
`/lab.html?view=all` shows every character; `/lab.html?view=level&level=ghostChase` opens a level.
`/soundtest.html` plays every sound and music track. Open it from a phone as well, using the Network address `npm run dev` prints.

## Publishing on CrazyGames

1. `npm run build`, then upload the **contents** of `dist/`, with `index.html` at the root.
2. Engine: HTML5. Orientation: landscape. Progress saving: **Yes, using the Data Module**. This setting is required, or the module stays disabled.
3. Upload the covers and preview videos from `promo/`, and paste the description and controls from `docs/crazygames-compliance.md`.
4. Don't tag it Multiplayer: the rivals are AI.
5. When invited to Full Launch, rebuild with `npm run build:full`.

## How it's organised

```
src/physics/    world (colliders, queries) and racer (the character controller). No DOM or renderer.
src/game/       simulation (one round's rules), bot (AI), director (difficulty), match (round flow),
                roundview (presents a simulation), menuscene, camera, app (boot, loop, quality)
src/levels/     base (shared framework and obstacles) plus one file per map, listed in index.js
src/assets/     characters (skins, hats, glasses), animator, scenery, castle, obstacles, cosmetics
src/render/     pipeline (HDR, bloom, reflections), materials, sky, textures, geo, particles
src/ui/         screens, hud, thumbs, icons, ui.css
src/core/       sdk (CrazyGames), profile (save and economy), audio, input
```

### Adding a map

Write `build(ctx)` in a new `src/levels/*.js`, declaring floors, obstacles, a route for the AI and checkpoints, then list it in `src/levels/index.js`. `npm run simulate yourLevel` shows straight away whether bots can finish it and how long rounds take. Worlds 2 and 3 are already on the level screen as locked tabs.

### Going multiplayer later

`Simulation` is deterministic, has no renderer dependency, and takes a per-racer `Input`. A server can run the same class at the same 120 Hz, with bots filling empty slots, and `RoundView` only needs racer positions to present it.

## Performance

Quality starts from the detected GPU and adapts while playing: resolution steps down first, then the quality tier between rounds.

| Tier | Reflections | Refraction | Shadows | Post | Typical use |
|---|---|---|---|---|---|
| high | planar | screen-space | 2048 | HDR, bloom, 4x MSAA | discrete GPUs |
| medium | environment only | screen-space | 1024 | HDR, bloom, 2x MSAA | integrated GPUs |
| low | environment only | none | blob | none | phones, 4 GB Chromebooks |
