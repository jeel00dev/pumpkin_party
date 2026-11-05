// CrazyGames SDK v3 wrapper. Every call is guarded, because `SDK.environment === 'disabled'` makes SDK
// methods throw, and the game must keep running with ad blockers, offline, or on any other host.
//
// Launch stage: Basic Launch keeps ads and banners off. `npm run build:full` builds in `full` mode for Full Launch.
export const LAUNCH_STAGE = import.meta.env?.MODE === 'full' ? 'full' : 'basic';

const SCRIPT_TIMEOUT = 4000; // if the script fails outright its onerror ends the wait at once

class CrazySDK {
  constructor() {
    this.sdk = null;
    this.available = false;
    this.environment = 'none';
    this.user = null;
    this.adPlaying = false;
    this.adsAllowed = LAUNCH_STAGE === 'full';
    this.adsDisabled = !this.adsAllowed;
    this.hasAdblock = false;
    this.playing = false;
    this.onMuteChange = null;
    this.onAuth = null;
    this.systemInfo = null;
    this.isApp = false;
    this.calls = []; // lifecycle trace, read by the e2e tests
  }

  /** Waits briefly for the SDK script, then initialises. Never rejects: the game runs regardless. */
  async init() {
    try {
      const w = window;
      if (!w.CrazyGames) {
        await new Promise((resolve) => {
          const started = performance.now();
          const check = () => {
            if (w.CrazyGames || w.__sdkFailed || performance.now() - started > SCRIPT_TIMEOUT) resolve();
            else setTimeout(check, 40);
          };
          check();
        });
      }
      if (!w.CrazyGames?.SDK) return;
      const sdk = w.CrazyGames.SDK;
      await Promise.race([sdk.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('sdk init timeout')), 4000))]);
      this.environment = sdk.environment || 'none';
      if (this.environment === 'disabled') return;
      this.sdk = sdk;
      this.available = true;
      this.systemInfo = sdk.user?.systemInfo || null;
      this.isApp = ['google_play_store', 'apple_store'].includes(this.systemInfo?.applicationType);
      try { sdk.game?.addSettingsChangeListener?.((s) => this.onMuteChange?.(!!s.muteAudio)); } catch { /* optional */ }
      try { if (sdk.game?.settings?.muteAudio) this.onMuteChange?.(true); } catch { /* optional */ }
      try {
        if (sdk.user?.isUserAccountAvailable) {
          this.user = await sdk.user.getUser();
          sdk.user.addAuthListener?.((u) => { this.user = u; this.onAuth?.(u); });
        }
      } catch { this.user = null; }
      if (this.adsAllowed) {
        try { this.hasAdblock = !!(await sdk.ad?.hasAdblock?.()); } catch { this.hasAdblock = false; }
      }
    } catch {
      this.available = false;
      this.sdk = null;
    }
  }

  get muted() { try { return !!this.sdk?.game?.settings?.muteAudio; } catch { return false; } }
  get accountsAvailable() { try { return !!this.sdk?.user?.isUserAccountAvailable; } catch { return false; } }
  get deviceType() { return this.systemInfo?.device?.type || null; }
  get locale() { return this.systemInfo?.locale || navigator.language || 'en'; }

  _game(fn, name) {
    this.calls.push(name);
    if (!this.available) return;
    try { fn(this.sdk.game); } catch { /* the SDK must never break gameplay */ }
  }
  loadingStart() { this._game((g) => g.loadingStart?.(), 'loadingStart'); }
  loadingStop() { this._game((g) => g.loadingStop?.(), 'loadingStop'); }
  gameplayStart() { if (this.playing) return; this.playing = true; this._game((g) => g.gameplayStart?.(), 'gameplayStart'); }
  gameplayStop() { if (!this.playing) return; this.playing = false; this._game((g) => g.gameplayStop?.(), 'gameplayStop'); }
  /** Reserved for major moments: winning the crown only. */
  happytime() { this._game((g) => g.happytime?.(), 'happytime'); }
  reportCompletion(p) { this._game((g) => g.reportGameCompletedPercentage?.(Math.round(p)), 'completion'); }

  /** Whether a rewarded offer should be shown at all. */
  get canOfferRewarded() { return this.available && this.adsAllowed && !this.adsDisabled && !this.hasAdblock; }

  /**
   * Requests an ad. Resolves true only on adFinished. The game pauses input for the duration; audio mutes
   * from adStarted, per the rules, and comes back on finish or error.
   */
  requestAd(type, { onStart, onEnd } = {}) {
    if (!this.available || !this.adsAllowed || this.adsDisabled || this.adPlaying || !this.sdk?.ad) return Promise.resolve(false);
    this.adPlaying = true;
    this.calls.push(`ad:${type}`);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(watchdog);
        this.adPlaying = false;
        onEnd?.(ok);
        resolve(ok);
      };
      const watchdog = setTimeout(() => finish(false), 90000);
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => onStart?.(),
          adFinished: () => finish(true),
          adError: (err) => {
            // Permanent for the session (Basic Launch, kids mode): stop offering rewarded ads.
            if (err?.code === 'adsDisabled' || err?.code === 'adsDisabledBasicLaunch') this.adsDisabled = true;
            if (err?.code === 'adblock') this.hasAdblock = true;
            finish(false);
          },
        });
      } catch { finish(false); }
    });
  }

  async showBanner(id) {
    if (!this.available || !this.adsAllowed || this.adsDisabled) return;
    try { await this.sdk.banner?.requestResponsiveBanner?.(id); } catch { /* unfilled or disabled */ }
  }
  clearBanners() { if (!this.available) return; try { this.sdk.banner?.clearAllBanners?.(); } catch { /* optional */ } }

  async refreshUser() {
    if (!this.available) return null;
    try { this.user = await this.sdk.user?.getUser?.(); } catch { this.user = null; }
    return this.user;
  }

  async showAuthPrompt() {
    if (!this.available) return null;
    try { this.user = await this.sdk.user?.showAuthPrompt?.(); return this.user; } catch { return null; }
  }

  /** Cloud-synced storage when the Data module is enabled, otherwise null. */
  get data() {
    if (!this.available) return null;
    try { return this.sdk.data || null; } catch { return null; }
  }
}

export const sdk = new CrazySDK();
