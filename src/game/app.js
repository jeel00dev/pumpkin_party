// Top-level application: boot sequence, frame loop, screen routing, quality governor and ads.
import { Pipeline } from '../render/pipeline.js';
import { clearMaterialCache, setMaterialTier } from '../render/materials.js';
import { disposeCharacterCaches } from '../assets/characters.js';
import { Audio } from '../core/audio.js';
import { InputManager } from '../core/input.js';
import { profile } from '../core/profile.js';
import { sdk } from '../core/sdk.js';
import { HUD } from '../ui/hud.js';
import { UI } from '../ui/screens.js';
import { Thumbs } from '../ui/thumbs.js';
import { Match } from './match.js';
import { LOBBY_SIZE } from './playlist.js';
import { MenuScene } from './menuscene.js';
import { setAnisotropy } from '../render/textures.js';
import { ICON } from '../ui/icons.js';

/** Pick a starting quality from what the device reports. The governor refines it during play. */
function detectTier(renderer) {
  const gl = renderer.getContext();
  let name = '';
  try { const dbg = gl.getExtension('WEBGL_debug_renderer_info'); if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)); } catch { /* optional */ }
  const n = name.toLowerCase();
  if (/swiftshader|llvmpipe|software/.test(n)) return 'low';
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent) || sdk.deviceType === 'mobile' || sdk.deviceType === 'tablet';
  const mem = navigator.deviceMemory || 8;
  if (mobile) {
    if (/adreno \(tm\) (7|8)|apple a1[5-9]|apple gpu/.test(n) && mem >= 4) return 'medium';
    return 'low';
  }
  if (mem <= 4) return 'low';
  if (/nvidia|geforce|rtx|gtx|radeon rx|rx \d{3,4}|radeon pro|arc\(|apple m\d|m[1-4] (pro|max|ultra)/.test(n)) return 'high';
  if (/intel.*(uhd|hd graphics [0-9]{3,4}\b)/.test(n) && !/iris/.test(n)) return 'low';
  return 'medium';
}

const ORDER = ['low', 'medium', 'high'];

export class App {
  constructor(canvas) {
    this.version = '1.0.0';
    this.canvas = canvas;
    this.sdk = sdk;
    this.profile = profile;
    this.audio = new Audio();
    this.input = new InputManager(canvas);
    // Primary pointer, not mere touch support: a touchscreen laptop is still played with keys and mouse.
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    window.addEventListener('touchstart', () => {
      if (!this.isTouch) { this.isTouch = true; this.hud?.addTouchControls(); }
    }, { once: true, passive: true });
    this.width = innerWidth; this.height = innerHeight;
    this.activeView = null;
    this.match = null;
    this.frameTimes = [];
    this.lastFrame = 0;
    this.paused = false;
    this.session = {
      start: performance.now(), played: 0,
      playedSeconds() { return this.played; },
    };
    this.perf = { acc: 0, n: 0, slow: 0, fast: 0, avg: 16 };
    this.tierSwitchPending = null;
  }

  async boot(progress) {
    progress(4, 'Loading');
    await sdk.init();
    sdk.loadingStart();
    if (sdk.deviceType === 'mobile' || sdk.deviceType === 'tablet') this.isTouch = true;
    sdk.onMuteChange = (m) => this.audio.setPlatformMuted(m);
    this.audio.setPlatformMuted(sdk.muted);
    sdk.onAuth = () => { this.profile.load(); this.applySettings(); if (this.ui?.name === 'menu') this.ui.menu(); };
    this.profile.load();
    progress(14, 'Loading');
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* fonts are optional */ }
    progress(22, 'Loading');
    await tick();

    this.pipe = new Pipeline(this.canvas, 'high');
    setAnisotropy(Math.min(8, this.pipe.renderer.capabilities.getMaxAnisotropy()));
    const q = this.profile.d.settings.quality;
    const params = new URLSearchParams(location.search);
    this.autoplay = params.has('bot');
    this.captureMode = params.has('capture');
    this.timeScale = +(params.get('speed') || 1);
    this.lobbySize = +(params.get('lobby') || LOBBY_SIZE);
    const tier = params.get('tier') || (q === 'auto' ? detectTier(this.pipe.renderer) : q);
    this.pipe.setTier(tier);
    this.pipe.setSize(this.width, this.height);
    setMaterialTier(this.pipe.tier);
    this.applySettings();
    progress(34, 'Painting the castle');
    await tick();

    this.ui = new UI(this);
    this.hud = new HUD(this);
    this.thumbs = new Thumbs(this.pipe);
    progress(44, 'Carving pumpkins');
    await tick();
    this.menu = new MenuScene(this);
    progress(72, 'Waking the ghosts');
    await tick();

    // Compile shaders now rather than in the first round.
    this.menu.setMode('title', { instant: true });
    this.menu.update(0.016);
    this.menu.render();
    progress(90, 'Almost ready');
    await tick();

