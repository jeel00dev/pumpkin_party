// All sound is synthesised at runtime: no audio files to download.
// Effects are short oscillator and noise recipes. Music is an original spooky-bouncy step sequencer.
//
// Audio starts only after a user gesture, stops on tab hide, resumes iOS "interrupted" contexts on the
// next gesture, and honours CrazyGames' muteAudio setting over the in-game toggles.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Every sound the game can make, grouped for the sound test page. A unit test keeps this complete. */
export const SOUND_GROUPS = {
  Movement: ['jump', 'land', 'dive', 'boing', 'shove', 'thud', 'splash', 'respawn'],
  'Hazards and hits': ['bonk', 'crack', 'drop', 'curse', 'boo', 'whoosh'],
  'Round moments': ['count', 'go', 'qualify', 'ping', 'star', 'win', 'lose'],
  'Menus and rewards': ['click', 'hover', 'tab', 'coin', 'buy', 'equip', 'error', 'levelup'],
};
export const MUSIC_TRACKS = ['menu', 'race', 'final'];

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.7; this.sfxVol = 0.9;
    this.platformMuted = false; this.adMuted = false; this.hidden = false;
    this.track = null;
    this.step = 0; this.nextTime = 0;
    this.timer = null;
    this.intensity = 0;
    this.lastPlayed = new Map();
    this._bindGestures();
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      this._applyMute();
      if (this.ctx) { if (this.hidden) this.ctx.suspend?.(); else if (this.ctx.state !== 'closed') this.ctx.resume?.(); }
    });
  }

  _bindGestures() {
    const unlock = () => {
      this.ensure();
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume?.();
    };
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ev, unlock, { passive: true });
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(c.destination);
    this.sfxBus = c.createGain(); this.musBus = c.createGain();
    this.sfxBus.connect(this.master); this.musBus.connect(this.master);
    this.musFilter = c.createBiquadFilter();
    this.musFilter.type = 'lowpass'; this.musFilter.frequency.value = 12000;
    this.musFilter.connect(this.musBus);
    // Small feedback delay gives the music space without a convolution reverb's cost.
    this.delay = c.createDelay(0.5); this.delay.delayTime.value = 0.21;
    const fb = c.createGain(); fb.gain.value = 0.26;
    const dw = c.createGain(); dw.gain.value = 0.2;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dw).connect(this.musBus);
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._applyVolumes();
    this._applyMute();
    if (this.wantTrack) this.music(this.wantTrack);
    return c;
  }

  setVolumes(music, sfx) { this.musicVol = music; this.sfxVol = sfx; this._applyVolumes(); }
  _applyVolumes() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = this.sfxVol * 0.9;
    this.musBus.gain.value = this.musicVol * 0.5;
  }
  setPlatformMuted(m) { this.platformMuted = m; this._applyMute(); }
  setAdMuted(m) { this.adMuted = m; this._applyMute(); }
  _applyMute() {
    if (!this.ctx) return;
    const off = this.platformMuted || this.adMuted || this.hidden;
    this.master.gain.setTargetAtTime(off ? 0 : 1, this.ctx.currentTime, 0.015);
  }
  get ready() { return this.ctx && this.ctx.state === 'running' && !this.platformMuted && !this.adMuted; }

  // ---------------------------------------------------------------------- primitives
  _tone(t, { type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.3, attack = 0.004, bus = null, vib = 0, vibRate = 7, q = null, filt = null }) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = g;
    o.connect(g);
    if (filt) {
      const fl = c.createBiquadFilter();
      fl.type = filt.type || 'lowpass'; fl.frequency.value = filt.f; if (q) fl.Q.value = q;
      g.connect(fl); last = fl;
    }
    last.connect(bus || this.sfxBus);
    if (vib > 0) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = vibRate; lg.gain.value = vib;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.02);
    }
    o.start(t); o.stop(t + dur + 0.03);
  }

  _noise(t, { dur = 0.2, vol = 0.3, f0 = 2000, f1 = null, type = 'lowpass', q = 0.8, bus = null, attack = 0.003 }) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    if (f1 !== null) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus || this.sfxBus);
    s.start(t, Math.random() * 0.9);
    s.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------------- effects
  sfx(name, vol = 1, rate = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Limits machine-gunning when many racers trigger the same sound together.
    const lp = this.lastPlayed.get(name) || 0;
    if (now - lp < 0.035) return;
    this.lastPlayed.set(name, now);
    const t = now + 0.001, R = rate, V = vol;
    switch (name) {
      case 'jump':
        this._tone(t, { type: 'sine', f0: 260 * R, f1: 720 * R, dur: 0.16, vol: 0.28 * V });
        this._tone(t, { type: 'triangle', f0: 130 * R, f1: 360 * R, dur: 0.13, vol: 0.14 * V });
        break;
      case 'land':
        this._tone(t, { type: 'sine', f0: 150, f1: 55, dur: 0.14, vol: 0.36 * V });
        this._noise(t, { dur: 0.08, vol: 0.12 * V, f0: 800, f1: 200 });
        break;
      case 'dive':
        this._noise(t, { dur: 0.26, vol: 0.2 * V, f0: 700, f1: 3400, type: 'bandpass', q: 1.4 });
        this._tone(t, { type: 'sine', f0: 520, f1: 240, dur: 0.22, vol: 0.14 * V });
        break;
      case 'bonk':
        this._tone(t, { type: 'triangle', f0: 340 * R, f1: 90 * R, dur: 0.24, vol: 0.46 * V });
        this._tone(t, { type: 'square', f0: 1150 * R, f1: 500 * R, dur: 0.07, vol: 0.09 * V, filt: { f: 3000 } });
        this._noise(t, { dur: 0.09, vol: 0.2 * V, f0: 2400, f1: 500 });
        break;
      case 'boing':
        this._tone(t, { type: 'sine', f0: 180 * R, f1: 820 * R, dur: 0.34, vol: 0.32 * V, vib: 90, vibRate: 22 });
        break;
      case 'splash':
        this._noise(t, { dur: 0.42, vol: 0.34 * V, f0: 3200, f1: 240 });
        for (let i = 0; i < 4; i++) this._tone(t + 0.05 + i * 0.05, { type: 'sine', f0: 280 + Math.random() * 400, f1: 900 + Math.random() * 500, dur: 0.07, vol: 0.09 * V });
        break;
      case 'respawn':
        [72, 76, 79, 84].forEach((n, i) => this._tone(t + i * 0.05, { type: 'triangle', f0: mtof(n), dur: 0.17, vol: 0.16 * V }));
        break;
      case 'qualify':
        [67, 72, 76, 79, 84, 88].forEach((n, i) => {
          this._tone(t + i * 0.07, { type: 'triangle', f0: mtof(n), dur: 0.3, vol: 0.24 * V });
          this._tone(t + i * 0.07, { type: 'sine', f0: mtof(n + 12), dur: 0.22, vol: 0.09 * V });
        });
        this._noise(t + 0.34, { dur: 0.6, vol: 0.06 * V, f0: 6000, f1: 11000, type: 'highpass' });
        break;
      case 'ping':
        this._tone(t, { type: 'sine', f0: 1320, dur: 0.14, vol: 0.14 * V });
        break;
      case 'thud':
        this._tone(t, { type: 'sine', f0: 92, f1: 34, dur: 0.34, vol: 0.62 * V });
        this._noise(t, { dur: 0.14, vol: 0.2 * V, f0: 500, f1: 90 });
        break;
      case 'click':
        this._tone(t, { type: 'triangle', f0: 900, f1: 540, dur: 0.06, vol: 0.2 * V });
        break;
      case 'hover':
        this._tone(t, { type: 'sine', f0: 1040, dur: 0.035, vol: 0.05 * V });
        break;
      case 'tab':
        this._tone(t, { type: 'triangle', f0: 620, f1: 780, dur: 0.07, vol: 0.14 * V });
        break;
      case 'count':
        this._tone(t, { type: 'square', f0: 660, dur: 0.14, vol: 0.14 * V, filt: { f: 2600 } });
        break;
      case 'go':
        this._tone(t, { type: 'square', f0: 1046, dur: 0.46, vol: 0.18 * V, filt: { f: 3600 } });
        this._tone(t, { type: 'triangle', f0: 523, dur: 0.46, vol: 0.2 * V });
        break;
      case 'coin':
        this._tone(t, { type: 'square', f0: 1320 * R, dur: 0.07, vol: 0.08 * V, filt: { f: 5000 } });
        this._tone(t + 0.06, { type: 'square', f0: 1760 * R, dur: 0.2, vol: 0.09 * V, filt: { f: 5000 } });
        break;
      case 'buy':
        [76, 79, 84].forEach((n, i) => this._tone(t + i * 0.08, { type: 'triangle', f0: mtof(n), dur: 0.2, vol: 0.2 * V }));
        break;
      case 'error':
        this._tone(t, { type: 'square', f0: 220, f1: 170, dur: 0.18, vol: 0.1 * V, filt: { f: 1500 } });
        break;
      case 'equip':
        this._tone(t, { type: 'triangle', f0: 620, f1: 1040, dur: 0.14, vol: 0.2 * V });
        break;
      case 'lose':
        [[60, 0], [59, 0.26], [58, 0.52], [57, 0.78]].forEach(([n, d], i) => {
          const dur = i === 3 ? 0.85 : 0.28;
          this._tone(t + d, { type: 'sawtooth', f0: mtof(n), f1: i === 3 ? mtof(n - 1) : null, dur, vol: 0.14 * V, filt: { f: 1300 }, q: 3, vib: i === 3 ? 7 : 0, vibRate: 6 });
        });
        break;
      case 'win':
        [[60, 0, 0.14], [64, 0.13, 0.14], [67, 0.26, 0.14], [72, 0.39, 0.3], [67, 0.7, 0.14], [72, 0.84, 0.75]].forEach(([n, d, dr]) => {
          this._tone(t + d, { type: 'sawtooth', f0: mtof(n), dur: dr + 0.05, vol: 0.16 * V, filt: { f: 3200 }, q: 1.2 });
          this._tone(t + d, { type: 'triangle', f0: mtof(n + 12), dur: dr + 0.05, vol: 0.13 * V });
        });
        break;
      case 'levelup':
        [72, 76, 79, 84, 88, 91].forEach((n, i) => this._tone(t + i * 0.055, { type: 'triangle', f0: mtof(n), dur: 0.24, vol: 0.18 * V }));
        break;
      case 'crack':
        this._noise(t, { dur: 0.07, vol: 0.14 * V, f0: 2600, f1: 900, type: 'bandpass', q: 3 });
        this._tone(t, { type: 'square', f0: 110 + Math.random() * 40, f1: 70, dur: 0.06, vol: 0.05 * V, filt: { f: 900 } });
        break;
      case 'drop':
        this._tone(t, { type: 'sine', f0: 420, f1: 80, dur: 0.3, vol: 0.14 * V });
        break;
      case 'curse':
        this._tone(t, { type: 'sine', f0: 780, f1: 1180, dur: 0.42, vol: 0.09 * V, vib: 30, vibRate: 16 });
        this._tone(t, { type: 'triangle', f0: 392, f1: 590, dur: 0.42, vol: 0.07 * V, vib: 22, vibRate: 14 });
        break;
      case 'boo':
        this._tone(t, { type: 'sine', f0: 230, f1: 420, dur: 0.7, vol: 0.32 * V, vib: 24, vibRate: 6 });
        this._tone(t, { type: 'triangle', f0: 115, f1: 210, dur: 0.7, vol: 0.2 * V, vib: 12, vibRate: 6 });
        break;
      case 'whoosh':
        this._noise(t, { dur: 0.32, vol: 0.14 * V, f0: 900, f1: 3400, type: 'bandpass', q: 2 });
        break;
      case 'star':
        this._tone(t, { type: 'triangle', f0: 1046 * R, f1: 1568 * R, dur: 0.22, vol: 0.2 * V });
        this._tone(t + 0.03, { type: 'sine', f0: 2093 * R, dur: 0.2, vol: 0.08 * V });
        break;
      case 'shove':
        this._tone(t, { type: 'sine', f0: 180 * R, f1: 90, dur: 0.07, vol: 0.14 * V });
        break;
      default:
    }
  }

  // ---------------------------------------------------------------------- music
  /** @param {'menu'|'race'|'final'|null} name */
  music(name) {
    this.wantTrack = name;
    if (!this.ctx) return;
    if (this.track === name) return;
    this.track = name;
    this.song = SONGS[name] || null;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    if (!this.timer) this.timer = setInterval(() => this._sched(), 40);
    if (!name && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Muffle music briefly, for pause menus and ad breaks. */
  duck(on) {
    if (!this.ctx) return;
    this.musFilter.frequency.setTargetAtTime(on ? 900 : 12000, this.ctx.currentTime, 0.08);
  }

  _sched() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.song) return;
    const ahead = 0.14;
    if (this.nextTime < this.ctx.currentTime - 0.3) this.nextTime = this.ctx.currentTime + 0.02;
    while (this.nextTime < this.ctx.currentTime + ahead) {
      this._playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.song.bpm / 4;
      this.step = (this.step + 1) % (16 * this.song.bars);
    }
  }

  _playStep(step, t) {
    const s = this.song, bar = Math.floor(step / 16), i = step % 16;
    const bus = this.musFilter;
    const chord = s.chords[bar % s.chords.length];
    const swing = i % 2 === 1 ? 0.012 : 0;
    t += swing;
    if (s.bass[i] !== '.') {
      const n = chord[0] - 24 + (s.bass[i] === '5' ? 7 : s.bass[i] === '8' ? 12 : 0);
      this._tone(t, { type: 'triangle', f0: mtof(n), dur: 0.24, vol: 0.34, bus });
    }
    if (s.pluck[i] !== '.') {
      for (const n of chord) this._tone(t, { type: 'square', f0: mtof(n + (s.pluck[i] === '^' ? 12 : 0)), dur: 0.12, vol: 0.034, bus, filt: { f: 2300 } });
    }
    const m = s.melody[step % s.melody.length];
    if (m) {
      const n = m;
      this._tone(t, { type: 'sine', f0: mtof(n), dur: s.noteLen, vol: 0.16, bus: this.delay });
      this._tone(t, { type: 'sine', f0: mtof(n), dur: s.noteLen, vol: 0.13, bus });
      this._tone(t, { type: 'sine', f0: mtof(n + 24), dur: 0.07, vol: 0.04, bus });
    }
    if (s.kick[i] === 'x') this._tone(t, { type: 'sine', f0: 130, f1: 45, dur: 0.14, vol: 0.46, bus: this.musBus });
    if (s.snare[i] === 'x') this._noise(t, { dur: 0.11, vol: 0.16, f0: 2100, type: 'bandpass', q: 0.7, bus: this.musBus });
    if (s.hat[i] === 'x') this._noise(t, { dur: 0.03, vol: 0.05, f0: 8000, type: 'highpass', bus: this.musBus });
  }
}

