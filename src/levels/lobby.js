// The castle courtyard: where rivals gather before a match. Nothing here can knock anyone out.
import { Level, ROUND_MODES } from './base.js';
import { makeBox } from '../physics/world.js';
import { buildCastle } from '../assets/castle.js';
import { addStartPad } from './pumpkinDash.js';

const W = 30, D = 24;

/** Wander between open spots and the odd pumpkin, pausing to look around. */
function wander(L) {
  return function (bot) {
    const r = bot.r, m = bot.memo;
    m.wait = (m.wait ?? bot.rand()) - 1 / 30;
    if (m.wait > 0 && !m.tx) { bot.wx = 0; bot.wz = 0; return; }
    if (!m.tx) {
      const prop = bot.rand() < 0.35 ? L.props[Math.floor(bot.rand() * L.props.length)] : null;
      m.tx = prop ? prop.x : (bot.rand() - 0.5) * (W - 6);
      m.tz = prop ? prop.z : (bot.rand() - 0.5) * (D - 6);
    }
    const dx = m.tx - r.x, dz = m.tz - r.z, d = Math.hypot(dx, dz);
    if (d < 1.4) { m.tx = 0; m.tz = 0; m.wait = 0.6 + bot.rand() * 1.8; bot.wx = 0; bot.wz = 0; return; }
    const pace = 0.65 + bot.skill * 0.35;
    bot.wx = (dx / d) * pace; bot.wz = (dz / d) * pace;
    if (r.grounded && bot.rand() < 0.01) bot.doJump();
  };
}

export function build(ctx) {
  const L = new Level(ctx);
  L.title = 'Castle Courtyard';
  L.objective = 'Warm up!';
  L.mode = ROUND_MODES.FREE;
  L.theme = 'violet';
  L.reflectY = 0;
  L.killY = -6;
  L.timeLimit = 0;
  L.addLiquid({ y: -5, kind: 'water' });

  L.floor({ z: 0, w: W, d: D, tile: 4 });
  addStartPad(L, 0, 0, 0, 7);
  const wall = (x, z, w, d) => L.addCol(makeBox(x, 0.4, z, w, 1.6, d, {}));
  wall(W / 2 + 0.5, 0, 1, D + 2); wall(-W / 2 - 0.5, 0, 1, D + 2);
  wall(0, D / 2 + 0.5, W + 2, 1); wall(0, -D / 2 - 0.5, W + 2, 1);
  L.art((s) => {
    for (const sd of [1, -1]) {
      s.block(sd * (W / 2 + 0.5), 0.2, 0, 1, 1.6, D + 2, 0xa52ce0, { r: 0.3, top: 0xc84cfa });
      s.block(0, 0.2, sd * (D / 2 + 0.5), W + 2, 1.6, 1, 0xff9022, { r: 0.3, top: 0xffb04a });
      s.lanternPost(sd * (W / 2 - 1.2), 0, -D / 2 + 1.4, 1.1);
      s.jackO(sd * (W / 2 + 3.4), 0.6, -4, 1.7, sd > 0 ? -0.6 : 0.6);
      s.terrace(sd * 34, 1, -40, 16, 30, 11);
      s.mushroom(sd * 20, 2.6, -26, 3.2, { cap: sd > 0 ? 0xff9022 : 0x7a3ae8, rim: sd > 0 ? 0x7a3ae8 : 0xff9022, height: 7 });
    }
    buildCastle(s, { x: 0, y: 0, z: -96, scale: 1 });
  });

  L.props = [[-11, -2], [11, -3], [-6, -8], [6, -8], [0, -3]].map(([x, z]) => L.bumpProp({ x, z, R: 0.72, boundX: W / 2 - 1, boundZ: D / 2 - 1 }));
  L.bouncePad({ x: -11, z: -8, R: 1.7, bounce: 13 });
  L.bouncePad({ x: 11, z: -8, R: 1.7, bounce: 13 });

  // Rivals drop in across the courtyard ahead of the player, who starts facing the castle.
  L.playerSpawn = { x: 0, y: 0.1, z: 5, yaw: Math.PI };
  const spots = [];
  for (let i = 0; i < 24; i++) {
    const a = ((i + 0.5) / 24) * Math.PI * 1.1 - Math.PI * 0.55, rr = i % 2 ? 6 : 9.5;
    spots.push({ x: Math.sin(a) * rr * 1.3, y: 0.1, z: -2 - Math.cos(a) * rr * 0.75, yaw: Math.PI / 2 - a });
  }
  L.spawns = spots;
  L.setupBot = (b) => { b.custom = wander(L); };

  L.addBalloon(-52, 34, -90, 4.6, { c1: 0x7a2be0, c2: 0xff9022 });
  L.addBalloon(56, 40, -96, 5.2, { c1: 0xff9022, c2: 0x7a2be0 });
  L.addFloatGhost(-26, 18, -60, 1.9);
  L.addFloatGhost(30, 22, -66, 2.3);
  L.addBackdrop({ center: [0, -120], ring: 520 });
  L.finishArt();
  return L;
}
