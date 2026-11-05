// Round: Pumpkin Dash. The signature race down the causeway to the castle gate.
//
// Teach -> test -> twist: wide plaza, slow hammers with escape lanes, optional hops with a safe path,
// timing jumps over spin bars, a breather, then the last hammer gauntlet up to the gate.
import * as THREE from 'three';
import { Level, ROUND_MODES, FLOOR_PALETTES, T, disc, gradY, box, Batch } from './base.js';
import { makeBox, makeCyl } from '../physics/world.js';
import { buildCastle } from '../assets/castle.js';
import { lathe, torus, rng } from '../render/geo.js';
import { glass } from '../render/materials.js';

export const CASTLE_Z = -340;

/** Glowing rune start pad, inspired by the moonlit key art. */
export function addStartPad(level, x, y, z, R = 13) {
  level.art((s) => {
    const S = s.solid;
    S.add(disc(R, R * 1.03, 0.9, 0.2, 64), { m: T(x, y - 0.42, z), color: gradY(-0.4, 0x2c1a78, 0.5, 0x5b3ad0), rough: 0.26, clear: 1 });
    S.add(disc(R * 0.72, R * 0.74, 0.3, 0.1, 56), { m: T(x, y - 0.06, z), color: 0x6a44e0, rough: 0.2, clear: 1 });
    s.ring(x, y + 0.06, z, R * 0.86, 0.1, 0x53f0ff, 3.2, 72);
    s.ring(x, y + 0.11, z, R * 0.55, 0.08, 0x53f0ff, 3.2, 56);
    // Rune marks.
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = R * 0.72;
      S.add(box(0.9, 0.05, 0.22, 0.02, 1), { m: T(x + Math.sin(a) * r, y + 0.1, z + Math.cos(a) * r, 0, a + 0.5), color: 0x53f0ff, rough: 0.4, emis: 3.2 });
      S.add(box(0.22, 0.05, 0.72, 0.02, 1), { m: T(x + Math.sin(a) * r, y + 0.1, z + Math.cos(a) * r, 0, a), color: 0x53f0ff, rough: 0.4, emis: 3.2 });
    }
    s.halo(x, y + 0.6, z, R * 2.1, 0x53f0ff, 0.08);
  });
}

/** Standard dressing of one side of a causeway section: a repeating rhythm of big toy shapes. */
export function dressSide(level, side, z0, z1, { halfW = 6, y = 0, seed = 3, dense = 1 } = {}) {
  level.art((s) => {
    const R = rng(seed + (side > 0 ? 100 : 0));
    let z = z0;
    let i = 0;
    while (z > z1) {
      const k = R();
      const xb = side * (halfW + 2.2);
      if (i % 3 === 0) {
        // Magenta blocks hugging the track, with an orange slab beyond.
        const h = R.range(2, 3.6);
        s.block(xb + side * 0.8, y - 0.3 + h / 2 - 0.9, z, 3.6, h, R.range(4.4, 6.2), 0xa52ce0, { top: 0xc248f8 });
        s.block(xb + side * 3.9, y - 0.5, z - 1, 3.4, 1.3, 7, 0xff9022, { r: 0.5, top: 0xffb04a });
      } else if (i % 3 === 1) {
        s.lanternPost(xb + side * 0.1, y - 0.9, z, 1.05, R() * 3);
        s.mushroom(xb + side * 4.2, y + R.range(1.6, 3.4), z - 2, R.range(2.8, 4.2), {
          cap: k > 0.5 ? 0xff9022 : 0x7a3ae8, rim: k > 0.5 ? 0x7a3ae8 : 0xff9022, height: 7,
        });
      } else {
        s.block(xb + side * 2.4, y - 1, z, 5, 2.4, 4.4, 0x5a2fc0, { top: 0x7c50e8 });
        s.jackO(xb + side * 1.8, y + 1.15, z - 0.2, R.range(1.2, 1.6), side > 0 ? -0.5 : 0.5);
      }
      z -= (11 + R() * 5) / dense;
      i++;
    }
  });
}

