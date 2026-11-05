# Implementation status

Every backlog item from `docs/ideas-2026-11-05-release-backlog.md`, tracked until it's **Done**, or **Dropped** with a reason the owner approved. Item numbers match the backlog's sections.

Status values: **Done**, **In progress**, **Not started**, **Blocked**, **Dropped**. "Done" means built and verified as described. It never means fun or good-sounding, which only a person can confirm.

## Waiting on the owner

| # | Needed | Why |
|---|---|---|
| O1 | Paste `docs/implementation-prompt.md` from the machine it was written on | The brief arrived with text cut from about 40 lines. See "Assumptions" below |
| O2 | Add `Jayt257` as a collaborator on `jeel00dev/pumpkin_party`, or approve a fork | Push returns 403 and `gh` isn't installed, so branches are local and no PR can be opened |
| O3 | Confirm D1 (Haunt mode) and D2 (Spared, Spooked, candy prize) | The note above the brief says these were recommendations the owner hadn't answered |
| O4 | Run the playtest kit with 5-10 people | `docs/playtest-kit.md`. Only people can do this |
| O5 | Listen to the audio | `/soundtest.html`. Only people can do this |
| O6 | Decide whether to keep the name "Pumpkin Party" | It isn't unique. See `docs/name-check.md` |

## Assumptions where the brief was cut off

The pasted brief lost text in the middle of many lines. Most could be restored from the backlog. These are the ones that needed a judgement call:

| Where | Text as received | Treated as |
|---|---|---|
| D2 | `"Eliminated" andl words and a candy-themed prize` | Replace "Qualified", "Eliminated" and the crown with original words and a candy-themed prize |
| CrazyGames | `gameplayStop stay cever fire on tab switches` | They stay correct and never fire on tab switches |
| CrazyGames | `821x462, 80, with DPR 1` | All sizes CrazyGames lists, at DPR 1 |
| Second chance | `never combines a midgame ad with a keep-pla` | Never combines a midgame ad with a keep-playing offer. The offer is removed |
| New rounds | `an npm 30-90 seconds a round` | An `npm run simulate` result of 30-90 s per round |
| 1.5 | `No reversed controls. Curses must s.` | **Unknown ending.** Curses apply to everyone equally, are announced before the round, stay visible during it, and run in the deterministic simulation |
| 1.9 | `with faster formance holds on the low tier` | With faster rounds, if performance holds on the low tier |
| 4.6 | `free monster power pickups , ghost phase, bandage grapple...` | **At least one power name is lost.** The list will start from the four that survive, and more may be added |
| Milestone 2 | `Trick or Treat Street, Lantern Night,thm game first` | Trick or Treat Street, Lantern Night, Moonlight Freeze and the rhythm game first, matching the backlog's suggested order |
| 9.11 | `earned e powers to a match's final stretch` | Earned in-match. Test limiting active powers to a match's final stretch |
| Close of brief | `any concrete problem you fr that, begin work` | Report problems, then begin without waiting |

## Machine and verification notes

- Baseline on 2026-11-05: 34 of 34 unit tests. Browser suite 25 of 26 on a free port, and the one failure came from the temporary port, because that test hard-coded `:4173`.
- E2E now uses port 4317 (`E2E_PORT` overrides it) and refuses to reuse a running server. Port 4173 on this machine serves a different project, which silently invalidated the first run.
- On this Windows machine, `--use-angle=vulkan` selects the RTX 4060 and `--use-angle=d3d11` selects the integrated Radeon 780M. `scripts/shot.mjs` and `scripts/drive.mjs` use the second for `--igpu`.
- `npm run art` no longer needs ImageMagick. `npm run promo` still needs ImageMagick and ffmpeg, which aren't on this machine. That matters at Milestone 6.

## Section 10: Prove it's fun (Milestone 0)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 10.1 Watch 5-10 people play | In progress: kit ready, sessions need the owner (O4) | `docs/playtest-kit.md` | Only people can complete this |
| 10.2 Listen to all the audio | In progress: page ready, listening needs the owner (O5) | `soundtest.html`, `src/soundtest.js` | `tests/audio.test.js` keeps the list complete. Page driven in Chromium at 1280x720 and 390x780: all 32 sounds listed, notes work, no horizontal overflow. No person has listened |
| 10.3 Basic Launch plan | Done | `docs/basic-launch-plan.md` | Targets checked against the CrazyGames docs cited there. The portal itself wasn't available |
| 10.4 Hold the promo media | Done: held until Milestone 6 | Nothing rendered | No promo media changed |

Milestone 0 checks: `npm test` 37 of 37, `npm run check` passes (1.20 MB, 18 files), `npx playwright test` 26 of 26. No game screen changed, so there were none to compare against the art. Frame rate wasn't measured because rendering didn't change.

## Section 1: Match flow (Milestone 1)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 1.1 Remove Level Select, stars and worlds; add Practice | Not started | | |
| 1.2 Random playlist with rules | Not started | | |
| 1.3 Spirit Board reveal | Not started | | |
| 1.4 Trick or Treat choice | Not started | | |
| 1.5 Curses | Not started | | |
| 1.6 Standings between rounds | Not started | | |
| 1.7 Playable lobby | Not started | | |
| 1.8 Waits under 5 seconds | Not started | | |
| 1.9 Try 20-24 player lobbies | Not started | | |
| 1.10 Round mix by stage | Not started | | |

