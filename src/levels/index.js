import { build as pumpkinDash } from './pumpkinDash.js';
import { build as ghostChase } from './ghostChase.js';
import { build as hauntedFloor } from './hauntedFloor.js';
import { build as witchsPlatform } from './witchsPlatform.js';
import { build as pumpkinRoll } from './pumpkinRoll.js';
import { build as finalShowdown } from './finalShowdown.js';
import { build as lobby } from './lobby.js';

/**
 * Round catalog. To add a map: write a build(ctx) in a new file and list it here.
 *
 * kind:     race, or the kind of round it plays as otherwise. Playlists mix kinds.
 * stages:   where it can appear. `opener` means forgiving; `final` means it can end a match.
 * hazards:  what's dangerous here. `hammers` makes a map eligible for the hammer curse.
 * danger:   the one-line hazard preview shown at the reveal.
 * debut:    the match in which it first appears, so each match brings something new. Omitted means 0.
 */
export const LEVELS = {
  pumpkinDash: { id: 'pumpkinDash', name: 'Pumpkin Dash', build: pumpkinDash, mode: 'race', kind: 'race', stages: ['opener', 'middle'], firstMatch: true, hazards: ['hammers'], danger: 'Swinging hammers', objective: 'Race to the Finish!', quotaDefault: 12, playersDefault: 16, hint: 'Time your run under the hammers.' },
  ghostChase: { id: 'ghostChase', name: 'Ghost Chase', build: ghostChase, mode: 'race', kind: 'race', stages: ['middle'], hazards: ['ghost'], danger: 'A giant ghost on your heels', objective: 'Outrun the giant ghost!', quotaDefault: 12, playersDefault: 16, hint: 'The ghost never stops. Keep running!' },
  hauntedFloor: { id: 'hauntedFloor', name: 'Haunted Floor', build: hauntedFloor, mode: 'survive', kind: 'survive', stages: ['middle'], hazards: ['floor'], danger: 'Panels that drop away', objective: 'Stay on the floor!', quotaDefault: 6, playersDefault: 12, hint: 'Floor panels drop after you touch them. Keep moving!' },
  witchsPlatform: { id: 'witchsPlatform', name: "Witch's Platform", build: witchsPlatform, mode: 'survive', kind: 'survive', stages: ['opener', 'middle'], hazards: ['pillars'], danger: 'Sinking pillars', objective: 'Survive!', quotaDefault: 6, playersDefault: 12, hint: 'Glowing green pillars are about to sink.' },
  pumpkinRoll: { id: 'pumpkinRoll', name: 'Pumpkin Roll', build: pumpkinRoll, mode: 'race', kind: 'race', stages: ['opener', 'middle'], hazards: ['pumpkins'], danger: 'Rolling pumpkins', objective: 'Dodge the pumpkins!', quotaDefault: 9, playersDefault: 12, hint: 'Hide behind the blocks when a pumpkin rolls by.' },
  finalShowdown: { id: 'finalShowdown', name: 'Final Showdown', build: finalShowdown, mode: 'last', kind: 'last', stages: ['final'], hazards: ['beams'], danger: 'Spinning beams and falling pads', objective: 'Last one standing!', quotaDefault: 1, playersDefault: 6, hint: 'Jump the spinning beams.' },
};

/** The playable waiting area. It isn't a round, so playlists never draw it. */
export const LOBBY_LEVEL = { id: 'lobby', name: 'Castle Courtyard', build: lobby, mode: 'free', objective: 'Warm up!' };

export const LEVEL_ORDER = ['pumpkinDash', 'ghostChase', 'hauntedFloor', 'witchsPlatform', 'pumpkinRoll', 'finalShowdown'];
