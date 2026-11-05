// CrazyGames submission media, rendered from the game itself.
//   covers: 1920x1080, 800x1200, 800x800. Text limited to the title, as the rules require.
//   videos: 15-20 s, silent, 1080p landscape and 2:3 portrait, opening on the cover.
// Needs the dev server. Usage: node scripts/make-promo.mjs [covers] [videos]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const base = process.env.BASE || 'http://127.0.0.1:5173';
const which = process.argv.slice(2);
const want = (k) => !which.length || which.includes(k);
const out = 'promo', tmp = 'shots/promo_tmp';
mkdirSync(out, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });

async function open(w, h, url) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.route('https://sdk.crazygames.com/**', (r) => r.abort());
  p.on('pageerror', (e) => console.log('page error', e.message));
  await p.addInitScript(() => localStorage.setItem('pumpkinparty.save', JSON.stringify({ flags: { tutorial: true, firstMatch: true, reviveUsed: false }, daily: { lastDay: Math.floor(Date.now() / 86400000), streak: 1 } })));
  await p.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready === true', { timeout: 90000 });
  return p;
}

/** Title scene plus logo. Framing adapts to the shape of the cover. */
async function cover(name, w, h, logoW, logoTop) {
  const p = await open(w, h, '/?menu=1&tier=high');
  await p.evaluate(() => {
    const a = window.__app;
    a.ui.clear();
    document.getElementById('ui').style.display = 'none';
    a.menu.setMode('title', { instant: true });
    a.pipe.setScale(1);
  });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${tmp}/${name}_bg.png` });
  await p.close();
  execFileSync('magick', [`${tmp}/${name}_bg.png`, '(', 'public/art/logo.webp', '-resize', `${logoW}x`, ')', '-gravity', 'north', '-geometry', `+0+${logoTop}`, '-composite', '-quality', '92', `${out}/cover-${name}.jpg`]);
  console.log('cover', name);
}

if (want('covers')) {
  await cover('landscape-1920x1080', 1920, 1080, 860, 12);
  await cover('portrait-800x1200', 800, 1200, 700, 40);
  await cover('square-800x800', 800, 800, 560, 10);
}

/** Render a list of shots frame by frame, at a fixed 30 fps, so GPU speed can't affect timing. */
async function video(name, w, h, coverFile) {
  const p = await open(w, h, '/?menu=1&capture=1&bot=1&tier=high');
  const dir = `${tmp}/${name}`;
  mkdirSync(dir, { recursive: true });
  await p.evaluate(() => {
    const a = window.__app;
    document.body.classList.add('capture-clean');
    a.ui.clear();
    a.menu.setMode('title', { instant: true });
  });
  let frame = 0;
  const snap = async () => { await p.screenshot({ path: `${dir}/f${String(frame++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 }); };
  const run = async (seconds, every = 1) => {
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n; i++) {
      await p.evaluate(async (s) => { for (let k = 0; k < s; k++) await window.__app.stepFrame(1 / 30 / s); }, every);
      await snap();
    }
  };
  // Open on the cover for a smooth hand-over from the static image, then the title scene moving.
  execFileSync('magick', [coverFile, '-resize', `${w}x${h}^`, '-gravity', 'center', '-extent', `${w}x${h}`, '-quality', '92', `${dir}/f00000.jpg`]);
  frame = 1;
  await run(1.3);
  const clip = async (id, lead, secs) => {
    await p.evaluate((level) => {
      const a = window.__app;
      a.ui.clear();
      a.match?.disposeView();
      a.hud.unmount();
      a.startPractice(level);
      if (a.match.view?.intro) a.match.view.skipIntro();
    }, id);
    // Run the countdown and the lead-in unrecorded, so the clip starts mid-action.
    await p.evaluate(async (t) => { const n = Math.round(t * 30); for (let i = 0; i < n; i++) await window.__app.stepFrame(1 / 30); }, lead);
    await run(secs);
  };
  await clip('pumpkinDash', 8, 5.2);
  await clip('ghostChase', 7, 3.2);
  await clip('witchsPlatform', 9, 3.2);
  await clip('finalShowdown', 8, 3.4);
  await p.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/f%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', '-an', `${out}/${name}.mp4`]);
  console.log('video', name);
}

if (want('videos')) {
  await video('preview-landscape-1080p', 1920, 1080, `${out}/cover-landscape-1920x1080.jpg`);
  await video('preview-portrait-1080p', 1080, 1620, `${out}/cover-portrait-800x1200.jpg`);
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
