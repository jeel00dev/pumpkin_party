// AI rival. A bot feeds the same Input the player does, so it obeys the same physics, falls for the
// same traps and makes its own mistakes. Skill controls reaction time and how far ahead it thinks.
import { S } from '../physics/racer.js';

const TICK = 1 / 30;
const LOOK_SAMPLES = [0.5, 1, 1.5];
/** When to leave the ground to clear a low bar, in seconds before it arrives. */
export const JUMP_LEAD_MIN = 0.25, JUMP_LEAD_MAX = 0.41;
const _g = { y: 0, collider: null };

export class Bot {
  constructor(racer, level, skill = 0.6, rand = Math.random) {
    this.r = racer;
    this.level = level;
    this.skill = skill;
    this.rand = rand;
    this.idx = 0;
    this.lateral = (rand() * 2 - 1) * 0.9;
    this.nextLateral = rand() * 3;
    this.tick = rand() * TICK;
    this.wx = 0; this.wz = 0;
    this.jumpLock = 0;
    this.diveLock = 0;
    this.wait = 0;
    this.stuck = 0; this.lastP = 0;
    this.speed = 0.88 + skill * 0.12 + (rand() - 0.5) * 0.04;
    this.mistake = 0;
    this.custom = null;
    this.memo = {};
    this.tx = racer.x; this.tz = racer.z;
    this.pace = 1;
    this.jumpQueued = false;
    this.jumpHold = 0;
    this.wantDiveFinish = rand() < 0.35;
  }

  /** Reset route tracking after a respawn. */
  onRespawn() {
    this.idx = this.nearestIndex();
    this.jumpLock = 0.2; this.diveLock = 0.5;
    this.lateral = (this.rand() * 2 - 1) * 0.6;
    this.wait = 0.05 + this.rand() * 0.3;
  }

  nearestIndex() {
    const rt = this.level.route, r = this.r;
    let best = 0, bd = Infinity;
    for (let i = 0; i < rt.length; i++) {
      const d = (rt[i].x - r.x) ** 2 + (rt[i].z - r.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    // Head for the next point, not the one we've just passed.
    return Math.min(best + 1, rt.length - 1);
  }

  update(dt, time, ctl = {}) {
    const r = this.r, inp = r.input;
    inp.jumpPressed = false; inp.divePressed = false;
    if (this.jumpHold > 0) { this.jumpHold -= dt; inp.jump = true; } else inp.jump = false;
    if (r.state === S.STUN || r.state === S.GETUP || r.state === S.DONE || r.state === S.GONE) {
      inp.mx = 0; inp.mz = 0;
      return;
    }
    if (this.jumpLock > 0) this.jumpLock -= dt;
    if (this.diveLock > 0) this.diveLock -= dt;
    if (this.mistake > 0) this.mistake -= dt;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick += TICK;
      if (this.custom) this.custom(this, time, ctl); else this.think(time, ctl);
    }
    // Input is smoothed slightly, as a thumb on a stick would be.
    const k = Math.min(1, dt * (8 + this.skill * 8));
    inp.mx += (this.wx - inp.mx) * k;
    inp.mz += (this.wz - inp.mz) * k;
    if (this.jumpQueued) { this.jumpQueued = false; inp.jumpPressed = true; inp.jump = true; this.jumpHold = 0.36; }
  }

  doJump() { if (this.jumpLock <= 0) { this.jumpQueued = true; this.jumpLock = 0.42; } }
  doDive() { if (this.diveLock <= 0) { this.r.input.divePressed = true; this.diveLock = 1; } }

  think(time, ctl) {
    const r = this.r, L = this.level, rt = L.route;
    if (!rt.length) return;
    if (this.wait > 0) { this.wait -= TICK; this.wx = this.wz = 0; return; }
    const skill = this.skill;

    // Pick a new lane now and then so the pack spreads out and mixes.
    this.nextLateral -= TICK;
    if (this.nextLateral <= 0) {
      this.lateral = (this.rand() * 2 - 1) * 0.9;
      this.nextLateral = 2 + this.rand() * 4;
    }

    let wp = rt[this.idx];
    // Advance along the route once past the waypoint's plane.
    for (let guard = 0; guard < 3 && this.idx < rt.length - 1; guard++) {
      const nx = rt[this.idx + 1];
      const dx = nx.x - wp.x, dz = nx.z - wp.z, l = Math.hypot(dx, dz) || 1;
      const along = ((r.x - wp.x) * dx + (r.z - wp.z) * dz) / l;
      if (along > 0.1) { this.idx++; wp = rt[this.idx]; } else break;
    }

    // Lane on the current section.
    let laneX = wp.x + this.lateral * (wp.w ?? 3);
    if (wp.lanes) {
      // Multiple targets at this waypoint (e.g. a pair of bounce pads): take the nearest.
      let bd = Infinity;
      for (const lx of wp.lanes) { const d = Math.abs(lx - r.x); if (d < bd) { bd = d; laneX = lx; } }
    }
    const tx = laneX, tz = wp.z;
    let dirX = tx - r.x, dirZ = tz - r.z;
    const dist = Math.hypot(dirX, dirZ) || 1;
    dirX /= dist; dirZ /= dist;

    const pace = this.speed * (ctl.pace ?? 1);
    const spd = Math.hypot(r.vx, r.vz);
    const hazardMemory = 0.35 + skill * 0.65;
    let blocked = false, steer = 0;

    // Look ahead along the path for moving obstacles, sampling several moments in the future.
    const obs = L.obstacles;
    const lookT = (0.34 + skill * 0.5) * L.world.mods.botSight;
    const stride = Math.max(spd, 3.5);
    if (this.rand() < hazardMemory) {
      const margin = 0.35 + skill * 0.65;
      search:
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        if (!o.blocks) continue;
        const dz = Math.abs(o.z - r.z);
        if (dz > 14) continue;
        for (const k of LOOK_SAMPLES) {
          const t = lookT * k;
          const px = r.x + dirX * stride * t, pz = r.z + dirZ * stride * t;
          if (o.blocks(px, pz, time + t, margin)) {
            blocked = true;
            const leftFree = !o.blocks(px - 3.4, pz, time + t, 0.6);
            const rightFree = !o.blocks(px + 3.4, pz, time + t, 0.6);
            if (rightFree && !leftFree) steer = 1;
            else if (leftFree && !rightFree) steer = -1;
            else steer = 0;
            break search;
          }
        }
      }
    }

    let mx = dirX, mz = dirZ;
    if (blocked) {
      if (steer !== 0) {
        // Dodge sideways; keep moving forward a little.
        mx = dirX * 0.5 + steer * 0.9; mz = dirZ * 0.5;
        this.lateral = Math.max(-0.95, Math.min(0.95, this.lateral + steer * 0.25));
      } else if (skill > 0.25) {
        // Nowhere safe: hang back for a moment rather than run straight in.
        mx = -dirX * 0.15; mz = -dirZ * 0.15;
      }
    }
    const l = Math.hypot(mx, mz) || 1;
    this.wx = (mx / l) * pace; this.wz = (mz / l) * pace;

    // Spin bars: clearing one takes about 0.2 s of rise, so the jump starts before the bar arrives.
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (!o.timeToReach) continue;
      if (Math.abs(o.z - r.z) > (o.len ?? 6) + 2) continue;
      const tta = o.timeToReach(r.x + r.vx * 0.12, r.z + r.vz * 0.12, time);
      if (r.grounded && tta > JUMP_LEAD_MIN && tta < JUMP_LEAD_MAX) {
        if (this.memo.barMiss === undefined) this.memo.barMiss = this.rand() > 0.5 + skill * 0.48;
        if (!this.memo.barMiss) this.doJump();
      } else if (tta > 0.8) this.memo.barMiss = undefined;
    }

