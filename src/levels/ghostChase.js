// Round: Ghost Chase. Dusk-blue sprint with a giant ghost sweeping up the course behind the pack.
// Anyone it catches is out, so the pressure builds even for those who never fall.
import * as THREE from 'three';
import { Level, ROUND_MODES, FLOOR_PALETTES, T, disc, gradY, box, Batch, toy } from './base.js';
import { makeBox } from '../physics/world.js';
import { buildCastle } from '../assets/castle.js';
import { makePatrolGhost } from '../assets/obstacles.js';
import { addStartPad, spawnGrid } from './pumpkinDash.js';
import { paramSurface, TAU } from '../render/geo.js';
import { glass } from '../render/materials.js';

const BLUE = FLOOR_PALETTES.blue;

/** Candy-striped conveyor belt, with its surface animated in the shader via UV offset. */
function conveyorStrip(L, { x = 0, y0, y1, z0, z1, w, speed = 3 }) {
  const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy);
  const pitch = Math.atan2(dy, Math.abs(dz));
  const cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  L.ramp({ x, y0, z0, y1, z1, w, conveyor: speed, kind: 'candy', palette: BLUE });
  L.art((s, group) => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ff6ad8'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    for (let i = -1; i < 3; i++) {
      g.beginPath();
      g.moveTo(0, i * 64 + 32); g.lineTo(64, i * 64); g.lineTo(128, i * 64 + 32); g.lineTo(128, i * 64 + 64); g.lineTo(64, i * 64 + 32); g.lineTo(0, i * 64 + 64);
      g.closePath(); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 4, len / 4);
    tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0, envMapIntensity: 0.9 }));
    m.rotation.order = 'YXZ';
    m.rotation.x = -Math.PI / 2 + pitch;
    m.position.set(x, cy + 0.04, cz);
    m.receiveShadow = L.tier.shadow > 0;
    group.add(m);
    L.animated.push((t, dt) => { tex.offset.y -= (speed / 4) * dt; });
    void s;
  });
}

function candyHammer(L, x, y, z, speed, phase) {
  L.hammer({ x, y, z, speed, phase, c1: 0xff5ad0, c2: 0xffffff, star: true, end: 0xff8d14 });
}

/** Orange arch that frames each hammer, as on the second key art sheet. */
function hammerArch(L, x, y, z, width = 16) {
  L.art((s) => {
    const S = s.solid;
    for (const sd of [1, -1]) {
      S.add(disc(0.72, 0.9, 7, 0.14, 16), { m: T(x + sd * width / 2, y + 3.5, z), color: gradY(-3.5, 0xc86a10, 3.5, 0xffa030), rough: 0.26, clear: 1 });
      S.add(disc(1.2, 1.35, 0.8, 0.14, 16), { m: T(x + sd * width / 2, y + 0.4, z), color: 0xff9022, rough: 0.28, clear: 1 });
      S.add(disc(1.0, 1.1, 0.5, 0.12, 16), { m: T(x + sd * width / 2, y + 7, z), color: 0x7a3ae8, rough: 0.26, clear: 1 });
    }
  });
}

class GiantGhost {
  constructor(L, { delay = 7, speed = 3.8, ramp = 0.035, maxSpeed = 6.2 }) {
    this.level = L; this.delay = delay; this.speed = speed; this.ramp = ramp; this.maxSpeed = maxSpeed;
    this.z = 24; this.y = 6;
    this.active = false;
    this.t = 0;
    this._g = { y: 0, collider: null };
    this.groundY = 0;
    L.art((s, group) => {
      this.mesh = makePatrolGhost(5.6);
      this.mesh.castShadow = false;
      group.add(this.mesh);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe0ff).multiplyScalar(0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      void halo;
    });
  }
  step(t, dt) {
    const L = this.level, sim = L.sim;
    if (!sim || sim.phase !== 'play') return;
    if (sim.elapsed < this.delay) return;
    this.active = true;
    this.speed = Math.min(this.maxSpeed, this.speed + this.ramp * dt);
    this.z -= this.speed * dt;
    const g = L.world.groundBelow(0, 80, this.z, 200, this._g);
    if (g) this.groundY += (this._g.y - this.groundY) * Math.min(1, dt * 2.5);
    // The chase stops short of the finish so the final sprint stays fair.
    const stop = L.finish.z + 9;
    if (this.z < stop) { this.z = stop; return; }
    for (const r of sim.racers) {
      if (!r.active || r.finished || r.eliminated) continue;
      if (r.z > this.z - 0.8) {
        L.world.emit('caught', r, r.x, r.y + 1, r.z);
        sim.eliminate(r, 'caught');
      }
    }
  }
  sync(t) {
    if (!this.mesh) return;
    this.mesh.visible = this.active || t < 2 || (this.level.sim && this.level.sim.elapsed > this.delay - 2.5);
    this.mesh.position.set(Math.sin(t * 0.7) * 2.2, this.groundY + 6.4 + Math.sin(t * 1.7) * 0.5, this.z - 1);
    this.mesh.rotation.z = Math.sin(t * 0.7) * 0.07;
    this.mesh.rotation.x = 0.14;
    this.mesh.rotation.y = Math.PI + Math.sin(t * 0.5) * 0.14;
    const sc = 5.6 + Math.sin(t * 3) * 0.14;
    this.mesh.scale.set(sc * 1.26, sc, sc);
  }
  /** Distance between a racer and the ghost; drives the HUD warning. */
  gap(r) { return this.z - r.z; }
}

