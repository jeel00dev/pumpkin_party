// Level framework: collision and art are declared together, and art is skipped in headless simulation.
import * as THREE from 'three';
import { BOX, CAPSULE, Collider, CYL, makeBox, makeCapsule, makeCyl, makeSphere, SPHERE } from '../physics/world.js';
import { S as RS } from '../physics/racer.js';
import { THEMES } from '../render/sky.js';
import { Batch, T, TAU, box, disc, gradY, lerp, prism, rng, smooth } from '../render/geo.js';
import { reflectiveFloor, refractive, toy } from '../render/materials.js';
import { glowTexture, stitchTextures, tileTextures } from '../render/textures.js';
import { makeBoulder, makeBouncePad, makeHammer, makePatrolGhost, makeSpinBar, makeSpinDisc, addHammerFrame } from '../assets/obstacles.js';
import { Scenery, makeBalloon, makeFloatGhost } from '../assets/scenery.js';

export const ROUND_MODES = { RACE: 'race', SURVIVE: 'survive', LAST: 'last', FREE: 'free' };

export class Level {
  constructor(ctx) {
    this.ctx = ctx;
    this.world = ctx.world;
    this.tier = ctx.tier;
    this.headless = !!ctx.headless;
    this.R = rng(ctx.seed ?? 1);
    this.obstacles = [];
    this.updaters = [];
    this.route = [];
    this.spawns = [];
    this.checkpoints = [];
    this.killY = -8;
    this.mode = ROUND_MODES.RACE;
    this.reflectY = 0;
    this.theme = 'violet';
    this.mods = this.world.mods;
    this.timeLimit = 150;
    this.finish = null;
    this.title = 'Level';
    this.objective = 'Race to the Finish!';
    this.time = 0;
    this.tileBatches = new Map();
    this.animated = [];
    if (!this.headless) {
      this.s = new Scenery(this.tier);
      this.group = new THREE.Group();
      this.group.add(this.s.group);
    }
  }

  /** The sky and lighting this round uses, which a fog curse overrides. */
  get themeName() { return this.mods.fog ? 'fog' : this.theme; }

  /** Called once every obstacle exists, with the round's curse. */
  applyMods(mods) { for (const o of this.obstacles) o.speedUp?.(mods.hazardSpeed ?? 1); }

  /** Runs art code only when there's a renderer. */
  art(fn) { if (!this.headless) fn(this.s, this.group); }

  addCol(c) { return this.world.add(c); }
  addObstacle(o) { this.obstacles.push(o); return o; }

