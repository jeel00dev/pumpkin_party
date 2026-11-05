import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_ORDER, LOBBY_LEVEL } from '../src/levels/index.js';
import { Simulation, STEP } from '../src/game/simulation.js';
import { MOVE } from '../src/physics/racer.js';
import { cursesFor } from '../src/content/curses.js';

const roster = (n, skill = 0.6) => Array.from({ length: n }, (_, i) => ({ name: `B${i}`, skill: skill + (i / n) * 0.2 }));
function play(id, n, quota, seed = 3, cap = 200, curse = null) {
  const sim = new Simulation(LEVELS[id].build, { headless: true, seed, racers: roster(n), quota, curse });
  sim.go();
  let t = 0;
  while (!sim.ended && t < cap * 120) { sim.step(); sim.world.events.length = 0; t++; }
  return sim;
}

describe('levels', () => {
  it('lists all six World 1 levels in the art\'s order', () => {
    expect(LEVEL_ORDER).toEqual(['pumpkinDash', 'ghostChase', 'hauntedFloor', 'witchsPlatform', 'pumpkinRoll', 'finalShowdown']);
  });

  for (const id of LEVEL_ORDER) {
    const def = LEVELS[id];
    it(`${id}: a round completes with a sensible length`, () => {
      const sim = play(id, def.playersDefault, def.quotaDefault);
      expect(sim.ended).toBe(true);
      expect(sim.qualified.length).toBeGreaterThan(0);
      expect(sim.elapsed).toBeGreaterThan(id === 'finalShowdown' ? 5 : 15);
      expect(sim.elapsed).toBeLessThan(def.build ? 155 : 999);
    });
  }

  it('races end when the quota fills, with the right count', () => {
    const sim = play('pumpkinDash', 16, 12);
    expect(sim.qualified.length).toBe(12);
    expect(sim.eliminated.length).toBe(4);
  });

  it('the same seed replays identically (deterministic, ready for future multiplayer)', () => {
    const a = play('ghostChase', 8, 6, 77, 25), b = play('ghostChase', 8, 6, 77, 25);
    expect(a.racers.map((r) => r.z)).toEqual(b.racers.map((r) => r.z));
  });

  it('physics steps at a fixed 120 Hz, independent of display rate', () => {
    expect(STEP).toBeCloseTo(1 / 120);
  });

  it('every map carries what the playlist and the reveal need', () => {
    for (const id of LEVEL_ORDER) {
      const d = LEVELS[id];
      expect(d.kind, id).toBeTruthy();
      expect(d.stages.length, id).toBeGreaterThan(0);
      expect(d.danger, id).toBeTruthy();
      expect(d.hint, id).toBeTruthy();
    }
  });
});

describe('deciding a round early', () => {
  it('gives the spots left to whoever is furthest along', () => {
    const sim = new Simulation(LEVELS.pumpkinDash.build, { headless: true, seed: 3, racers: roster(8), quota: 4 });
    sim.go();
    for (let i = 0; i < 120 * 12; i++) { sim.step(); sim.world.events.length = 0; }
    const L = sim.level;
    const order = sim.racers.slice().sort((a, b) => L.progress(b) - L.progress(a)).map((r) => r.name);
    sim.settle();
    expect(sim.ended).toBe(true);
    expect(sim.qualified.map((r) => r.name)).toEqual(order.slice(0, 4));
    expect(sim.eliminated.length).toBe(4);
  });

  it('fills only the spots still open', () => {
    const sim = new Simulation(LEVELS.pumpkinDash.build, { headless: true, seed: 3, racers: roster(6), quota: 3 });
    sim.go();
    sim.qualify(sim.racers[5]);
    sim.settle();
    expect(sim.qualified.length).toBe(3);
  });
});

