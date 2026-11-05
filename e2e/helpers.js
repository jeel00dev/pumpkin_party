// Shared by the browser suites.
/** A faithful stub of SDK v3, so lifecycle calls, ads, and Data storage can be asserted. */
export const sdkStub = (opts = {}) => `
  window.__sdkLog = [];
  const store = {};
  const log = (n) => window.__sdkLog.push(n);
  const adMode = ${JSON.stringify(opts.ad || 'finish')};
  window.CrazyGames = { SDK: {
    environment: ${JSON.stringify(opts.environment || 'crazygames')},
    async init() { log('init'); },
    data: {
      getItem(k) { log('data.get'); return store[k] ?? null; },
      setItem(k, v) { log('data.set'); store[k] = v; },
      removeItem(k) { delete store[k]; }, clear() {},
    },
    game: {
      settings: { muteAudio: ${opts.muted ? 'true' : 'false'}, disableChat: false },
      gameplayStart() { log('gameplayStart'); }, gameplayStop() { log('gameplayStop'); },
      loadingStart() { log('loadingStart'); }, loadingStop() { log('loadingStop'); },
      happytime() { log('happytime'); }, reportGameCompletedPercentage(p) { log('completion:' + p); },
      addSettingsChangeListener(l) { window.__sdkSettings = l; }, removeSettingsChangeListener() {},
      isInstantMultiplayer: false,
    },
    user: {
      isUserAccountAvailable: true,
      systemInfo: { device: { type: 'desktop' }, locale: 'en-US', applicationType: 'web', countryCode: 'US', os: { name: 'Windows' }, browser: { name: 'Chrome' } },
      async getUser() { return ${opts.user ? JSON.stringify(opts.user) : 'null'}; },
      async showAuthPrompt() { log('authPrompt'); return { username: 'Prompted', profilePictureUrl: '', __dangerousUserId: '1' }; },
      addAuthListener() {}, removeAuthListener() {},
    },
    ad: {
      async hasAdblock() { return ${opts.adblock ? 'true' : 'false'}; },
      requestAd(type, cb) {
        log('ad:' + type);
        setTimeout(() => {
          if (adMode === 'error') { cb.adError({ code: 'unfilled', message: 'none' }); return; }
          if (adMode === 'disabled') { cb.adError({ code: 'adsDisabled', message: 'basic' }); return; }
          cb.adStarted?.(); log('adStarted');
          setTimeout(() => { log('adFinished'); cb.adFinished?.(); }, 50);
        }, 10);
      },
    },
    banner: { async requestResponsiveBanner() { log('banner'); }, clearBanner() {}, clearAllBanners() { log('bannerClear'); } },
  } };
`;

export async function open(page, { url = '/', sdk = {}, block = false, save = null } = {}) {
  await page.route('https://sdk.crazygames.com/**', (r) => (block ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: sdkStub(sdk) })));
  if (save) await page.addInitScript((s) => { localStorage.setItem('pumpkinparty.save', JSON.stringify(s)); }, save);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 90000 });
  return errors;
}

export const log = (page) => page.evaluate(() => window.__sdkLog);
// A returning player who's already claimed today's reward, so nothing sits on top of the menu.
export const returning = { flags: { tutorial: true, firstMatch: true }, daily: { lastDay: Math.floor(Date.now() / 86400000), streak: 1 } };