  // -----------------------------------------------------------------------------------------
  // Tile floors
  // -----------------------------------------------------------------------------------------
  /** Adds a flat tiled floor with its top at y. */
  floor({ x = 0, y = 0, z, w, d, tile = 3.6, kind = 'candy', palette = null, collide = true, base = true, thickness = 1.6, ry = 0, friction = 1, noClimb = false }) {
    if (collide) this.addCol(makeBox(x, y - thickness / 2, z, w, thickness, d, { ry, friction, noClimb }));
    this.art(() => {
      const nx = Math.max(1, Math.round(w / tile)), nz = Math.max(1, Math.round(d / tile));
      const tw = w / nx, td = d / nz;
      const pal = palette || FLOOR_PALETTES[kind] || FLOOR_PALETTES.candy;
      const matOuter = T(x, y, z, 0, ry);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const m = matOuter.clone().multiply(T((i - (nx - 1) / 2) * tw, -0.3, (j - (nz - 1) / 2) * td));
          this.pushTile(kind, tw, td, m, pal[(i * 5 + j * 3 + (this.R() * 3 | 0)) % pal.length]);
        }
      }
      if (base) {
        this.s.solid.add(box(w + 0.06, thickness, d + 0.06, 0.12, 1), { m: matOuter.clone().multiply(T(0, -thickness / 2 - 0.2, 0)), color: gradY(-thickness / 2, 0x24116a, thickness / 2, 0x341a8c), rough: 0.5, clear: 0.2 });
      }
    });
  }

  /** Sloped tiled ramp between two heights along Z. */
  ramp({ x = 0, y0, z0, y1, z1, w, tile = 3.6, kind = 'candy', palette = null, conveyor = 0, friction = 1 }) {
    const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
    const pitch = Math.atan2(dy, Math.abs(dz)) * (dz < 0 ? 1 : -1);
    const cx = x, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const thick = 1.6;
    // Box top must coincide with the ramp surface: offset along the surface normal.
    const nY = Math.cos(pitch), nZ = -Math.sin(pitch) * (dz < 0 ? -1 : -1);
    const conv = conveyor ? { conveyorZ: conveyor * Math.sign(dz) * -1 } : {};
    this.addCol(new Collider(BOX, { x: cx, y: cy - (thick / 2) * nY, z: cz - (thick / 2) * nZ, hx: w / 2, hy: thick / 2, hz: len / 2, rx: pitch, friction, ...conv }));
    this.art(() => {
      const m0 = T(cx, cy, cz, pitch, 0, 0);
      const nx = Math.max(1, Math.round(w / tile)), nz = Math.max(1, Math.round(len / tile));
      const tw = w / nx, td = len / nz;
      const pal = palette || FLOOR_PALETTES[kind] || FLOOR_PALETTES.candy;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const m = m0.clone().multiply(T((i - (nx - 1) / 2) * tw, -0.3, (j - (nz - 1) / 2) * td));
          this.pushTile(kind, tw, td, m, pal[(i * 5 + j * 3) % pal.length]);
        }
      }
      this.s.solid.add(box(w + 0.06, thick, len + 0.06, 0.12, 1), { m: m0.clone().multiply(T(0, -thick / 2 - 0.2, 0)), color: gradY(-thick / 2, 0x24116a, thick / 2, 0x341a8c), rough: 0.5, clear: 0.2 });
    });
  }

  pushTile(kind, w, d, m, color) {
    const key = `${kind}:${w.toFixed(2)}:${d.toFixed(2)}`;
    let b = this.tileBatches.get(key);
    if (!b) { b = { kind, w, d, items: [] }; this.tileBatches.set(key, b); }
    b.items.push({ m, color });
  }

  /** Solid low wall along a section's edge, so a knock costs time rather than a long fall. */
  sideWall(side, z0, z1, { halfW = 6, y = 0, h = 0.82, w = 0.95 } = {}) {
    const zc = (z0 + z1) / 2, len = Math.abs(z1 - z0), x = side * (halfW + w / 2);
    this.addCol(makeBox(x, y + h / 2 - 0.2, zc, w, h + 0.4, len, { noClimb: false }));
    this.art((s) => {
      const n = Math.max(1, Math.round(len / 6.5));
      const seg = len / n;
      for (let i = 0; i < n; i++) {
        const z = z0 + Math.sign(z1 - z0) * (i + 0.5) * seg;
        const pink = i % 2 === 0;
        s.block(x, y + h / 2 - 0.2, z, w, h + 0.4, seg - 0.14, pink ? 0xa52ce0 : 0xff9022, { r: 0.3, top: pink ? 0xc84cfa : 0xffb04a });
      }
    });
  }

  /** Bake every tile run into InstancedMeshes (one draw call per size/kind). */
  finishTiles() {
    this.art((s, group) => {
      const detail = this.tier.detail;
      const texSize = detail === 0 ? 512 : 1024;
      const candy = tileTextures(texSize);
      const stitch = stitchTextures(detail === 0 ? 256 : 512);
      const mats = {
        candy: this.tier.detail === 0 ? new THREE.MeshStandardMaterial({ map: candy.albedo, normalMap: candy.normal, roughness: 0.3, envMapIntensity: 1 }) : reflectiveFloor({ map: candy.albedo, normalMap: candy.normal, rough: 0.3, normalScale: 0.7, reflect: 0.62 }),
        stitch: this.tier.detail === 0 ? new THREE.MeshStandardMaterial({ map: stitch.albedo, normalMap: stitch.normal, roughness: 0.4 }) : reflectiveFloor({ map: stitch.albedo, normalMap: stitch.normal, rough: 0.3, normalScale: 0.9, reflect: 0.8 }),
      };
      for (const b of this.tileBatches.values()) {
        const r = 0.2;
        const geo = box(b.w - 0.07, 0.6, b.d - 0.07, r, 2);
        const mesh = new THREE.InstancedMesh(geo, mats[b.kind] || mats.candy, b.items.length);
        const c = new THREE.Color();
        b.items.forEach((it, i) => {
          mesh.setMatrixAt(i, it.m);
          mesh.setColorAt(i, c.set(it.color));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.receiveShadow = this.tier.shadow > 0;
        mesh.castShadow = false;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    });
  }

  /** Big plane of liquid beneath the course. */
  addLiquid({ y, kind = 'water', size = 2200 }) {
    this.liquidY = y;
    this.liquidKind = kind;
    this.art((s, group) => {
      const conf = LIQUIDS[kind];
      const geo = new THREE.PlaneGeometry(size, size);
      geo.rotateX(-Math.PI / 2);
      let mat;
      if (this.tier.detail === 0) {
        mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(conf.flat), fog: true });
      } else {
        mat = refractive(conf);
        const theme = THEMES[this.themeName];
        mat.uniforms.fogColor.value.set(theme.fog);
        mat.uniforms.fogDensity.value = theme.fogDensity;
        const k = theme.key.dir;
        mat.uniforms.uLightDir.value.set(k[0], k[1], k[2]).normalize();
        mat.uniforms.uSkyColor.value.set(theme.mid);
      }
      this.liquid = new THREE.Mesh(geo, mat);
      this.liquid.position.set(0, y, 0);
      this.liquid.frustumCulled = false;
      this.liquid.renderOrder = 2;
      group.add(this.liquid);
    });
  }

  // -----------------------------------------------------------------------------------------
  // Obstacles
  // -----------------------------------------------------------------------------------------
  hammer(o) { return this.addObstacle(new Hammer(this, o)); }
  spinBar(o) { return this.addObstacle(new SpinBar(this, o)); }
  spinDisc(o) { return this.addObstacle(new SpinDisc(this, o)); }
  ghost(o) { return this.addObstacle(new PatrolGhost(this, o)); }
  bouncePad(o) { return this.addObstacle(new BouncePad(this, o)); }
  boulderSpawner(o) { return this.addObstacle(new BoulderSpawner(this, o)); }
  mover(o) { return this.addObstacle(new MovingPlatform(this, o)); }
  bumpProp(o) { return this.addObstacle(new BumpProp(this, o)); }

  // -----------------------------------------------------------------------------------------
  // Runtime
  // -----------------------------------------------------------------------------------------
  /** Fixed-step: move every collider. */
  step(dt) {
    this.time += dt;
    for (let i = 0; i < this.obstacles.length; i++) this.obstacles[i].step(this.time, dt);
  }

  /** Per-frame: sync meshes to physics, animate decoration. */
  render(dt, camera) {
    for (let i = 0; i < this.obstacles.length; i++) this.obstacles[i].sync?.(this.time, dt);
    for (let i = 0; i < this.animated.length; i++) this.animated[i](this.time, dt, camera);
  }

  /** Distance along the route, used for ranking and bot pacing. */
  progress(r) {
    const route = this.route;
    if (route.length < 2) return 0;
    let best = Infinity, bestS = 0, s = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i], b = route[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
      let t = ((r.x - a.x) * dx + (r.z - a.z) * dz) / (l2 || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = (r.x - px) ** 2 + (r.z - pz) ** 2;
      if (d < best) { best = d; bestS = s + l * t; }
      s += l;
    }
    return bestS;
  }

  totalLength() {
    let s = 0;
    for (let i = 0; i < this.route.length - 1; i++) s += Math.hypot(this.route[i + 1].x - this.route[i].x, this.route[i + 1].z - this.route[i].z);
    return s;
  }

  /** Called every physics step for each racer; returns respawn/kill logic hooks. */
  afterStep() {}
  /** Which checkpoint should this racer respawn at? */
  checkpointFor(r) {
    const cps = this.checkpoints;
    if (!cps.length) return null;
    const p = this.progress(r);
    let cp = cps[0];
    for (const c of cps) if (c.s !== undefined ? p >= c.s : r.z <= c.z) cp = c;
    return cp;
  }

  // -----------------------------------------------------------------------------------------
  // Common decoration
  // -----------------------------------------------------------------------------------------
  addBalloon(x, y, z, s = 1, opts = {}) {
    this.art((_, group) => {
      const b = makeBalloon(s, this.tier, opts);
      b.position.set(x, y, z);
      group.add(b);
      const ph = this.R() * 6;
      const speed = 0.3 + this.R() * 0.2;
      this.animated.push((t) => {
        b.position.y = y + Math.sin(t * speed + ph) * 2.4;
        b.rotation.y = Math.sin(t * 0.14 + ph) * 0.22;
        b.rotation.z = Math.sin(t * 0.3 + ph) * 0.02;
      });
    });
  }

  addFloatGhost(x, y, z, s = 1) {
    this.art((_, group) => {
      const g = makeFloatGhost(s);
      g.position.set(x, y, z);
      group.add(g);
      const ph = this.R() * 6, sp = 0.5 + this.R() * 0.4;
      this.animated.push((t) => {
        g.position.y = y + Math.sin(t * sp + ph) * 1.5;
        g.position.x = x + Math.sin(t * sp * 0.4 + ph) * 3;
        g.rotation.y = Math.sin(t * 0.5 + ph) * 0.4;
        g.rotation.z = Math.sin(t * sp + ph) * 0.1;
      });
    });
  }

  /** Far hills and treelines so the horizon never reads as empty. */
  addBackdrop({ dark = 0x3a2a90, light = 0x6b4bd8, y = -8, ring = 640, center = [0, 0], treeCol = 0x241a60, seed = 9 } = {}) {
    this.art((s) => {
      const R = rng(seed);
      const hills = new Batch();
      const seg = 96, A = new THREE.Color(dark), B = new THREE.Color(light);
      const prof = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU;
        prof.push(40 + 22 * Math.sin(a * 3 + 1) + 14 * Math.sin(a * 7 + 2) + 7 * Math.sin(a * 13));
      }
      const pos = [], col = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, h = prof[i];
        const x = center[0] + Math.sin(a) * ring, z = center[1] + Math.cos(a) * ring;
        pos.push(x, y - 40, z, x, y + h, z);
        col.push(A.r, A.g, A.b, B.r, B.g, B.b);
        if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
      m.frustumCulled = false;
      m.layers.enable(1);
      this.group.add(m);
      // Silhouette trees on the ridge.
      const tree = new THREE.ConeGeometry(1, 2.8, 6);
      const tb = new Batch();
      const count = this.tier.detail === 0 ? 70 : 170;
      for (let i = 0; i < count; i++) {
        const a = R() * TAU, k = (a / TAU) * seg, h = prof[Math.floor(k)];
        const rr = ring - R.range(0, 34);
        const sc = R.range(3, 7.5);
        tb.add(tree, { m: T(center[0] + Math.sin(a) * rr, y + h + sc * 0.9, center[1] + Math.cos(a) * rr, 0, 0, 0, sc, sc * 1.2, sc), color: treeCol, rough: 1 });
      }
      const tm = new THREE.Mesh(tb.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
      tm.frustumCulled = false;
      this.group.add(tm);
      void hills; void s;
    });
  }

  /** Called once all art has been declared. */
  finishArt() {
    this.finishTiles();
    this.art((s) => s.build());
  }

  dispose() {
    if (this.headless) return;
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      if (o.material && !o.material.userData?.shared) o.material.dispose();
    });
    this.group.removeFromParent();
  }
}

