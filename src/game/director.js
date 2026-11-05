// Difficulty director: decides how sharp the AI rivals are so a new player has a winning first session,
// then eases toward a real challenge. In a knockout format a bad first match means no second one, so
// this is the game's main retention lever: see docs/research-2026-11-04-design-and-crazygames.md.
import { BOT_SKINS, SKIN_IDS, HATS, GLASSES } from '../assets/characters.js';
import { TRAILS } from '../assets/cosmetics.js';
import { botName } from './bot.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** How much rivals ease off, by how many matches in a row ended in the first two rounds. */
const EASE_OFF = [0, 0, 0.1, 0.16, 0.2, 0.24];

/** Matches in a row, counting back from the latest, that ended in the first two rounds. */
export function earlyExits(recent = []) {
  let n = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i] <= 2; i--) n++;
  return n;
}

/**
 * 0 (brand new) to 1 (seasoned), from match count and recent results.
 *
 * Losing-streak protection stays light on purpose: it only makes rivals a little less sharp, it's capped,
 * and the first good run ends it. It never rigs a result, hands out a win or changes what a player earns.
 */
export function difficulty(stats) {
  const played = stats.matches || 0;
  let d = 0.1 + Math.min(played, 24) * 0.028;
  const recent = stats.recent || [];
  if (recent.length) {
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length; // 1..5 rounds reached
    d += (avg - 3) * 0.05;
    // Struggling? Ease off. On a streak? Push back.
    d -= EASE_OFF[Math.min(earlyExits(recent), EASE_OFF.length - 1)];
    if (stats.streak >= 2) d += 0.06 * Math.min(stats.streak, 4);
  }
  return clamp(d, 0.08, 0.92);
}

/** Bot skill for this slot: a spread around the difficulty, tightening at later rounds. */
export function botSkill(d, roundIndex, rand) {
  const roundBoost = roundIndex * 0.035;
  const spread = 0.26;
  return clamp(d + roundBoost + (rand() - 0.5) * spread * 2, 0.08, 0.98);
}

/**
 * Race pacing: rubber-banding that fades out with experience. Rivals ahead of a player who's behind
 * ease off, and only so far as a skilful player wouldn't notice. Hard bots never slow down.
 */
export function makePacing(d, playerGetter) {
  const strength = clamp(1 - d * 1.5, 0, 1);
  if (strength <= 0) return null;
  return (sim) => {
    const p = playerGetter();
    if (!p || !p.active || p.finished || sim.level.mode !== 'race') return null;
    const L = sim.level;
    const pp = L.progress(p);
    const spots = sim.quota - sim.qualified.length;
    return (bot) => {
      if (bot.skill > 0.72) return 1;
      const r = bot.r;
      const ahead = L.progress(r) - pp;
      if (ahead <= 2) return 1;
      // Keeps most of the pack within catching distance, tightening as spots run out.
      const urgency = clamp(1 - spots / sim.quota, 0, 1);
      const slow = clamp((ahead - 2) / 45, 0, 1) * (0.2 + urgency * 0.25) * strength;
      return 1 - slow;
    };
  };
}

/** Build the entrants for a round, keeping identities across rounds of the same match. */
export function buildRoster(n, d, rand) {
  const roster = [];
  const usedNames = new Set();
  for (let i = 0; i < n; i++) {
    let name = botName(rand), guard = 0;
    while (usedNames.has(name) && guard++ < 16) name = botName(rand);
    usedNames.add(name);
    const skin = BOT_SKINS[Math.floor(rand() * BOT_SKINS.length)];
    const hatKeys = Object.keys(HATS), glassKeys = Object.keys(GLASSES), trailKeys = Object.keys(TRAILS);
    roster.push({
      id: i, name, skin,
      hat: rand() < 0.22 ? hatKeys[1 + Math.floor(rand() * (hatKeys.length - 1))] : 'none',
      glasses: rand() < 0.16 ? glassKeys[1 + Math.floor(rand() * (glassKeys.length - 1))] : 'none',
      trail: rand() < 0.08 ? trailKeys[1 + Math.floor(rand() * (trailKeys.length - 1))] : 'none',
      bias: rand(),
    });
  }
  return roster;
}

void SKIN_IDS;
