import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels/index.js';
import { buildPlaylist, quotaFor, trickFor } from '../src/game/playlist.js';
import { CURSES, cursesFor, modsFor, NO_MODS } from '../src/content/curses.js';

function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const RUNS = 400;

describe('match playlist', () => {
  for (const lobby of [16, 20, 24]) {
    it(`keeps its rules on every draw, with ${lobby} racers`, () => {
      for (let seed = 1; seed <= RUNS; seed++) {
        const plan = buildPlaylist(LEVELS, { matchIndex: 1 + (seed % 6), rand: seeded(seed), lobby });
        const ids = plan.map((r) => r.level);
        expect(new Set(ids).size, 'no repeats').toBe(ids.length);
        const body = plan.slice(0, -1).map((r) => LEVELS[r.level]);
        expect(body.some((d) => d.kind === 'race'), 'a race').toBe(true);
        expect(body.some((d) => d.kind !== 'race'), 'a non-race').toBe(true);
        expect(plan.filter((r) => r.wildcard).length, 'one wildcard').toBe(1);
        expect(LEVELS[plan.at(-1).level].stages).toContain('final');
        expect(LEVELS[plan[0].level].stages, 'forgiving opener').toContain('opener');
        expect(plan.at(-1).quota).toBe(1);
        for (let i = 1; i < plan.length; i++) expect(plan[i].quota).toBeLessThan(plan[i - 1].quota);
      }
    });
  }

  it('starts a first match on the most readable course', () => {
    for (let seed = 1; seed <= RUNS; seed++) expect(buildPlaylist(LEVELS, { matchIndex: 0, rand: seeded(seed) })[0].level).toBe('pumpkinDash');
  });

  it('varies between matches', () => {
    const openers = new Set(), finals = new Set(), seconds = new Set();
    for (let seed = 1; seed <= RUNS; seed++) {
      const plan = buildPlaylist(LEVELS, { matchIndex: 5, rand: seeded(seed) });
      openers.add(plan[0].level); seconds.add(plan[1].level); finals.add(plan.at(-1).level);
    }
    expect(openers.size).toBeGreaterThan(1);
    expect(seconds.size).toBeGreaterThan(2);
  });

  it('debuts one new game type per match, and holds back those not due yet', () => {
    const catalog = {
      a: { id: 'a', kind: 'race', stages: ['opener', 'middle'], firstMatch: true },
      b: { id: 'b', kind: 'race', stages: ['opener', 'middle'] },
      c: { id: 'c', kind: 'survive', stages: ['middle'] },
      d: { id: 'd', kind: 'survive', stages: ['middle'] },
      e: { id: 'e', kind: 'collect', stages: ['middle'], debut: 1 },
      f: { id: 'f', kind: 'tag', stages: ['middle'], debut: 2 },
      z: { id: 'z', kind: 'last', stages: ['final'] },
    };
    for (let seed = 1; seed <= RUNS; seed++) {
      const ids = (m) => buildPlaylist(catalog, { matchIndex: m, rand: seeded(seed) });
      expect(ids(0).map((r) => r.level)).not.toContain('e');
      expect(ids(0).map((r) => r.level)).not.toContain('f');
      const one = ids(1);
      expect(one.map((r) => r.level)).toContain('e');
      expect(one.find((r) => r.level === 'e').isNew).toBe(true);
      expect(one.map((r) => r.level)).not.toContain('f');
      expect(ids(2).map((r) => r.level)).toContain('f');
    }
  });

  it('adapts when fewer racers survive than planned, and always knocks someone out', () => {
    expect(quotaFor(9, 12)).toBe(9);
    expect(quotaFor(9, 9)).toBe(8);
    expect(quotaFor(3, 2)).toBe(1);
    expect(quotaFor(1, 3)).toBe(1);
  });
});

describe('Trick or Treat', () => {
  it('never appears in a first match, and at most twice in any other', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      expect(trickFor(LEVELS.pumpkinDash, { matchIndex: 0, rand: seeded(seed) })).toBe(null);
      expect(trickFor(LEVELS.pumpkinDash, { matchIndex: 3, offered: 2, rand: seeded(seed) })).toBe(null);
    }
  });

  it('appears at only some reveals', () => {
    let offers = 0;
    for (let seed = 1; seed <= RUNS; seed++) if (trickFor(LEVELS.pumpkinDash, { matchIndex: 3, rand: seeded(seed) })) offers++;
    expect(offers / RUNS).toBeGreaterThan(0.3);
    expect(offers / RUNS).toBeLessThan(0.6);
  });
});

describe('curses', () => {
  it('only offers the hammer curse on maps with hammers', () => {
    expect(cursesFor(LEVELS.pumpkinDash).map((c) => c.id)).toContain('hammers');
    expect(cursesFor(LEVELS.witchsPlatform).map((c) => c.id)).not.toContain('hammers');
  });

  it('every curse changes something, and no curse is a reversed control', () => {
    for (const c of Object.values(CURSES)) {
      const m = modsFor(c.id);
      expect(Object.keys(m).some((k) => m[k] !== NO_MODS[k]), c.id).toBe(true);
      expect(`${c.name} ${c.hint}`.toLowerCase()).not.toMatch(/revers|invert|backwards/);
      expect(c.hint.length).toBeLessThan(70);
    }
  });

  it('falls back to no change for an unknown curse', () => {
    expect(modsFor('nothing')).toEqual({ ...NO_MODS });
    expect(modsFor(null)).toEqual({ ...NO_MODS });
  });
});
