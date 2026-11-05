// Collision world. Characters are capsules; the environment is boxes, cylinders, spheres and capsules
// that may rotate and move. Contact velocities come from the collider's own motion, so a rotating disc
// or swinging hammer carries or hits characters with the correct speed.
//
// This module has no DOM or renderer dependency, so whole matches can be simulated headlessly in tests,
// and the same step can later run on a server for multiplayer.

export const BOX = 0, CYL = 1, SPHERE = 2, CAPSULE = 3;
/** Round-wide modifiers a racer reads. A curse replaces these: see src/content/curses.js. */
const DEFAULT_MODS = Object.freeze({ gravity: 1, grip: 1, body: 1, botSight: 1 });

export class Collider {
  constructor(type, opts = {}) {
    this.type = type;
    this.px = opts.x ?? 0; this.py = opts.y ?? 0; this.pz = opts.z ?? 0;
    // Rotation matrix (columns are the local axes, in world space).
    this.r00 = 1; this.r01 = 0; this.r02 = 0;
    this.r10 = 0; this.r11 = 1; this.r12 = 0;
    this.r20 = 0; this.r21 = 0; this.r22 = 1;
    this.hx = opts.hx ?? 0.5; this.hy = opts.hy ?? 0.5; this.hz = opts.hz ?? 0.5;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;
    this.kinematic = !!opts.kinematic;
    this.enabled = opts.enabled ?? true;
    this.friction = opts.friction ?? 1;
    this.conveyorX = opts.conveyorX ?? 0; this.conveyorZ = opts.conveyorZ ?? 0;
    this.bounce = opts.bounce ?? 0;       // jump pad: sets upward speed on contact
    this.bumper = opts.bumper ?? 0;       // pushes characters along the contact normal
    this.hazard = opts.hazard ?? null;    // { knock, up, stun }
    this.tag = opts.tag ?? null;
    this.user = opts.user ?? null;
    this.noClimb = !!opts.noClimb;
    this.onTouch = opts.onTouch ?? null;  // called when a character stands on it
    this.stamp = 0;
    this.radius = 0;
    this.minX = 0; this.maxX = 0; this.minY = 0; this.maxY = 0; this.minZ = 0; this.maxZ = 0;
    if (opts.qw !== undefined) this.setQuat(opts.qx, opts.qy, opts.qz, opts.qw);
    else if (opts.rx || opts.ry || opts.rz) this.setEuler(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
    this.updateBounds();
  }

  setPos(x, y, z) { this.px = x; this.py = y; this.pz = z; return this; }

  setQuat(x, y, z, w) {
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    this.r00 = 1 - 2 * (yy + zz); this.r01 = 2 * (xy - wz); this.r02 = 2 * (xz + wy);
    this.r10 = 2 * (xy + wz); this.r11 = 1 - 2 * (xx + zz); this.r12 = 2 * (yz - wx);
    this.r20 = 2 * (xz - wy); this.r21 = 2 * (yz + wx); this.r22 = 1 - 2 * (xx + yy);
    return this;
  }

  /** Euler order matches THREE's 'YXZ', the one used across the art code. */
  setEuler(rx, ry, rz) {
    const c1 = Math.cos(rx / 2), s1 = Math.sin(rx / 2), c2 = Math.cos(ry / 2), s2 = Math.sin(ry / 2), c3 = Math.cos(rz / 2), s3 = Math.sin(rz / 2);
    const x = s1 * c2 * c3 + c1 * s2 * s3;
    const y = c1 * s2 * c3 - s1 * c2 * s3;
    const z = c1 * c2 * s3 - s1 * s2 * c3;
    const w = c1 * c2 * c3 + s1 * s2 * s3;
    return this.setQuat(x, y, z, w);
  }

  /** Conservative bounds used by the broad phase. */
  updateBounds() {
    let r;
    switch (this.type) {
      case BOX: r = Math.hypot(this.hx, this.hy, this.hz); break;
      case CYL: r = Math.hypot(this.hx, this.hy); break;
      case SPHERE: r = this.hx; break;
      default: r = this.hx + this.hy;
    }
    this.radius = r;
    if (this.type === BOX) {
      const ex = Math.abs(this.r00) * this.hx + Math.abs(this.r01) * this.hy + Math.abs(this.r02) * this.hz;
      const ey = Math.abs(this.r10) * this.hx + Math.abs(this.r11) * this.hy + Math.abs(this.r12) * this.hz;
      const ez = Math.abs(this.r20) * this.hx + Math.abs(this.r21) * this.hy + Math.abs(this.r22) * this.hz;
      this.minX = this.px - ex; this.maxX = this.px + ex;
      this.minY = this.py - ey; this.maxY = this.py + ey;
      this.minZ = this.pz - ez; this.maxZ = this.pz + ez;
    } else {
      this.minX = this.px - r; this.maxX = this.px + r;
      this.minY = this.py - r; this.maxY = this.py + r;
      this.minZ = this.pz - r; this.maxZ = this.pz + r;
    }
  }

  /** True when the shape stands upright, so its top is a flat ledge. */
  get upright() { return this.r11 > 0.985 && (this.type === BOX || this.type === CYL); }

  topY() {
    if (this.type === BOX || this.type === CYL) return this.py + this.hy;
    return this.py + this.hx + (this.type === CAPSULE ? this.hy : 0);
  }
}

const out = { nx: 0, ny: 0, nz: 0, depth: 0, cx: 0, cy: 0, cz: 0 };
const q = { x: 0, y: 0, z: 0 };

/** Closest point on the shape to local point (x,y,z). Sets q; returns true when the point is inside. */
function closestLocal(c, x, y, z) {
  const hx = c.hx, hy = c.hy, hz = c.hz;
  switch (c.type) {
    case BOX: {
      q.x = x < -hx ? -hx : x > hx ? hx : x;
      q.y = y < -hy ? -hy : y > hy ? hy : y;
      q.z = z < -hz ? -hz : z > hz ? hz : z;
      return x > -hx && x < hx && y > -hy && y < hy && z > -hz && z < hz;
    }
    case CYL: {
      const d2 = x * x + z * z, inR = d2 < hx * hx, inH = y > -hy && y < hy;
      if (inR) { q.x = x; q.z = z; } else { const d = Math.sqrt(d2), k = hx / d; q.x = x * k; q.z = z * k; }
      q.y = y < -hy ? -hy : y > hy ? hy : y;
      return inR && inH;
    }
    case SPHERE: {
      const d = Math.hypot(x, y, z);
      if (d < 1e-6) { q.x = 0; q.y = hx; q.z = 0; return true; }
      const k = hx / d;
      q.x = x * k; q.y = y * k; q.z = z * k;
      return d < hx;
    }
    default: { // capsule along local Y
      const sy = y < -hy ? -hy : y > hy ? hy : y;
      const dx = x, dy = y - sy, dz = z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) { q.x = hx; q.y = sy; q.z = 0; return true; }
      const k = hx / d;
      q.x = dx * k; q.y = sy + dy * k; q.z = dz * k;
      return d < hx;
    }
  }
}

