// One match from the lobby to the last reward: reveals, rounds, standings and payouts.
//
// Flow: lobby -> reveal -> round -> standings -> next reveal ... -> final -> results.
// A brand-new player skips straight to the first round, and Play Again skips the lobby.
import { RoundView } from './roundview.js';
import { Lobby } from './lobby.js';
import { LEVELS } from '../levels/index.js';
import { buildPlaylist, quotaFor, trickFor } from './playlist.js';
import { botSkill, buildRoster, difficulty, makePacing } from './director.js';
import { CURSES } from '../content/curses.js';
import { SAY } from '../content/terms.js';
import { Reveal } from '../ui/reveal.js';

/** Seconds. Lobby plus reveal, and standings plus reveal, each stay under five. */
export const FLOW = { lobby: 2.4, standings: 2.6, intro: 1.4, beat: 0.8 };
const COUNT_BEATS = 3;

export class Match {
  /** @param {object} o { practice: levelId | null, quick: first launch, straight into play, skipLobby, trick: force a curse offer } */
  constructor(app, o = {}) {
    this.app = app;
    this.practice = o.practice || null;
    this.quick = !!o.quick;
    this.skipLobby = !!o.skipLobby;
    this.forceTrick = o.trick ?? null;
    const st = app.profile.d.stats;
    this.matchIndex = st.matches || 0;
    this.diff = difficulty(st);
    let s = (Date.now() & 0xffffff) | 1;
    this.rand = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    if (this.practice) {
      const def = LEVELS[this.practice];
      // Survival practice plays out to the last rival, so a run lasts as long as you do.
      this.plan = [{ level: def.id, stage: 'practice', quota: def.mode === 'race' ? def.quotaDefault : 1 }];
      this.roster = buildRoster(def.playersDefault - 1, this.diff, this.rand);
    } else {
      this.plan = buildPlaylist(LEVELS, { matchIndex: this.matchIndex, rand: this.rand, lobby: app.lobbySize });
      this.roster = buildRoster(app.lobbySize - 1, this.diff, this.rand);
    }
    this.roundIndex = 0;
    this.totals = { coins: 0, xp: 0, gems: 0, event: 0, spared: 0 };
    this.phase = 'none';
    this.t = 0;
    this.lastCount = -1;
    this.curse = null;
    this.tricksOffered = 0;
    this.view = null;
    this.reveal = null;
    this.lobby = null;
    this.onStandingsEnd = null;
    this.timeline = [];
    this.mark('created');
  }

  get hud() { return this.app.hud; }

  /** Timestamps for each step of the flow, which the wait-time tests read. */
  mark(name) { this.timeline.push({ name, at: performance.now() }); }

  setPhase(name) { this.phase = name; this.mark(name); }

  begin() {
    if (this.practice || this.quick) this.startRound(0);
    else if (this.skipLobby) { this.app.menuBackdrop('menu'); this.toReveal(0); } else this.toLobby();
  }

  /** The racers still in, the player among them. */
  entrants() {
    const eq = this.app.profile.d.equip;
    const out = [{ isPlayer: true, name: this.app.profile.displayName, skin: eq.skin, hat: eq.hat, glasses: eq.glasses, trail: eq.trail }];
    for (const b of this.roster) if (!b.out) out.push({ ...b, skill: botSkill(this.diff, this.roundIndex, this.rand) });
    // Spawn the player mid-pack so they start with rivals around them.
    const slot = Math.min(out.length - 1, Math.floor(out.length * (0.55 + this.rand() * 0.3)));
    const pl = out.shift();
    out.splice(slot, 0, pl);
    return out;
  }

  // ---------------------------------------------------------------- lobby
  toLobby() {
    const app = this.app;
    this.lobby = new Lobby(this);
    this.view = this.lobby.view;
    app.ui.clear();
    document.body.dataset.screen = 'lobby';
    app.setActiveView(this.view);
    app.audio.music('menu');
    this.t = FLOW.lobby;
    this.setPhase('lobby');
    app.input.setEnabled(true);
    app.input.pointerLockWanted = false;
    this.hud.mountLobby({ total: this.roster.length, onReady: () => this.endLobby() });
  }

