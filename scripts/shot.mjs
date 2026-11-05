// Dev helper: open a page in headless Chromium on the real GPU and save a screenshot.
//   node scripts/shot.mjs "<url path>" out.png [width] [height] [waitMs] [--igpu]
import { chromium } from 'playwright';

const [path = '/', out = 'shots/out.png', w = '1672', h = '941', wait = '1500'] = process.argv.slice(2);
const igpu = process.argv.includes('--igpu');
const base = process.env.BASE || 'http://127.0.0.1:5173';
// On Windows, Vulkan selects the discrete GPU and Direct3D 11 the integrated one.
const igpuFlags = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const args = igpu
  ? igpuFlags
  : ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'];
const b = await chromium.launch({ headless: true, channel: 'chromium', args });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${t.slice(0, 600)}`); else if (t.startsWith('[pp]')) logs.push(t); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e}`.slice(0, 1200)));
await p.goto(base + path, { waitUntil: 'load' });
try { await p.waitForFunction('window.__ready === true', { timeout: 60000 }); } catch { logs.push('[timeout] window.__ready never set'); }
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
console.log(logs.join('\n'));
await b.close();