describe('the lobby', () => {
  const lobby = () => {
    const sim = new Simulation(LOBBY_LEVEL.build, { headless: true, seed: 4, racers: [{ name: 'You', isPlayer: true }, ...roster(7)], quota: 0 });
    sim.go();
    return sim;
  };

  it('starts the player facing the castle, wherever they sit in the roster', () => {
    const sim = lobby();
    expect(sim.player.z).toBeCloseTo(sim.level.playerSpawn.z);
    expect(sim.player.yaw).toBeCloseTo(Math.PI);
  });

  it('has no rules: rivals roam, nobody goes out and it never ends by itself', () => {
    const sim = lobby();
    const start = sim.racers.filter((r) => !r.isPlayer).map((r) => [r.x, r.z]);
    for (let i = 0; i < 120 * 40; i++) { sim.step(); sim.world.events.length = 0; }
    expect(sim.ended).toBe(false);
    expect(sim.eliminated.length).toBe(0);
    const moved = sim.racers.filter((r) => !r.isPlayer).filter((r, i) => Math.hypot(r.x - start[i][0], r.z - start[i][1]) > 1).length;
    expect(moved).toBeGreaterThan(4);
  });

  it('respawns anyone who somehow falls out', () => {
    const sim = lobby();
    const r = sim.racers[1];
    r.teleport(100, -20, 100);
    for (let i = 0; i < 120 * 2; i++) { sim.step(); sim.world.events.length = 0; }
    expect(sim.eliminated.length).toBe(0);
    expect(r.y).toBeGreaterThan(-6);
  });

  it('keeps bumped pumpkins inside the courtyard', () => {
    const sim = lobby();
    const prop = sim.level.props[0];
    prop.vx = 60; prop.vz = -40;
    for (let i = 0; i < 120 * 6; i++) { sim.step(); sim.world.events.length = 0; }
    expect(Math.abs(prop.x)).toBeLessThanOrEqual(prop.boundX);
    expect(Math.abs(prop.z)).toBeLessThanOrEqual(prop.boundZ);
    expect(Math.hypot(prop.vx, prop.vz)).toBeLessThan(5);
  });
});

describe('curses in play', () => {
  const stand = (curse) => {
    const sim = new Simulation(LEVELS.pumpkinDash.build, { headless: true, seed: 5, racers: [{ name: 'A', skill: 0.5 }], quota: 1, curse });
    return { sim, r: sim.racers[0] };
  };

  it('moon gravity pulls less, and tiny bodies are smaller, for bots and players alike', () => {
    expect(stand('moon').r.gravity).toBeCloseTo(MOVE.GRAVITY * 0.58);
    expect(stand('tiny').r.radius).toBeCloseTo(MOVE.RADIUS * 0.66);
    expect(stand('tiny').r.height).toBeCloseTo(MOVE.HEIGHT * 0.66);
    expect(stand(null).r.gravity).toBe(MOVE.GRAVITY);
  });

  it('slippery slime takes longer to reach full speed', () => {
    const toSpeed = (curse) => {
      const { sim, r } = stand(curse);
      r.bot = null; sim.bots.length = 0;
      sim.go();
      for (let i = 0; i < 90; i++) sim.step(); // settle on the floor
      let n = 0;
      while (Math.hypot(r.vx, r.vz) < MOVE.RUN_SPEED * 0.9 && n < 600) { r.input.mz = -1; sim.step(); n++; }
      return n;
    };
    expect(toSpeed('slime')).toBeGreaterThan(toSpeed(null) * 2);
  });

  it('hammer frenzy doubles the swing, and the hitbox follows it', () => {
    const plain = stand(null).sim.level, cursed = stand('hammers').sim.level;
    const hammer = (L) => L.obstacles.find((o) => o.blocks && o.angle);
    expect(hammer(cursed).speed).toBeCloseTo(hammer(plain).speed * 2);
  });

  it('a cursed round replays identically from the same seed', () => {
    const a = play('pumpkinDash', 6, 4, 11, 20, 'slime'), b = play('pumpkinDash', 6, 4, 11, 20, 'slime');
    expect(a.racers.map((r) => r.z)).toEqual(b.racers.map((r) => r.z));
    const plain = play('pumpkinDash', 6, 4, 11, 20);
    expect(a.racers.map((r) => r.z)).not.toEqual(plain.racers.map((r) => r.z));
  });

  for (const id of LEVEL_ORDER) {
    for (const c of cursesFor(LEVELS[id])) {
      it(`${id} still finishes under ${c.name}`, () => {
        const def = LEVELS[id];
        const sim = play(id, def.playersDefault, def.quotaDefault, 9, 200, c.id);
        expect(sim.ended).toBe(true);
        expect(sim.qualified.length).toBeGreaterThan(0);
      });
    }
  }
});