export const FLOOR_PALETTES = {
  candy: [0xb04ef2, 0xb854f6, 0xa848ec, 0xbe5af8, 0xb250f0],
  blue: [0x6a78ff, 0x6a90ff, 0x7a78ff, 0x5f83f2],
  stitch: [0x8a44f0, 0x9a50f8, 0x823ee8, 0x924af4],
  magenta: [0xc24cf0, 0xcc58f6, 0xb644e4],
};

const LIQUIDS = {
  water: {
    color: 0x7a3df0, deep: 0x3a1a9c, emissive: 0x1a0844, opacity: 0.62, distort: 0.04, flow: 0.5, gloss: 1, foam: 0xcfa6ff, foamAmt: 0.1, waveScale: 0.16, flat: 0x4a2ac0,
  },
  slime: {
    color: 0x8cff2e, deep: 0x36c81a, emissive: 0x3fb80e, opacity: 0.86, distort: 0.08, flow: 0.9, gloss: 0.55, foam: 0xeaff8a, foamAmt: 0.65, waveScale: 0.28, flat: 0x6ae022,
  },
  moon: {
    color: 0x2f6be0, deep: 0x142a8a, emissive: 0x06103a, opacity: 0.55, distort: 0.05, flow: 0.4, gloss: 1.05, foam: 0x9fd0ff, foamAmt: 0.08, waveScale: 0.2, flat: 0x2348b0,
  },
};

