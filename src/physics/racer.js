// Character controller: momentum-based running, a heavy little jump, belly-flop dives, tumbling knockdowns
// and an automatic ledge pull-up. Player and bots run the same code; only their input differs.
import { capsuleVs } from './world.js';

export const MOVE = {
  RUN_SPEED: 7.4,
  GROUND_ACCEL: 62,
  GROUND_DECEL: 48,
  AIR_ACCEL: 21,
  TURN_RATE: 13,            // rad/s the body turns toward the movement direction
  GRAVITY: 27,
  FALL_MULT: 1.22,          // heavier on the way down, so the jump doesn't feel floaty
  LOW_JUMP_MULT: 1.75,      // releasing jump early cuts the arc
  JUMP_SPEED: 10.1,
  TERMINAL: -34,
  COYOTE: 0.11,
  JUMP_BUFFER: 0.13,
  DIVE_SPEED: 10.4,
  DIVE_UP: 3.8,
  DIVE_UP_AIR: 2.4,
  DIVE_COOLDOWN: 0.75,
  SLIDE_FRICTION: 13,
  SLIDE_TIME: 0.42,
  GETUP_TIME: 0.32,
  STUN_MIN: 0.75,
  INVULN_AFTER: 0.85,
  RADIUS: 0.47,
  HEIGHT: 1.62,
  SLOPE_NY: 0.62,           // steeper contacts are treated as walls
  CLIMB_MAX: 1.28,
  CLIMB_MIN: 0.24,
  CLIMB_TIME: 0.2,
};

export const S = { RUN: 0, DIVE: 1, SLIDE: 2, STUN: 3, GETUP: 4, CLIMB: 5, DONE: 6, GONE: 7 };
export const STATE_NAME = ['run', 'dive', 'slide', 'stun', 'getup', 'climb', 'done', 'gone'];

export class Input {
  constructor() { this.reset(); }
  reset() { this.mx = 0; this.mz = 0; this.jump = false; this.jumpPressed = false; this.divePressed = false; }
}

export class Racer {
  constructor(id, world, opts = {}) {
    this.id = id;
    this.world = world;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name ?? `Racer ${id}`;
    this.x = 0; this.y = 0; this.z = 0;
    this.px = 0; this.py = 0; this.pz = 0; // previous step, for render interpolation
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = Math.PI; this.pyaw = Math.PI;
    this.state = S.RUN;
    this.grounded = false; this.wasGrounded = false;
    this.ground = null;
    this.gvx = 0; this.gvz = 0; this.gvy = 0;
    this.groundNY = 1;
    this.coyote = 0; this.jumpBuf = 0; this.jumping = false;
    this.diveCd = 0; this.timer = 0; this.invuln = 0;
    this.input = new Input();
    this.speedMod = 1;
    this.spinX = 0; this.spinY = 0; this.spinZ = 0;
    this.tq = [0, 0, 0, 1];       // tumble orientation
    this.contactNormalX = 0; this.contactNormalZ = 0; this.airTime = 0;
    this.lastFall = 0;
    this.climbFromY = 0; this.climbToY = 0; this.climbFromX = 0; this.climbFromZ = 0; this.climbToX = 0; this.climbToZ = 0;
    this.active = true;
    this.eliminated = false;
    this.finished = false;
    this.finishTime = 0;
    this.pushX = 0; this.pushZ = 0;
    this.stunStrength = 0;
    this.sinceHit = 99;
    this.falls = 0; this.hits = 0;
    const m = world.mods;
    this.gravity = MOVE.GRAVITY * m.gravity;
    this.grip = m.grip;
    this.radius = MOVE.RADIUS * m.body;
    this.height = MOVE.HEIGHT * m.body;
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.x = this.px = x; this.y = this.py = y; this.z = this.pz = z;
    this.vx = this.vy = this.vz = 0;
    this.yaw = this.pyaw = yaw;
    this.state = S.RUN; this.grounded = false; this.ground = null;
    this.gvx = this.gvy = this.gvz = 0;
    this.timer = 0; this.coyote = 0; this.jumping = false;
    this.tq[0] = this.tq[1] = this.tq[2] = 0; this.tq[3] = 1;
  }