// Original compositions in D minor / E minor with a playful chromatic hook.
// melody: one MIDI note per 16th step (0 = rest).
const rest = 0;
function melody(...bars) { return bars.flat(); }
const mMenu = melody(
  [62, 0, 65, 0, 69, 0, 68, 0, 69, 0, 72, 0, 70, 0, 69, 0],
  [67, 0, 0, 65, 0, 0, 67, 0, 69, 0, 0, 0, 0, 0, 0, 0],
  [62, 0, 65, 0, 69, 0, 68, 0, 69, 0, 74, 0, 72, 0, 70, 0],
  [69, 0, 0, 68, 0, 0, 67, 0, 65, 0, 62, 0, 0, 0, 0, 0],
  [74, 0, 0, 72, 0, 70, 0, 72, 0, 74, 0, 0, 72, 0, 70, 0],
  [69, 0, 0, 65, 0, 62, 0, 65, 0, 69, 0, 0, 0, 0, 0, 0],
  [70, 0, 0, 69, 0, 67, 0, 69, 0, 70, 0, 72, 0, 74, 0, 0],
  [73, 0, 0, 0, 69, 0, 0, 0, 73, 0, 76, 0, 0, 0, 0, 0],
);
const mRace = melody(
  [64, 0, 67, 71, 0, 67, 72, 0, 71, 0, 67, 0, 64, 0, 66, 67],
  [69, 0, 67, 66, 0, 64, 62, 0, 64, 0, 0, 0, 59, 0, 62, 0],
  [64, 0, 67, 71, 0, 67, 72, 0, 76, 0, 74, 0, 72, 0, 71, 0],
  [72, 0, 71, 69, 0, 67, 66, 0, 64, 0, 0, 0, 0, 0, 71, 72],
  [76, 0, 0, 74, 72, 0, 74, 0, 76, 0, 79, 0, 76, 0, 74, 0],
  [72, 0, 0, 71, 69, 0, 71, 0, 72, 0, 76, 0, 72, 0, 71, 0],
  [69, 0, 72, 76, 0, 72, 69, 0, 71, 0, 74, 78, 0, 74, 71, 0],
  [76, 0, 75, 0, 76, 0, 71, 0, 76, 0, 0, 0, 0, 0, 0, 0],
);
const mFinal = melody(
  [64, 64, 0, 67, 64, 0, 70, 0, 69, 0, 67, 0, 64, 0, 63, 0],
  [64, 64, 0, 67, 64, 0, 72, 0, 71, 0, 67, 0, 64, 0, 0, 0],
  [76, 0, 76, 0, 75, 0, 72, 0, 71, 0, 72, 0, 75, 0, 76, 0],
  [79, 0, 78, 0, 76, 0, 75, 0, 72, 0, 71, 0, 70, 0, 67, 0],
);

const SONGS = {
  menu: {
    bpm: 112, bars: 8, noteLen: 0.2,
    chords: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64], [62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]],
    bass: 'x...5...x...5...', pluck: '..x...x...x...x.', kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', melody: mMenu,
  },
  race: {
    bpm: 148, bars: 8, noteLen: 0.14,
    chords: [[64, 67, 71], [60, 64, 67], [64, 67, 71], [62, 66, 69], [60, 64, 67], [57, 60, 64], [57, 60, 64], [59, 63, 66]],
    bass: 'x.x.5.x.x.x.5.8.', pluck: '..x...x...x...^.', kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', melody: mRace,
  },
  final: {
    bpm: 168, bars: 4, noteLen: 0.12,
    chords: [[64, 67, 71], [64, 67, 71], [60, 64, 67], [59, 63, 66]],
    bass: 'x.x.x.x.5.5.8.8.', pluck: '^.x.^.x.^.x.^.x.', kick: 'x..x..x.x..x..x.', snare: '....x.......x.xx', hat: 'xxxxxxxxxxxxxxxx', melody: mFinal,
  },
};
void rest;
