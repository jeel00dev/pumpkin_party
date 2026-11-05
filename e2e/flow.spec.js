// The match flow: lobby, Spirit Board, Trick or Treat, standings and Practice.
import { expect, test } from '@playwright/test';
import { log, open, returning } from './helpers.js';

const veteran = { ...returning, stats: { matches: 4, recent: [3, 3, 3, 3] } };
const phase = (page) => page.evaluate(() => window.__app.match?.phase);
const screen = (page) => page.evaluate(() => document.body.dataset.screen);
const marks = (page) => page.evaluate(() => {
  const t = window.__app.match.timeline;
  return Object.fromEntries(t.map((x) => [x.name, Math.round(x.at - t[0].at)]));
});
const untilLanded = (page) => expect.poll(() => page.evaluate(() => !!window.__app.match?.reveal?.landed), { timeout: 10000 }).toBe(true);
const untilPhase = (page, name, timeout = 30000) => expect.poll(() => phase(page), { timeout }).toBe(name);
/** Ends the current round with the player spared. */
const spareThePlayer = (page) => page.evaluate(() => { const s = window.__app.activeView.sim; s.qualify(s.player); s.settle(); });
const text = (page) => page.locator('#ui').innerText();

test('a brand-new player skips the lobby and the reveal, and lands in the round', async ({ page }) => {
  await open(page);
  await untilPhase(page, 'play');
  const m = await marks(page);
  expect(m.lobby).toBeUndefined();
  expect(m.reveal).toBeUndefined();
  expect(m.intro).toBeUndefined();
  expect(await page.evaluate(() => window.__app.match.plan[0].level)).toBe('pumpkinDash');
});

test('from Play to the round, the wait stays under five seconds', async ({ page }) => {
  await open(page, { save: veteran });
  await page.getByRole('button', { name: 'Play' }).first().click();
  await untilPhase(page, 'lobby');
  await expect.poll(() => phase(page), { timeout: 15000 }).toMatch(/intro|count/);
  const m = await marks(page);
  expect(m.lobby).toBeLessThan(m.reveal);
  expect(m.intro ?? m.count).toBeLessThan(5000);
});

test('between rounds, the wait stays under five seconds even with no input', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true }));
  await page.locator('.reveal').waitFor();
  await page.keyboard.press('Space');
  await untilPhase(page, 'play');
  await spareThePlayer(page);
  await untilPhase(page, 'standings');
  await expect.poll(() => phase(page), { timeout: 12000 }).toMatch(/intro|count/);
  const gap = await page.evaluate(() => {
    const t = window.__app.match.timeline;
    const last = t.at(-1).at;
    const s = t.filter((x) => x.name === 'standings').at(-1).at;
    return last - s;
  });
  expect(gap).toBeLessThan(5000);
});

test('the lobby: run, emote and bump things, with the rivals labelled as AI', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => { window.__app.timeScale = 0.25; window.__app.startMatch(); });
  await untilPhase(page, 'lobby');
  expect(await screen(page)).toBe('lobby');
  await expect(page.locator('.lobby-top')).toContainText('AI rivals');
  expect((await text(page)).toLowerCase()).not.toContain('players found');
  // The SDK isn't told about the wait: it's a waiting area, not a play session.
  expect(await log(page)).not.toContain('gameplayStart');
  const z0 = await page.evaluate(() => window.__app.activeView.sim.player.z);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => window.__app.activeView.sim.player.z)).toBeLessThan(z0 - 1);
  await page.keyboard.up('KeyW');
  await page.locator('[data-emote="0"]').click();
  expect(await page.evaluate(() => window.__app.activeView.emote)).toBeTruthy();
  const moved = await page.evaluate(() => {
    const sim = window.__app.activeView.sim, prop = sim.level.props[0], p = sim.player, x0 = prop.x;
    p.teleport(prop.x - 1.5, 0.1, prop.z);
    p.vx = 7;
    for (let i = 0; i < 60; i++) { p.input.mx = 1; sim.step(); }
    return Math.abs(prop.x - x0);
  });
  expect(moved).toBeGreaterThan(0.5);
  await page.locator('[data-ready]').click();
  await expect.poll(() => screen(page)).toBe('reveal');
});

test('the lobby works by touch', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, { save: veteran });
  await page.evaluate(() => { window.__app.timeScale = 0.2; window.__app.startMatch(); });
  await untilPhase(page, 'lobby');
  await expect(page.locator('[data-stick]')).toBeVisible();
  await page.locator('[data-emote="0"]').tap();
  expect(await page.evaluate(() => window.__app.activeView.emote)).toBeTruthy();
  await page.locator('[data-ready]').tap();
  await expect.poll(() => screen(page)).toBe('reveal');
  await ctx.close();
});