// ---------------------------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------------------------
class Hammer {
  constructor(level, { x, z, y = 0, arm = 9, L = 4.4, R = 1.55, amp = 0.9, speed = 1.9, phase = 0, frame = false, span = null, c1, c2, star = false, end, clearance = 0.22, hazard = {} }) {
    this.x = x; this.z = z;
    this.arm = arm; this.R = R; this.L = L;
    this.pivotY = y + clearance + R + arm;
    this.amp = amp; this.speed = speed; this.phase = phase;
    // The hitbox is a touch smaller than the art, so near misses feel lucky rather than unfair.
    this.c = level.addCol(makeCapsule(x, this.pivotY - arm, z, R * 0.82, L * 0.85, {
      kinematic: true, noClimb: true, hazard: { knock: 7, up: 6.5, stun: 0.95, speedScale: 0.34, ...hazard },
    }));
    this.level = level;
    level.art((s, group) => {
      this.mesh = makeHammer({ arm, L, R, c1, c2, star, end });
      this.mesh.position.set(x, this.pivotY, z);
      group.add(this.mesh);
      if (frame) addHammerFrame(s, x, y, z, span ?? 16, this.pivotY - y + 0.05);
    });
    this.step(0, 1 / 120);
  }
  speedUp(k) { this.speed *= k; }
  angle(t) { return this.amp * Math.sin(this.speed * t + this.phase); }
  step(t) {
    const a = this.angle(t);
    const w = this.amp * this.speed * Math.cos(this.speed * t + this.phase);
    const c = this.c, sa = Math.sin(a), ca = Math.cos(a), arm = this.arm;
    c.setPos(this.x + arm * sa, this.pivotY - arm * ca, this.z);
    // Capsule axis (local Y) lies along the barrel, which points along world X at the bottom of the swing.
    const h = (a - Math.PI / 2) / 2;
    c.setQuat(0, 0, Math.sin(h), Math.cos(h));
    c.wx = 0; c.wy = 0; c.wz = w;
    c.vx = w * arm * ca; c.vy = w * arm * sa; c.vz = 0;
  }
  sync(t) { if (this.mesh) this.mesh.rotation.z = this.angle(t); }
  /** AI: would this hammer's head occupy (x,z) at future time t? */
  blocks(x, z, t, margin = 0.9) {
    if (Math.abs(z - this.z) > this.R + margin) return false;
    const a = this.angle(t);
    const hx = this.x + this.arm * Math.sin(a), hy = this.pivotY - this.arm * Math.cos(a);
    if (hy - this.R > 2.2) return false;
    return Math.abs(x - hx) < this.L / 2 + this.R + margin;
  }
  zone() { return { x: this.x, z: this.z, r: this.arm + 1 }; }
}