  /** Knock the character down. */
  stun(dirX, dirY, dirZ, duration = 1, source = null) {
    if (this.invuln > 0 || this.state === S.DONE || this.state === S.GONE) return false;
    this.vx = dirX; this.vy = dirY; this.vz = dirZ;
    this.state = S.STUN;
    this.timer = Math.max(MOVE.STUN_MIN, duration);
    this.grounded = false; this.ground = null;
    this.jumping = false;
    this.invuln = this.timer + MOVE.INVULN_AFTER;
    const h = Math.hypot(dirX, dirZ) || 1;
    // Tumble about the axis perpendicular to the blow.
    const amt = 7 + Math.hypot(dirX, dirY, dirZ) * 0.65;
    this.spinX = (dirZ / h) * amt; this.spinZ = (-dirX / h) * amt; this.spinY = (Math.random() - 0.5) * 3;
    this.hits++;
    this.sinceHit = 0;
    this.world.emit('hit', this, this.x, this.y + 1, this.z, Math.hypot(dirX, dirY, dirZ));
    void source;
    return true;
  }

  /** One fixed physics step. */
  step(dt) {
    if (!this.active) return;
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.diveCd > 0) this.diveCd -= dt;
    this.sinceHit += dt;

    switch (this.state) {
      case S.RUN: this.stepRun(dt); break;
      case S.DIVE: this.stepDive(dt); break;
      case S.SLIDE: this.stepSlide(dt); break;
      case S.STUN: this.stepStun(dt); break;
      case S.GETUP: this.stepGetup(dt); break;
      case S.CLIMB: this.stepClimb(dt); return; // no collision while pulling up
      case S.DONE: this.stepDone(dt); break;
      default: return;
    }
    this.integrate(dt);
  }

  stepRun(dt) {
    const inp = this.input;
    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wish = Math.min(ml, 1);
    const baseX = this.grounded ? this.gvx : 0, baseZ = this.grounded ? this.gvz : 0;
    // Relative to whatever the character stands on.
    let rx = this.vx - baseX, rz = this.vz - baseZ;
    const maxSp = MOVE.RUN_SPEED * this.speedMod;
    const tx = mx * maxSp, tz = mz * maxSp;
    const frictionMul = this.grounded && this.ground ? this.ground.friction * this.grip : 1;
    let accel;
    if (this.grounded) accel = (wish > 0.05 ? MOVE.GROUND_ACCEL : MOVE.GROUND_DECEL) * frictionMul;
    else accel = MOVE.AIR_ACCEL;
    // Sharp turns cost momentum: the signature clumsy lean into corners.
    if (this.grounded && wish > 0.1) {
      const sp = Math.hypot(rx, rz);
      if (sp > 2) {
        const dot = (rx * mx + rz * mz) / (sp * (wish || 1));
        if (dot < 0.2) accel *= 1.15;
      }
    }
    let dx = tx - rx, dz = tz - rz;
    const dl = Math.hypot(dx, dz), ma = accel * dt;
    if (dl > ma) { dx *= ma / dl; dz *= ma / dl; }
    // In the air, never let control bleed a fast launch down to run speed.
    if (!this.grounded) {
      const sp = Math.hypot(rx, rz);
      if (sp > maxSp && wish > 0.05) {
        const nx = rx + dx, nz = rz + dz, ns = Math.hypot(nx, nz);
        if (ns < sp) { dx = nx * (sp - 0.04) / ns - rx; dz = nz * (sp - 0.04) / ns - rz; }
      }
    }
    rx += dx; rz += dz;
    this.vx = baseX + rx; this.vz = baseZ + rz;

    if (wish > 0.08) {
      const target = Math.atan2(mx, mz);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = MOVE.TURN_RATE * dt * (this.grounded ? 1 : 0.6);
      this.yaw += Math.abs(d) < turn ? d : Math.sign(d) * turn;
    }

    // Jumping, with coyote time and input buffering.
    if (this.grounded) this.coyote = MOVE.COYOTE; else if (this.coyote > 0) this.coyote -= dt;
    if (inp.jumpPressed) this.jumpBuf = MOVE.JUMP_BUFFER; else if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.jumpBuf = 0; this.coyote = 0;
      this.vy = MOVE.JUMP_SPEED + Math.max(0, this.gvy) * 0.6;
      this.grounded = false; this.ground = null;
      this.jumping = true;
      this.world.emit('jump', this, this.x, this.y, this.z);
    }
    if (inp.divePressed && this.diveCd <= 0) this.startDive();

    // Gravity with short-hop and fall tuning.
    let g = this.gravity;
    if (this.vy < 0) { g *= MOVE.FALL_MULT; this.jumping = false; }
    else if (this.jumping && !inp.jump) g *= MOVE.LOW_JUMP_MULT;
    this.vy -= g * dt;
    if (this.vy < MOVE.TERMINAL) this.vy = MOVE.TERMINAL;
  }

  startDive() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cur = this.vx * fx + this.vz * fz;
    const sp = Math.max(cur, MOVE.DIVE_SPEED);
    const inp = this.input;
    let dx = fx, dz = fz;
    const ml = Math.hypot(inp.mx, inp.mz);
    if (ml > 0.2) { dx = inp.mx / ml; dz = inp.mz / ml; this.yaw = Math.atan2(dx, dz); }
    this.vx = dx * sp; this.vz = dz * sp;
    this.vy = this.grounded ? MOVE.DIVE_UP : Math.max(this.vy, 0) * 0.3 + MOVE.DIVE_UP_AIR;
    this.state = S.DIVE;
    this.grounded = false; this.ground = null;
    this.diveCd = MOVE.DIVE_COOLDOWN;
    this.jumpBuf = 0; this.coyote = 0;
    this.world.emit('dive', this, this.x, this.y, this.z);
  }

  stepDive(dt) {
    this.vy -= this.gravity * dt;
    if (this.vy < MOVE.TERMINAL) this.vy = MOVE.TERMINAL;
    if (this.grounded) {
      this.state = S.SLIDE;
      this.timer = MOVE.SLIDE_TIME;
      this.world.emit('slide', this, this.x, this.y, this.z);
    }
  }

  stepSlide(dt) {
    this.timer -= dt;
    const rx = this.vx - this.gvx, rz = this.vz - this.gvz;
    const sp = Math.hypot(rx, rz);
    if (sp > 0.01) {
      const ns = Math.max(0, sp - MOVE.SLIDE_FRICTION * dt);
      this.vx = this.gvx + (rx / sp) * ns; this.vz = this.gvz + (rz / sp) * ns;
    }
    this.vy -= this.gravity * dt;
    if (this.timer <= 0) { this.state = S.GETUP; this.timer = MOVE.GETUP_TIME * 0.5; }
  }

  stepStun(dt) {
    this.timer -= dt;
    this.vy -= this.gravity * dt;
    if (this.vy < MOVE.TERMINAL) this.vy = MOVE.TERMINAL;
    if (this.grounded) {
      const f = Math.max(0, 1 - 4.5 * dt);
      this.vx = this.gvx + (this.vx - this.gvx) * f; this.vz = this.gvz + (this.vz - this.gvz) * f;
      this.spinX *= f; this.spinY *= f; this.spinZ *= f;
    }
    this.integrateTumble(dt);
    if (this.timer <= 0 && (this.grounded || this.timer < -1.3)) {
      this.state = S.GETUP;
      this.timer = MOVE.GETUP_TIME;
      this.world.emit('getup', this, this.x, this.y, this.z);
    }
  }

  integrateTumble(dt) {
    const q = this.tq;
    const wx = this.spinX, wy = this.spinY, wz = this.spinZ;
    const x = q[0], y = q[1], z = q[2], w = q[3], h = dt * 0.5;
    q[0] = x + h * (wx * w + wy * z - wz * y);
    q[1] = y + h * (wy * w + wz * x - wx * z);
    q[2] = z + h * (wz * w + wx * y - wy * x);
    q[3] = w + h * (-wx * x - wy * y - wz * z);
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
    // Settle flat when on the ground: ease toward face-down so the get-up looks right.
    if (this.grounded && Math.hypot(wx, wz) < 2) {
      const k = Math.min(1, 6 * dt);
      const yq = this.yaw;
      void yq;
      const tx = Math.SQRT1_2, tw = Math.SQRT1_2;
      q[0] += (tx - q[0]) * k; q[1] += (0 - q[1]) * k; q[2] += (0 - q[2]) * k; q[3] += (tw - q[3]) * k;
      const m = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      q[0] /= m; q[1] /= m; q[2] /= m; q[3] /= m;
    }
  }

  stepGetup(dt) {
    this.timer -= dt;
    const f = Math.max(0, 1 - 14 * dt);
    this.vx = this.gvx + (this.vx - this.gvx) * f; this.vz = this.gvz + (this.vz - this.gvz) * f;
    this.vy -= this.gravity * dt;
    if (this.timer <= 0) { this.state = S.RUN; this.coyote = 0; this.tq[0] = this.tq[1] = this.tq[2] = 0; this.tq[3] = 1; }
  }

  stepClimb(dt) {
    this.timer -= dt;
    const t = 1 - Math.max(0, this.timer) / MOVE.CLIMB_TIME;
    const e = t * t * (3 - 2 * t);
    this.y = this.climbFromY + (this.climbToY - this.climbFromY) * Math.min(1, e * 1.4);
    this.x = this.climbFromX + (this.climbToX - this.climbFromX) * e;
    this.z = this.climbFromZ + (this.climbToZ - this.climbFromZ) * e;
    this.vx = this.vy = this.vz = 0;
    if (this.timer <= 0) { this.state = S.RUN; this.vy = 0; this.vx = (this.climbToX - this.climbFromX) * 8; this.vz = (this.climbToZ - this.climbFromZ) * 8; }
  }

  stepDone(dt) {
    this.vy -= this.gravity * dt;
    const f = Math.max(0, 1 - 6 * dt);
    this.vx *= f; this.vz *= f;
  }

  integrate(dt) {
    const world = this.world;
    const r = this.radius, H = this.height;
    this.wasGrounded = this.grounded;
    const fallSpeed = -this.vy;
    this.x += (this.vx + this.pushX) * dt; this.y += this.vy * dt; this.z += (this.vz + this.pushZ) * dt;
    this.pushX = 0; this.pushZ = 0;

    let grounded = false, ground = null, gNY = 0;
    let wallX = 0, wallZ = 0, walled = false;
    const pad = 0.15;
    const n = world.query(this.x - r - pad, this.y - pad, this.z - r - pad, this.x + r + pad, this.y + H + pad, this.z + r + pad);
    // Copy, since a hazard callback may run queries of its own.
    const list = world.candidates;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (let i = 0; i < n; i++) {
        const c = list[i];
        const hit = capsuleVs(c, this.x, this.y + r, this.z, this.x, this.y + H - r, this.z, r);
        if (!hit) continue;
        const nx = hit.nx, ny = hit.ny, nz = hit.nz, depth = hit.depth;
        const cx = hit.cx, cy = hit.cy, cz = hit.cz;
        any = true;
        // Surface velocity at the contact.
        let sx = c.vx, sy = c.vy, sz = c.vz;
        if (c.kinematic) {
          const ox = cx - c.px, oy = cy - c.py, oz = cz - c.pz;
          sx += c.wy * oz - c.wz * oy;
          sy += c.wz * ox - c.wx * oz;
          sz += c.wx * oy - c.wy * ox;
        }
        if (c.hazard && this.invuln <= 0 && this.state !== S.DONE) {
          const hz = c.hazard;
          // Hazards only count if they are moving into the character or it runs into them hard.
          const closing = (sx - this.vx) * nx + (sy - this.vy) * ny + (sz - this.vz) * nz;
          if (closing > (hz.minClosing ?? 0.5)) {
            let hx = nx, hz2 = nz;
            const hl = Math.hypot(hx, hz2);
            if (hl > 0.01) { hx /= hl; hz2 /= hl; } else { hx = Math.sin(this.yaw + Math.PI); hz2 = Math.cos(this.yaw + Math.PI); }
            const sp = Math.hypot(sx, sz);
            const k = (hz.knock ?? 12) + sp * (hz.speedScale ?? 0.55);
            // Bias the blow toward the obstacle's direction of travel.
            const bx = sp > 0.2 ? sx / sp : hx, bz = sp > 0.2 ? sz / sp : hz2;
            const dx = hx * 0.55 + bx * 0.45, dz = hz2 * 0.55 + bz * 0.45;
            const dl = Math.hypot(dx, dz) || 1;
            this.x += nx * depth; this.y += Math.max(0, ny) * depth; this.z += nz * depth;
            if (this.stun((dx / dl) * k, hz.up ?? 7, (dz / dl) * k, hz.stun ?? 1.05, c)) {
              if (c.user && c.user.onHit) c.user.onHit(this);
              continue;
            }
          }
        }
        // Positional correction.
        this.x += nx * depth; this.y += ny * depth; this.z += nz * depth;
        // Velocity: remove the part going into the surface, relative to the surface.
        const rvx = this.vx - sx, rvy = this.vy - sy, rvz = this.vz - sz;
        const vn = rvx * nx + rvy * ny + rvz * nz;
        const walkable = ny >= MOVE.SLOPE_NY;
        if (vn < 0) {
          let rest = 0;
          if (this.state === S.STUN) rest = walkable ? 0.3 : 0.5;
          if (c.bumper > 0) {
            this.vx = sx + nx * c.bumper; this.vz = sz + nz * c.bumper; this.vy = Math.max(this.vy, 3.5);
            world.emit('bump', this, cx, cy, cz, c.bumper);
          } else {
            this.vx -= nx * vn * (1 + rest); this.vy -= ny * vn * (1 + rest); this.vz -= nz * vn * (1 + rest);
          }
        }
        if (walkable) {
          grounded = true;
          if (ny > gNY) {
            gNY = ny; ground = c;
            this.gvx = sx + c.conveyorX; this.gvy = sy; this.gvz = sz + c.conveyorZ;
          }
          if (c.bounce > 0 && this.state !== S.STUN) {
            this.vy = c.bounce;
            grounded = false; ground = null;
            this.jumping = false;
            world.emit('bounce', this, this.x, this.y, this.z, c.bounce);
          }
        } else if (ny < -0.5) {
          // Bonked head.
          if (this.vy > 0) this.vy = 0;
        } else if (Math.abs(ny) < 0.5) {
          walled = true; wallX = nx; wallZ = nz;
          // Ledge pull-up: air-borne, pushing into an upright block with its top within reach.
          if (this.state === S.RUN && !grounded && !this.wasGrounded && c.upright && !c.noClimb && !c.hazard) {
            const top = c.topY();
            const rise = top - this.y;
            const inp = this.input;
            const pushing = -(inp.mx * nx + inp.mz * nz);
            if (rise > MOVE.CLIMB_MIN && rise < MOVE.CLIMB_MAX && pushing > 0.35 && this.vy < 4.5) {
              this.state = S.CLIMB;
              this.timer = MOVE.CLIMB_TIME;
              this.climbFromX = this.x; this.climbFromY = this.y; this.climbFromZ = this.z;
              this.climbToY = top + 0.04;
              this.climbToX = this.x - nx * (r + 0.32); this.climbToZ = this.z - nz * (r + 0.32);
              this.vx = this.vy = this.vz = 0;
              world.emit('climb', this, this.x, this.y, this.z);
              this.grounded = false;
              return;
            }
          }
        }
        if (c.onTouch && walkable) c.onTouch(this);
      }
      if (!any) break;
    }

    // Snap down to the floor so running over seams and down ramps doesn't launch the character.
    if (!grounded && this.wasGrounded && this.vy <= 0.5 && this.state === S.RUN && !this.jumping) {
      const res = _ground;
      const g = world.groundBelow(this.x, this.y + 0.02, this.z, 0.32, res);
      if (g) {
        this.y = res.y;
        this.vy = 0;
        grounded = true;
        ground = res.collider;
        this.gvx = ground.vx + ground.conveyorX; this.gvy = ground.vy; this.gvz = ground.vz + ground.conveyorZ;
        if (ground.kinematic) {
          const ox = this.x - ground.px, oz = this.z - ground.pz;
          this.gvx += ground.wy * oz; this.gvz -= ground.wy * ox;
        }
      }
    }
    if (!grounded) {
      this.gvx *= 0.9; this.gvz *= 0.9; this.gvy = 0;
      this.airTime += dt;
    } else {
      if (this.state === S.RUN && !this.wasGrounded && this.airTime > 0.08) {
        world.emit('land', this, this.x, this.y, this.z, fallSpeed);
      }
      this.airTime = 0;
    }
    this.grounded = grounded;
    this.ground = ground;
    this.groundNY = gNY || 1;
    if (walled) { this.contactNormalX = wallX; this.contactNormalZ = wallZ; } else { this.contactNormalX = 0; this.contactNormalZ = 0; }
  }

  /** Which animation should play right now. */
  animMode() {
    switch (this.state) {
      case S.DIVE: return 'dive';
      case S.SLIDE: return 'slide';
      case S.STUN: return 'stun';
      case S.GETUP: return 'getup';
      case S.CLIMB: return 'climb';
      case S.DONE: return 'win';
      default:
    }
    if (!this.grounded && this.airTime > 0.06) return 'air';
    const sp = Math.hypot(this.vx - this.gvx, this.vz - this.gvz);
    return sp > 0.6 ? 'run' : 'idle';
  }
}

