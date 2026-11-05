// Measures frame times during a real round, on the autopilot, against a built or running game.
//   node scripts/perf.mjs [--tier=low|medium|high] [--gpu=igpu|dgpu] [--lobby=16] [--level=pumpkinDash]
//                         [--seconds=15] [--size=1280x720] [--throttle=1] [--curse=id] [--base=url]
// Frame rate is uncapped so the result shows real headroom. On Windows, igpu is the integrated GPU
// (Direct3D 11) and dgpu the discrete one (Vulkan).
import { chromium } from 'playwright';

const f = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const base = f.base || process.env.BASE || 'http://127.0.0.1:5173';
const tier = f.tier || 'low', gpu = f.gpu || 'igpu', lobby = +(f.lobby || 16), level = f.level || 'pumpkinDash';
const seconds = +(f.seconds || 15), throttle = +(f.throttle || 1);
const [W, H] = (f.size || '1280x720').split('x').map(Number);
const backend = gpu === 'dgpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=gl-egl'];
const b = await chromium.launch({ headless: true, channel: 'chromium', args: [...backend, '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('https://sdk.crazygames.com/**', (r) => r.abort());
await page.addInitScript(() => localStorage.setItem('pumpkinparty.save', JSON.stringify({ flags: { tutorial: true, firstMatch: true }, daily: { lastDay: Math.floor(Date.now() / 86400000), streak: 1 }, stats: { matches: 8 }, settings: { quality: 'auto' } })));
if (throttle > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}
await page.goto(`${base}/?menu=1&bot=1&tier=${tier}&lobby=${lobby}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready===true', { timeout: 120000 });
const gl = await page.evaluate(() => {
  const g = window.__app.pipe.renderer.getContext();
  const d = g.getExtension('WEBGL_debug_renderer_info');
  return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
await page.evaluate(({ level, curse }) => {
  const a = window.__app;
  a.startMatch({ quick: true });
  a.match.plan[0] = { level, stage: 'opener', wildcard: false, isNew: false, quota: Math.max(1, a.lobbySize - 4) };
  a.match.curse = curse || null;
  a.match.disposeView();
  a.match.startRound(0);
}, { level, curse: f.curse });
await page.waitForFunction('window.__app.match?.phase==="play"', { timeout: 60000 });
const r = await page.evaluate(async (seconds) => {
  const a = window.__app;
  const work = [], frames = [];
  const original = a.frame;
  a.frame = function (now) { const s = performance.now(); original.call(this, now); work.push(performance.now() - s); };
  await new Promise((res) => {
    let last = performance.now();
    const end = last + seconds * 1000;
    const tick = () => {
      const t = performance.now();
      frames.push(t - last); last = t;
      if (t < end) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  a.frame = original;
  const info = a.pipe.renderer.info.render;
  return { frames, work, calls: info.calls, tris: info.triangles, tier: a.pipe.tier.name, scale: a.pipe.scale, racers: a.activeView?.sim.racers.filter((x) => x.active).length ?? 0 };
}, seconds);
await b.close();
const sorted = (a) => a.slice().sort((x, y) => x - y);
const q = (a, p) => sorted(a)[Math.min(a.length - 1, Math.floor(a.length * p))];
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const n = r.frames.length;
console.log(JSON.stringify({
  gpu: gl.replace(/^ANGLE \(|\)$/g, '').slice(0, 60), tier: r.tier, lobby, racers: r.racers, level, curse: f.curse || null, size: `${W}x${H}`, cpuThrottle: throttle, scale: +r.scale.toFixed(2),
  fps: +(n / (r.frames.reduce((x, y) => x + y, 0) / 1000)).toFixed(1),
  frameMs: { p50: +q(r.frames, 0.5).toFixed(1), p95: +q(r.frames, 0.95).toFixed(1), p99: +q(r.frames, 0.99).toFixed(1), max: +Math.max(...r.frames).toFixed(1) },
  jsMs: { avg: +avg(r.work).toFixed(2), p95: +q(r.work, 0.95).toFixed(2) },
  drawCalls: r.calls, triangles: r.tris, errors,
}));
