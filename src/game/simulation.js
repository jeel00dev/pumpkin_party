// One round of gameplay, independent of rendering: world + level + racers + bots + rules.
// Runs at a fixed 120 Hz so physics behaves identically on a 60, 144 or 240 Hz display.
import { World } from '../physics/world.js';
import { Racer, S, resolveRacerContacts } from '../physics/racer.js';
import { Bot, botName } from './bot.js';
import { modsFor } from '../content/curses.js';

export const STEP = 1 / 120;

export class Simulation {
  /**
   * @param {function} buildLevel level factory
   * @param {object} o  { tier, headless, seed, racers: [{name, skin, isPlayer, skill}], quota, difficulty, curse }
   */
  constructor(buildLevel, o = {}) {
    this.seed = o.seed ?? 1;
    let s = (this.seed * 2654435761) >>> 0 || 1;
    this.rand = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    this.world = new World();
    this.curse = o.curse ?? null;
    this.world.mods = modsFor(this.curse);
    this.level = buildLevel({ world: this.world, tier: o.tier, headless: o.headless, seed: this.seed, difficulty: o.difficulty ?? 0.5, sim: this });
    this.racers = [];
    this.bots = [];
    this.player = null;
    this.time = 0;
    this.phase = 'countdown';
    this.goTime = 0;
    this.quota = o.quota ?? 0;
    this.qualified = [];
    this.eliminated = [];
    this.ended = false;
    this.events = this.world.events;
    this.respawnQueue = [];
    this.pacing = o.pacing ?? null;  // optional director: fn(sim) -> pace multiplier per bot
    this.level.sim = this;
    this.level.applyMods(this.world.mods);

    const spawns = this.level.spawns;
    (o.racers || []).forEach((def, i) => {
      const r = new Racer(i, this.world, { isPlayer: def.isPlayer, name: def.name ?? botName(this.rand) });
      r.skin = def.skin; r.def = def;
      const sp = (def.isPlayer && this.level.playerSpawn) || spawns[i % spawns.length];
      r.teleport(sp.x, sp.y, sp.z, sp.yaw ?? Math.PI);
      r.spawnIndex = i;
      this.racers.push(r);
      if (def.isPlayer) this.player = r;
      else {
        const b = new Bot(r, this.level, def.skill ?? 0.5, this.rand);
        r.bot = b;
        this.bots.push(b);
        this.level.setupBot?.(b);
      }
    });
    if (o.autoPlayer && this.player) {
      const b = new Bot(this.player, this.level, 0.95, this.rand);
      this.player.bot = b;
      this.bots.push(b);
      this.level.setupBot?.(b);
    }
    this.level.onStart?.(this);
  }

  /** Begin the round proper (end of countdown). */
  go() { this.phase = 'play'; this.goTime = this.time; this.level.onGo?.(this); }

  get elapsed() { return this.phase === 'countdown' ? 0 : this.time - this.goTime; }

  step() {
    const dt = STEP;
    this.time += dt;
    const L = this.level;
    L.step(dt);
    if (this.phase === 'play' || this.phase === 'ended') {
      const pace = this.pacing ? this.pacing(this) : null;
      for (let i = 0; i < this.bots.length; i++) {
        const b = this.bots[i];
        if (!b.r.active || b.r.state === S.GONE) continue;
        b.update(dt, L.time, pace ? { pace: pace(b) } : undefined);
      }
    } else {
      // Nobody moves or gets hit before the starting horn.
      for (const r of this.racers) { r.input.reset(); r.invuln = Math.max(r.invuln, 0.2); }
    }
    for (let i = 0; i < this.racers.length; i++) this.racers[i].step(dt);
    resolveRacerContacts(this.racers, dt);
    if (this.phase === 'play') this.rules();
    this.handleFalls(dt);
    L.afterStep?.(this, dt);
    // Clear one-shot inputs after they've been consumed.
    const p = this.player;
    if (p && !p.bot) { p.input.jumpPressed = false; p.input.divePressed = false; }
  }