test('the Spirit Board lands on the planned round, and any key skips to the result', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true }));
  await page.locator('.reveal').waitFor();
  await page.keyboard.press('Space');
  await untilLanded(page);
  const planned = await page.evaluate(() => window.__app.match.plan[0].level);
  const landedOn = await page.locator('.sb-tile.on span').innerText();
  expect(await page.evaluate((id) => window.__app.match.reveal.o.def.id === id, planned)).toBe(true);
  expect(landedOn.length).toBeGreaterThan(0);
  await expect(page.locator('.sb-info')).toContainText('Watch out:');
  await expect.poll(() => phase(page), { timeout: 10000 }).toMatch(/intro|count|play/);
  expect(await text(page)).not.toContain('Ouija');
});

test('the Spirit Board can be skipped with a tap', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true }));
  await page.locator('.reveal').waitFor();
  await page.touchscreen.tap(400, 225);
  await untilLanded(page);
  await ctx.close();
});

test('Trick by keyboard curses the round, shows it, and doubles the candy', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true, trick: 'moon' }));
  await page.locator('.reveal').waitFor();
  await page.keyboard.press('Space');
  await untilLanded(page);
  const [a, b] = await Promise.all(['treat', 'trick'].map((k) => page.locator(`[data-pick=${k}]`).evaluate((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(n).fontSize]; })));
  expect(a).toEqual(b);
  await page.keyboard.press('Digit2');
  await untilPhase(page, 'play');
  expect(await page.evaluate(() => window.__app.activeView.sim.curse)).toBe('moon');
  await expect(page.locator('[data-curse]')).toHaveText('Trick: Moon Gravity');
  const candy = await page.evaluate(() => window.__app.match.roundRewards(1).candy);
  await spareThePlayer(page);
  await untilPhase(page, 'standings');
  await expect(page.locator('.st-rewards')).toContainText(`+${candy} Candy (doubled!)`);
  expect(candy).toBe(12);
});

test('Treat plays the round as normal', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true, trick: 'slime' }));
  await page.locator('.reveal').waitFor();
  await page.keyboard.press('Space');
  await untilLanded(page);
  await page.keyboard.press('Digit1');
  await untilPhase(page, 'play');
  expect(await page.evaluate(() => window.__app.activeView.sim.curse)).toBe(null);
  await expect(page.locator('[data-curse]')).toHaveCount(0);
});

test('with no choice made, the round starts as normal instead of waiting', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => { window.__app.timeScale = 3; window.__app.startMatch({ skipLobby: true, trick: 'tiny' }); });
  await expect.poll(() => phase(page), { timeout: 15000 }).toMatch(/intro|count|play/);
  await untilPhase(page, 'play');
  expect(await page.evaluate(() => window.__app.activeView.sim.curse)).toBe(null);
});

test('Trick works by touch', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true, trick: 'heads' }));
  await page.locator('.reveal').waitFor();
  await page.touchscreen.tap(400, 225);
  await untilLanded(page);
  await page.locator('[data-pick=trick]').tap();
  await untilPhase(page, 'play');
  expect(await page.evaluate(() => window.__app.activeView.sim.curse)).toBe('heads');
  await ctx.close();
});

test('standings show who is in and who just went out, and survivors carry over', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true }));
  await page.locator('.reveal').waitFor();
  await page.keyboard.press('Space');
  await untilPhase(page, 'play');
  const quota = await page.evaluate(() => window.__app.match.quota);
  await spareThePlayer(page);
  await untilPhase(page, 'standings');
  await expect(page.locator('.st-p')).toHaveCount(16);
  await expect(page.locator('.st-p.in')).toHaveCount(quota);
  await expect(page.locator('.st-p.justOut')).toHaveCount(16 - quota);
  await expect(page.locator('.st-p.you .nm')).toHaveText('You');
  await expect(page.locator('.st-sub')).toContainText(`${quota} are still in`);
  await expect(page.locator('.standings')).toContainText('Spared!');
  await page.locator('[data-next]').click();
  await untilLanded(page);
  await expect.poll(() => phase(page), { timeout: 15000 }).toMatch(/intro|count|play/);
  await untilPhase(page, 'play');
  expect(await page.evaluate(() => window.__app.activeView.sim.racers.length)).toBe(quota);
});

