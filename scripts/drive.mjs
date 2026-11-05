// Dev helper: open the game on the GPU with the SDK blocked, run a small script, and save screenshots.
//   node scripts/drive.mjs <scenario.mjs> [--igpu] [w] [h]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const igpu = args.includes('--igpu');
const pos = args.filter((a) => !a.startsWith('--'));
const scenario = pos[0];
const W = +(pos[1] || 1280), H = +(pos[2] || 720);
const base = process.env.BASE || 'http://127.0.0.1:5173';
// On Windows, Vulkan selects the discrete GPU and Direct3D 11 the integrated one.
const igpuFlags = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const flags = igpu ? igpuFlags : ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ headless: true, channel: 'chromium', args: flags });
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: args.includes('--touch'), isMobile: args.includes('--touch') });
const p = await ctx.newPage();
const logs = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 500)}`); });
p.on('pageerror', (e) => logs.push(`PAGEERR ${String(e.stack || e).slice(0, 1400)}`));
await p.route('https://sdk.crazygames.com/**', (r) => r.abort());
const open = async (url = '/?menu=1') => {
  await p.goto(base + url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 90000 });
};
const shot = (name) => p.screenshot({ path: `shots/${name}.png` });
const mod = await import(pathToFileURL(path.resolve(scenario)).href);
try { await mod.default({ p, open, shot, ctx }); } catch (e) { logs.push(`SCENARIO ${e.stack || e}`); }
console.log(logs.join('\n') || 'no errors');
await b.close();
