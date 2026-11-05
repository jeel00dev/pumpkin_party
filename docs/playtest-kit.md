# Playtest kit

Nobody has played Pumpkin Party by hand yet, and passing tests can't show whether it's fun. This kit lets you find out in about an hour for five people. Run it with 5-10 people who haven't seen the game. Run it again after Milestone 3.

The one rule: **don't help.** The moment you explain something, you lose the chance to learn that it was unclear.

## Before you start

1. Build the game and start it:
   ```bash
   npm run build
   npm run preview
   ```
   The terminal prints a **Network** address. Anyone on the same Wi-Fi can open it, including on a phone. For testers elsewhere, upload the contents of `dist/` as a private build in the CrazyGames Developer Portal, or to any static host.
2. Open it in a **private or incognito window** for each tester. That gives them a fresh save, so they see what a new player sees.
3. Try to get at least two phones and one laptop with an integrated GPU, because the audience plays on both.
4. Print or copy the sheet below once per tester.
5. Ask permission to take notes. A phone video of the screen and hands is even better.

## What to say

Say this, and only this:

> "This is a game that isn't finished. I'm testing the game, not you. Please play as you would at home, and say whatever you're thinking. I won't be able to answer questions while you play. Stop whenever you want."

If they ask for help, say: "What would you try?" If they're stuck for more than a minute, note it, then give the smallest hint you can.

Let them play for **10 minutes or until they stop by choice**. When someone chooses to stop is useful information, so don't end the session for them.

## What to watch for

Write down the time and what happened, and leave the reasons for later.

| Moment | What to note |
|---|---|
| First 60 seconds | Do they know what to do? Do they find jump and dive by themselves? Do they read the hints? |
| Controls | Any fumbling? On a phone: do thumbs cover the action, do they hit the wrong button, do they manage the camera? |
| Being knocked out | Do they blame themselves or the game? Do they know what hit them? Do they understand what happens next? |
| Between rounds | Do they read the screens? Do they wait, or look for a skip? Do they look bored? |
| Trick or Treat choice | Do they understand it? Do they pick on purpose, or at random? |
| Words | Do "Spared" and "Spooked" make sense without being explained? |
| Rivals | Do they talk about any rival by name? Do they believe the rivals are people? (They're told they aren't, so a yes means our labelling isn't working.) |
| Feelings | Mark every laugh, gasp, groan, sigh, phone check and look away, with what caused it. |
| After a match | Do they press Play Again without being asked? Do they open the Shop or anything else? |
| Sound | Do they mute it, turn it down or comment on it? |
| Bugs | Anything broken, stuck or confusing. Note the device. |

## Questions afterwards

Ask these in order, before you discuss anything yourself. Write down their exact words.

1. In one sentence, what is this game?
2. What was the best moment?
3. What was the worst or most annoying moment?
4. Did any loss feel unfair? Which one?
5. Was anything confusing?
6. Were the other characters real people or computer players? What made you think so?
7. Would you play it again tomorrow, with nobody asking you to? Why, or why not?
8. If you could change one thing, what would it be?

Then ask for a score from 1 to 5 for each: **Fun**, **Clear**, **Fair**, **Looks good**, **Sounds good**.

## Tester sheet

```
Tester:            Age range:          Device and browser:
Plays games like this? never / sometimes / often
Time played:       Stopped by choice? yes / no     Played again unprompted? yes / no

Timeline (time, what happened, how they reacted):


Answers 1-8:


Scores:  Fun _  Clear _  Fair _  Looks good _  Sounds good _
```

## Sound check

Nobody has listened to the generated audio either, and this is a separate job from the playtest. It takes about 15 minutes:

1. Run `npm run dev` and open `/soundtest.html`, on speakers or headphones and then on a phone over the same Wi-Fi. The terminal prints the Network address.
2. Play every effect and music track, and mark each one Good or Bad.
3. Press **Show my notes** and send the result back.

## Sending results back

Save everything as `docs/playtest-results-YYYY-MM-DD.md`, or paste it into a message. Raw notes are more useful than a summary. Include each tester's sheet, and anything that surprised you.

The results decide what happens next:

| If you see | Priority shifts to |
|---|---|
| People don't understand the goal or the rules | Onboarding and clearer screens, ahead of new content |
| Losses feel unfair | Hitboxes, warnings and bot difficulty |
| Bored between rounds | Shorter waits and more ceremony |
| They enjoy it but don't press Play Again | Goals and rewards (Milestones 4 and 5) |
| Phone players struggle | Touch controls and layout, before anything else |
| Sounds marked Bad | Rework them, or supply real audio files |