class SpinBar {
  constructor(level, { x, z, y = 0.85, len = 7, r = 0.42, speed = 1.3, phase = 0, arms = 2, c1, c2, hazard = {}, post = 0 }) {
    this.x = x; this.z = z; this.y = y; this.len = len; this.r = r; this.speed = speed; this.phase = phase; this.arms = arms;
    this.cols = [];
    for (let i = 0; i < arms; i++) {
      this.cols.push(level.addCol(makeCapsule(x, y, z, r, len, {
        kinematic: true, noClimb: true, hazard: { knock: 6, up: 6.2, stun: 0.85, speedScale: 0.25, minClosing: 0.3, ...hazard },
      })));
    }
    this.hub = level.addCol(makeCyl(x, y - 0.5, z, 0.8, 2.4, {}));
    level.art((s, group) => {
      this.mesh = makeSpinBar({ len, r, c1, c2, arms, post: post || Math.max(0, y - 0.2) });
      this.mesh.position.set(x, y, z);
      group.add(this.mesh);
    });
    this.step(0, 1 / 120);
  }
  step(t) {
    const a = this.speed * t + this.phase;
    for (let i = 0; i < this.arms; i++) {
      const c = this.cols[i];
      const b = a + (i / this.arms) * TAU;
      const d = this.len / 2 + 0.15;
      c.setPos(this.x + Math.cos(b) * d, this.y, this.z - Math.sin(b) * d);
      c.setEuler(0, b, Math.PI / 2);
      c.wx = 0; c.wy = this.speed; c.wz = 0;
      c.vx = -Math.sin(b) * d * this.speed; c.vy = 0; c.vz = -Math.cos(b) * d * this.speed;
    }
  }
  sync(t) { if (this.mesh) this.mesh.rotation.y = this.speed * t + this.phase; }
  /** AI: how soon will a bar reach this point? returns seconds or Infinity. */
  timeToReach(x, z, t) {
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
    if (d > this.len + 0.9) return Infinity;
    const ang = Math.atan2(-dz, dx);
    let best = Infinity;
    for (let i = 0; i < this.arms; i++) {
      const b = this.speed * t + this.phase + (i / this.arms) * TAU;
      let diff = (ang - b) % TAU;
      if (this.speed > 0) { if (diff < 0) diff += TAU; } else { if (diff > 0) diff -= TAU; diff = -diff; }
      best = Math.min(best, diff / Math.abs(this.speed));
    }
    return best;
  }
}

class SpinDisc {
  constructor(level, { x, y, z, R = 4, h = 0.8, speed = 0.8, phase = 0, c1, c2, wedges = 8, stem = true }) {
    this.x = x; this.y = y; this.z = z; this.R = R; this.speed = speed; this.phase = phase;
    this.c = level.addCol(makeCyl(x, y - h / 2, z, R, h, { kinematic: true, noClimb: false }));
    this.c.wy = speed;
    level.art((s, group) => {
      this.mesh = makeSpinDisc({ R, h, c1, c2, wedges });
      this.mesh.position.set(x, y, z);
      group.add(this.mesh);
      if (stem) s.solid.add(disc(R * 0.3, R * 0.42, 12, 0.1, 18), { m: T(x, y - 6.6, z), color: gradY(-6, 0x241468, 6, 0x5a30c0), rough: 0.4, clear: 0.6 });
    });
  }
  step(t) { this.c.setEuler(0, this.speed * t + this.phase, 0); }
  sync(t) { if (this.mesh) this.mesh.rotation.y = this.speed * t + this.phase; }
}

