// Regenerates pre-rendered art from the game itself: logo, loading screen and level thumbnails.
// Needs the dev server running. Usage: node scripts/make-art.mjs [logo] [loading] [thumbs] [levelId...]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pngToWebp } from './webp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const which = process.argv.slice(2);
const SHOTS = {
  pumpkinDash: { url: 'level=pumpkinDash&t=4&pz=-30' },
  ghostChase: { url: 'level=ghostChase&t=3.2&pz=-16' },
  hauntedFloor: { url: 'level=hauntedFloor&t=1.5' },
  witchsPlatform: { url: 'level=witchsPlatform&t=1' },
  pumpkinRoll: { url: 'level=pumpkinRoll&t=4&pz=-20&py=2.8' },
  finalShowdown: { url: 'level=finalShowdown&t=1' },
};
const want = (k) => !which.length || which.includes(k);
const out = 'public/art';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });

if (want('logo')) {
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  p.on('pageerror', (e) => console.log('logo error', e.message));
  await p.goto(`${base}/art.html`);
  await p.waitForFunction('window.__logo===true || window.__logoErr', { timeout: 60000 });
  const png = await p.locator('#logo').screenshot({ omitBackground: true });
  writeFileSync(`${out}/logo.webp`, await pngToWebp(b, png, { quality: 0.88, width: 900, trim: true }));
  await p.close();
  console.log('logo done');
}

const openGame = async (w, h, url) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.route('https://sdk.crazygames.com/**', (r) => r.abort());
  p.on('pageerror', (e) => console.log('page error', e.message));
  await p.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 90000 });
  return p;
};

if (want('loading')) {
  const p = await openGame(1280, 720, '/?menu=1&tier=high');
  await p.evaluate(() => {
    const a = window.__app;
    a.ui.clear();
    document.getElementById('ui').style.display = 'none';
    a.menu.setMode('title', { instant: true });
  });
  await p.waitForTimeout(1800);
  writeFileSync(`${out}/loading.webp`, await pngToWebp(b, await p.screenshot(), { quality: 0.72 }));
  await p.close();
  console.log('loading done');
}

// `thumbs` renders every map; naming a map renders just that one.
for (const [id, o] of Object.entries(SHOTS)) {
  if (!(want('thumbs') || which.includes(id))) continue;
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  p.on('pageerror', (e) => console.log(id, e.message));
  await p.goto(`${base}/lab.html?view=level&${o.url}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 90000 });
  await p.waitForTimeout(500);
  writeFileSync(`${out}/th_${id}.webp`, await pngToWebp(b, await p.screenshot(), { quality: 0.74, width: 480 }));
  await p.close();
  console.log('thumb', id);
}
await b.close();