    this.input.onPause = () => this.pauseRound();
    this.input.onUnlock = () => { if (this.match?.phase === 'play' && !this.ui.modal && !this.input.lockFailed) this.pauseRound({ focusLost: document.hidden || !document.hasFocus() }); };
    this.input.onEmote = (i) => {
      const name = this.emoteList()[i];
      if (name && this.activeView) { this.activeView.emote = name; clearTimeout(this._emoT); this._emoT = setTimeout(() => { if (this.activeView) this.activeView.emote = null; }, 2600); }
    };
    window.addEventListener('resize', () => this.onResize());
    this.canvas.addEventListener('click', () => {
      if (this.activeView || this.ui.name !== 'menu') return;
      this.menu.playEmote(this.profile.d.equip.emote, 2.2);
      this.audio.sfx('boing', 0.5);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.match?.phase === 'play' && !this.paused) this.pauseRound({ focusLost: true }); });
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => location.reload());
    if (sdk.isApp) document.documentElement.classList.add('in-app');
    progress(100, 'Ready');
    sdk.loadingStop();
    requestAnimationFrame((t) => this.frame(t));

    // New players go straight into gameplay, as CrazyGames requires; returning players get the menu.
    if (!this.profile.d.flags.firstMatch && !params.has('menu')) {
      this.showMenuBackdropOnly('title');
      this.startMatch({ quick: true });
    } else {
      this.showMenu();
    }
    window.__ready = true;
  }

  /** The emotes on the number keys, with the equipped one first. */
  emoteList() {
    const owned = this.profile.d.owned.emote;
    return [...new Set([this.profile.d.equip.emote, 'cheer', 'dance', 'flex'])].filter((e) => owned.includes(e));
  }

  // ---------------------------------------------------------------- routing
  goto(name, arg) {
    this.menu.setHero(this.profile.d.equip);
    this.input.setEnabled(false);
    this.hud.unmount();
    this.setActiveView(null);
    switch (name) {
      case 'menu': this.menu.setMode('menu'); this.ui.menu(); this.audio.music('menu'); break;
      case 'practice': this.menu.setMode('menu'); this.ui.practice(); break;
      case 'shop': this.menu.setMode('menu'); this.ui.shop(arg); break;
      case 'customize': this.menu.setMode('studio'); this.ui.customize(arg); break;
      case 'event': this.menu.setMode('menu'); this.ui.event(); break;
      default:
    }
  }

  showMenu() { this.match = null; this.goto('menu'); }
  showMenuBackdropOnly(mode) { this.menu.setMode(mode, { instant: true }); }
  menuBackdrop(mode) { this.menu.setHero(this.profile.d.equip); this.menu.setMode(mode, { instant: true }); }
  onEquip() { this.menu.setHero(this.profile.d.equip); this.ui.current && this.ui.fillAvatar && 0; }

  setActiveView(v) { this.activeView = v; }

  // ---------------------------------------------------------------- matches
  /** @param {object} o quick: first launch, straight into a round. skipLobby: Play Again. */
  startMatch(o = {}) {
    this.ui.clear();
    this.paused = false;
    this.applyPendingTier();
    this.match = new Match(this, o);
    this.match.begin();
  }

  startPractice(id) {
    this.ui.clear();
    this.paused = false;
    this.applyPendingTier();
    this.match = new Match(this, { practice: id });
    this.match.begin();
  }

  /** @param {object} o focusLost: the player switched away. CrazyGames tracks that itself, so the SDK isn't told. */
  pauseRound(o = {}) {
    if (this.paused) { if (this.ui.modal) this.resumeRound?.(); return; }
    if (!this.match || !['intro', 'count', 'play'].includes(this.match.phase) || this.ui.modal || !this.activeView) return;
    this.paused = true;
    this.input.paused = true;
    this.activeView.paused = true;
    this.input.setEnabled(false);
    this.audio.duck(true);
    if (!o.focusLost) this.sdk.gameplayStop();
    const resume = () => {
      this.ui.closeModal();
      this.paused = false;
      this.input.paused = false;
      if (this.activeView) this.activeView.paused = false;
      this.input.setEnabled(true);
      this.audio.duck(false);
      if (this.match?.phase === 'play') this.sdk.gameplayStart();
    };
    this.resumeRound = resume;
    this.ui.pause({
      onResume: resume,
      canRestart: !!this.match.practice,
      onRestart: () => {
        const id = this.match.practice;
        this.ui.closeModal();
        this.audio.duck(false);
        this.paused = false;
        this.input.paused = false;
        this.sdk.gameplayStop();
        this.match.disposeView();
        this.hud.unmount();
        this.startPractice(id);
      },
      onQuit: () => {
        this.ui.closeModal();
        this.audio.duck(false);
        this.sdk.gameplayStop();
        this.paused = false;
        this.input.paused = false;
        this.match.disposeView();
        this.hud.unmount();
        this.input.setEnabled(false);
        this.match = null;
        this.showMenu();
      },
    });
  }

  // ---------------------------------------------------------------- ads
  async midgameAd() {
    if (!sdk.adsAllowed) return false;
    return sdk.requestAd('midgame', {
      onStart: () => { this.audio.setAdMuted(true); this.adBlock(true); },
      onEnd: () => { this.audio.setAdMuted(false); this.adBlock(false); },
    });
  }

  async rewardedAd() {
    this.adBlock(true);
    const ok = await sdk.requestAd('rewarded', {
      onStart: () => this.audio.setAdMuted(true),
      onEnd: () => { this.audio.setAdMuted(false); },
    });
    this.adBlock(false);
    return ok;
  }

  /** Blocks UI input while an ad is pending, per the ad rules. */
  adBlock(on) {
    let n = document.getElementById('ad-block');
    if (on && !n) {
      n = document.createElement('div');
      n.id = 'ad-block';
      n.className = 'scrim';
      n.style.pointerEvents = 'auto';
      n.innerHTML = '<div class="spinner"></div>';
      this.ui.root.appendChild(n);
    } else if (!on && n) n.remove();
  }

  async login() {
    const u = await sdk.showAuthPrompt();
    if (u) { this.profile.load(); this.applySettings(); this.ui.toast(`${ICON.user} Welcome, ${u.username}!`); if (this.ui.name === 'menu') this.ui.menu(); }
  }

  // ---------------------------------------------------------------- settings and quality
  applySettings(qualityChanged = false) {
    const s = this.profile.d.settings;
    this.audio.setVolumes(s.music, s.sfx);
    this.input.sens = s.sens;
    if (this.activeView) {
      this.activeView.cam.invertY = s.invertY;
      this.activeView.cam.reduced = s.reducedShake;
    }
    this.settings = s;
    this.profile.save();
    if (qualityChanged && this.pipe) {
      const t = s.quality === 'auto' ? detectTier(this.pipe.renderer) : s.quality;
      this.tierSwitchPending = t;
      // A menu has nothing in flight, so the swap can happen immediately.
      if (!this.match) this.applyPendingTier(true);
    }
  }

  applyPendingTier(rebuildMenu = true) {
    const t = this.tierSwitchPending;
    if (!t || t === this.pipe.tier.name) { this.tierSwitchPending = null; return; }
    this.tierSwitchPending = null;
    this.pipe.setTier(t);
    setMaterialTier(this.pipe.tier);
    clearMaterialCache();
    disposeCharacterCaches();
    if (rebuildMenu && this.menu) {
      const m = this.menu.mode;
      this.menu = new MenuScene(this);
      this.menu.setMode(m, { instant: true });
    }
  }

  onResize() {
    this.width = innerWidth; this.height = innerHeight;
    this.pipe.setSize(this.width, this.height);
    this.menu?.resize();
    if (this.activeView) this.activeView.cam.setAspect(this.width / this.height);
  }

  /**
   * Resolution governor: small steps in render scale keep the frame rate up without visible pops.
   * Only sustained slowness changes anything; a one-off hitch doesn't.
   */
  govern(dt) {
    const P = this.perf;
    P.acc += dt; P.n++;
    if (P.acc < 1) return;
    const avg = P.acc / P.n;
    P.acc = 0; P.n = 0;
    P.avg = avg;
    if (document.hidden) return;
    if (avg > 1 / 45) { P.slow++; P.fast = 0; } else if (avg < 1 / 57) { P.fast++; P.slow = 0; } else { P.slow = 0; P.fast = 0; }
    if (P.slow >= 2) {
      P.slow = 0;
      if (this.pipe.scale > 0.65) this.pipe.setScale(this.pipe.scale - 0.1);
      else if (this.profile.d.settings.quality === 'auto') {
        const i = ORDER.indexOf(this.pipe.tier.name);
        if (i > 0) this.tierSwitchPending = ORDER[i - 1]; // applied at the next safe moment, between rounds
      }
    } else if (P.fast >= 6 && this.pipe.scale < 1) {
      P.fast = 0;
      this.pipe.setScale(this.pipe.scale + 0.05);
    }
  }

  /** Advance exactly one frame of a known length, for the promo capture. */
  stepFrame(dt) {
    return new Promise((resolve) => requestAnimationFrame(() => {
      this.thumbs.pump(4);
      this.match?.update(dt);
      if (this.activeView) { this.activeView.update(dt); this.activeView.render(); resolve(); return; }
      this.menu.update(dt);
      this.menu.render();
      resolve();
    }));
  }

  frame(now) {
    if (this.captureMode) return;
    requestAnimationFrame((t) => this.frame(t));
    if (this.contextLost) return;
    const realDt = Math.max(1 / 480, Math.min(0.1, (now - (this.lastFrame || now)) / 1000));
    const dt = realDt * this.timeScale;
    this.lastFrame = now;
    this.fps = dt;
    this.govern(realDt);
    this.thumbs.pump(2);
    if (!this.paused && this.match?.phase === 'play') this.session.played += dt;
    this.match?.update(this.paused ? 0 : dt);
    if (this.activeView) {
      this.activeView.update(dt);
      this.activeView.render();
      return;
    }
    this.menu.update(dt);
    this.menu.render();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
