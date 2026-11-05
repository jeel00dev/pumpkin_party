# Proposal: replacing the dive

**Status: waiting for the owner's choice.** Nothing here has been built. The brief says to propose this first.

The backlog flags the dive as one of the game's closest matches to Fall Guys, along with "Qualified", "Eliminated" and the crown. Those words have been replaced, so this is the last of the four.

## What the dive does today

| Job | Detail |
|---|---|
| Adds reach | A lunge at 10.4 m/s, against a run speed of 7.4. It saves a jump that's coming up short |
| Costs something | A 0.42 s slide, a get-up and a 0.75 s cooldown, so it's a commitment |
| Hits rivals | It's the only move that can knock a rival down. A connecting dive stuns them for 0.8 s |
| Finishes races | Bots lunge for the line, purely for show |

Whatever replaces it has to keep the first three jobs, or level gaps, bot behaviour and Candy Bandits all need rework.

## Options

| | A. Pounce (recommended) | B. Boo! | C. Swoop |
|---|---|---|---|
| The idea | Same button and same reach, but you leap at people like a monster, arms up and claws out. Landing near a rival lets out a "Boo!" that makes them stumble | A scare with no movement: a short cone in front of you that makes rivals flinch | A short ghostly air dash with no slide or landing penalty |
| Reach for saving a jump | Same as today | Lost | Similar |
| Risk and commitment | Kept | Lost, because it's safe to use anywhere | Lost, because it has no landing cost |
| Affecting rivals | Better: a direct hit knocks down, a near landing makes them stumble | Good, at any time | Lost |
| Reads as this game's own | Yes: monsters pouncing suits the theme, and each skin can pounce its own way | Yes | Weaker: air dashes are common in platformers |
| Levels and bots | No change, as the physics stays | Gaps need rework, and bots need new logic | Bots and some gaps need rework |
| Effort | Small | Medium | Medium |

## Recommendation: A, Pounce

It changes what the move means without touching what's already tuned and tested. Concretely:

1. Rename it **Pounce** everywhere a player sees it: touch button, key hints, missions and the portal controls text.
2. Replace the belly-flop pose with an arms-up leap, and swap the running-man icon on the touch button.
3. Add a small "Boo!" when a Pounce lands within about 2 m of a rival: a brief stumble that costs them speed, without a full knockdown. A direct hit still knocks them down as it does today.
4. Give bots the same rule, so they can Pounce at the player and at each other. Rival personalities in Milestone 3 build on this: the Bully hunts people with it.

"Pounce" is a plain English verb. It would go through the name check before shipping.

This is a judgement about feel, and nothing here is backed by data. A playtest could change it.

## What's needed

Please reply **A**, **B**, **C** or something else. Until then, Milestone 2 carries on with everything else and the dive stays as it is. The player-facing word will live in `src/content/terms.js`, so the rename is cheap whichever option wins.
