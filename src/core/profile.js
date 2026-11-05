// Player profile: progress, economy, missions, daily reward and the event track.
// Saved through the CrazyGames Data module when available (cloud sync, guest-to-account migration),
// falling back to localStorage on other hosts.
import { defaultOwned, BUNDLES, SHOP } from '../assets/cosmetics.js';
import { sdk } from './sdk.js';
import { SAY } from '../content/terms.js';

const KEY = 'pumpkinparty.save';
const DAY = 86400000;

export const SEASON_DAYS = 14;

/** Event rewards, tier by tier. The last is exclusive to the event, per the art's "exclusive rewards". */
export const EVENT_TRACK = [
  { need: 20, reward: { coins: 60 } },
  { need: 50, reward: { gems: 5 } },
  { need: 90, reward: { item: ['glasses', 'pixel'] } },
  { need: 140, reward: { coins: 120 } },
  { need: 200, reward: { item: ['trail', 'embers'] } },
  { need: 270, reward: { gems: 10 } },
  { need: 350, reward: { item: ['hat', 'sunset'] } },
  { need: 440, reward: { coins: 220 } },
  { need: 540, reward: { item: ['emote', 'boo'] } },
  { need: 650, reward: { gems: 20 } },
  { need: 780, reward: { item: ['trail', 'ghosts'] } },
  { need: 950, reward: { item: ['skin', 'goldking'] } },
];

export const DAILY_REWARDS = [
  { coins: 50 }, { coins: 75 }, { gems: 3 }, { coins: 120 }, { gems: 5 }, { coins: 200 }, { gems: 10, item: ['hat', 'rosy'] },
];

const MISSION_POOL = [
  { id: 'qualify3', text: SAY.getSpared(3), need: 3, stat: 'qualify', coins: 50, event: 12 },
  { id: 'qualify6', text: SAY.getSpared(6), need: 6, stat: 'qualify', coins: 90, event: 18 },
  { id: 'match2', text: 'Play 2 matches', need: 2, stat: 'match', coins: 40, event: 10 },
  { id: 'jump40', text: 'Jump 40 times', need: 40, stat: 'jump', coins: 40, event: 8 },
  { id: 'dive12', text: 'Dive 12 times', need: 12, stat: 'dive', coins: 40, event: 8 },
  { id: 'final1', text: SAY.reachFinal(), need: 1, stat: 'final', coins: 80, event: 16 },
  { id: 'win1', text: SAY.winPrize(), need: 1, stat: 'win', gems: 5, coins: 60, event: 25 },
  { id: 'top3', text: 'Finish a race in the top 3', need: 1, stat: 'podium', coins: 70, event: 14 },
  { id: 'survive2', text: 'Survive 2 survival rounds', need: 2, stat: 'survive', coins: 60, event: 12 },
  { id: 'bounce6', text: 'Hit 6 bounce pads', need: 6, stat: 'bounce', coins: 40, event: 8 },
  { id: 'coins200', text: 'Earn 200 coins from rounds', need: 200, stat: 'earned', coins: 40, gems: 2, event: 10 },
];

const dayNumber = (t = Date.now()) => Math.floor(t / DAY);

function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function defaults() {
  return {
    v: 1,
    coins: 150, gems: 5, xp: 0, level: 1,
    owned: defaultOwned(),
    equip: { skin: 'pumpkin', hat: 'none', glasses: 'none', trail: 'none', emote: 'wave' },
    seen: {},
    stats: { matches: 0, rounds: 0, qualified: 0, wins: 0, finals: 0, jumps: 0, dives: 0, hits: 0, falls: 0, streak: 0, bestStreak: 0, recent: [] },
    missions: { day: 0, list: [] },
    daily: { lastDay: 0, streak: 0 },
    event: { season: -1, points: 0, claimed: [] },
    settings: { music: 0.7, sfx: 0.9, quality: 'auto', sens: 1, invertY: false, reducedShake: false, showHints: true },
    flags: { tutorial: false, firstMatch: false },
    freeCoinsDay: 0, freeCoinsCount: 0,
    guestName: null,
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = merge(base[k], over[k]);
    else base[k] = over[k];
  }
  // Keep unknown keys in owned lists and stats maps so old saves survive updates.
  for (const k of Object.keys(over)) if (base[k] === undefined) base[k] = over[k];
  return base;
}

export class Profile {
  constructor() {
    this.d = defaults();
    this.listeners = new Set();
    this.saveTimer = null;
    this.storage = 'none';
  }