export function build(ctx) {
  const L = new Level(ctx);
  L.title = 'Ghost Chase';
  L.objective = 'Outrun the giant ghost!';
  L.mode = ROUND_MODES.RACE;
  L.theme = 'dusk';
  L.reflectY = 0;
  L.killY = -6;
  L.timeLimit = 120;
  L.addLiquid({ y: -5, kind: 'moon' });

  L.addCol(makeBox(0, -0.5, 4, 22, 1, 22, {}));
  addStartPad(L, 0, 0, 4, 11);
  L.art((s) => { s.block(0, -0.8, 4, 22.4, 1.2, 22.4, 0x4453e0, { top: 0x6a7cf8, r: 0.3 }); });
  L.spawns = spawnGrid(0, 4, 24);

  // --- Patrol ghosts --------------------------------------------------------------------
  L.floor({ z: -39, w: 16, d: 72, tile: 4, palette: BLUE });
  [-20, -32, -44, -56, -68].forEach((z, i) => {
    L.ghost({ x: 0, z, dx: 5.6, speed: 1.1 + i * 0.09, phase: i * 1.3, s: 1.35, y: 1.5 });
  });
  railRun(L, 8, -7, -75);

  // --- Candy hammers ---------------------------------------------------------------------
  L.floor({ z: -100, w: 15, d: 50, tile: 5, palette: BLUE });
  candyHammer(L, 0, 0, -86, 1.7, 0.4); hammerArch(L, 0, 0, -86);
  candyHammer(L, 0, 0, -102, 1.9, 2.5); hammerArch(L, 0, 0, -102);
  candyHammer(L, 0, 0, -118, 2.1, 1.1); hammerArch(L, 0, 0, -118);
  L.sideWall(1, -75, -125, { halfW: 7.5 });
  L.sideWall(-1, -75, -125, { halfW: 7.5 });

  // --- Candy conveyor climb --------------------------------------------------------------
  conveyorStrip(L, { y0: 0, y1: 5.6, z0: -125, z1: -160, w: 11, speed: 2.8 });
  L.ramp({ x: -7.5, y0: 0, z0: -125, y1: 5.6, z1: -160, w: 4, tile: 4, palette: FLOOR_PALETTES.magenta });
  L.ramp({ x: 7.5, y0: 0, z0: -125, y1: 5.6, z1: -160, w: 4, tile: 4, palette: FLOOR_PALETTES.magenta });
  L.sideWall(1, -125, -160, { halfW: 9.5, y: 2.8, h: 4.4 });
  L.sideWall(-1, -125, -160, { halfW: 9.5, y: 2.8, h: 4.4 });
  L.floor({ y: 5.6, z: -167, w: 19, d: 14, tile: 4.75, palette: BLUE });

  // --- Sliding platforms over the gap ------------------------------------------------------
  L.mover({ x: 0, y: 5.6, z: -178.5, w: 7, d: 5, dx: 4.5, speed: 1.05, phase: 0, color: 0x6a58ff, rim: 0xff9022 });
  L.mover({ x: 0, y: 5.6, z: -185.5, w: 7, d: 5, dx: 4.5, speed: 1.2, phase: 2.2, color: 0xa83ae8, rim: 0xffc860 });
  L.mover({ x: 0, y: 5.6, z: -192.5, w: 7, d: 5, dx: 4.5, speed: 1.05, phase: 4.2, color: 0x6a58ff, rim: 0xff9022 });
  L.floor({ y: 5.6, z: -210, w: 15, d: 30, tile: 5, palette: BLUE });
  L.ghost({ x: 0, y: 7.1, z: -204, dx: 4.6, speed: 1.5, phase: 0.5, s: 1.35 });
  L.ghost({ x: 0, y: 7.1, z: -216, dx: 4.6, speed: 1.7, phase: 2.6, s: 1.35 });
  L.sideWall(1, -196, -225, { halfW: 7.5, y: 5.6 });
  L.sideWall(-1, -196, -225, { halfW: 7.5, y: 5.6 });

  // --- Finish ---------------------------------------------------------------------------------
  L.floor({ y: 5.6, z: -238, w: 22, d: 26, tile: 5.5, palette: BLUE });
  L.finish = { z: -231, x0: -11, x1: 11, y: 5.6 };
  L.art((s) => s.finishArch(0, 5.6, -231, 13, 9));
  L.addCol(makeBox(0, 10, -252, 30, 16, 2, {}));
  L.addCol(makeBox(-12, 9, -238, 2, 8, 28, {}));
  L.addCol(makeBox(12, 9, -238, 2, 8, 28, {}));

  L.chaser = L.addObstacle(new GiantGhost(L, { delay: 8 - (ctx.difficulty ?? 0.5) * 2, speed: 3.6 + (ctx.difficulty ?? 0.5) * 0.8, maxSpeed: 5.4 + (ctx.difficulty ?? 0.5) * 1 }));

  L.route = [
    { x: 0, z: 10, w: 6 }, { x: 0, z: -75, w: 5.6 }, { x: 0, z: -125, w: 5 },
    { x: 0, z: -160, w: 8 }, { x: 0, z: -172, w: 6 },
    { x: 0, z: -177, w: 0.8, moving: true, jump: true },
    { x: 0, z: -192, w: 0.8, moving: true, jump: true },
    { x: 0, z: -197, w: 4 }, { x: 0, z: -230, w: 5 }, { x: 0, z: -235, w: 8 },
  ];
  L.checkpoints = [
    { z: 10, x: 0, y: 0.1, spawnZ: 4, spread: 6 },
    { z: -26, x: 0, y: 0.1, spawnZ: -26, spread: 4 },
    { z: -50, x: 0, y: 0.1, spawnZ: -50, spread: 4 },
    { z: -75, x: 0, y: 0.1, spawnZ: -77, spread: 4 },
    { z: -110, x: 0, y: 0.1, spawnZ: -110, spread: 4 },
    { z: -160, x: 0, y: 5.7, spawnZ: -168, spread: 5 },
    { z: -197, x: 0, y: 5.7, spawnZ: -199, spread: 4 },
  ];

  L.art((s) => {
    buildCastle(s, { x: 0, y: 4.2, z: -282, scale: 1.25 });
    for (const sd of [1, -1]) {
      s.bannerPole(sd * 8.8, 0, -80, 1, sd > 0 ? Math.PI : 0, 8);
      s.bannerPole(sd * 8.8, 0, -124, 1, sd > 0 ? Math.PI : 0, 8);
      s.bannerPole(sd * 9.4, 5.6, -228, 1, sd > 0 ? Math.PI : 0, 9);
      s.lanternPost(sd * 11.5, -0.6, -8, 1.1);
      s.lanternPost(sd * 11, 5, -168, 1.1);
      s.jackO(sd * 12, 0.5, -5, 1.6, sd > 0 ? -0.6 : 0.6);
      s.terrace(sd * 30, 1, -40, 14, 34, 10, {});
      s.terrace(sd * 34, 3, -110, 16, 40, 13, {});
      s.terrace(sd * 38, 7, -190, 18, 48, 17, {});
      s.jackO(sd * 27, 3, -32, 2.6, sd > 0 ? -0.5 : 0.5);
      s.jackO(sd * 30, 5.2, -100, 2.8, sd > 0 ? -0.5 : 0.5);
      s.lanternPost(sd * 30, 3, -128, 1.5);
      s.lanternPost(sd * 34, 7, -210, 1.6);
      s.deadTree(sd * 40, 3, -60, 2.2, sd > 0 ? 4 : 9, 0x4a2a6a);
      s.deadTree(sd * 44, 5, -150, 2.4, sd > 0 ? 6 : 12, 0x4a2a6a);
      // Glass candy blocks: real screen-space refraction, as on the key art's right-hand side.
    }
  });
  addGlassBlocks(L);
  L.addBalloon(-60, 38, -120, 5.2, { c1: 0xff9022, c2: 0x7a2be0 });
  L.addBalloon(70, 46, -170, 6, { c1: 0xff5ad0, c2: 0xffffff });
  L.addFloatGhost(36, 26, -85, 3);
  L.addFloatGhost(-48, 30, -190, 3.6);
  L.addBackdrop({ dark: 0x3a55c8, light: 0x7e9cf8, treeCol: 0x2a3e9c, center: [0, -240], ring: 560, seed: 14 });
  L.finishArt();
  return L;
}

function railRun(L, side, z0, z1) {
  L.sideWall(1, z0, z1, { halfW: side });
  L.sideWall(-1, z0, z1, { halfW: side });
}

/** Jelly candy blocks beside the course: they really refract whatever's behind them. */
function addGlassBlocks(L) {
  L.art((s, group) => {
    const geo = box(4.6, 3.4, 5.6, 0.55, 3);
    const mat = glass({ color: 0xffa8e8, strength: 0.08, tint: 0.7 });
    const spots = [[11.4, -35], [-11.4, -52], [11.4, -92], [-11.4, -112]];
    for (const [x, z] of spots) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0.65, z);
      m.renderOrder = 6;
      group.add(m);
      s.solid.add(box(5, 0.5, 6, 0.14, 1), { m: T(x, -1.1, z), color: 0x4453e0, rough: 0.35, clear: 0.6 });
    }
  });
}

void Batch; void toy; void paramSurface; void TAU;