export function build(ctx) {
  const L = new Level(ctx);
  L.title = 'Pumpkin Dash';
  L.objective = 'Race to the Finish!';
  L.mode = ROUND_MODES.RACE;
  L.theme = 'violet';
  L.reflectY = 0;
  L.killY = -6;
  L.timeLimit = 150;
  L.addLiquid({ y: -5, kind: 'water' });

  const W = 12, TILE = 4;

  // --- A: start plaza ------------------------------------------------------------------
  L.addCol(makeCyl(0, -0.5, 4, 13.2, 1, {}));
  addStartPad(L, 0, 0, 4, 13.2);
  L.floor({ z: -20, w: 16, d: 24, tile: TILE });
  L.spawns = spawnGrid(0, 4, 24);

  // --- B: hammer alley (teach) ---------------------------------------------------------
  L.floor({ z: -66, w: W, d: 68, tile: TILE });
  L.hammer({ x: 0, z: -44, speed: 1.55, phase: 0 });
  L.hammer({ x: 0, z: -60, speed: 1.65, phase: 2.4 });
  L.hammer({ x: 0, z: -76, speed: 1.75, phase: 0.8 });
  L.hammer({ x: 0, z: -92, speed: 1.85, phase: 3.4 });
  L.sideWall(1, -32, -99, { halfW: W / 2 });
  L.sideWall(-1, -32, -99, { halfW: W / 2 });

  // --- C: mushroom hops, with a safe plank on the right ---------------------------------
  L.spinDisc({ x: 0, y: 0, z: -105.5, R: 3.9, speed: 0.7, c1: 0xff9022, c2: 0x7a3ae8 });
  L.spinDisc({ x: -3.6, y: 0, z: -116, R: 3.7, speed: -0.9, c1: 0x7a3ae8, c2: 0xff9022 });
  L.spinDisc({ x: 3.6, y: 0, z: -116, R: 3.7, speed: 0.9, c1: 0xff9022, c2: 0x7a3ae8 });
  L.spinDisc({ x: 0, y: 0, z: -126.5, R: 3.9, speed: -0.7, c1: 0x7a3ae8, c2: 0xff9022 });
  // The safe plank: longer, narrow, no timing required.
  L.floor({ x: 8.6, z: -116, w: 2.2, d: 35, tile: 2.2, kind: 'candy', palette: FLOOR_PALETTES.magenta });
  L.floor({ x: 6.4, z: -99.5, w: 6.4, d: 2.2, tile: 2.2, palette: FLOOR_PALETTES.magenta });
  L.floor({ x: 6.4, z: -132.5, w: 6.4, d: 2.2, tile: 2.2, palette: FLOOR_PALETTES.magenta });

  // --- D: spin bars (test) --------------------------------------------------------------
  L.floor({ z: -163, w: 18, d: 60, tile: TILE + 0.5 });
  L.spinBar({ x: -4.5, z: -148, y: 0.82, len: 4.5, speed: 1.35, phase: 0 });
  L.spinBar({ x: 4.5, z: -148, y: 0.82, len: 4.5, speed: -1.35, phase: 1.6 });
  L.spinBar({ x: 0, z: -166, y: 0.82, len: 8, speed: 1.5, phase: 0.8 });
  L.spinBar({ x: -4.5, z: -183, y: 0.82, len: 4.5, speed: -1.7, phase: 2.2 });
  L.spinBar({ x: 4.5, z: -183, y: 0.82, len: 4.5, speed: 1.7, phase: 0.2 });
  L.sideWall(1, -134, -186, { halfW: 9 });
  L.sideWall(-1, -134, -186, { halfW: 9 });

  // --- E: bounce pads over a gap (breather and spectacle). Side planks are the slow, safe way ---
  L.bouncePad({ x: -3.6, z: -190.6, R: 2.1, bounce: 15.5 });
  L.bouncePad({ x: 3.6, z: -190.6, R: 2.1, bounce: 15.5 });
  L.floor({ x: -9.5, z: -202, w: 3, d: 18, tile: 3, palette: FLOOR_PALETTES.magenta });
  L.floor({ x: 9.5, z: -202, w: 3, d: 18, tile: 3, palette: FLOOR_PALETTES.magenta });
  L.floor({ z: -203.25, w: 16, d: 9.5, tile: TILE + 0.75 });
  L.floor({ z: -217.75, w: 18, d: 13.5, tile: TILE + 0.5 });

  // --- F: last gauntlet up to the gate (twist) --------------------------------------------
  L.ramp({ y0: 0, z0: -224.5, y1: 3.2, z1: -240, w: 14, tile: TILE });
  L.floor({ y: 3.2, z: -280, w: W + 2, d: 80, tile: TILE });
  L.hammer({ x: 0, y: 3.2, z: -251, speed: 2.05, phase: 0.3, c1: 0xff5ad0, c2: 0xffffff, star: true, end: 0xff8d14, span: 18 });
  L.hammer({ x: 0, y: 3.2, z: -265, speed: 2.15, phase: 2.8, c1: 0xff5ad0, c2: 0xffffff, star: true, end: 0xff8d14, span: 18 });
  L.hammer({ x: 0, y: 3.2, z: -279, speed: 2.25, phase: 1.2, c1: 0xff5ad0, c2: 0xffffff, star: true, end: 0xff8d14, span: 18 });
  L.hammer({ x: 0, y: 3.2, z: -293, speed: 2.35, phase: 3.9, c1: 0xff5ad0, c2: 0xffffff, star: true, end: 0xff8d14, span: 18 });
  L.sideWall(1, -241, -311, { halfW: (W + 2) / 2, y: 3.2 });
  L.sideWall(-1, -241, -311, { halfW: (W + 2) / 2, y: 3.2 });

  // Finish plaza before the castle gate.
  L.floor({ y: 3.2, z: -326, w: 24, d: 14, tile: TILE + 2 });
  L.finish = { z: -313, x0: -13, x1: 13, y: 3.2 };
  L.art((s) => s.finishArch(0, 3.2, -313, 14, 9.5));
  // Invisible backstop so finishers don't run into the castle wall and fall off.
  L.addCol(makeBox(0, 8, -334, 40, 16, 2, {}));
  L.addCol(makeBox(-13.5, 6, -326, 2, 8, 16, {}));
  L.addCol(makeBox(13.5, 6, -326, 2, 8, 16, {}));

  // --- Route for AI + ranking -------------------------------------------------------------
  L.route = [
    { x: 0, z: 8, w: 6 }, { x: 0, z: -32, w: 5.2 },
    { x: 0, z: -98, w: 4.4 },
    { x: 0, z: -102, w: 0.5 }, { x: 0, z: -109, w: 1.2, jump: true },
    { x: 2.8, z: -116, w: 0.8, jump: true },
    { x: 0, z: -126.5, w: 1.0, jump: true },
    { x: 0, z: -134, w: 1.2, jump: true },
    { x: 0, z: -186, w: 6 },
    { x: 0, z: -190.6, w: 0.3, lanes: [-3.6, 3.6] },
    { x: 0, z: -206, w: 4 },
    { x: 0, z: -212, w: 4, jump: true },
    { x: 0, z: -222, w: 5 },
    { x: 0, z: -240, w: 5 }, { x: 0, z: -312, w: 4.5 }, { x: 0, z: -316, w: 8 },
  ];
  L.checkpoints = [
    { z: 8, x: 0, y: 0.1, spawnZ: 4, spread: 6 },
    { z: -34, x: 0, y: 0.1, spawnZ: -30, spread: 4 },
    { z: -52, x: 0, y: 0.1, spawnZ: -52, spread: 4 },
    { z: -84, x: 0, y: 0.1, spawnZ: -84, spread: 4 },
    { z: -99, x: 0, y: 0.1, spawnZ: -98, spread: 3.5 },
    { z: -134, x: 0, y: 0.1, spawnZ: -136, spread: 5 },
    { z: -160, x: 0, y: 0.1, spawnZ: -158, spread: 5 },
    { z: -184, x: 0, y: 0.1, spawnZ: -185, spread: 5 },
    { z: -200, x: 0, y: 0.1, spawnZ: -203, spread: 5 },
    { z: -212, x: 0, y: 0.1, spawnZ: -216, spread: 5 },
    { z: -258, x: 0, y: 3.3, spawnZ: -258, spread: 4 },
    { z: -286, x: 0, y: 3.3, spawnZ: -286, spread: 4 },
  ];

  // --- Dressing -----------------------------------------------------------------------------
  L.art((s) => {
    buildCastle(s, { x: 0, y: 1.6, z: CASTLE_Z, scale: 1.62 });
    s.bannerPole(-10, 3.2, -310, 1, 0, 9);
    s.bannerPole(10, 3.2, -310, 1, Math.PI, 9);
    s.bannerPole(-9.4, 0, -34, 1, 0, 8);
    s.bannerPole(9.4, 0, -34, 1, Math.PI, 8);
    for (const sd of [1, -1]) {
      s.lanternPost(sd * 8.8, 3.2 - 0.9, -243, 1.05);
      s.lanternPost(sd * 12, 3.2 - 0.9, -318, 1.2);
      s.jackO(sd * 7.5, 1.05, 12, 1.3, sd > 0 ? -0.5 : 0.5);
      s.jackO(sd * 16.5, 0.2, -6, 1.9, sd > 0 ? -0.7 : 0.7);
      // Start plaza block walls frame the first view, matching the key art.
      s.block(sd * 11.6, -0.3, -21, 3.8, 3.6, 8.2, 0xa52ce0, { top: 0xc84cfa });
      s.block(sd * 17.5, -0.7, -24, 8, 2, 10, 0xff9022, { r: 0.55, top: 0xffb04a });
      s.jackO(sd * 18, 1.7, -24, 2.1, sd > 0 ? -0.5 : 0.5);
      s.lanternPost(sd * 13.8, 0.4, -14.5, 1.15);
    }
    // Far mid-ground: stone terraces with lanterns and pumpkins, as on both sides of the key art.
    for (const sd of [1, -1]) {
      s.terrace(sd * 34, 1, -58, 16, 30, 11);
      s.terrace(sd * 40, 4, -112, 20, 28, 14);
      s.terrace(sd * 36, 1, -180, 14, 42, 11);
      s.terrace(sd * 44, 6, -250, 22, 46, 16);
      s.jackO(sd * 32, 3, -52, 3, sd > 0 ? -0.6 : 0.6);
      s.jackO(sd * 36, 3.1, -176, 3.2, sd > 0 ? -0.5 : 0.5);
      s.jackO(sd * 40, 8.4, -240, 3.6, sd > 0 ? -0.4 : 0.4);
      s.lanternPost(sd * 36, 1, -68, 1.5);
      s.lanternPost(sd * 34, 4, -106, 1.6);
      s.lanternPost(sd * 34, 6, -262, 1.8);
      s.deadTree(sd * 46, 4, -116, 2, sd > 0 ? 3 : 8, 0x62214a);
      s.deadTree(sd * 40, 1, -192, 2.3, sd > 0 ? 5 : 11, 0x62214a);
      s.deadTree(sd * 50, 6, -262, 2.6, sd > 0 ? 7 : 13, 0x62214a);
      s.fence(sd * 25, -44, sd * 25, -128, -0.6, {});
      s.fence(sd * 28, -160, sd * 28, -290, 0, {});
    }
  });
  L.art((s, group) => {
    const geo = box(2.3, 3.2, 2.3, 0.5, 3);
    const mat = glass({ color: 0xc8a0ff, strength: 0.09, tint: 0.6 });
    for (const [x, y, z, r] of [[-9.4, 1.5, -6.4, 0.5], [9.4, 1.5, -6.4, -0.5], [-10.6, 4.7, -322, 0.3], [10.6, 4.7, -322, -0.3]]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = r;
      m.renderOrder = 6;
      group.add(m);
    }
  });
  dressSide(L, 1, -36, -96, { halfW: W / 2, seed: 5 });
  dressSide(L, -1, -40, -96, { halfW: W / 2, seed: 8 });
  dressSide(L, -1, -140, -188, { halfW: 9, seed: 12 });
  dressSide(L, 1, -140, -188, { halfW: 9, seed: 16 });
  dressSide(L, 1, -246, -306, { halfW: (W + 2) / 2, y: 3.2, seed: 21 });
  dressSide(L, -1, -250, -306, { halfW: (W + 2) / 2, y: 3.2, seed: 24 });

  L.addBalloon(-56, 42, -170, 5.2, { c1: 0x7a2be0, c2: 0xff9022 });
  L.addBalloon(66, 54, -150, 6.5, { c1: 0xff9022, c2: 0x7a2be0 });
  L.addBalloon(-128, 74, -320, 9, { c1: 0xa52ce0, c2: 0xff5ad0 });
  L.addBalloon(150, 62, -330, 8, { c1: 0xff9022, c2: 0x4453e0 });
  L.addFloatGhost(-44, 26, -188, 3);
  L.addFloatGhost(56, 34, -262, 4);
  L.addFloatGhost(28, 22, -105, 2.4);
  L.addBackdrop({ center: [0, -300], ring: 560 });
  L.finishArt();
  return L;
}

/** Sixteen spawn points in a fan on the start pad, player slot last so they see the crowd. */
export function spawnGrid(cx, cz, n = 16, { spacingX = 2.4, spacingZ = 2.4, perRow = 5, facing = Math.PI } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const count = Math.min(perRow, n - row * perRow);
    pts.push({ x: cx + (col - (count - 1) / 2) * spacingX, y: 0.1, z: cz - 3 + row * spacingZ, yaw: facing });
  }
  return pts;
}

void THREE; void Batch; void lathe; void torus;