  /** Read order: SDK Data module (which itself handles guests) and then localStorage. */
  load() {
    let raw = null;
    const data = sdk.data;
    if (data) {
      try { raw = data.getItem(KEY); this.storage = 'sdk'; } catch { raw = null; }
    }
    if (raw === null || raw === undefined) {
      try { raw = localStorage.getItem(KEY); if (raw && this.storage !== 'sdk') this.storage = 'local'; } catch { raw = null; }
    }
    if (raw) {
      try { this.d = merge(defaults(), JSON.parse(raw)); } catch { this.d = defaults(); }
    }
    if (this.storage === 'none') this.storage = data ? 'sdk' : 'local';
    this.refreshDaily();
    this.refreshSeason();
    return this;
  }

  save(immediate = false) {
    const write = () => {
      this.saveTimer = null;
      const s = JSON.stringify(this.d);
      const data = sdk.data;
      if (data) {
        try { data.setItem(KEY, s); return; } catch { /* e.g. dataModuleDisabled: fall through to local */ }
      }
      try { localStorage.setItem(KEY, s); } catch { /* private mode: progress stays in memory */ }
    };
    if (immediate) { if (this.saveTimer) clearTimeout(this.saveTimer); write(); return; }
    if (!this.saveTimer) this.saveTimer = setTimeout(write, 500);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) f(this.d); this.save(); }

  // ------------------------------------------------------------ identity
  get displayName() {
    if (sdk.user?.username) return sdk.user.username;
    if (!this.d.guestName) {
      const a = ['Spooky', 'Lucky', 'Sneaky', 'Jolly', 'Wobbly', 'Mighty', 'Tiny', 'Zippy'];
      const b = ['Pumpkin', 'Ghost', 'Gourd', 'Bat', 'Mummy', 'Witch', 'Goblin', 'Skull'];
      this.d.guestName = `${a[Math.floor(Math.random() * a.length)]}${b[Math.floor(Math.random() * b.length)]}${10 + Math.floor(Math.random() * 90)}`;
      this.save();
    }
    return this.d.guestName;
  }
  get avatarUrl() { return sdk.user?.profilePictureUrl || null; }

  // ------------------------------------------------------------ currency and items
  addCoins(n) { this.d.coins += n; this.changed(); }
  addGems(n) { this.d.gems += n; this.changed(); }
  canAfford(price, currency = 'coins') { return this.d[currency] >= price; }
  owns(kind, id) { return (this.d.owned[kind] || []).includes(id); }
  grant(kind, id) {
    const list = this.d.owned[kind] || (this.d.owned[kind] = []);
    if (!list.includes(id)) list.push(id);
    this.changed();
  }
  buy(kind, id) {
    const item = SHOP[kind]?.[id];
    if (!item || this.owns(kind, id) || item.price < 0) return false;
    if (this.d.coins < item.price) return false;
    this.d.coins -= item.price;
    this.grant(kind, id);
    return true;
  }
  buyBundle(id) {
    const b = BUNDLES[id];
    if (!b || this.bundleOwned(id) || this.d.coins < b.price) return false;
    this.d.coins -= b.price;
    for (const [k, i] of b.items) this.grant(k, i);
    this.changed();
    return true;
  }
  bundleOwned(id) { return BUNDLES[id].items.every(([k, i]) => this.owns(k, i)); }
  equip(kind, id) { if (kind === 'emote' || this.owns(kind, id)) { this.d.equip[kind] = id; this.changed(); } }

  // ------------------------------------------------------------ xp
  xpFor(level) { return 60 + (level - 1) * 40; }
  addXP(n) {
    this.d.xp += n;
    let ups = 0;
    while (this.d.xp >= this.xpFor(this.d.level)) {
      this.d.xp -= this.xpFor(this.d.level);
      this.d.level++;
      ups++;
    }
    if (ups) { this.d.coins += 40 * ups; this.d.gems += ups; }
    this.changed();
    return ups;
  }

  // ------------------------------------------------------------ missions
  refreshDaily() {
    const today = dayNumber();
    if (this.d.missions.day !== today) {
      const R = rngFrom(today * 7919);
      const pool = MISSION_POOL.slice();
      const list = [];
      for (let i = 0; i < 3; i++) {
        const k = Math.floor(R() * pool.length);
        const m = pool.splice(k, 1)[0];
        list.push({ id: m.id, progress: 0, claimed: false });
      }
      this.d.missions = { day: today, list };
    }
  }
  missionDef(id) { return MISSION_POOL.find((m) => m.id === id); }
  missions() {
    this.refreshDaily();
    return this.d.missions.list.map((m) => ({ ...this.missionDef(m.id), ...m, done: m.progress >= this.missionDef(m.id).need }));
  }
  track(stat, amount = 1) {
    let notify = null;
    for (const m of this.d.missions.list) {
      const def = this.missionDef(m.id);
      if (!def || def.stat !== stat || m.claimed || m.progress >= def.need) continue;
      m.progress = Math.min(def.need, m.progress + amount);
      if (m.progress >= def.need) notify = def;
    }
    this.save();
    return notify;
  }
  claimMission(id) {
    const m = this.d.missions.list.find((q) => q.id === id);
    const def = this.missionDef(id);
    if (!m || m.claimed || m.progress < def.need) return null;
    m.claimed = true;
    if (def.coins) this.d.coins += def.coins;
    if (def.gems) this.d.gems += def.gems;
    if (def.event) this.addEventPoints(def.event);
    this.changed();
    return def;
  }
  missionsReady() { return this.missions().filter((m) => m.done && !m.claimed).length; }

  // ------------------------------------------------------------ daily login reward
  dailyAvailable() { return this.d.daily.lastDay !== dayNumber(); }
  dailyStep() {
    // A missed day restarts the seven-day calendar, but never takes anything away.
    const today = dayNumber();
    const cont = today - this.d.daily.lastDay === 1;
    const streak = this.d.daily.lastDay === 0 || !cont ? 0 : this.d.daily.streak;
    return streak % 7;
  }
  claimDaily() {
    if (!this.dailyAvailable()) return null;
    const step = this.dailyStep();
    const r = DAILY_REWARDS[step];
    this.d.daily = { lastDay: dayNumber(), streak: step + 1 };
    if (r.coins) this.d.coins += r.coins;
    if (r.gems) this.d.gems += r.gems;
    if (r.item) this.grant(r.item[0], r.item[1]);
    this.changed();
    return r;
  }

  // ------------------------------------------------------------ rewarded free coins, capped per day
  freeCoinsLeft() {
    if (this.d.freeCoinsDay !== dayNumber()) { this.d.freeCoinsDay = dayNumber(); this.d.freeCoinsCount = 0; }
    return Math.max(0, 3 - this.d.freeCoinsCount);
  }
  claimFreeCoins() {
    const amt = [60, 40, 25][this.d.freeCoinsCount] ?? 25;
    this.d.freeCoinsCount++;
    this.d.coins += amt;
    this.changed();
    return amt;
  }

  // ------------------------------------------------------------ event
  seasonNumber() { return Math.floor(dayNumber() / SEASON_DAYS); }
  seasonEndsIn() {
    const end = (this.seasonNumber() + 1) * SEASON_DAYS * DAY;
    return Math.max(0, end - Date.now());
  }
  refreshSeason() {
    const s = this.seasonNumber();
    if (this.d.event.season !== s) this.d.event = { season: s, points: 0, claimed: [] };
  }
  addEventPoints(n) { this.refreshSeason(); this.d.event.points += n; this.save(); }
  eventTierReady(i) { return this.d.event.points >= EVENT_TRACK[i].need && !this.d.event.claimed.includes(i); }
  eventReadyCount() { return EVENT_TRACK.filter((_, i) => this.eventTierReady(i)).length; }
  claimEvent(i) {
    if (!this.eventTierReady(i)) return null;
    this.d.event.claimed.push(i);
    const r = EVENT_TRACK[i].reward;
    if (r.coins) this.d.coins += r.coins;
    if (r.gems) this.d.gems += r.gems;
    if (r.item) this.grant(r.item[0], r.item[1]);
    this.changed();
    return r;
  }

  // ------------------------------------------------------------ rounds met so far, for Practice
  markSeen(id) { if (!this.d.seen[id]) { this.d.seen[id] = true; this.save(); } }
  hasSeen(id) { return !!this.d.seen[id]; }

  /** How much of the game this player has met, reported to the platform. */
  completion(totalRounds) {
    const met = Object.keys(this.d.seen).length / Math.max(1, totalRounds);
    return Math.min(100, met * 70 + Math.min(this.d.stats.wins, 6) * 5);
  }

  /** Rolling win record over the last matches, which feeds the difficulty director. */
  recordMatch(reachedRound, won) {
    const st = this.d.stats;
    st.matches++;
    st.recent.push(won ? 5 : reachedRound);
    if (st.recent.length > 8) st.recent.shift();
    if (won) { st.wins++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); } else st.streak = 0;
    this.changed();
  }
}

export const profile = new Profile();
