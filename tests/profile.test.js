import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });

const { Profile, EVENT_TRACK, DAILY_REWARDS } = await import('../src/core/profile.js');
const { difficulty, botSkill, earlyExits } = await import('../src/game/director.js');

describe('profile and economy', () => {
  let p;
  beforeEach(() => { store.clear(); p = new Profile().load(); });

  it('starts with a pumpkin and enough for a head start', () => {
    expect(p.d.equip.skin).toBe('pumpkin');
    expect(p.owns('skin', 'pumpkin')).toBe(true);
    expect(p.owns('skin', 'ghost')).toBe(false);
    expect(p.d.coins).toBeGreaterThan(0);
  });

  it('buys items only with enough coins, and never event exclusives', () => {
    p.d.coins = 100;
    expect(p.buy('skin', 'ghost')).toBe(false);
    p.d.coins = 500;
    expect(p.buy('skin', 'ghost')).toBe(true);
    expect(p.d.coins).toBe(200);
    expect(p.owns('skin', 'ghost')).toBe(true);
    p.d.coins = 99999;
    expect(p.buy('skin', 'goldking')).toBe(false);
  });

  it('levels up and pays a reward', () => {
    const coins = p.d.coins;
    expect(p.addXP(p.xpFor(1))).toBe(1);
    expect(p.d.level).toBe(2);
    expect(p.d.coins).toBeGreaterThan(coins);
  });

  it('daily missions progress, complete and pay out once', () => {
    const m = p.missions()[0];
    expect(p.claimMission(m.id)).toBe(null);
    p.track(m.stat, m.need);
    const c = p.d.coins;
    expect(p.claimMission(m.id)).toBeTruthy();
    expect(p.d.coins).toBeGreaterThanOrEqual(c);
    expect(p.claimMission(m.id)).toBe(null);
  });

  it('daily reward can be claimed once a day', () => {
    expect(p.dailyAvailable()).toBe(true);
    const r = p.claimDaily();
    expect(r).toEqual(DAILY_REWARDS[0]);
    expect(p.dailyAvailable()).toBe(false);
    expect(p.claimDaily()).toBe(null);
  });

  it('event track unlocks in order with candy, and the top reward is exclusive', () => {
    expect(p.eventTierReady(0)).toBe(false);
    p.addEventPoints(EVENT_TRACK[0].need);
    expect(p.eventTierReady(0)).toBe(true);
    expect(p.claimEvent(0)).toBeTruthy();
    expect(p.claimEvent(0)).toBe(null);
    expect(EVENT_TRACK[EVENT_TRACK.length - 1].reward.item).toEqual(['skin', 'goldking']);
  });

  it('remembers the rounds a player has met, for Practice', () => {
    expect(p.hasSeen('ghostChase')).toBe(false);
    p.markSeen('ghostChase');
    p.save(true);
    expect(new Profile().load().hasSeen('ghostChase')).toBe(true);
  });

  it('reports completion from rounds met and wins, never above 100', () => {
    expect(p.completion(6)).toBe(0);
    for (const id of ['a', 'b', 'c']) p.markSeen(id);
    expect(p.completion(6)).toBe(35);
    p.d.stats.wins = 40;
    expect(p.completion(3)).toBe(100);
  });

  it('has no trace of stars or second chances', () => {
    expect(p.d.stars).toBeUndefined();
    expect(p.d.flags.reviveUsed).toBeUndefined();
    expect(p.starsFor).toBeUndefined();
  });

  it('saves and reloads progress through storage', () => {
    p.d.coins = 4242;
    p.save(true);
    const q = new Profile().load();
    expect(q.d.coins).toBe(4242);
    expect(q.d.owned.skin).toContain('pumpkin');
  });

  it('a corrupt save falls back to defaults instead of crashing', () => {
    store.set('pumpkinparty.save', '{not json');
    expect(new Profile().load().d.level).toBe(1);
  });
});

describe('difficulty director', () => {
  it('goes easy on a new player and tightens with experience', () => {
    const fresh = difficulty({ matches: 0, recent: [], streak: 0 });
    const vet = difficulty({ matches: 30, recent: [5, 4, 5, 3, 4], streak: 3 });
    expect(fresh).toBeLessThan(0.2);
    expect(vet).toBeGreaterThan(0.75);
  });

  it('eases off after repeated early knockouts', () => {
    const a = difficulty({ matches: 10, recent: [3, 3, 3], streak: 0 });
    const b = difficulty({ matches: 10, recent: [1, 1, 1], streak: 0 });
    expect(b).toBeLessThan(a);
  });

  it('losing-streak protection grows with the streak, stays capped, and ends on the first good run', () => {
    const at = (recent) => difficulty({ matches: 12, recent, streak: 0 });
    const base = [3, 3, 3, 3, 3, 3, 3, 3];
    const withStreak = (n) => [...base.slice(n), ...Array(n).fill(1)];
    expect(earlyExits(withStreak(4))).toBe(4);
    expect(earlyExits([1, 1, 3])).toBe(0);
    const drop = (n) => at(base) - at(withStreak(n));
    // Light on purpose. Most of each drop comes from the streak term, and none of it can exceed the cap.
    for (let n = 2; n < 6; n++) expect(drop(n + 1)).toBeGreaterThan(drop(n));
    expect(drop(8) - ((3 - 1) * 0.05)).toBeLessThanOrEqual(0.2401);
    expect(at([1, 1, 1, 1, 1, 4])).toBeGreaterThan(at([1, 1, 1, 1, 1, 1]) + 0.2);
  });

  it('bot skill stays in range', () => {
    for (let i = 0; i < 100; i++) {
      const s = botSkill(Math.random(), i % 5, Math.random);
      expect(s).toBeGreaterThanOrEqual(0.08);
      expect(s).toBeLessThanOrEqual(0.98);
    }
  });
});