class MovingPlatform {
  constructor(level, { x, y, z, w = 4, d = 4, h = 0.7, dx = 0, dy = 0, dz = 0, speed = 0.8, phase = 0, color = 0x8a3ae8, rim = 0xff9022, round = false }) {
    Object.assign(this, { x, y, z, dx, dy, dz, speed, phase, h });
    this.c = level.addCol(round ? makeCyl(x, y - h / 2, z, w / 2, h, { kinematic: true }) : makeBox(x, y - h / 2, z, w, h, d, { kinematic: true }));
    level.art((s, group) => {
      const b = new Batch();
      if (round) {
        b.add(disc(w / 2, w / 2 * 0.94, h, 0.14, 40), { m: T(0, -h / 2, 0), color: gradY(-h / 2, new THREE.Color(color).multiplyScalar(0.6), h / 2, color), rough: 0.25, clear: 1 });
      } else {
        b.add(box(w, h, d, 0.16, 2), { m: T(0, -h / 2, 0), color: gradY(-h / 2, new THREE.Color(color).multiplyScalar(0.6), h / 2, color), rough: 0.25, clear: 1 });
      }
      b.add(box(w * 0.98, 0.12, d * 0.98, 0.05, 1), { m: T(0, -h - 0.02, 0), color: rim, rough: 0.3, clear: 1 });
      this.mesh = new THREE.Mesh(b.build(), toy({ key: 'world' }));
      this.mesh.castShadow = true;
      this.mesh.layers.enable(1);
      this.mesh.frustumCulled = false;
      group.add(this.mesh);
    });
    this.step(0);
  }
  off(t) { return Math.sin(this.speed * t + this.phase); }
  step(t) {
    const k = this.off(t), v = Math.cos(this.speed * t + this.phase) * this.speed;
    const c = this.c;
    c.setPos(this.x + this.dx * k, this.y - this.h / 2 + this.dy * k, this.z + this.dz * k);
    c.vx = this.dx * v; c.vy = this.dy * v; c.vz = this.dz * v;
  }
  sync(t) {
    if (!this.mesh) return;
    const k = this.off(t);
    this.mesh.position.set(this.x + this.dx * k, this.y + this.dy * k, this.z + this.dz * k);
  }
}

/** A ghost that drifts back and forth across the course and bumps racers aside. */
class PatrolGhost {
  constructor(level, { x, y = 1.5, z, dx = 5, dz = 0, speed = 1.2, phase = 0, s = 1.5, knock = 9 }) {
    Object.assign(this, { x, y, z, dx, dz, speed, phase });
    this.r = 1.05 * s;
    this.c = level.addCol(makeSphere(x, y, z, this.r, { kinematic: true, noClimb: true, hazard: { knock, up: 6, stun: 0.8, speedScale: 0.5, minClosing: 0.2 } }));
    level.art((_, group) => {
      this.mesh = makePatrolGhost(s);
      group.add(this.mesh);
    });
    this.step(0);
  }
  pos(t) { return Math.sin(this.speed * t + this.phase); }
  step(t) {
    const k = this.pos(t), v = Math.cos(this.speed * t + this.phase) * this.speed;
    const c = this.c;
    c.setPos(this.x + this.dx * k, this.y + Math.sin(t * 2.4 + this.phase) * 0.18, this.z + this.dz * k);
    c.vx = this.dx * v; c.vz = this.dz * v; c.vy = 0;
  }
  sync(t) {
    if (!this.mesh) return;
    const c = this.c;
    this.mesh.position.set(c.px, c.py, c.pz);
    const v = Math.cos(this.speed * t + this.phase) * this.speed;
    this.mesh.rotation.y = Math.atan2(this.dx * v, Math.max(1, this.dz * v + 2.4));
    this.mesh.rotation.z = -this.dx * v * 0.03;
  }
  blocks(x, z, t, margin = 1) {
    const k = this.pos(t);
    const gx = this.x + this.dx * k, gz = this.z + this.dz * k;
    return Math.hypot(x - gx, z - gz) < this.r + margin;
  }
}