  updateLobby(dt) {
    this.t -= dt;
    this.lobby.update(dt, 1 - this.t / FLOW.lobby);
    this.hud.setLobbyCount(this.lobby.arrived);
    if (this.t <= 0) this.endLobby();
  }

  endLobby() {
    if (this.phase !== 'lobby') return;
    this.app.input.setEnabled(false);
    this.hud.unmount();
    this.toReveal(0);
  }

  // ---------------------------------------------------------------- reveal
  toReveal(i) {
    const app = this.app, R = this.plan[i], def = LEVELS[R.level];
    const trick = this.forceTrick ?? trickFor(def, { matchIndex: this.matchIndex, offered: this.tricksOffered, rand: this.rand });
    if (trick) this.tricksOffered++;
    this.curse = null;
    this.roundIndex = i;
    const others = Object.values(LEVELS).filter((d) => d.id !== def.id && (d.debut ?? 0) <= this.matchIndex && !d.stages.includes('final'));
    const alive = this.roster.filter((b) => !b.out).length + 1;
    this.setPhase('reveal');
    this.reveal = new Reveal(app, {
      round: i + 1, total: this.plan.length, def, others, rand: this.rand, wildcard: R.wildcard, isNew: R.isNew, isFinal: R.stage === 'final',
      goal: this.goalText(def, quotaFor(R.quota, alive)),
      curse: trick ? CURSES[trick] : null,
      onDone: (curse) => {
        this.reveal = null;
        this.curse = curse;
        this.startRound(i);
      },
    });
  }

  goalText(def, quota) {
    if (def.mode === 'race') return SAY.raceGoal(quota);
    return quota <= 1 ? SAY.finalGoal() : SAY.surviveGoal(quota);
  }

  // ---------------------------------------------------------------- round
  startRound(i) {
    const app = this.app;
    this.roundIndex = i;
    this.disposeView();
    this.lobby = null;
    app.ui.clear();
    document.body.dataset.screen = 'round';
    const R = this.plan[i], def = LEVELS[R.level];
    const racers = this.entrants();
    this.players = racers.length;
    this.quota = quotaFor(R.quota, racers.length);
    const quick = (this.quick && i === 0) || this.curse === 'fog';
    const seed = 1 + Math.floor(this.rand() * 90000);
    this.view = new RoundView(app, def, {
      seed, racers, quota: this.quota, curse: this.curse,
      difficulty: this.diff,
      pacing: makePacing(this.diff, () => this.view?.sim.player),
      onEvent: (e) => this.onEvent(e),
      intro: quick ? 0 : FLOW.intro,
    });
    if (quick) this.view.intro = null;
    app.setActiveView(this.view);
    this.def = def;
    this.playerOut = false; this.playerIn = false; this.endScheduled = false; this.warned = false;
    this.hud.mount({
      round: i + 1, total: this.plan.length, objective: this.view.level.objective, mode: def.mode,
      levelName: def.name, totalPlayers: racers.length, practice: !!this.practice, curse: this.curse ? CURSES[this.curse] : null,
    });
    this.lastCount = -1;
    app.audio.music(def.stages.includes('final') ? 'final' : 'race');
    if (!this.practice) app.profile.markSeen(def.id);
    if (this.view.intro) {
      this.setPhase('intro');
      this.hud.introCard({ round: i + 1, total: this.plan.length, name: def.name, objective: this.goalText(def, this.quota), hint: def.hint, practice: !!this.practice });
      app.audio.sfx('whoosh', 0.6);
      const skip = () => { this.view?.skipIntro(); };
      window.addEventListener('keydown', skip, { once: true });
      window.addEventListener('pointerdown', skip, { once: true });
      this.removeSkip = () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
    } else this.toCountdown();
    if (!app.profile.d.flags.tutorial && i === 0) this.hud.showTips();
    app.input.setEnabled(true);
    app.input.pointerLockWanted = !app.isTouch;
  }

