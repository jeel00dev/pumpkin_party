# Basic Launch plan

Basic Launch is the live test: real players on CrazyGames, with no ads. It shows whether the game is worth taking further, and it should only happen after the playtests have been acted on.

The targets come from [CrazyGames' Basic Launch metrics](https://docs.crazygames.com/resources/basic-launch-metrics/). Checked 2026-11-04.

| Measure | What it means | Target |
|---|---|---|
| Length of the test | Minimum run | 7+ days and 500+ plays (it ends after 21 days otherwise) |
| Conversion | Share of people who play at least one minute | 80%+ (top performers) |
| Average session | Average play time | 10+ minutes (successful titles often reach this) |
| Day-1 retention | Share who come back the next day | 10-15% (strong games) |

The portal's exact labels may differ from the names above. Nobody has checked them against a live dashboard yet.

## Before submitting

1. Finish Milestones 1-3, and run the playtest kit again on that build.
2. Run `npm run check` and `npx playwright test`.
3. Run `npm run build`, which leaves ads off. Upload the **contents** of `dist/`, with `index.html` at the root.
4. Set **Progress saving: Yes, using the Data Module**. Without this the module stays disabled.
5. Upload fresh covers and videos. The current promo media shows the old level-based game, so re-render it first (Milestone 6).
6. Run the build through the QA tool, on a real phone and on Safari.
7. Don't tag it Multiplayer. The rivals are AI.

## During the test

Check the portal once a day, and record the numbers in a table so that trends are visible. Don't change the build in the first 7 days unless something is broken. Otherwise the numbers can't be compared.

```
Date | Plays | Conversion | Avg session | Day-1 retention | Notes (bugs, comments, changes)
```

Also note the split between desktop and mobile, if the portal shows it. Weak mobile numbers call for different fixes from weak desktop numbers.

## Reading the results

| Result | Likely cause | First thing to look at |
|---|---|---|
| Conversion under 80% | Slow loading, or a confusing first minute | Load time, first-launch flow, onboarding hints, mobile performance |
| Session under 10 minutes | The match loop isn't pulling people into another match | Play Again rate, waits between rounds, rewards, how often players go out in early rounds |
| Day-1 retention under 10% | Nothing to come back for | Next goal, missions, login rewards, new-game-type pacing |
| All three fine | Ready to go on | Prepare the Full Launch build with `npm run build:full` |
| Crashes or errors in comments | A bug | Fix it first. Note the date, as earlier numbers won't compare |

These are starting points. If several numbers are weak, fix conversion first, because players who leave in the first minute never reach anything else.

## Limits of this plan

- The targets describe strong games on the platform. They aren't pass marks that CrazyGames has published for this game.
- The sample is small, so a few hundred plays can swing a percentage by a lot.
- The game can't measure these itself. It sends SDK events, and the portal does the counting.