class BouncePad {
  constructor(level, { x, y = 0, z, R = 2, bounce = 15, ry = 0 }) {
    this.x = x; this.y = y; this.z = z; this.R = R;
    this.c = level.addCol(makeCyl(x, y + 0.26, z, R * 0.84, 0.52, { bounce, noClimb: true }));
    this.pulse = 0;
    this.c.user = this;
    level.art((_, group) => {
      this.mesh = makeBouncePad(R);
      this.mesh.position.set(x, y, z);
      this.mesh.rotation.y = ry;
      group.add(this.mesh);
    });
  }
  step() {}
  sync(t, dt) {
    if (!this.mesh) return;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    const k = Math.sin(t * 3) * 0.015;
    this.mesh.scale.set(1 + k, 1 - k + this.pulse * 0.2, 1 + k);
  }
}

/** A loose pumpkin that racers can knock around. Harmless, and it only rolls on flat ground. */
class BumpProp {
  constructor(level, { x, z, y = 0, R = 1, boundX = 14, boundZ = 14 }) {
    Object.assign(this, { level, x, z, y, R, boundX, boundZ });
    this.hidesNearCamera = true;
    this.vx = 0; this.vz = 0;
    this.q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
    level.art((_, group) => {
      this.mesh = makeBoulder(R);
      this.mesh.position.set(x, y + R, z);
      group.add(this.mesh);
    });
  }
  step(t, dt) {
    const sim = this.level.sim;
    if (!sim) return;
    const reach = this.R + 0.5;
    for (const r of sim.racers) {
      if (!r.active || r.hidden || r.y > this.y + this.R * 2) continue;
      const dx = this.x - r.x, dz = this.z - r.z, d = Math.hypot(dx, dz);
      if (d >= reach || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      this.x += nx * (reach - d); this.z += nz * (reach - d);
      const closing = (r.vx - this.vx) * nx + (r.vz - this.vz) * nz;
      if (closing > 0.3) {
        this.vx += nx * closing * 1.3; this.vz += nz * closing * 1.3;
        if (closing > 3) this.level.world.emit('bump', r, this.x, this.y + 1, this.z, closing);
      }
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    const f = Math.max(0, 1 - 1.3 * dt);
    this.vx *= f; this.vz *= f;
    if (Math.abs(this.x) > this.boundX) { this.x = Math.sign(this.x) * this.boundX; this.vx *= -0.7; }
    if (Math.abs(this.z) > this.boundZ) { this.z = Math.sign(this.z) * this.boundZ; this.vz *= -0.7; }
  }
  sync(t, dt) {
    if (!this.mesh) return;
    this.mesh.position.set(this.x, this.y + this.R, this.z);
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.01) {
      this._v.set(this.vz / sp, 0, -this.vx / sp);
      this._dq.setFromAxisAngle(this._v, (sp * dt) / this.R);
      this.q.premultiply(this._dq);
      this.mesh.quaternion.copy(this.q);
    }
  }
}

/** Giant rolling pumpkins released from a point, falling under gravity along the level's colliders. */
class BoulderSpawner {
  constructor(level, { x, y, z, R = 2.5, interval = 3.2, delay = 0, count = 5, spreadX = 0, startVz = 3, startVx = 0, killY = null, restitution = 0.25, knock = 15, gravity = 22 }) {
    Object.assign(this, { level, x, y, z, R, interval, count, spreadX, startVz, startVx, restitution, gravity });
    this.killY = killY ?? level.killY - 8;
    this.pool = [];
    this.next = delay;
    this.rng = level.R;
    for (let i = 0; i < count; i++) {
      const c = level.addCol(makeSphere(x, -500, z, R * 0.95, {
        kinematic: true, noClimb: true, enabled: false, hazard: { knock, up: 8, stun: 1.15, speedScale: 0.45, minClosing: 0.4 },
      }));
      const b = { c, alive: false, vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, q: new THREE.Quaternion(), bounced: 0, mesh: null };
      level.art((_, group) => {
        b.mesh = makeBoulder(R);
        b.mesh.visible = false;
        b.mesh.rotation.order = 'YXZ';
        group.add(b.mesh);
      });
      this.pool.push(b);
    }
    this._v = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
  }
  step(t, dt) {
    if (t >= this.next) {
      const b = this.pool.find((p) => !p.alive);
      if (b) {
        b.alive = true;
        b.c.enabled = true;
        b.c.setPos(this.x + (this.spreadX ? (this.rng() * 2 - 1) * this.spreadX : 0), this.y, this.z);
        b.vx = this.startVx + (this.rng() - 0.5) * 1.4; b.vy = 0; b.vz = this.startVz;
        b.q.identity();
      }
      this.next = t + this.interval;
    }
    const world = this.level.world;
    for (const b of this.pool) {
      if (!b.alive) continue;
      const c = b.c;
      b.vy -= this.gravity * dt;
      let px = c.px + b.vx * dt, py = c.py + b.vy * dt, pz = c.pz + b.vz * dt;
      // Rolling contact against static geometry only (bottom of sphere).
      const statics = world.statics;
      const n = world.query(px - this.R, py - this.R, pz - this.R, px + this.R, py + this.R, pz + this.R);
      for (let i = 0; i < n; i++) {
        const o = world.candidates[i];
        if (o === c || o.kinematic || o.hazard) continue;
        const hit = sphereVs(o, px, py, pz, this.R * 0.95);
        if (!hit) continue;
        px += hit.nx * hit.depth; py += hit.ny * hit.depth; pz += hit.nz * hit.depth;
        const vn = b.vx * hit.nx + b.vy * hit.ny + b.vz * hit.nz;
        if (vn < 0) {
          b.vx -= hit.nx * vn * (1 + this.restitution);
          b.vy -= hit.ny * vn * (1 + this.restitution);
          b.vz -= hit.nz * vn * (1 + this.restitution);
          if (vn < -3 && world.emit) world.emit('thud', null, px, py - this.R, pz, -vn);
        }
      }
      void statics;
      c.setPos(px, py, pz);
      c.vx = b.vx; c.vy = b.vy; c.vz = b.vz;
      if (py < this.killY) { b.alive = false; c.enabled = false; c.setPos(this.x, -500, this.z); }
    }
  }
  sync(t, dt) {
    for (const b of this.pool) {
      if (!b.mesh) continue;
      b.mesh.visible = b.alive;
      if (!b.alive) continue;
      const c = b.c;
      b.mesh.position.set(c.px, c.py, c.pz);
      // Roll without slipping: axis perpendicular to travel.
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0.01) {
        this._v.set(b.vz / sp, 0, -b.vx / sp);
        this._dq.setFromAxisAngle(this._v, (sp * dt) / this.R);
        b.q.premultiply(this._dq);
        b.mesh.quaternion.copy(b.q);
      }
    }
  }
  /** AI: is a boulder about to pass through (x,z)? */
  blocks(x, z, t, margin = 2) {
    void t;
    for (const b of this.pool) {
      if (!b.alive) continue;
      const c = b.c;
      const look = 0.6;
      const fx = c.px + b.vx * look, fz = c.pz + b.vz * look;
      if (Math.hypot(x - fx, z - fz) < this.R + margin) return true;
    }
    return false;
  }
}