/**
 * Capsule (segment a->b, radius r) against collider. On contact fills `out` with the world-space normal
 * (pointing from collider to capsule), depth and contact point.
 */
export function capsuleVs(c, ax, ay, az, bx, by, bz, r) {
  // World -> local (R transpose).
  const adx = ax - c.px, ady = ay - c.py, adz = az - c.pz;
  const bdx = bx - c.px, bdy = by - c.py, bdz = bz - c.pz;
  const lax = c.r00 * adx + c.r10 * ady + c.r20 * adz;
  const lay = c.r01 * adx + c.r11 * ady + c.r21 * adz;
  const laz = c.r02 * adx + c.r12 * ady + c.r22 * adz;
  const lbx = c.r00 * bdx + c.r10 * bdy + c.r20 * bdz;
  const lby = c.r01 * bdx + c.r11 * bdy + c.r21 * bdz;
  const lbz = c.r02 * bdx + c.r12 * bdy + c.r22 * bdz;
  const sx = lbx - lax, sy = lby - lay, sz = lbz - laz;
  const ss = sx * sx + sy * sy + sz * sz;
  let t = 0.5, inside = false, px = 0, py = 0, pz = 0;
  for (let i = 0; i < 4; i++) {
    px = lax + sx * t; py = lay + sy * t; pz = laz + sz * t;
    inside = closestLocal(c, px, py, pz);
    if (ss < 1e-9) break;
    const nt = ((q.x - lax) * sx + (q.y - lay) * sy + (q.z - laz) * sz) / ss;
    const ct = nt < 0 ? 0 : nt > 1 ? 1 : nt;
    if (Math.abs(ct - t) < 1e-4) { t = ct; break; }
    t = ct;
  }
  px = lax + sx * t; py = lay + sy * t; pz = laz + sz * t;
  inside = closestLocal(c, px, py, pz);
  let dx = px - q.x, dy = py - q.y, dz = pz - q.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  let nx, ny, nz, depth;
  if (!inside && d2 > 1e-10) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d; nz = dz / d; depth = r - d;
  } else {
    // Segment is inside the shape: push out along the shallowest way.
    switch (c.type) {
      case BOX: {
        const ex = c.hx - Math.abs(px), ey = c.hy - Math.abs(py), ez = c.hz - Math.abs(pz);
        if (ey <= ex && ey <= ez) { nx = 0; ny = py >= 0 ? 1 : -1; nz = 0; depth = ey + r; q.x = px; q.y = ny * c.hy; q.z = pz; }
        else if (ex <= ez) { nx = px >= 0 ? 1 : -1; ny = 0; nz = 0; depth = ex + r; q.x = nx * c.hx; q.y = py; q.z = pz; }
        else { nx = 0; ny = 0; nz = pz >= 0 ? 1 : -1; depth = ez + r; q.x = px; q.y = py; q.z = nz * c.hz; }
        break;
      }
      case CYL: {
        const rad = Math.hypot(px, pz), er = c.hx - rad, ey = c.hy - Math.abs(py);
        if (ey <= er) { nx = 0; ny = py >= 0 ? 1 : -1; nz = 0; depth = ey + r; q.x = px; q.y = ny * c.hy; q.z = pz; }
        else {
          if (rad > 1e-5) { nx = px / rad; nz = pz / rad; } else { nx = 1; nz = 0; }
          ny = 0; depth = er + r; q.x = nx * c.hx; q.y = py; q.z = nz * c.hx;
        }
        break;
      }
      case SPHERE: {
        const d = Math.hypot(px, py, pz) || 1;
        nx = px / d; ny = py / d; nz = pz / d; depth = c.hx - d + r;
        q.x = nx * c.hx; q.y = ny * c.hx; q.z = nz * c.hx;
        break;
      }
      default: {
        const syy = py < -c.hy ? -c.hy : py > c.hy ? c.hy : py;
        dx = px; dy = py - syy; dz = pz;
        const d = Math.hypot(dx, dy, dz) || 1;
        nx = dx / d || 1; ny = dy / d; nz = dz / d; depth = c.hx - d + r;
        q.x = nx * c.hx; q.y = syy + ny * c.hx; q.z = nz * c.hx;
      }
    }
  }
  out.nx = c.r00 * nx + c.r01 * ny + c.r02 * nz;
  out.ny = c.r10 * nx + c.r11 * ny + c.r12 * nz;
  out.nz = c.r20 * nx + c.r21 * ny + c.r22 * nz;
  out.depth = depth;
  out.cx = c.px + c.r00 * q.x + c.r01 * q.y + c.r02 * q.z;
  out.cy = c.py + c.r10 * q.x + c.r11 * q.y + c.r12 * q.z;
  out.cz = c.pz + c.r20 * q.x + c.r21 * q.y + c.r22 * q.z;
  return out;
}

