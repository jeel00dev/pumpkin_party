# CrazyGames compliance

Checked against the [CrazyGames developer docs](https://docs.crazygames.com/requirements/intro/) on 2026-11-04. Automated checks are in `e2e/crazygames.spec.js` and `scripts/check-build.mjs`.

## Technical

| Rule | Status | Where |
|---|---|---|
| Initial download ≤ 50 MB, or ≤ 20 MB for the mobile homepage | ✅ about 1.2 MB in total | `npm run check` |
| Total ≤ 250 MB, at most 1,500 files | ✅ 18 files | `scripts/check-build.mjs` |
| Relative paths only | ✅ `base: './'`, and e2e confirms no other-origin requests | `vite.config.js` |
| Works on Chrome and Edge; Safari if it runs well | ✅ WebGL 2 with no browser-specific code. Tested on Chromium only, so **check Safari and iOS on real devices** | |
| Runs smoothly on a 4 GB Chromebook | ✅ by design: low tier drops post, shadows and reflections. Not tested on a real Chromebook, so **check in the QA tool** | `render/pipeline.js`, `game/app.js` |
| Mouse, keyboard and touch | ✅ plus gamepad | `core/input.js`, `ui/hud.js` |
| `user-select: none` with prefixes | ✅ | `ui/ui.css` |
| Works in the app's fullscreen; safe areas respected | ✅ `env(safe-area-inset-*)` throughout the UI | `ui/ui.css` |
| iOS audio resumes after an interruption, on a user gesture | ✅ every gesture calls `resume()` | `core/audio.js` |
| Orientation lock logic not needed | ✅ none; set landscape in the portal | |
| `gameplayStart` when a round starts or resumes, `gameplayStop` at every break, never on tab switch | ✅ e2e checks all of these. A tab switch still pauses the round, but tells the SDK nothing, as the docs ask: "Don't call this event when the user switches focus or leaves the game area". The lobby is a waiting area, so it isn't reported as gameplay | `game/match.js`, `game/app.js` |
| Data module for saves, read at load, with fallback | ✅ e2e | `core/profile.js` |
| Don't call the SDK when `environment` is `disabled` | ✅ e2e | `core/sdk.js` |
| Personal data notice | ✅ not needed: nothing is collected beyond SDK events | |

## Gameplay

| Rule | Status | Where |
|---|---|---|
| Land new users in gameplay immediately, or within one click | ✅ first launch goes straight to a round with no lobby or reveal; returning players are one click from a match. e2e. A daily reward popup can sit in front of Play once a day, which Milestone 4 replaces | `game/app.js`, `game/match.js` |
| Legible at DPR 1 at every listed size | ✅ e2e checks overflow and font sizes at all ten: 821x462, 907x510, 1077x606, 1216x684, 1280x720, 1366x768, 1536x864, 1920x1080, mobile 800x450, tablet 1080x607. The lobby, Spirit Board and standings are checked at four of those | `ui/screens.js` `onResize`, `e2e/flow.spec.js` |
| Consistent physics at 144 and 165 Hz | ✅ fixed 120 Hz step with interpolation. Unit tested, but not observed on a real high-refresh display | `game/simulation.js`, `game/roundview.js` |
| English localisation | ✅ all text is English. Locale is read from the SDK; no translations yet | |
| No custom fullscreen button | ✅ e2e | |
| No cross-promotion or external links | ✅ e2e | |
| PEGI 12 | ✅ cartoon slapstick, no blood, no chat or user content | |
| Original names, assets and content | ⚠️ All assets are made from scratch, but **confirm the name "Pumpkin Party" isn't taken** and see the note on images below | |
| Intuitive controls; adapts to keyboard layout | ✅ physical key codes, so WASD lands on ZQSD on AZERTY | `core/input.js` |
| Onboarding in gameplay, skippable, visual | ✅ on-screen key hints that clear as you use each control; they never block play | `ui/hud.js` |
| Avoid relying on Escape | ✅ `P` pauses; Esc also works, but nothing depends on it | |
| Mouse lock has an unlock shortcut | ✅ Tab or Esc, and the game pauses when the lock is released | `core/input.js` |

The concept art has a **Quit** button on the title screen. It's left out: a browser game has nothing to quit to.

## Ads (Full Launch only; off in the Basic Launch build)

| Rule | Status | Where |
|---|---|---|
| Only ads through the SDK | ✅ | `core/sdk.js` |
| Game runs without ads, and with ad blockers | ✅ e2e | |
| Midgame only at natural breaks, never from a navigation button | ✅ automatic, between matches, after 3 minutes of play | `game/match.js` |
| Mute only once the ad starts; unmute and resume on finish or error | ✅ e2e | `game/app.js` |
| Block input while an ad is pending | ✅ spinner overlay | `game/app.js` |
| Rewarded offers: never on an active gameplay screen | ✅ results and coin screens only. The old second-chance offer is gone, so a match never combines a midgame ad with a keep-playing offer | |
| No reward on `adError` | ✅ e2e | |
| Decline matches accept in size, font and colour; not delayed | ✅ e2e checks the free-coins offer | `ui/screens.js` |
| Video icon on the offer; reward stated | ✅ | |
| Rewards also available by playing; offered infrequently | ✅ coins are earned in play; free coins capped at 3 a day | `core/profile.js` |
| Banners not during gameplay; must not block UI | ✅ shop only, in a reserved slot, on screens taller than 520 px | `ui/screens.js` |

## Account

| Rule | Status | Where |
|---|---|---|
| Show the CrazyGames username and avatar, fetched at every start | ✅ e2e | `core/sdk.js`, `core/profile.js` |
| Guests can play; no other login options | ✅ | |
| Login button isn't the main call to action, and the prompt never opens by itself | ✅ small, top right, e2e | `ui/screens.js` |
| Progress follows the account | ✅ through the Data module | |

## Bots

The docs don't address AI opponents. The game doesn't claim to be multiplayer: the menu and the lobby both say "AI rivals", there's no "finding players" step, and rival names are playful rather than imitating real usernames. **Don't select the Multiplayer tag** when submitting. The Quality guidelines ask that the "name and imagery should accurately reflect the gameplay".

## Before you submit

These need you, as they can't be checked from here:

1. Select **Yes, using the Data Module** under progress saving, or the module stays disabled.
2. Run the build through the [QA tool](https://docs.crazygames.com/) in the Developer Portal, on a real phone and on Safari.
3. Decide whether to keep the name "Pumpkin Party". Other small games already use it: see `docs/name-check.md`. It also needs a proper trademark check.
4. Two of your reference images (the purple course with pumpkin hammers and "Finish" arch, and the moonlit lake with the pumpkin house) look like screenshots from other games or asset packs. I used them only as mood reference and nothing was copied from them, but don't upload those images themselves as covers or marketing.

## Portal copy (ready to paste)

**Description**

Pumpkin Party is a Halloween knockout platformer. Race down the castle causeway, dodge giant hammers and rolling pumpkins, outrun a giant ghost, and stay on your feet as the floor falls away. The Spirit Board picks each round, and some come with a choice: play it safe, or take a curse for double candy. Each round spooks more rivals, until one is left to take the Golden Treat. Play solo against AI opponents that get smarter as you improve. Earn coins to unlock skins, hats, glasses, trails and emotes, complete daily missions, and climb the Halloween Event track for an exclusive Golden Jack skin.

**Controls**

Keyboard and mouse: WASD or arrow keys to run, Space to jump, Shift to dive, mouse to look around, P to pause, 1-4 to emote. Touch: left stick to run, on-screen buttons to jump and dive, drag to look around. Gamepad: left stick to run, A to jump, X to dive, right stick to look around.

**Tags**

3D, Platformer, Parkour, Halloween, Racing, Obstacle Course. Not Multiplayer.