  toCountdown() {
    this.removeSkip?.();
    this.setPhase('count');
    this.t = 0;
    this.lastCount = -1;
    this.hud.clearMessage();
  }

  update(dt) {
    switch (this.phase) {
      case 'lobby': this.updateLobby(dt); break;
      case 'reveal': this.reveal?.update(dt); break;
      case 'standings':
        this.t -= dt;
        this.app.ui.standingsTick(this.t);
        if (this.t <= 0) this.endStandings();
        break;
      case 'intro':
        this.app.input.clearPresses();
        break;
      case 'count': {
        this.t += dt;
        const left = COUNT_BEATS * FLOW.beat - this.t;
        const n = Math.ceil(left / FLOW.beat);
        if (n !== this.lastCount && n > 0) {
          this.lastCount = n;
          this.hud.message(String(n), 'count', FLOW.beat * 900);
          this.app.audio.sfx('count');
        }
        if (left <= 0) {
          this.view.sim.go();
          this.setPhase('play');
          this.hud.message('GO!', 'go', 800);
          this.app.audio.sfx('go');
          this.app.sdk.gameplayStart();
          this.playStart = performance.now();
        }
        break;
      }
      case 'play': this.updatePlay(dt); break;
      case 'post':
        this.t -= dt;
        if (this.t <= 0) this.finishRound();
        break;
      default:
    }
  }

  updatePlay(dt) {
    const v = this.view, sim = v.sim, L = v.level, p = sim.player;
    const input = this.app.input;
    // Onboarding marks.
    if (this.hud.tips) {
      if (Math.hypot(input.moveX, input.moveY) > 0.3) this.hud.tipDone('move');
      if (p.airTime > 0.1 && !p.grounded) this.hud.tipDone('jump');
      if (p.state === 1) this.hud.tipDone('dive');
      if (v.cam.lookIdle < 0.2) this.hud.tipDone('look');
    }
    // Timer and counters.
    const limit = L.timeLimit || 120;
    const remain = limit - sim.elapsed;
    if (L.mode === 'race') {
      this.hud.setClock(remain, remain < 15);
      this.hud.setSpared(sim.qualified.length);
      this.hud.setRank(p.finished ? p.place : sim.rankOf(p));
    } else {
      this.hud.setClock(remain, remain < 10);
      this.hud.setSpared(sim.racers.filter((r) => !r.eliminated).length);
      this.hud.setRank(0);
    }
    // Chaser warning.
    if (L.chaser && L.chaser.active && p.active && !p.finished) {
      const gap = L.chaser.gap(p);
      this.hud.setWarn(gap < 16 ? `${gap < 8 ? 'BOO! ' : ''}Ghost ${Math.max(0, Math.round(gap))}m behind!` : '');
    } else this.hud.setWarn('');
    // Warn near the end of the clock.
    if (remain < 10 && !this.warned) { this.warned = true; this.app.audio.sfx('count', 0.6); }

    // Once the player's safe, wrap up the round promptly: nobody likes to wait.
    if (this.playerIn && !sim.ended && L.mode === 'race') {
      this.wrapT = (this.wrapT ?? 3.2) - dt;
      if (this.wrapT <= 0) sim.settle();
    }
    // Spectating after a knockout isn't needed in single-player, so results come quickly.
    if (this.playerOut && !this.endScheduled) { this.endScheduled = true; this.phase = 'post'; this.t = 1.9; }
  }

  spookPlayer(caught = false) {
    this.playerOut = true;
    this.hud.message(caught ? 'BOO! Caught!' : SAY.spokenSpooked(), 'red', 1900);
    this.hud.setWarn('');
    this.app.audio.sfx(caught ? 'boo' : 'lose');
    this.app.input.exitLock();
  }