const CELL = 12;

export class World {
  constructor() {
    this.statics = [];
    this.dynamics = [];
    this.grid = new Map();
    this.stamp = 1;
    this.candidates = [];
    this.gridDirty = true;
    this.events = [];
    this.time = 0;
    this.mods = DEFAULT_MODS;
  }

  add(c) {
    if (c.kinematic) this.dynamics.push(c);
    else { c.updateBounds(); this.statics.push(c); this._insert(c); }
    return c;
  }

  remove(c) {
    const list = c.kinematic ? this.dynamics : this.statics;
    const i = list.indexOf(c);
    if (i >= 0) list.splice(i, 1);
    c.enabled = false;
    if (!c.kinematic) this.gridDirty = true;
  }

  _insert(c) {
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL), z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = x * 73856093 ^ z * 19349663;
        let cell = this.grid.get(k);
        if (!cell) { cell = []; this.grid.set(k, cell); }
        cell.push(c);
      }
    }
  }

  _rebuild() {
    this.grid.clear();
    for (const c of this.statics) this._insert(c);
    this.gridDirty = false;
  }

  /** Collect colliders whose bounds touch the given box into this.candidates; returns the count. */
  query(minX, minY, minZ, maxX, maxY, maxZ) {
    if (this.gridDirty) this._rebuild();
    const out_ = this.candidates;
    let n = 0;
    const s = ++this.stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL), z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const cell = this.grid.get(x * 73856093 ^ z * 19349663);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const c = cell[i];
          if (c.stamp === s) continue;
          c.stamp = s;
          if (!c.enabled || c.maxX < minX || c.minX > maxX || c.maxY < minY || c.minY > maxY || c.maxZ < minZ || c.minZ > maxZ) continue;
          out_[n++] = c;
        }
      }
    }
    const dyn = this.dynamics;
    for (let i = 0; i < dyn.length; i++) {
      const c = dyn[i];
      if (!c.enabled) continue;
      const r = c.radius;
      if (c.px + r < minX || c.px - r > maxX || c.py + r < minY || c.py - r > maxY || c.pz + r < minZ || c.pz - r > maxZ) continue;
      out_[n++] = c;
    }
    return n;
  }

  /**
   * Highest walkable surface below a point, or null. Used by AI ground probes and ground snapping.
   * Handles upright boxes and cylinders plus tilted boxes (ramps).
   */
  groundBelow(x, y, z, maxDrop = 50, result = null) {
    const n = this.query(x - 0.01, y - maxDrop, z - 0.01, x + 0.01, y + 0.01, z + 0.01);
    let best = -Infinity, bestC = null;
    for (let i = 0; i < n; i++) {
      const c = this.candidates[i];
      if (c.hazard && c.type !== BOX) continue;
      let top = null;
      const dx = x - c.px, dz = z - c.pz;
      if (c.type === CYL && c.upright) {
        if (dx * dx + dz * dz <= c.hx * c.hx) top = c.py + c.hy;
      } else if (c.type === BOX) {
        if (c.r11 > 0.2) {
          // Intersect the vertical line with the box's top plane (local +Y face).
          const ty = (c.hy - (c.r01 * dx + c.r21 * dz)) / c.r11;
          const lx = c.r00 * dx + c.r10 * ty + c.r20 * dz;
          const lz = c.r02 * dx + c.r12 * ty + c.r22 * dz;
          if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) top = c.py + ty;
        }
      } else if (c.type === SPHERE) {
        const r2 = c.hx * c.hx - dx * dx - dz * dz;
        if (r2 > 0) top = c.py + Math.sqrt(r2);
      }
      if (top !== null && top <= y + 0.01 && top > best) { best = top; bestC = c; }
    }
    if (best === -Infinity) return null;
    if (result) { result.y = best; result.collider = bestC; return result; }
    return best;
  }

  emit(type, racer, x, y, z, v = 0) { this.events.push({ type, racer, x, y, z, v }); }
}

/** Convenience constructors. */
export const makeBox = (x, y, z, w, h, d, o = {}) => new Collider(BOX, { x, y, z, hx: w / 2, hy: h / 2, hz: d / 2, ...o });
export const makeCyl = (x, y, z, r, h, o = {}) => new Collider(CYL, { x, y, z, hx: r, hy: h / 2, ...o });
export const makeSphere = (x, y, z, r, o = {}) => new Collider(SPHERE, { x, y, z, hx: r, ...o });
export const makeCapsule = (x, y, z, r, len, o = {}) => new Collider(CAPSULE, { x, y, z, hx: r, hy: len / 2, ...o });
