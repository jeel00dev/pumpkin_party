// Which rounds a match plays, and how many racers each one keeps.
//
// Rules: no repeats, at least one race and one non-race, one wildcard slot, and a final drawn from a
// pool. A forgiving opener, a varied middle and a tense final. Each new game type debuts in its own
// match, so the first few matches always bring something new (see `debut` in src/levels/index.js).
import { cursesFor } from '../content/curses.js';

export const LOBBY_SIZE = 16;
/** Racers kept by each round, from the full lobby down to one winner. */
const FUNNELS = { 16: [12, 9, 6, 3, 1], 20: [14, 10, 6, 3, 1], 24: [16, 11, 6, 3, 1] };
const WILDCARD_SLOTS = [2, 3];
const TRICKS_PER_MATCH = 2;
const TRICK_CHANCE = 0.45;

const pick = (list, rand) => list[Math.floor(rand() * list.length)];

function shuffled(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isRace = (d) => d.kind === 'race';

/**
 * @param {object} catalog level definitions, each with { id, kind, stages, debut?, firstMatch? }
 * @param {object} o       matchIndex: matches already played; rand: seeded random; lobby: starting racers
 * @returns {Array} one entry per round: { level, stage, wildcard, isNew, quota }
 */
export function buildPlaylist(catalog, { matchIndex = 0, rand = Math.random, lobby = LOBBY_SIZE } = {}) {
  const funnel = FUNNELS[lobby] ?? FUNNELS[LOBBY_SIZE];
  const open = Object.values(catalog).filter((d) => (d.debut ?? 0) <= matchIndex);
  const finals = open.filter((d) => d.stages.includes('final'));
  const rounds = open.filter((d) => !d.stages.includes('final'));
  const slots = funnel.length - 1;
  const wild = pick(WILDCARD_SLOTS, rand);
  const picks = new Array(slots).fill(null);
  const used = new Set();
  const take = (i, d) => { if (d) { picks[i] = d; used.add(d.id); } };
  const free = (test = () => true) => shuffled(rounds.filter((d) => !used.has(d.id) && test(d)), rand);

  // The opener is forgiving, and a player's very first match starts on the most readable course.
  const openers = free((d) => d.stages.includes('opener'));
  take(0, (matchIndex === 0 && openers.find((d) => d.firstMatch)) || openers[0] || free()[0]);

  // A game type making its debut takes the first slot after the opener, so it can't be missed.
  const debut = free((d) => matchIndex > 0 && (d.debut ?? 0) === matchIndex)[0];
  if (debut) take(wild === 1 ? 2 : 1, debut);

  // Fill the rest, avoiding two rounds of the same kind in a row when the pool allows it.
  for (let i = 1; i < slots; i++) {
    if (picks[i]) continue;
    const pool = free((d) => i === wild || d.stages.includes('middle'));
    const fallback = pool.length ? pool : free();
    take(i, fallback.find((d) => d.kind !== picks[i - 1]?.kind) ?? fallback[0]);
  }

  // Guarantee both a race and a non-race, swapping out a slot that isn't the opener or a debut.
  for (const wantRace of [true, false]) {
    if (picks.some((d) => d && isRace(d) === wantRace)) continue;
    const swap = free((d) => isRace(d) === wantRace)[0];
    const i = picks.findIndex((d, k) => k > 0 && d && d !== debut);
    if (swap && i > 0) { used.delete(picks[i].id); take(i, swap); }
  }

  const plan = picks.filter(Boolean).map((d, i) => ({
    level: d.id, stage: i === 0 ? 'opener' : 'middle', wildcard: i === wild, isNew: d === debut, quota: funnel[i],
  }));
  const final = pick(finals, rand);
  if (final) plan.push({ level: final.id, stage: 'final', wildcard: false, isNew: false, quota: 1 });
  return plan;
}

/** How many of the racers still in are kept this round. Every round must knock someone out. */
export function quotaFor(planned, alive) {
  return Math.max(1, Math.min(planned, alive - 1));
}

/** Decides whether this reveal offers Trick or Treat, and with which curse. Returns a curse id or null. */
export function trickFor(def, { matchIndex = 0, offered = 0, rand = Math.random } = {}) {
  if (matchIndex === 0 || offered >= TRICKS_PER_MATCH) return null; // the first match has enough to learn
  if (rand() > TRICK_CHANCE) return null;
  const options = cursesFor(def);
  return options.length ? pick(options, rand).id : null;
}