  onEvent(e) {
    const app = this.app, sim = this.view?.sim;
    const profile = app.profile;
    switch (e.type) {
      case 'introEnd':
        this.toCountdown();
        break;
      case 'qualify':
        if (e.racer.isPlayer) {
          this.playerIn = true;
          this.wrapT = 3.2;
          this.place = e.racer.place;
          this.hud.message(this.def.mode === 'last' ? SAY.spokenChampion() : SAY.spokenSpared(), 'gold', 1900);
          this.hud.setWarn('');
          app.input.exitLock();
        }
        break;
      case 'eliminate':
        if (e.racer.isPlayer) {
          this.spookPlayer(e.racer.outReason === 'caught');
          profile.d.stats.falls++;
        } else if (sim && !this.playerOut && sim.level.mode !== 'race') {
          app.audio.sfx('ping', 0.3, 0.8);
        }
        break;
      case 'playerFell':
        profile.d.stats.falls++;
        break;
      case 'playerHit':
        profile.d.stats.hits++;
        break;
      case 'playerJump':
        profile.d.stats.jumps++;
        profile.track('jump');
        break;
      case 'playerDive':
        profile.d.stats.dives++;
        profile.track('dive');
        break;
      case 'playerBounce':
        profile.track('bounce');
        break;
      case 'roundEnd':
        if (this.phase === 'play' && !this.endScheduled) {
          this.endScheduled = true;
          this.phase = 'post';
          this.t = this.playerIn ? 2.2 : 1.9;
          // The player was running when spots filled up.
          if (sim.player.eliminated && !this.playerOut) this.spookPlayer();
        }
        break;
      default:
    }
  }

  /** Round rewards. Small numbers per round add up to about one skin every three matches. */
  roundRewards(placedIn) {
    const base = 14 + this.roundIndex * 7;
    const place = Math.max(0, 12 - (placedIn - 1) * 2);
    return {
      coins: base + place,
      xp: 20 + this.roundIndex * 6,
      // A Trick round pays double candy: that's the whole deal.
      candy: (6 + this.roundIndex * 2) * (this.curse ? 2 : 1),
    };
  }

  // ---------------------------------------------------------------- end of a round
  finishRound() {
    const app = this.app, sim = this.view.sim, p = sim.player, profile = app.profile;
    app.sdk.gameplayStop();
    app.input.setEnabled(false);
    this.hud.unmount();
    profile.d.stats.rounds++;
    const time = p.finished ? p.finishTime : sim.elapsed;
    // A knockout ends the player's round early, so the rest of it is decided here.
    if (!sim.ended) sim.settle();
    if (this.practice) return this.finishPractice(p, sim, time);

    const spared = p.finished;
    const place = p.place || 1;
    const R = this.plan[this.roundIndex];
    for (const r of sim.racers) {
      if (r.isPlayer || r.finished) continue;
      const b = this.roster.find((q) => q.id === r.def.id);
      if (b) b.out = this.roundIndex + 1;
    }
    const left = this.roster.filter((b) => !b.out).length;
    let rewards = null;
    if (spared) {
      rewards = this.roundRewards(place);
      this.totals.coins += rewards.coins; this.totals.xp += rewards.xp; this.totals.spared++;
      this.totals.event += rewards.candy;
      profile.d.stats.qualified++;
      profile.track('qualify');
      profile.track('earned', rewards.coins);
      if (this.def.mode === 'race' && place <= 3) profile.track('podium');
      if (this.def.mode !== 'race') profile.track('survive');
      if (this.plan[this.roundIndex + 1]?.stage === 'final') { profile.track('final'); profile.d.stats.finals++; }
      // The last racer standing wins, even if the playlist had a round to spare.
      if (R.stage === 'final' || left === 0) return this.endMatch(true);
    }

    this.place = spared ? place : left + 1;
    app.menuBackdrop(spared ? 'complete' : 'lose');
    app.audio.music('menu');
    app.audio.sfx(spared ? 'win' : 'lose', 0.7);
    if (spared) app.menu.celebrate();
    const players = sim.racers.length;
    const curse = this.curse;
    this.disposeView();
    this.onStandingsEnd = () => { if (spared) this.toReveal(this.roundIndex + 1); else this.endMatch(false); };
    this.setPhase('standings');
    this.t = FLOW.standings;
    app.ui.standings({
      round: this.roundIndex + 1, total: this.plan.length, spared, place: this.place, players, time, rewards, tricked: !!curse,
      alive: left + (spared ? 1 : 0),
      entries: this.standingEntries(spared),
      seconds: FLOW.standings,
      onNext: () => this.endStandings(),
      onMenu: () => this.endMatch(false, true),
    });
    return undefined;
  }

