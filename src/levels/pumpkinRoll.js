// Round: Pumpkin Roll. A climb up three long ramps while giant pumpkins bowl down the hill.
// Stone cover gives thinking players shelter; greedy lines are faster but exposed.
import { Level, ROUND_MODES, FLOOR_PALETTES, T, disc, gradY } from './base.js';
import { makeBox } from '../physics/world.js';
import { rng } from '../render/geo.js';
import { buildCastle } from '../assets/castle.js';
import { addStartPad, spawnGrid } from './pumpkinDash.js';
import { addBubbles } from './witchsPlatform.js';

function cover(L, x, y, z, w = 5, h = 1.6, d = 1.6, ry = 0) {
  L.addCol(makeBox(x, y + h / 2, z, w, h, d, { ry }));
  L.art((s) => {
    s.block(x, y + h / 2, z, w, h, d, 0x6a3ae0, { r: 0.42, ry, top: 0x9a68ff });
    s.jackO(x, y + h + 0.6, z, 0.72, 0, { stem: true, nu: 28, nv: 18 });
  });
}

export function build(ctx) {
  const L = new Level(ctx);
  L.title = 'Pumpkin Roll';
  L.objective = 'Dodge the pumpkins!';
  L.mode = ROUND_MODES.RACE;
  L.theme = 'slime';
  L.reflectY = 0;
  const slimeY = -4.6;
  L.killY = slimeY - 0.5;
  L.timeLimit = 130;
  L.addLiquid({ y: slimeY, kind: 'slime' });
  const d = ctx.difficulty ?? 0.5;

  L.addCol(makeBox(0, -0.5, 4, 24, 1, 26, {}));
  L.art((s) => s.block(0, -0.8, 4, 24.4, 1.2, 26.4, 0x4a2fa8, { top: 0x7a50f0, r: 0.3 }));
  addStartPad(L, 0, 0, 2, 11);
  L.spawns = spawnGrid(0, 2, 24, { perRow: 6, spacingX: 2.8 });

  const W = 22;
  // Ramp 1.
  L.ramp({ y0: 0, z0: -9, y1: 8, z1: -68, w: W, tile: 4.4 });
  L.floor({ y: 8, z: -74, w: W + 2, d: 12, tile: 4.8, palette: FLOOR_PALETTES.magenta });
  // Ramp 2.
  L.ramp({ y0: 8, z0: -80, y1: 18, z1: -141, w: W, tile: 4.4 });
  L.floor({ y: 18, z: -147, w: W + 2, d: 12, tile: 4.8, palette: FLOOR_PALETTES.magenta });
  // Ramp 3.
  L.ramp({ y0: 18, z0: -153, y1: 30, z1: -214, w: W, tile: 4.4 });
  L.floor({ y: 30, z: -229, w: W + 6, d: 30, tile: 5.6 });

  // Invisible walls keep everyone on the hill; the visible edge is a run of inflated rails.
  for (const sd of [1, -1]) {
    L.addCol(makeBox(sd * (W / 2 + 0.5), 15, -112, 1, 60, 214, { noClimb: true }));
    L.art((s) => {
      for (const [y0, z0, y1, z1] of [[0, -9, 8, -68], [8, -68, 8, -80], [8, -80, 18, -141], [18, -141, 18, -153], [18, -153, 30, -214]]) {
        s.tubeRail(sd * (W / 2 + 0.3), y0 + 0.5, z0, sd * (W / 2 + 0.3), y1 + 0.5, z1, { r: 0.42 });
        s.tubeRail(sd * (W / 2 + 0.3), y0 + 1.25, z0, sd * (W / 2 + 0.3), y1 + 1.25, z1, { r: 0.26, color: 0x8a3ae8 });
      }
    });
  }

  // Shelter: staggered so there's never a straight safe line.
  const slope = (z, y0, z0, y1, z1) => y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  const yA = (z) => slope(z, 0, -9, 8, -68), yB = (z) => slope(z, 8, -80, 18, -141), yC = (z) => slope(z, 18, -153, 30, -214);
  cover(L, -5.5, yA(-30), -30); cover(L, 5.5, yA(-44), -44); cover(L, 0, yA(-58), -58, 6);
  cover(L, 6, yB(-100), -100); cover(L, -6, yB(-114), -114); cover(L, 0, yB(-128), -128, 6);
  cover(L, -6, yC(-172), -172); cover(L, 6, yC(-186), -186); cover(L, 0, yC(-200), -200, 7);

  // Boulder runs. Rate rises with each ramp.
  const interval = 2.9 - d * 0.5;
  L.boulderSpawner({ x: 0, y: 12, z: -71, R: 2.5, interval, delay: 1.2, spreadX: 8.5, startVz: 4 });
  L.boulderSpawner({ x: 0, y: 22, z: -144, R: 2.6, interval: interval * 0.9, delay: 2.2, spreadX: 8.5, startVz: 4 });
  L.boulderSpawner({ x: 0, y: 34, z: -217, R: 2.75, interval: interval * 0.8, delay: 3.3, spreadX: 8.5, startVz: 5 });

  L.finish = { z: -218, x0: -14, x1: 14, y: 30 };
  L.art((s) => s.finishArch(0, 30, -218, 15, 10));
  L.addCol(makeBox(0, 36, -244, 34, 16, 2, {}));
  L.addCol(makeBox(-15, 34, -229, 2, 8, 32, {}));
  L.addCol(makeBox(15, 34, -229, 2, 8, 32, {}));

  L.route = [
    { x: 0, z: 10, w: 7 }, { x: 0, z: -68, w: 8 }, { x: 0, z: -80, w: 8 }, { x: 0, z: -141, w: 8 },
    { x: 0, z: -153, w: 8 }, { x: 0, z: -216, w: 8 }, { x: 0, z: -222, w: 8 },
  ];
  L.checkpoints = [
    { z: 10, x: 0, y: 0.1, spawnZ: 2, spread: 7 },
    { z: -68, x: 0, y: 8.1, spawnZ: -74, spread: 7 },
    { z: -141, x: 0, y: 18.1, spawnZ: -147, spread: 7 },
  ];
  L.introPath = { from: [14, 40, -240], to: [0, 7, 22], lookFrom: [0, 28, -300], lookTo: [0, 3, -30] };

  L.art((s) => {
    buildCastle(s, { x: 0, y: 26, z: -296, scale: 1.2 });
    const R = rng(55);
    for (const sd of [1, -1]) {
      s.lanternPost(sd * 13.5, 7.1, -74, 1.2);
      s.lanternPost(sd * 13.5, 17.1, -147, 1.2);
      s.lanternPost(sd * 16, 29.1, -224, 1.3);
      s.bannerPole(sd * 12.6, 0, -6, 1, sd > 0 ? Math.PI : 0, 8);
      s.bannerPole(sd * 12.6, 8, -71, 1, sd > 0 ? Math.PI : 0, 8);
      s.bannerPole(sd * 12.6, 18, -144, 1, sd > 0 ? Math.PI : 0, 8);
      // The slope's flanks: stacked terraces, rising with the hill.
      s.terrace(sd * 26, 4, -35, 14, 50, 14);
      s.terrace(sd * 28, 14, -110, 16, 60, 24);
      s.terrace(sd * 30, 26, -185, 18, 60, 34);
      s.jackO(sd * 24, 6.2, -24, 2.3, sd > 0 ? -0.6 : 0.6);
      s.jackO(sd * 25, 16.3, -96, 2.6, sd > 0 ? -0.6 : 0.6);
      s.jackO(sd * 26, 28.3, -170, 2.8, sd > 0 ? -0.6 : 0.6);
      s.deadTree(sd * 30, 4, -46, 2, sd > 0 ? 2 : 6, 0x4a1a4e);
      s.deadTree(sd * 34, 14, -122, 2.4, sd > 0 ? 4 : 8, 0x4a1a4e);
      s.deadTree(sd * 36, 26, -198, 2.6, sd > 0 ? 3 : 9, 0x4a1a4e);
      s.lanternPost(sd * 30, 4, -18, 1.6);
      s.lanternPost(sd * 32, 14, -82, 1.7);
      s.lanternPost(sd * 34, 26, -156, 1.8);
    }
    // Pumpkin patches at each release point.
    for (const [z, y] of [[-71, 8], [-144, 18], [-217, 30]]) {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 8 + R.range(-1, 1);
        s.solid.add(disc(1.9, 2.4, 0.5, 0.1, 16), { m: T(x, y + 0.2, z - 3), color: gradY(-0.25, 0x241468, 0.25, 0x5e30c8), rough: 0.4, clear: 0.5 });
      }
    }
  });
  addBubbles(L, slimeY, 40);
  L.addBalloon(-60, 44, -120, 5.6);
  L.addBalloon(64, 60, -180, 6.2, { c1: 0xa52ce0, c2: 0xff9022 });
  L.addFloatGhost(-30, 24, -60, 2.8);
  L.addFloatGhost(38, 42, -170, 3.4);
  L.addBackdrop({ dark: 0x241a70, light: 0x5038b8, treeCol: 0x140e48, ring: 620, center: [0, -200], seed: 41 });
  L.finishArt();
  return L;
}