test('a player knocked out mid-round still sees a fair standings screen, then the results', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true }));
  await page.locator('.reveal').waitFor();
  await page.keyboard.press('Space');
  await untilPhase(page, 'play');
  await page.evaluate(() => { const s = window.__app.activeView.sim; s.eliminate(s.player, 'fell'); });
  await untilPhase(page, 'standings');
  await expect(page.locator('.standings')).toContainText('Spooked!');
  await expect(page.locator('.st-p.you.justOut')).toHaveCount(1);
  const quota = await page.evaluate(() => window.__app.match.quota);
  await expect(page.locator('.st-p.in')).toHaveCount(quota);
  await page.locator('[data-next]').click();
  await expect.poll(() => screen(page)).toBe('results');
  await expect(page.locator('.res-sub')).toContainText(`#${quota + 1}`);
});

test('gameplay is reported only while a round is on, and each break reports a stop', async ({ page }) => {
  await open(page, { save: veteran });
  await page.evaluate(() => window.__app.startMatch({ skipLobby: true }));
  await page.locator('.reveal').waitFor();
  expect(await log(page)).not.toContain('gameplayStart');
  await page.keyboard.press('Space');
  await untilPhase(page, 'play');
  expect((await log(page)).filter((x) => x === 'gameplayStart').length).toBe(1);
  await spareThePlayer(page);
  await untilPhase(page, 'standings');
  expect((await log(page)).filter((x) => x === 'gameplayStop').length).toBe(1);
});

test('Practice lists only rounds already met, and pays nothing', async ({ page }) => {
  await open(page, { save: { ...returning, seen: { ghostChase: true } } });
  await page.locator('[data-act=practice]').click();
  await expect.poll(() => screen(page)).toBe('practice');
  await expect(page.locator('.lvl-card')).toHaveCount(1);
  await expect(page.locator('.lvl-card .nm')).toHaveText('Ghost Chase');
  const before = await page.evaluate(() => { const d = window.__app.profile.d; return [d.coins, d.xp, d.event.points, d.stats.matches]; });
  await page.locator('.lvl-card').click();
  await untilPhase(page, 'play');
  await page.evaluate(() => { const s = window.__app.activeView.sim; s.qualify(s.player); s.settle(); });
  await expect.poll(() => screen(page), { timeout: 15000 }).toBe('practiceDone');
  await expect(page.locator('#ui')).toContainText('Practice earns no rewards');
  const after = await page.evaluate(() => { const d = window.__app.profile.d; return [d.coins, d.xp, d.event.points, d.stats.matches]; });
  expect(after).toEqual(before);
});

test('a new player has no Practice button yet, and the old level select is gone', async ({ page }) => {
  await open(page, { save: returning });
  await expect(page.locator('[data-act=practice]')).toHaveCount(0);
  await expect(page.locator('[data-act=levels]')).toHaveCount(0);
  const t = (await text(page)).toLowerCase();
  expect(t).not.toContain('world 1');
  expect(t).not.toContain('select level');
});

for (const [w, h, label] of [[821, 462, 'smallest desktop iframe'], [800, 450, 'mobile'], [1080, 607, 'tablet'], [1920, 1080, 'full HD']]) {
  test(`the flow screens fit and stay legible at ${label} (${w}x${h})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, { save: veteran });
    const check = async (name) => {
      const out = await page.evaluate(() => {
        const over = [], small = [];
        document.querySelectorAll('#ui button, #ui .nm, #ui .sb-tile span, #ui .sb-info *, #ui .st-sub, #ui .sb-choice small, #ui .lobby-top *, #ui .lobby-help, #ui .rc-reward').forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width && (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1)) over.push(n.textContent.trim().slice(0, 24) || n.className);
          if (n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 10.5) small.push(n.textContent.trim().slice(0, 24));
        });
        return { over, small };
      });
      expect(out.over, `${name} overflow`).toEqual([]);
      expect(out.small, `${name} legibility`).toEqual([]);
    };
    await page.evaluate(() => { window.__app.timeScale = 0.1; window.__app.startMatch(); });
    await untilPhase(page, 'lobby');
    await page.waitForTimeout(200);
    await check('lobby');
    await page.evaluate(() => { const a = window.__app; a.timeScale = 1; a.match.forceTrick = 'moon'; a.match.endLobby(); });
    await page.locator('.reveal').waitFor();
    await page.mouse.click(5, 5);
    await untilLanded(page);
    await page.waitForTimeout(260);
    await check('reveal with a choice');
    await page.locator('[data-pick=treat]').click();
    await untilPhase(page, 'play');
    await spareThePlayer(page);
    await untilPhase(page, 'standings');
    await page.waitForTimeout(150);
    await check('standings');
  });
}