  /** Falling below the level: respawn in races, knockout in survival rounds. */
  handleFalls(dt) {
    const killY = this.level.killAt ? this.level.killAt() : this.level.killY;
    for (const r of this.racers) {
      if (!r.active || r.state === S.GONE) continue;
      if (r.respawnT > 0) {
        r.respawnT -= dt;
        if (r.respawnT <= 0) this.respawn(r);
        continue;
      }
      if (r.y < killY && r.state !== S.DONE) {
        this.world.emit('fall', r, r.x, this.level.liquidY ?? killY, r.z);
        r.falls++;
        if (this.level.mode === 'race' || this.level.mode === 'free') {
          r.respawnT = 0.75;
          r.hidden = true;
          r.vx = r.vz = 0; r.vy = 0;
          r.state = S.DONE;
          r.frozen = true;
        } else {
          this.eliminate(r, 'fell');
        }
      }
    }
  }

  respawn(r) {
    const cp = this.level.checkpointFor(r) || { x: 0, y: 1, spawnZ: 0, spread: 3 };
    r.state = S.RUN;
    r.frozen = false;
    r.hidden = false;
    const x = (cp.x ?? 0) + (this.rand() * 2 - 1) * (cp.spread ?? 3);
    r.teleport(x, (cp.y ?? 0.1) + 1.0, cp.spawnZ ?? cp.z, cp.yaw ?? Math.PI);
    r.invuln = 1.6;
    r.respawnT = 0;
    r.bot?.onRespawn();
    this.world.emit('respawn', r, r.x, r.y, r.z);
  }

  /** Mode rules: race finish line, survival quotas. */
  rules() {
    const L = this.level;
    if (L.mode === 'race' && L.finish) {
      const f = L.finish;
      for (const r of this.racers) {
        if (r.finished || !r.active || r.state === S.GONE || r.hidden) continue;
        if (this.quota > 0 && this.qualified.length >= this.quota) break;
        if (r.z <= f.z && r.y > f.y - 1 && r.x >= f.x0 && r.x <= f.x1) this.qualify(r);
      }
      if (this.quota > 0 && this.qualified.length >= this.quota) this.endRound();
      // Everyone left has finished (a chaser can eliminate racers below the quota).
      else if (!this.racers.some((r) => r.active && !r.finished && !r.eliminated)) this.endRound();
    } else if (L.mode === 'survive' || L.mode === 'last') {
      const alive = this.racers.filter((r) => r.active && !r.eliminated);
      if (alive.length <= Math.max(1, this.quota)) {
        for (const r of alive) this.qualify(r);
        this.endRound();
      }
    }
    if (L.timeLimit && this.elapsed >= L.timeLimit) this.timeUp();
  }

  timeUp() {
    if (this.level.mode === 'race') { this.settle(); return; }
    for (const r of this.racers) if (r.active && !r.eliminated) this.qualify(r);
    this.endRound();
  }

  /** Ends the round now: the racers furthest along take the spots left, as with a photo finish. */
  settle() {
    const L = this.level;
    const pending = this.racers.filter((r) => !r.finished && !r.eliminated && r.active)
      .sort((a, b) => L.progress(b) - L.progress(a) || (b.def?.skill ?? 0) - (a.def?.skill ?? 0));
    const need = Math.max(0, this.quota - this.qualified.length);
    pending.slice(0, need).forEach((r) => this.qualify(r));
    this.endRound();
  }

  qualify(r) {
    if (r.finished) return;
    r.finished = true;
    r.finishTime = this.elapsed;
    r.place = this.qualified.length + 1;
    this.qualified.push(r);
    r.state = S.DONE;
    r.invuln = 99;
    r.input.reset();
    this.world.emit('qualify', r, r.x, r.y, r.z);
  }

  eliminate(r, why = 'out') {
    if (r.eliminated || r.finished) return;
    r.eliminated = true;
    r.state = S.GONE;
    r.active = false;
    r.hidden = true;
    r.outReason = why;
    r.outTime = this.elapsed;
    this.eliminated.push(r);
    this.world.emit('eliminate', r, r.x, r.y, r.z);
  }

  endRound() {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'ended';
    this.endTime = this.time;
    // Anyone still running without a spot is out.
    for (const r of this.racers) if (!r.finished && !r.eliminated) { this.eliminate(r, 'quota'); }
    this.world.emit('roundEnd', null, 0, 0, 0);
  }

  /** Racers sorted by current standing (for HUD). */
  rankOf(r) {
    if (r.finished) return r.place;
    let rank = this.qualified.length + 1;
    const p = this.level.progress(r);
    for (const o of this.racers) if (o !== r && !o.finished && !o.eliminated && this.level.progress(o) > p) rank++;
    return rank;
  }
}