    if (r.state !== S.RUN) return;
    // Ledges and gaps: jump at the edge, with timing error that shrinks with skill.
    if (r.grounded) {
      const ahead = Math.max(spd, 2.5) * (0.13 + (1 - skill) * this.rand() * 0.07);
      const fx = r.x + (spd > 0.5 ? (r.vx / spd) : dirX) * ahead, fz = r.z + (spd > 0.5 ? (r.vz / spd) : dirZ) * ahead;
      const here = L.world.groundBelow(fx, r.y + 0.3, fz, 1.1, _g);
      if (!here) this.doJump();
      else if (wp.jump && dist < 2.2 + skill) this.doJump();
      // Step up onto anything low in front.
      if (Math.abs(r.contactNormalX) + Math.abs(r.contactNormalZ) > 0.6) {
        const into = -(r.contactNormalX * dirX + r.contactNormalZ * dirZ);
        if (into > 0.5) this.doJump();
      }
    } else {
      // Airborne, about to come up short: belly-flop forward.
      if (r.vy < -1.5) {
        const look = 1.3;
        const lx = r.x + dirX * look * spd * 0.35, lz = r.z + dirZ * look * spd * 0.35;
        const under = L.world.groundBelow(r.x, r.y + 0.1, r.z, 4, _g);
        if (!under) {
          const ahead = L.world.groundBelow(lx, r.y + 0.1, lz, 3.5, _g);
          if (!ahead && this.rand() < 0.3 + skill * 0.5) this.doDive();
        }
      }
    }

    // Finish-line lunge, purely for show and personality.
    if (L.finish && this.wantDiveFinish && r.grounded && Math.abs(r.z - L.finish.z) < 3.2 && spd > 4) this.doDive();

    // Unstuck: if progress stalls, hop and try another lane.
    const p = L.progress(r);
    if (Math.abs(p - this.lastP) < 0.25) {
      this.stuck += TICK;
      if (this.stuck > 1.2) {
        this.doJump();
        this.lateral = (this.rand() * 2 - 1) * 0.9;
        this.stuck = 0;
      }
    } else this.stuck = 0;
    this.lastP = p;
  }
}

/** A cheerful, obviously made-up name for each AI rival. */
const FIRST = ['Spooky', 'Captain', 'Lil', 'Sir', 'Count', 'Madame', 'Doctor', 'Baron', 'Tiny', 'Grumpy', 'Sneaky', 'Wobbly', 'Boo', 'Creepy', 'Jolly', 'Sleepy'];
const LAST = ['Pumpkin', 'Bones', 'Boo', 'Gourd', 'Fang', 'Wisp', 'Candy', 'Mallow', 'Squash', 'Cobweb', 'Toffee', 'Bat', 'Ghoul', 'Goblin', 'Nugget', 'Muffin'];
export function botName(rand = Math.random) {
  return `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
}
