// The cosmetics catalog. Prices live here so the economy is tunable in one place.
import { SKINS, HATS, GLASSES } from './characters.js';
import { CELL } from '../render/particles.js';

export const TRAILS = {
  none: { name: 'No Trail', price: 0, cell: 0, colors: [0xffffff], rate: 1 },
  embers: { name: 'Embers', price: 250, rarity: 'common', cell: CELL.SPARK, colors: [0xffb030, 0xff7a14, 0xffe07a], rate: 0.035, rise: 1.8, life: 0.7, size: 0.3, sizeEnd: 0, additive: true, intensity: 1.6, spin: 6 },
  candy: { name: 'Candy Corn', price: 300, rarity: 'common', cell: CELL.CANDY, colors: [0xffffff], rate: 0.09, rise: 0.8, life: 1, size: 0.42, sizeEnd: 0.2, gravity: 4, spin: 6 },
  bats: { name: 'Bat Swarm', price: 450, rarity: 'rare', cell: CELL.BAT, colors: [0x241a3c, 0x3a2666], rate: 0.11, rise: 2.4, life: 1.2, size: 0.6, sizeEnd: 0.28, spin: 0.6 },
  slime: { name: 'Slime Drip', price: 450, rarity: 'rare', cell: CELL.BUBBLE, colors: [0x8cff2e, 0xc8ff5a], rate: 0.07, rise: 0.4, life: 0.9, size: 0.34, sizeEnd: 0.1, gravity: 3, intensity: 1.2, spin: 1 },
  stars: { name: 'Star Dust', price: 600, rarity: 'epic', cell: CELL.STAR, colors: [0xffd23a, 0xffffff, 0x53f0ff], rate: 0.05, rise: 1, life: 0.9, size: 0.34, sizeEnd: 0, additive: true, intensity: 1.5, spin: 5 },
  ghosts: { name: 'Lil Ghosts', price: 800, rarity: 'epic', cell: CELL.GHOST, colors: [0xffffff], rate: 0.14, rise: 1.7, life: 1.3, size: 0.46, sizeEnd: 0.2, spin: 0.5 },
  hearts: { name: 'Sweethearts', price: 400, rarity: 'rare', cell: CELL.HEART, colors: [0xff5a8a, 0xff8ab0], rate: 0.1, rise: 1.3, life: 1, size: 0.34, sizeEnd: 0.1, spin: 1 },
};

export const EMOTES = {
  wave: { name: 'Wave', price: 0, icon: 'wave' },
  cheer: { name: 'Cheer', price: 0, icon: 'cheer' },
  dance: { name: 'Pumpkin Boogie', price: 250, rarity: 'common', icon: 'dance' },
  flex: { name: 'Flex', price: 250, rarity: 'common', icon: 'flex' },
  boo: { name: 'Boo!', price: 300, rarity: 'rare', icon: 'boo' },
  spin: { name: 'Spin Cycle', price: 300, rarity: 'rare', icon: 'spin' },
};

/** Bundles: buy several at once, slightly cheaper. */
export const BUNDLES = {
  spooky: { name: 'Spooky Starter', price: 700, items: [['skin', 'ghost'], ['hat', 'witch'], ['trail', 'embers']], tint: '#ff9022' },
  monster: { name: 'Graveyard Gang', price: 1100, items: [['skin', 'franky'], ['skin', 'mummy'], ['emote', 'flex']], tint: '#7fd03f' },
  royal: { name: 'Royal Night', price: 1800, items: [['skin', 'vampire'], ['hat', 'crown'], ['trail', 'stars']], tint: '#b040e8' },
};

export const SHOP = { skin: SKINS, hat: HATS, glasses: GLASSES, trail: TRAILS, emote: EMOTES };

export function defaultOwned() {
  return { skin: ['pumpkin'], hat: ['none'], glasses: ['none'], trail: ['none'], emote: ['wave', 'cheer'] };
}
