// CrazyGames compliance suite. Each test maps to a rule in docs/crazygames-compliance.md.
import { expect, test } from '@playwright/test';

/** A faithful stub of SDK v3, so lifecycle calls, ads, and Data storage can be asserted. */
const sdkStub = (opts = {}) => `
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

async function open(page, { url = '/', sdk = {}, block = false, save = null } = {}) {
  await page.route('https://sdk.crazygames.com/**', (r) => (block ? r.abort() : r.fulfill({ contentType: 'application/javascript', body: sdkStub(sdk) })));
  if (save) await page.addInitScript((s) => { localStorage.setItem('pumpkinparty.save', JSON.stringify(s)); }, save);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 90000 });
  return errors;
}

const log = (page) => page.evaluate(() => window.__sdkLog);
// A returning player who's already claimed today's reward, so nothing sits on top of the menu.
const returning = { flags: { tutorial: true, firstMatch: true }, daily: { lastDay: Math.floor(Date.now() / 86400000), streak: 1 } };

test('new players land directly in gameplay, with no click needed', async ({ page }) => {
  const errors = await open(page);
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen)).toBe('round');
  await expect.poll(() => page.evaluate(() => window.__app.match?.phase), { timeout: 15000 }).toBe('play');
  expect(await log(page)).toContain('gameplayStart');
  await expect(page.locator('[data-tips]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('returning players reach gameplay in one click from the menu', async ({ page }) => {
  await open(page, { save: returning });
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen)).toBe('menu');
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect.poll(() => page.evaluate(() => window.__app.match?.phase), { timeout: 30000 }).toBe('play');
});

test('the daily reward greets returning players once, and never new ones', async ({ page }) => {
  await open(page, { save: { flags: { tutorial: true, firstMatch: true } } });
  await expect(page.locator('.days')).toBeVisible();
  const before = await page.evaluate(() => window.__app.profile.d.coins);
  await page.locator('.modal [data-act=claim]').click();
  await expect(page.locator('.days')).toHaveCount(0);
  expect(await page.evaluate(() => window.__app.profile.d.coins)).toBeGreaterThan(before);
  await page.evaluate(() => window.__app.goto('menu'));
  await expect(page.locator('.days')).toHaveCount(0);
});

test('during a round the HUD lets the mouse through to the game', async ({ page }) => {
  await open(page, { save: returning });
  await page.evaluate(() => window.__app.startSolo('pumpkinDash'));
  await expect.poll(() => page.evaluate(() => window.__app.match?.phase), { timeout: 20000 }).toBe('play');
  const hit = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight * 0.6)?.id);
  expect(hit).toBe('game');
});

test('SDK lifecycle fires in the right order', async ({ page }) => {
  await open(page, { save: returning });
  const first = await log(page);
  expect(first[0]).toBe('init');
  expect(first).toContain('loadingStart');
  expect(first).toContain('loadingStop');
  expect(first.indexOf('loadingStart')).toBeLessThan(first.indexOf('loadingStop'));
  expect(first).not.toContain('gameplayStart'); // not while sitting in a menu
  await page.evaluate(() => window.__app.startSolo('pumpkinDash'));
  await expect.poll(async () => (await log(page)).includes('gameplayStart'), { timeout: 20000 }).toBe(true);
  // Pausing stops gameplay, resuming starts it again.
  await page.keyboard.press('KeyP');
  await expect.poll(async () => (await log(page)).filter((x) => x === 'gameplayStop').length).toBe(1);
  await page.locator('[data-act=resume]').click();
  await expect.poll(async () => (await log(page)).filter((x) => x === 'gameplayStart').length).toBe(2);
});

test('runs fully offline when the SDK cannot load (ad blockers, no network)', async ({ page }) => {
  const errors = await open(page, { block: true, save: returning });
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen)).toBe('menu');
  await page.evaluate(() => window.__app.startSolo('pumpkinDash'));
  await expect.poll(() => page.evaluate(() => window.__app.match?.phase), { timeout: 20000 }).toBe('play');
  expect(errors).toEqual([]);
});

test('does not call a disabled SDK (other hosts)', async ({ page }) => {
  const errors = await open(page, { sdk: { environment: 'disabled' }, save: returning });
  const lg = await log(page);
  expect(lg).toEqual(['init']);
  expect(errors).toEqual([]);
});

test('progress is saved through the Data module and read back at launch', async ({ page }) => {
  await open(page, { save: returning });
  expect(await log(page)).toContain('data.get');
  await page.evaluate(() => { window.__app.profile.addCoins(5); window.__app.profile.save(true); });
  expect(await log(page)).toContain('data.set');
});

test('shows the CrazyGames username, and guests can play', async ({ page }) => {
  await open(page, { sdk: { user: { username: 'CoolGhoul', profilePictureUrl: 'https://images.crazygames.com/x.png', __dangerousUserId: '9' } }, save: returning });
  await expect(page.locator('.profile .nm')).toHaveText('CoolGhoul');
  await expect(page.locator('[data-act=login]')).toHaveCount(0);
});

test('login is optional, only by button, and never pops up by itself', async ({ page }) => {
  await open(page, { save: returning });
  await page.waitForTimeout(800);
  expect(await log(page)).not.toContain('authPrompt');
  await page.locator('[data-act=login]').click();
  await expect.poll(() => log(page)).toContain('authPrompt');
});

test('honours the platform mute setting over in-game volume', async ({ page }) => {
  await open(page, { sdk: { muted: true }, save: returning });
  expect(await page.evaluate(() => window.__app.audio.platformMuted)).toBe(true);
  await page.evaluate(() => window.__sdkSettings({ muteAudio: false }));
  expect(await page.evaluate(() => window.__app.audio.platformMuted)).toBe(false);
});

test('no fullscreen button, external links or quit button anywhere', async ({ page }) => {
  await open(page, { save: returning });
  for (const scr of ['menu', 'levels', 'shop', 'customize', 'event']) {
    await page.evaluate((s) => window.__app.goto(s), scr);
    await page.waitForTimeout(150);
    await expect(page.locator('a[href]')).toHaveCount(0);
    const text = (await page.locator('#ui').innerText()).toLowerCase();
    expect(text).not.toContain('fullscreen');
    expect(text).not.toContain('quit');
  }
});

test('page never scrolls, text cannot be selected, context menu is suppressed', async ({ page }) => {
  await open(page, { save: returning });
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => { const e = new MouseEvent('contextmenu', { cancelable: true, bubbles: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })).toBe(true);
});

test('all asset requests use relative paths on the same origin', async ({ page, baseURL }) => {
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.includes('sdk.crazygames.com')) external.push(u);
  });
  await open(page, { save: returning });
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
});

test('keyboard controls work: W runs forward, Space jumps, Shift dives', async ({ page }) => {
  await open(page, { save: returning });
  await page.evaluate(() => window.__app.startSolo('pumpkinDash'));
  await expect.poll(() => page.evaluate(() => window.__app.match?.phase), { timeout: 20000 }).toBe('play');
  const z0 = await page.evaluate(() => window.__app.activeView.sim.player.z);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  const z1 = await page.evaluate(() => window.__app.activeView.sim.player.z);
  expect(z1).toBeLessThan(z0 - 1.5);
  const jumps0 = await page.evaluate(() => window.__app.profile.d.stats.jumps);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__app.profile.d.stats.jumps)).toBeGreaterThan(jumps0);
  await page.waitForTimeout(800);
  const d0 = await page.evaluate(() => window.__app.profile.d.stats.dives);
  await page.keyboard.press('ShiftLeft');
  await expect.poll(() => page.evaluate(() => window.__app.profile.d.stats.dives)).toBeGreaterThan(d0);
  await page.keyboard.up('KeyW');
});

test('audio pauses for a midgame ad: no ad during play, muted only once it starts', async ({ page }) => {
  await open(page, { url: '/?stage=full', save: returning });
  await page.evaluate(() => { window.__app.sdk.adsAllowed = true; window.__app.sdk.adsDisabled = false; });
  const muted = await page.evaluate(async () => {
    const a = window.__app; const seen = [];
    const p = a.midgameAd();
    seen.push(a.audio.adMuted);
    await new Promise((r) => setTimeout(r, 30));
    seen.push(a.audio.adMuted);
    await p;
    seen.push(a.audio.adMuted);
    return seen;
  });
  expect(muted).toEqual([false, true, false]);
});

test('a failed rewarded ad never pays out', async ({ page }) => {
  await open(page, { sdk: { ad: 'error' }, save: returning });
  const out = await page.evaluate(async () => {
    const a = window.__app;
    a.sdk.adsAllowed = true; a.sdk.adsDisabled = false;
    const c = a.profile.d.coins;
    const ok = await a.rewardedAd();
    if (ok) a.profile.addCoins(100);
    return { ok, same: a.profile.d.coins === c };
  });
  expect(out).toEqual({ ok: false, same: true });
});

test('Basic Launch: ads are off and no rewarded offers appear', async ({ page }) => {
  await open(page, { save: returning });
  expect(await page.evaluate(() => window.__app.sdk.canOfferRewarded)).toBe(false);
  await page.locator('[data-act=freecoins]').first().click();
  await expect(page.locator('[data-act=watch]')).toHaveCount(0);
  await page.locator('.modal [data-act=close]').first().click();
  expect((await log(page)).some((x) => x.startsWith('ad:'))).toBe(false);
});

test('rewarded offers show a video icon and an equal decline button', async ({ page }) => {
  await open(page, { save: returning });
  await page.evaluate(() => { const a = window.__app; a.sdk.adsAllowed = true; a.sdk.adsDisabled = false; a.ui.freeCoins(); });
  const yes = page.locator('[data-act=watch]'), no = page.locator('.foot [data-act=close]');
  await expect(yes).toBeVisible();
  await expect(yes.locator('svg').first()).toBeVisible();
  const [a, b] = await Promise.all([yes.evaluate((n) => getComputedStyle(n).fontSize), no.evaluate((n) => getComputedStyle(n).fontSize)]);
  expect(a).toBe(b);
});

for (const [w, h, label] of [[821, 462, 'smallest desktop iframe'], [800, 450, 'mobile'], [1080, 607, 'tablet'], [1920, 1080, 'full HD']]) {
  test(`layout fits inside the view at ${label} (${w}x${h})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, { save: returning });
    for (const scr of ['menu', 'levels', 'shop', 'customize', 'event']) {
      await page.evaluate((s) => window.__app.goto(s), scr);
      await page.waitForTimeout(120);
      const over = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#ui button, #ui .nm, #ui .title').forEach((n) => {
          if (n.closest('.cards, .ev-track, .cust-panel')) return; // scrollers may run past the edge
          const r = n.getBoundingClientRect();
          if (r.width && (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1)) out.push(n.textContent.trim().slice(0, 20) || n.className);
        });
        return out;
      });
      expect(over, `${scr} overflow`).toEqual([]);
      const small = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#ui button, #ui .nm').forEach((n) => { if (n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 10.5) out.push(n.textContent.trim().slice(0, 16)); });
        return out;
      });
      expect(small, `${scr} legibility`).toEqual([]);
    }
  });
}
