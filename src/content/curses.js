// Curses: round modifiers chosen at a Trick or Treat reveal. A few of these multiply every map.
//
// A curse is plain data. The physics reads its numbers, so a cursed round stays deterministic and bots
// obey the same rules as the player. Curses never reverse controls, which would feel unfair, and they
// apply to every racer alike. The player sees the curse before the round and on the HUD during it.
export const NO_MODS = Object.freeze({
  gravity: 1,        // multiplies gravity
  grip: 1,           // multiplies how hard feet can push on the ground
  body: 1,           // multiplies body size, including the hitbox
  hazardSpeed: 1,    // multiplies how fast hammers swing
  headScale: 1,      // visual only
  fog: false,        // visual only: thick fog with a lantern around the player
  botSight: 1,       // how far ahead bots can read hazards, so fog hides things from them too
});

export const CURSES = {
  moon: { id: 'moon', name: 'Moon Gravity', hint: 'Everyone floats. Jumps go higher and falls take longer.', mods: { gravity: 0.58 } },
  heads: { id: 'heads', name: 'Giant Heads', hint: 'Huge heads on the same tiny legs.', mods: { headScale: 1.6 } },
  fog: { id: 'fog', name: 'Lantern Fog', hint: 'Thick fog. Only your lantern lights the way.', mods: { fog: true, botSight: 0.6 } },
  slime: { id: 'slime', name: 'Slippery Slime', hint: 'Every floor is slick. Turn early.', mods: { grip: 0.32 } },
  tiny: { id: 'tiny', name: 'Tiny Bodies', hint: 'Everyone shrinks. Smaller body, same big jump.', mods: { body: 0.66 } },
  hammers: { id: 'hammers', name: 'Hammer Frenzy', hint: 'Hammers swing twice as fast.', mods: { hazardSpeed: 2 }, needs: 'hammers' },
};

/** The rules a round runs under. Unknown or absent curses change nothing. */
export function modsFor(id) {
  const c = id ? CURSES[id] : null;
  return c ? { ...NO_MODS, ...c.mods } : { ...NO_MODS };
}

/** Curses that make sense on this map: a hammer curse needs hammers. */
export function cursesFor(def) {
  return Object.values(CURSES).filter((c) => !c.needs || def.hazards?.includes(c.needs));
}