  /** Everyone in the match, racers still in first, then whoever just went out, then the rest. */
  standingEntries(spared) {
    const eq = this.app.profile.d.equip;
    const you = { name: this.app.profile.displayName, skin: eq.skin, hat: eq.hat, glasses: eq.glasses, isPlayer: true, state: spared ? 'in' : 'justOut' };
    const rank = { in: 0, justOut: 1, out: 2 };
    const rivals = this.roster.map((b) => ({
      name: b.name, skin: b.skin, hat: b.hat, glasses: b.glasses, isPlayer: false, state: !b.out ? 'in' : b.out === this.roundIndex + 1 ? 'justOut' : 'out',
    }));
    return [you, ...rivals].sort((a, b) => rank[a.state] - rank[b.state]);
  }

  endStandings() {
    if (this.phase !== 'standings') return;
    this.phase = 'none';
    const next = this.onStandingsEnd;
    this.onStandingsEnd = null;
    this.app.ui.clear();
    next();
  }

  async endMatch(won, quit = false) {
    const app = this.app, profile = app.profile;
    this.phase = 'none';
    this.disposeView();
    this.hud.unmount();
    app.ui.clear();
    app.input.setEnabled(false);
    const reached = this.roundIndex + 1;
    const total = this.plan.length;
    const t = this.totals;
    // Completion bonus scales with progress.
    t.coins += 10 + reached * 6 + (won ? 110 : 0);
    t.xp += 20 + reached * 10 + (won ? 80 : 0);
    t.event += 4 + reached * 3 + (won ? 30 : 0);
    if (won) t.gems += 3;
    profile.d.coins += t.coins;
    profile.d.gems += t.gems;
    profile.addEventPoints(t.event);
    const ups = profile.addXP(t.xp);
    profile.recordMatch(reached, won);
    profile.track('match');
    profile.d.flags.firstMatch = true;
    profile.d.flags.tutorial = true;
    if (won) { profile.track('win'); app.sdk.happytime(); }
    app.sdk.reportCompletion(profile.completion(Object.keys(LEVELS).length));
    profile.save(true);
    if (quit) { app.showMenu(); return; }

    app.menuBackdrop(won ? 'champion' : 'lose');
    // Natural break between matches: the SDK itself decides whether an ad is due.
    if (app.session.playedSeconds() > 180) await app.midgameAd();
    app.audio.music('menu');
    if (won) { app.audio.sfx('win'); app.menu.celebrate(); }
    app.ui.results({
      won, reached, totalRounds: total, place: won ? 1 : this.place, rewards: t, levelUps: ups,
      canDouble: app.sdk.canOfferRewarded,
      onDouble: async () => {
        const ok = await app.rewardedAd();
        if (ok) { profile.addCoins(t.coins); }
        return ok;
      },
      onAgain: () => app.startMatch({ skipLobby: true }),
      onMenu: () => app.showMenu(),
    });
  }

  /** Practice pays nothing, so there's nothing to farm: it only shows how the run went. */
  finishPractice(p, sim, time) {
    const app = this.app, def = this.def;
    const n = sim.racers.length;
    const place = p.finished ? (p.place || 1) : n - sim.eliminated.indexOf(p);
    app.profile.d.flags.tutorial = true;
    app.profile.save(true);
    this.phase = 'none';
    this.disposeView();
    app.menuBackdrop(p.finished ? 'complete' : 'lose');
    app.audio.music('menu');
    if (p.finished) { app.audio.sfx('win', 0.7); app.menu.celebrate(); }
    app.ui.practiceDone({
      name: def.name, finished: p.finished, place, players: n, time, race: def.mode === 'race',
      onAgain: () => app.startPractice(def.id),
      onBack: () => app.goto('practice'),
    });
  }

  disposeView() {
    if (this.view) {
      this.app.setActiveView(null);
      this.view.dispose();
      this.view = null;
    }
  }
}

