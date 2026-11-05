// Every player-facing game word, in one place, so renaming one is a one-line change.
// docs/name-check.md records what was checked for each name.
export const TERMS = {
  spared: 'Spared',          // through to the next round
  spooked: 'Spooked',        // knocked out
  prize: 'Golden Treat',     // what the winner takes home
  prizes: 'Golden Treats',
  champion: 'Champion',
  candy: 'Candy',
  rivals: 'AI rivals',
  soloNote: 'Single player · AI rivals',
  practice: 'Practice',
  board: 'Spirit Board',
  trick: 'Trick',
  treat: 'Treat',
};

const lower = (s) => s.toLowerCase();

/** Phrases built from those terms. */
export const SAY = {
  raceGoal: (n) => `Top ${n} are ${lower(TERMS.spared)}!`,
  surviveGoal: (n) => `Last ${n} are ${lower(TERMS.spared)}!`,
  finalGoal: () => `Last one standing takes the ${TERMS.prize}!`,
  spokenSpared: () => `${TERMS.spared}!`,
  spokenSpooked: () => `${TERMS.spooked}!`,
  spokenChampion: () => `${TERMS.champion}!`,
  youWon: () => `You took the ${TERMS.prize}!`,
  getSpared: (n) => `Get ${lower(TERMS.spared)} in ${n} rounds`,
  winPrize: () => `Win a ${TERMS.prize}`,
  reachFinal: () => 'Reach a final',
  rivalsArriving: (n, total) => `${n} / ${total} ${TERMS.rivals}`,
};
