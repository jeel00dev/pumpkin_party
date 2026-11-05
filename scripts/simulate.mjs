// Headless bot simulation: run whole rounds without rendering to check every level can be completed,
// and how long rounds really last.
//   node scripts/simulate.mjs [levelId|all] [runs] [--difficulty=low|medium|high|all] [--curse=id|all] [--players=n]
import { LEVELS } from '../src/levels/index.js';
import { Simulation } from '../src/game/simulation.js';
import { botSkill } from '../src/game/director.js';
import { cursesFor } from '../src/content/curses.js';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const which = pos[0] || 'all';
const runs = +(pos[1] || 6);
const ids = which === 'all' ? Object.keys(LEVELS) : [which];
const DIFFICULTY = { low: 0.15, medium: 0.5, high: 0.85 };
const difficulties = flags.difficulty === 'all' ? Object.keys(DIFFICULTY) : [flags.difficulty || 'medium'];

function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function runLevel(id, diffName, curse) {
  const def = LEVELS[id];
  const d = DIFFICULTY[diffName];
  const stats = { first: [], last: [], spared: 0, falls: 0, hits: 0, dur: [], wall: 0, n: 0, unfinished: 0 };
  const N = +(flags.players || def.playersDefault);
  const quota = flags.players ? Math.max(1, Math.round(N * (def.quotaDefault / def.playersDefault))) : def.quotaDefault;
  for (let run = 0; run < runs; run++) {
    const rand = seeded(1000 + run * 31);
    const racers = [];
    for (let i = 0; i < N; i++) racers.push({ name: `Bot${i}`, skill: botSkill(d, 1, rand) });
    const t0 = performance.now();
    const sim = new Simulation(def.build, { headless: true, seed: 1000 + run * 31, racers, quota, difficulty: d, curse });
    sim.go();
    let safety = 0;
    while (!sim.ended && safety < 120 * 300) { sim.step(); sim.world.events.length = 0; safety++; }
    stats.wall += performance.now() - t0;
    if (!sim.ended) stats.unfinished++;
    stats.dur.push(sim.elapsed);
    stats.spared += sim.qualified.length;
    stats.n += N;
    for (const r of sim.racers) { stats.falls += r.falls; stats.hits += r.hits; }
    if (sim.qualified.length) { stats.first.push(sim.qualified[0].finishTime); stats.last.push(sim.qualified[sim.qualified.length - 1].finishTime); }
  }
  const label = `${id.padEnd(16)} ${diffName.padEnd(6)} ${(curse || '-').padEnd(8)}`;
  console.log(`${label} rounds=${runs} dur=${avg(stats.dur).toFixed(1)}s (${Math.min(...stats.dur).toFixed(0)}-${Math.max(...stats.dur).toFixed(0)}) first=${avg(stats.first).toFixed(1)}s last=${avg(stats.last).toFixed(1)}s spared=${(stats.spared / runs).toFixed(1)}/${stats.n / runs} falls/bot=${(stats.falls / stats.n).toFixed(2)} hits/bot=${(stats.hits / stats.n).toFixed(2)} sim=${(stats.wall / runs / 1000).toFixed(2)}s${stats.unfinished ? ` UNFINISHED=${stats.unfinished}` : ''}`);
}

for (const id of ids) {
  const curses = flags.curse === 'all' ? [null, ...cursesFor(LEVELS[id]).map((c) => c.id)] : [flags.curse || null];
  for (const diff of difficulties) for (const curse of curses) runLevel(id, diff, curse);
}