const _ground = { y: 0, collider: null };

/** Soft body contact between characters, plus the fun part: a dive that connects knocks people over. */
export function resolveRacerContacts(racers, dt) {
  const R = racers.length ? 0.56 * (racers[0].radius / MOVE.RADIUS) : 0.56, RR = R * 2;
  for (let i = 0; i < racers.length; i++) {
    const a = racers[i];
    if (!a.active || a.state === S.GONE || a.state === S.DONE) continue;
    for (let j = i + 1; j < racers.length; j++) {
      const b = racers[j];
      if (!b.active || b.state === S.GONE || b.state === S.DONE) continue;
      const dy = a.y - b.y;
      if (dy > 1.5 || dy < -1.5) continue;
      const dx = a.x - b.x, dz = a.z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RR * RR || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (RR - d) * 0.5;
      a.x += nx * push * 0.5; a.z += nz * push * 0.5;
      b.x -= nx * push * 0.5; b.z -= nz * push * 0.5;
      // Exchange a share of the closing speed so crowds shove each other.
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel < 0) {
        const imp = -rel * 0.45;
        a.vx += nx * imp; a.vz += nz * imp;
        b.vx -= nx * imp; b.vz -= nz * imp;
        a.world.emit('shove', a, (a.x + b.x) / 2, a.y + 1, (a.z + b.z) / 2, imp);
      }
      const aDive = a.state === S.DIVE, bDive = b.state === S.DIVE;
      if (aDive !== bDive) {
        const diver = aDive ? a : b, target = aDive ? b : a;
        if (target.state === S.RUN && Math.hypot(diver.vx, diver.vz) > 7) {
          const k = 8;
          const tx = aDive ? -nx : nx, tz = aDive ? -nz : nz;
          target.stun(tx * k, 5, tz * k, 0.8, diver);
          diver.vx *= 0.5; diver.vz *= 0.5;
        }
      }
    }
  }
  void dt;
}