const shit = { nx: 0, ny: 0, nz: 0, depth: 0 };
/** Sphere contact against a static collider. */
export function sphereVs(c, x, y, z, r) {
  const dx = x - c.px, dy = y - c.py, dz = z - c.pz;
  const lx = c.r00 * dx + c.r10 * dy + c.r20 * dz;
  const ly = c.r01 * dx + c.r11 * dy + c.r21 * dz;
  const lz = c.r02 * dx + c.r12 * dy + c.r22 * dz;
  let qx, qy, qz, nx, ny, nz, depth;
  if (c.type === BOX) {
    qx = Math.max(-c.hx, Math.min(c.hx, lx)); qy = Math.max(-c.hy, Math.min(c.hy, ly)); qz = Math.max(-c.hz, Math.min(c.hz, lz));
  } else if (c.type === CYL) {
    const d = Math.hypot(lx, lz), k = d > c.hx ? c.hx / d : 1;
    qx = lx * k; qz = lz * k; qy = Math.max(-c.hy, Math.min(c.hy, ly));
  } else if (c.type === SPHERE) {
    const d = Math.hypot(lx, ly, lz) || 1, k = Math.min(1, c.hx / d);
    qx = lx * k; qy = ly * k; qz = lz * k;
  } else if (c.type === CAPSULE) {
    const sy = Math.max(-c.hy, Math.min(c.hy, ly));
    const d = Math.hypot(lx, ly - sy, lz) || 1, k = Math.min(1, c.hx / d);
    qx = lx * k; qy = sy + (ly - sy) * k; qz = lz * k;
  } else return null;
  const ex = lx - qx, ey = ly - qy, ez = lz - qz;
  const d2 = ex * ex + ey * ey + ez * ez;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; ny = ey / d; nz = ez / d; depth = r - d; } else { nx = 0; ny = 1; nz = 0; depth = r; }
  shit.nx = c.r00 * nx + c.r01 * ny + c.r02 * nz;
  shit.ny = c.r10 * nx + c.r11 * ny + c.r12 * nz;
  shit.nz = c.r20 * nx + c.r21 * ny + c.r22 * nz;
  shit.depth = depth;
  return shit;
}

export { makeBox, makeCyl, makeCapsule, makeSphere, BOX, CYL, RS, T, TAU, box, disc, gradY, lerp, prism, smooth, glowTexture, Batch, toy };
