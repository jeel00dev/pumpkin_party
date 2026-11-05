// Hands-free playthrough: a whole match on autopilot, every screen on the way, no errors.
import { expect, test } from '@playwright/test';

test('a whole match plays through to the results without an error', async ({ page }) => {
  test.setTimeout(420000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errors.push(m.text()); });
  await page.route('https://sdk.crazygames.com/**', (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem('pumpkinparty.save', JSON.stringify({ flags: { tutorial: true, firstMatch: true }, daily: { lastDay: Math.floor(Date.now() / 86400000), streak: 1 } })));
  await page.goto('/?bot=1&speed=4', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 90000 });
  await page.getByRole('button', { name: 'Play' }).first().click();
  const seen = new Set();
  for (let i = 0; i < 800; i++) {
    await page.waitForTimeout(250);
    const s = await page.evaluate(() => document.body.dataset.screen);
    seen.add(s);
    if (s === 'results') break;
  }
  for (const s of ['lobby', 'reveal', 'round', 'standings', 'results']) expect(seen.has(s), s).toBe(true);
  expect(await page.evaluate(() => window.__app.profile.d.stats.matches)).toBe(1);
  // Every player-facing word is the game's own.
  const words = await page.locator('#ui').innerText();
  expect(words).not.toMatch(/Qualified|Eliminated/);
  // Play Again skips the lobby: one click to the board, then the next round.
  await page.locator('[data-act=again]').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen)).toBe('reveal');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => document.body.dataset.screen), { timeout: 20000 }).toBe('round');
  expect(errors).toEqual([]);
});

test('touch controls appear on touch devices and drive the character', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.route('https://sdk.crazygames.com/**', (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem('pumpkinparty.save', JSON.stringify({ flags: { tutorial: true, firstMatch: true }, daily: { lastDay: Math.floor(Date.now() / 86400000), streak: 1 } })));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 90000 });
  await page.evaluate(() => window.__app.startPractice('pumpkinDash'));
  await expect.poll(() => page.evaluate(() => window.__app.match?.phase), { timeout: 20000 }).toBe('play');
  await expect(page.locator('[data-stick]')).toBeVisible();
  await expect(page.locator('[data-jump]')).toBeVisible();
  await expect(page.locator('[data-dive]')).toBeVisible();
  await page.evaluate(() => window.__app.input.setStick(0, 1));
  const z0 = await page.evaluate(() => window.__app.activeView.sim.player.z);
  await page.waitForTimeout(700);
  const z1 = await page.evaluate(() => window.__app.activeView.sim.player.z);
  expect(z1).toBeLessThan(z0 - 1.5);
  await page.locator('[data-jump]').tap();
  await ctx.close();
});

test('audio unlocks on the first gesture, and every sound and track plays without error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://sdk.crazygames.com/**', (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem('pumpkinparty.save', JSON.stringify({ flags: { tutorial: true, firstMatch: true }, daily: { lastDay: Math.floor(Date.now() / 86400000), streak: 1 } })));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 90000 });
  expect(await page.evaluate(() => window.__app.audio.ctx)).toBe(null); // nothing before a gesture
  await page.mouse.click(640, 400);
  await expect.poll(() => page.evaluate(() => window.__app.audio.ctx?.state)).toBe('running');
  await page.evaluate(async () => {
    const a = window.__app.audio;
    for (const n of ['jump', 'land', 'dive', 'bonk', 'boing', 'splash', 'respawn', 'qualify', 'ping', 'thud', 'click', 'hover', 'tab', 'count', 'go', 'coin', 'buy', 'error', 'equip', 'lose', 'win', 'levelup', 'crack', 'drop', 'curse', 'boo', 'whoosh', 'star', 'shove', 'planchette', 'reveal']) {
      a.lastPlayed.clear();
      a.sfx(n);
    }
    for (const t of ['menu', 'race', 'final']) { a.music(t); await new Promise((r) => setTimeout(r, 900)); }
    a.music('menu');
  });
  expect(errors).toEqual([]);
});
