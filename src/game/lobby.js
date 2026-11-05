// The playable wait before a match: run about, emote and bump pumpkins while the AI rivals drop in.
// It runs on the real physics, but it's a waiting area, so it doesn't count as gameplay for the SDK.
import { RoundView } from './roundview.js';
import { LOBBY_LEVEL } from '../levels/index.js';

const EMOTES = ['wave', 'cheer', 'dance', 'flex'];

export class Lobby {
  constructor(match) {
    this.match = match;
    const racers = match.entrants();
    this.view = new RoundView(match.app, LOBBY_LEVEL, { seed: 1 + Math.floor(match.rand() * 90000), racers, quota: 0, difficulty: 0.5, intro: 0 });
    this.view.intro = null;
    const sim = this.view.sim;
    sim.go();
    this.queue = sim.racers.filter((r) => !r.isPlayer);
    for (const r of this.queue) { r.active = false; r.hidden = true; }
    this.arrived = 0;
  }

  /** @param {number} progress 0 to 1 through the lobby's time. Rivals arrive across most of it. */
  update(dt, progress) {
    const sim = this.view.sim, level = sim.level;
    const due = Math.min(this.queue.length, Math.ceil((progress / 0.85) * this.queue.length));
    while (this.arrived < due) {
      const r = this.queue[this.arrived++];
      const spot = level.spawns[r.spawnIndex % level.spawns.length];
      r.active = true;
      r.hidden = false;
      r.teleport(spot.x, 5 + sim.rand() * 3, spot.z, spot.yaw ?? 0);
      r.invuln = 1;
      sim.world.emit('respawn', r, r.x, spot.y ?? 0, r.z);
    }
    // Idle rivals show off now and then. Purely for looks, so this needs no seeded random.
    for (const v of this.view.views) {
      if (v.r.isPlayer) continue;
      v.emoteT = (v.emoteT ?? 0.5 + Math.random() * 2) - dt;
      if (v.emoteT <= 0) {
        v.emote = v.emote ? null : EMOTES[Math.floor(Math.random() * EMOTES.length)];
        v.emoteT = v.emote ? 1.4 : 0.8 + Math.random() * 2.5;
      }
    }
  }
}
