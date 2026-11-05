// Round: Haunted Floor. A graveyard's stitched floors peel away beneath your feet, across three storeys.
// Every step costs a panel, so survival means reading the crowd and keeping moving.
import * as THREE from 'three';
import { Level, ROUND_MODES, T, gradY } from './base.js';
import { makeBox } from '../physics/world.js';
import { S } from '../physics/racer.js';
import { box, rng } from '../render/geo.js';
import { reflectiveFloor } from '../render/materials.js';
import { stitchTextures } from '../render/textures.js';
import { buildCastle } from '../assets/castle.js';

const LAYERS = [0, -9, -18];
const SIZE = 13, TILE = 3.2;

class TileField {
  constructor(L, { layers = LAYERS, size = SIZE, tile = TILE, delay = 1.2, fallSpeed = 24, palette }) {
    Object.assign(this, { L, layers, size, tile, delay, fallSpeed, palette });
    this.tiles = [];
    this.triggered = 0;
    const half = ((size - 1) * tile) / 2;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    layers.forEach((y, ly) => {
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const x = i * tile - half, z = j * tile - half;
          const col = makeBox(x, y - 0.4, z, tile - 0.05, 0.8, tile - 0.05, { noClimb: true });
          const t = { i, j, ly, x, y, z, col, state: 0, timer: 0, ry: 0, vy: 0, dy: 0, idx: this.tiles.length, rnd: L.R() };
          // Only the panel under the character's centre counts, so brushing a neighbour costs nothing.
          col.onTouch = (r) => {
            if (t.state !== 0 || L.sim?.phase !== 'play') return;
            if (Math.abs(r.x - x) <= tile / 2 && Math.abs(r.z - z) <= tile / 2) this.trigger(t);
          };
          col.user = t;
          L.addCol(col);
          this.tiles.push(t);
        }
      }
    });
    this.byKey = new Map(this.tiles.map((t) => [`${t.ly}:${t.i}:${t.j}`, t]));
    L.art((_, group) => {
      const stitch = stitchTextures(L.tier.detail === 0 ? 256 : 512);
      const mat = L.tier.detail === 0
        ? new THREE.MeshStandardMaterial({ map: stitch.albedo, normalMap: stitch.normal, roughness: 0.36 })
        : reflectiveFloor({ map: stitch.albedo, normalMap: stitch.normal, rough: 0.32, normalScale: 1, reflect: 0.45 });
      const geo = box(tile - 0.08, 0.8, tile - 0.08, 0.17, 3);
      this.mesh = new THREE.InstancedMesh(geo, mat, this.tiles.length);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (const t of this.tiles) {
        dummy.position.set(t.x, t.y - 0.4, t.z);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(t.idx, dummy.matrix);
        c.set(palette[ly2(t)][(t.i * 3 + t.j * 5) % palette[ly2(t)].length]);
        this.mesh.setColorAt(t.idx, c);
      }
      this.mesh.receiveShadow = L.tier.shadow > 0;
      this.mesh.frustumCulled = false;
      group.add(this.mesh);
    });
    this.dirty = new Set();
    this.dummy = dummy;
    function ly2(t) { return t.ly % palette.length; }
  }

  trigger(t) {
    t.state = 1; t.timer = this.delay;
    this.triggered++;
    this.dirty.add(t);
    this.L.world.emit('tileWarn', null, t.x, t.y, t.z);
  }

  /** Called every physics step. */
  step(time, dt) {
    for (const t of this.dirty) {
      if (t.state === 1) {
        t.timer -= dt;
        if (t.timer <= 0) {
          t.state = 2;
          t.col.enabled = false;
          t.vy = 0;
          this.L.world.emit('tileFall', null, t.x, t.y, t.z);
        }
      } else if (t.state === 2) {
        t.vy += 40 * dt;
        t.dy += t.vy * dt;
        if (t.dy > 40) { t.state = 3; this.dirty.delete(t); this.finalize(t); }
      }
    }
  }

  finalize(t) {
    if (!this.mesh) return;
    this.dummy.position.set(0, -500, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(t.idx, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  sync(time) {
    if (!this.mesh || !this.dirty.size) return;
    const d = this.dummy;
    for (const t of this.dirty) {
      if (t.state === 1) {
        // Shake with a growing amplitude: the warning players read at a glance.
        const k = 1 - t.timer / this.delay;
        const a = 0.03 + k * 0.08;
        d.position.set(t.x + Math.sin(time * 61 + t.rnd * 9) * a, t.y - 0.4 - k * 0.1 + Math.sin(time * 47) * a * 0.6, t.z + Math.cos(time * 53 + t.rnd * 5) * a);
        d.rotation.set(Math.sin(time * 40) * a * 0.3, 0, Math.cos(time * 37) * a * 0.3);
      } else if (t.state === 2) {
        d.position.set(t.x, t.y - 0.4 - t.dy, t.z);
        d.rotation.set(t.dy * 0.06 * (t.rnd - 0.5), 0, t.dy * 0.06 * (0.5 - t.rnd));
      } else continue;
      d.updateMatrix();
      this.mesh.setMatrixAt(t.idx, d.matrix);
      this.mesh.setColorAt(t.idx, t.state === 1 ? _warn.setHSL(0.075 + (t.timer % 0.12) * 0.25, 1, 0.56) : _warn.set(0x6a33c8));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  tileAt(x, z, ly) {
    const half = ((this.size - 1) * this.tile) / 2;
    const i = Math.round((x + half) / this.tile), j = Math.round((z + half) / this.tile);
    return this.byKey.get(`${ly}:${i}:${j}`) || null;
  }

  layerOf(y) {
    let best = 0, d = Infinity;
    this.layers.forEach((ly, k) => { const q = Math.abs(y - ly); if (q < d && y > ly - 2) { d = q; best = k; } });
    return best;
  }
}
const _warn = new THREE.Color();

/** Survival brain: keep moving onto tiles with the most intact neighbours, away from others. */
function brain(field) {
  return function (bot) {
    const r = bot.r, skill = bot.skill;
    if (r.state !== S.RUN) return;
    const ly = field.layerOf(r.y);
    const here = field.tileAt(r.x, r.z, ly);
    const m = bot.memo;
    // Standing still costs no panels, so sensible players wait until theirs starts to go.
    const patience = 0.34 + (1 - skill) * 0.16;
    if (here && r.grounded && (here.state === 0 || (here.state === 1 && here.timer > patience))) {
      if (here.state === 0 && Math.hypot(here.x - r.x, here.z - r.z) > 0.8) {
        const dx = here.x - r.x, dz = here.z - r.z, d = Math.hypot(dx, dz);
        bot.wx = (dx / d) * 0.6; bot.wz = (dz / d) * 0.6;
      } else { bot.wx = 0; bot.wz = 0; }
      m.target = null;
      // A little restlessness keeps the crowd from looking frozen.
      if (bot.rand() > 0.008) return;
    }
    m.timer = (m.timer ?? 0) - 1 / 30;
    const stale = !m.target || m.target.state !== 0 || m.target.ly !== ly;
    if (stale || m.timer <= 0) {
      m.timer = 0.28 + (1 - skill) * 0.34 + bot.rand() * 0.15;
      let best = null, bs = -Infinity;
      const rad = 2;
      const off = ((field.size - 1) * field.tile) / 2;
      const ci = here ? here.i : Math.round((r.x + off) / field.tile);
      const cj = here ? here.j : Math.round((r.z + off) / field.tile);
      for (let di = -rad; di <= rad; di++) {
        for (let dj = -rad; dj <= rad; dj++) {
          if (!di && !dj) continue;
          const t = field.byKey.get(`${ly}:${ci + di}:${cj + dj}`);
          if (!t || t.state !== 0) continue;
          let free = 0;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const q = field.byKey.get(`${ly}:${t.i + a}:${t.j + b}`); if (q && q.state === 0) free++; }
          let crowd = 0;
          const sim = field.L.sim;
          for (const o of sim.racers) if (o !== r && o.active && Math.hypot(o.x - t.x, o.z - t.z) < 2.6) crowd++;
          const dist = Math.hypot(di, dj);
          const toCentre = Math.hypot(t.x, t.z) * 0.012;
          const s = free * (0.2 + skill * 0.5) - crowd * 0.5 - dist * 0.42 - toCentre + bot.rand() * (1.3 - skill);
          if (s > bs) { bs = s; best = t; }
        }
      }
      m.target = best;
    }
    const t = m.target;
    if (!t) { bot.wx = -r.x * 0.02; bot.wz = -r.z * 0.02; return; }
    const dx = t.x - r.x, dz = t.z - r.z, d = Math.hypot(dx, dz) || 1;
    const sp = 0.75 + skill * 0.25;
    bot.wx = (dx / d) * sp; bot.wz = (dz / d) * sp;
    // A missing tile straight ahead means a hop.
    if (r.grounded) {
      const ahead = field.L.world.groundBelow(r.x + (dx / d) * 1.1, r.y + 0.3, r.z + (dz / d) * 1.1, 1.2, { y: 0, collider: null });
      if (!ahead && d < 7.5) bot.doJump();
    }
  };
}

export function build(ctx) {
  const L = new Level(ctx);
  L.title = 'Haunted Floor';
  L.objective = 'Stay on the floor!';
  L.mode = ROUND_MODES.SURVIVE;
  L.theme = 'moonlit';
  L.reflectY = 0;
  L.killY = LAYERS[2] - 5;
  L.timeLimit = 90;
  L.addLiquid({ y: LAYERS[2] - 4, kind: 'moon' });

  const palette = [[0x8a44f0, 0x9a50f8, 0x823ee8], [0x6a50f0, 0x7a58f8, 0x6248e8], [0x44a0d8, 0x4eaae2, 0x3c98ce]];
  L.field = L.addObstacle(new TileField(L, { palette }));
  // Solid edges: losing a panel should drop you a storey, not throw you off the side of the building.
  const half = (SIZE * TILE) / 2;
  for (const [x, z, w, d] of [[half + 0.5, 0, 1, SIZE * TILE + 2], [-half - 0.5, 0, 1, SIZE * TILE + 2], [0, half + 0.5, SIZE * TILE + 2, 1], [0, -half - 0.5, SIZE * TILE + 2, 1]]) {
    L.addCol(makeBox(x, -12, z, w, 40, d, { noClimb: true }));
  }
  L.art((s) => {
    for (const y of LAYERS) {
      for (const [x, z, w, d] of [[half + 0.2, 0, 0.3, SIZE * TILE], [-half - 0.2, 0, 0.3, SIZE * TILE], [0, half + 0.2, SIZE * TILE, 0.3], [0, -half - 0.2, SIZE * TILE, 0.3]]) {
        s.solid.add(box(w, 0.3, d, 0.08, 1), { m: T(x, y + 0.1, z), color: 0x53f0ff, rough: 0.4, emis: 1.6 });
      }
    }
  });
  L.spawns = spawnRing(24, 15);
  L.setupBot = (b) => { b.custom = brain(L.field); };
  L.bloom = 0.32;

  L.introPath = { from: [40, 16, 44], to: [0, 8, 26], lookFrom: [0, -6, 0], lookTo: [0, 0, -4] };

  L.art((s) => {
    // A moonlit village on the far shore, with the great pumpkin house at its heart.
    const shore = -12;
    s.block(0, shore - 5, -128, 300, 10, 96, 0x234a78, { top: 0x4f8ab0, r: 1.5, rough: 0.5, clear: 0.3 });
    s.pumpkinHouse(0, shore, -112, 2.3);
    s.ghostHouse(-62, shore, -116, 2.4, 0.3);
    s.ghostHouse(60, shore, -120, 2.1, -0.3);
    s.witchHouse(-104, shore, -104, 2.4, 0.5);
    s.witchHouse(106, shore, -108, 2.2, -0.5);
    s.carriage(-36, shore, -92, 2.2, 0.5);
    for (const q of [[-130, -130], [-84, -146], [-34, -148], [36, -150], [86, -146], [132, -132], [-24, -92], [34, -94]]) s.pine(q[0], shore, q[1], 5.5, 0x237a92);
    s.tombstone(38, shore, -96, 4, -0.2, 2);
    for (const sd of [1, -1]) s.lanternPost(sd * 17, shore, -86, 2.6);
    const half = (SIZE * TILE) / 2 + 1.5;
    // Corner mausoleum pillars frame the arena.
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      s.block(x * half, LAYERS[2] + 9, z * half, 2.6, 40, 2.6, 0x31507a, { top: 0x5f8eb8, r: 0.3 });
      s.candle(x * half, LAYERS[2] + 29.1, z * half, 1.5);
      s.jackO(x * half, LAYERS[2] + 30.9, z * half, 1.3, Math.atan2(-x, -z));
    }
    const R = rng(32);
    // Graveyard islands circling the arena.
    const isle = (cx, cz, r, y = -3) => {
      s.block(cx, y - 2, cz, r * 2, 4, r * 2, 0x264a6e, { top: 0x4f8aa8, r: 0.9, rough: 0.4, clear: 0.5 });
      for (let i = 0; i < 4; i++) {
        const a = R() * 6.28, d = R.range(0.2, 0.75) * r;
        s.tombstone(cx + Math.cos(a) * d, y, cz + Math.sin(a) * d, R.range(0.7, 1.15), R() * 0.6 - 0.3, i % 3);
      }
      s.deadTree(cx + R.range(-1, 1), y, cz + R.range(-1, 1), R.range(1.4, 2), Math.floor(R() * 40), 0x6a1f3a);
      for (let i = 0; i < 3; i++) s.candle(cx + R.range(-r, r) * 0.6, y, cz + R.range(-r, r) * 0.6, R.range(0.7, 1.2));
      s.fence(cx - r, cz + r, cx + r, cz + r, y, { post: 0x2a3d6a, rail: 0x3a5a8e });
    };
    isle(-42, -16, 9); isle(42, -20, 10); isle(-40, 26, 8, -6); isle(40, 24, 9, -5);
    for (const a of [0.4, 1.4, 2.5, 3.8, 4.9, 5.7]) s.pine(Math.cos(a) * 66, -8, Math.sin(a) * 66, 3, 0x1f7a8a);
  });
  L.addBalloon(-54, 32, -70, 5);
  L.addBalloon(58, 38, -82, 5.5, { c1: 0x2f6be0, c2: 0xff9022 });
  L.addFloatGhost(-22, 12, -30, 2.6);
  L.addFloatGhost(26, 16, 22, 2.8);
  L.addBackdrop({ dark: 0x1c2f88, light: 0x3a6cc8, treeCol: 0x101c5c, ring: 520, seed: 22 });
  L.finishArt();
  void T; void gradY;
  return L;
}

export function spawnRing(n, R, y = 0.1, cx = 0, cz = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const rr = R * (i % 2 ? 0.62 : 1);
    const x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr;
    pts.push({ x, y, z, yaw: Math.PI });
  }
  return pts;
}