## Section 2: New game types (Milestone 2, trap in Milestone 6)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 2.1 Trick or Treat Street | Not started | | |
| 2.2 Lantern Night | Not started | | |
| 2.3 Hide and Spook | Not started | | |
| 2.4 Moonlight Freeze | Not started | | |
| 2.5 Rhythm game (renamed from the backlog's working title) | Not started | | |
| 2.6 Witch's Curse | Not started | | |
| 2.7 Zombie Night | Not started | | |
| 2.8 Candy Bandits | Not started | | |
| 2.9 Broomstick Rush | Not started | | |
| 2.10 Throne final (renamed from the backlog's working title) | Not started | | |
| 2.11 Bounty Final | Not started | | |
| 2.12 Haunted Gauntlet | Not started | | |
| 2.13 Ghosts place one trap for the next round | Not started (Milestone 6) | | |

## Section 3: Keep it original (Milestone 2)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 3.1 Rework Haunted Floor | Not started | | |
| 3.2 Replace or rework Final Showdown, keeping the cauldron | Not started | | |
| 3.3 Add ghost and candy hazards to the hammer alley | Not started | | |
| 3.4 Replace the dive or give it a distinct identity (propose first) | Not started | | |
| 3.5 Replace "Qualified", "Eliminated" and the crown (D2) | Not started | | |
| 3.6 Pillar: eliminated doesn't mean finished | Not started | | |
| 3.7 Pillar: monster powers | Not started | | |
| 3.8 Pillar: candy score across a match | Not started | | |
| 3.9 Pillar: spooky show host | Not started | | |

## Section 4: One-winner drama (Milestone 2)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 4.1 Haunt mode | Not started | | |
| 4.2 Runner-up recognition | Not started | | |
| 4.3 Progress without winning (renamed per D2) | Not started | | |
| 4.4 Champion ceremony | Not started | | |
| 4.5 Pressure events | Not started | | |
| 4.6 Catch-up pickups | Not started | | |

## Section 5: Rivals with personality (Milestone 3)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 5.1 Personalities with visible styles | Not started | | |
| 5.2 Nameplates and elimination feed | Not started | | |
| 5.3 A nemesis, with Rematch on the home screen | Not started | | |
| 5.4 Keep the "AI rivals" label | Not started | | |

## Section 6: Difficulty and level design (Milestones 1 and 2)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 6.1 Stronger losing-streak protection (Milestone 1) | Not started | | |
| 6.2 Teach, test, twist, final exam | Not started | | |
| 6.3 Two routes on every race | Not started | | |
| 6.4 Fair failure | Not started | | |
| 6.5 One hazard colour language | Not started | | |
| 6.6 Layout variants per map | Not started | | |
| 6.7 One set piece per map | Not started | | |
| 6.8 One new game type per match (Milestone 1) | Not started | | |
| 6.9 About 80% skill to 20% chaos | Not started | | |

## Section 7: Game feel (Milestone 3)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 7.1 Floppy limb ragdoll | Not started | | |
| 7.2 Expressive faces | Not started | | |
| 7.3 Scaled hit-stop | Not started | | |
| 7.4 Squash, stretch and anticipation | Not started | | |
| 7.5 Restrained, decaying shake | Not started | | |
| 7.6 Near-miss rewards | Not started | | |
| 7.7 Small touches | Not started | | |
| 7.8 Cute gibberish voices | Not started | | |
| 7.9 Music that intensifies; ready for real files | Not started | | |
| 7.10 A run and stumble for each monster | Not started | | |

## Section 8: Home screen and UI (Milestones 4 and 6)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 8.1 One dominant Play button | Not started | | |
| 8.2 Open centre | Not started | | |
| 8.3 Labelled tabs | Not started | | |
| 8.4 Next goal always visible | Not started | | |
| 8.5 One suggestion at a time | Not started | | |
| 8.6 Interactive hero | Not started | | |
| 8.7 Haunted Town (Milestone 6) | Not started | | |
| 8.8 Hub mini-games (Milestone 6) | Not started | | |
| 8.9 Reward ceremony | Not started | | |
| 8.10 Motion and transitions | Not started | | |
| 8.11 In-round info | Not started | | |
| 8.12 One visual language | Not started | | |
| 8.13 Hats and glasses in the Shop | Not started | | |

## Section 9: Retention (Milestones 5 and 6)

| Item | Status | Where | Verified by |
|---|---|---|---|
| 9.1 Rank ladder with seasonal resets | Not started | | |
| 9.2 Feel accomplished in 3 minutes | Not started | | |
| 9.3 Cumulative login rewards | Not started | | |
| 9.4 Banked missions and weekly goals | Not started | | |
| 9.5 A real season track | Not started | | |
| 9.6 Event framework, plus one further event | Not started | | |
| 9.6b Further seasonal events and tournaments (Milestone 6) | Not started | | |
| 9.7 Give gems a purpose, or remove them | Not started | | |
| 9.8 Collection album | Not started | | |
| 9.9 Titles and achievements | Not started | | |
| 9.10 One weekly challenge mode | Not started | | |
| 9.11 Monster powers stay free and earned | Not started | | |
| 9.12 Full Launch ad placements | Not started | | |
| 9.13 Guardrails | Not started | | |

## Release preparation (Milestone 6)

| Item | Status | Where | Verified by |
|---|---|---|---|
| R1 Update README and compliance doc, including portal copy and tags | Not started | | |
| R2 Add `CLAUDE.md` | Not started | | |
| R3 Re-render art and promo media | Not started | | |
| R4 List everything only the owner can do | Not started | | |
