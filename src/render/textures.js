// Procedural textures painted once at load. No image files are downloaded for any of these.
import * as THREE from 'three';
import { rng, clamp } from './geo.js';

const cache = new Map();
let anisotropy = 4;
export function setAnisotropy(a) { anisotropy = a; }

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTexture(canvas, { srgb = true, repeat = false, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function memo(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const v = fn();
  cache.set(key, v);
  return v;
}

/** Separable box blur, repeated, on a tiling Float32 height field. */
function blurField(f, w, h, radius, passes = 2) {
  const tmp = new Float32Array(f.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += f[y * w + ((k + w) % w)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / (2 * radius + 1);
        sum += f[y * w + ((x + radius + 1) % w)] - f[y * w + ((x - radius + w) % w)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[((k + h) % h) * w + x];
      for (let y = 0; y < h; y++) {
        f[y * w + x] = sum / (2 * radius + 1);
        sum += tmp[((y + radius + 1) % h) * w + x] - tmp[((y - radius + h) % h) * w + x];
      }
    }
  }
  return f;
}

/** Tangent-space normal map from a height field. */
export function normalFromField(f, w, h, strength = 2, { repeat = true } = {}) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w, yd = ((y + 1) % h) * w, yy = y * w;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w;
      const dx = (f[yy + xr] - f[yy + xl]) * strength;
      const dy = (f[yd + x] - f[yu + x]) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (yy + x) * 4;
      // DataTextures are not flipped, so +Y of the normal lines up with increasing row index.
      data[i] = (-dx / l) * 127.5 + 127.5;
      data[i + 1] = (-dy / l) * 127.5 + 127.5;
      data[i + 2] = (1 / l) * 127.5 + 127.5;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function fieldFromCanvas(c) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255;
  return f;
}

/** Wrapped sweet, drawn around the origin with width ~2 units. */
function candyPath(ctx) {
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.56, 0.44, 0, 0, Math.PI * 2);
  for (const sd of [1, -1]) {
    ctx.moveTo(sd * 0.46, 0);
    ctx.lineTo(sd * 1.06, -0.46);
    ctx.quadraticCurveTo(sd * 0.92, 0, sd * 1.06, 0.46);
    ctx.closePath();
  }
}

/**
 * Big glossy floor tile: mottled violet, with soft embossed sweets.
 * Tiles use UV 0..1 across the top face, so one texture covers a whole tile.
 */
export function tileTextures(size = 1024) {
  return memo(`tile${size}`, () => {
    const a = makeCanvas(size), h = makeCanvas(size);
    const ca = a.getContext('2d'), ch = h.getContext('2d');
    const R = rng(77);
    // The base is darker than the sweets; instance colours supply the violet hue.
    ca.fillStyle = '#b4adff'; ca.fillRect(0, 0, size, size);
    ch.fillStyle = '#000'; ch.fillRect(0, 0, size, size);
    for (let i = 0; i < 22; i++) {
      const x = R() * size, y = R() * size, r = size * R.range(0.1, 0.34);
      const g = ca.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.55;
      g.addColorStop(0, dark ? 'rgba(120,100,235,0.3)' : 'rgba(214,206,255,0.3)');
      g.addColorStop(1, dark ? 'rgba(120,100,235,0)' : 'rgba(214,206,255,0)');
      ca.fillStyle = g; ca.fillRect(0, 0, size, size);
    }
    const sweet = (x, y, s, rot) => {
      for (const [c, fill] of [[ca, 'rgba(255,240,255,0.92)'], [ch, '#fff']]) {
        c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
        candyPath(c);
        c.fillStyle = fill; c.fill();
        c.restore();
      }
    };
    const S = size;
    sweet(S * 0.3, S * 0.34, S * 0.115, -0.3);
    sweet(S * 0.74, S * 0.22, S * 0.07, 0.4);
    sweet(S * 0.72, S * 0.72, S * 0.105, -0.2);
    sweet(S * 0.24, S * 0.8, S * 0.065, 0.5);
    const f = fieldFromCanvas(h);
    blurField(f, size, size, Math.max(1, size >> 9), 2);
    return { albedo: toTexture(a), normal: normalFromField(f, size, size, 2.6 * (size / 1024), { repeat: false }) };
  });
}

/**
 * Stitched leather panel used on the Haunted Floor: seams and thread around the edge plus soft creases.
 */
export function stitchTextures(size = 512) {
  return memo(`stitch${size}`, () => {
    const a = makeCanvas(size), h = makeCanvas(size);
    const ca = a.getContext('2d'), ch = h.getContext('2d');
    ca.fillStyle = '#ffffff'; ca.fillRect(0, 0, size, size);
    ch.fillStyle = '#808080'; ch.fillRect(0, 0, size, size);
    const R = rng(5);
    for (let i = 0; i < 40; i++) {
      const x = R() * size, y = R() * size, r = size * R.range(0.05, 0.22);
      const g = ch.createRadialGradient(x, y, 0, x, y, r);
      const up = R() < 0.5;
      g.addColorStop(0, up ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      ch.fillStyle = g; ch.fillRect(0, 0, size, size);
    }
    const inset = size * 0.075;
    ch.lineWidth = size * 0.016; ch.strokeStyle = 'rgba(30,30,30,0.9)';
    ch.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
    ca.lineCap = 'round';
    ca.strokeStyle = 'rgba(90,60,170,0.55)'; ca.lineWidth = size * 0.012;
    ca.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
    const stitch = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.round(len / (size * 0.05));
      for (let i = 0; i < n; i++) {
        const t0 = (i + 0.2) / n, t1 = (i + 0.72) / n;
        const px0 = x0 + (x1 - x0) * t0, py0 = y0 + (y1 - y0) * t0, px1 = x0 + (x1 - x0) * t1, py1 = y0 + (y1 - y0) * t1;
        ca.strokeStyle = 'rgba(232,214,255,0.95)'; ca.lineWidth = size * 0.012;
        ca.beginPath(); ca.moveTo(px0, py0); ca.lineTo(px1, py1); ca.stroke();
        ch.strokeStyle = '#fff'; ch.lineWidth = size * 0.016;
        ch.beginPath(); ch.moveTo(px0, py0); ch.lineTo(px1, py1); ch.stroke();
      }
    };
    const k = inset * 1.42;
    stitch(k, k, size - k, k); stitch(size - k, k, size - k, size - k);
    stitch(size - k, size - k, k, size - k); stitch(k, size - k, k, k);
    const f = fieldFromCanvas(h);
    blurField(f, size, size, 1, 2);
    return { albedo: toTexture(a), normal: normalFromField(f, size, size, 4, { repeat: false }) };
  });
}

/** Stone bricks that tile; albedo stays near-white so vertex colour tints each castle piece. */
export function brickTextures(size = 1024) {
  return memo(`brick${size}`, () => {
    const a = makeCanvas(size), h = makeCanvas(size);
    const ca = a.getContext('2d'), ch = h.getContext('2d');
    const R = rng(21);
    ca.fillStyle = '#b8b0d8'; ca.fillRect(0, 0, size, size);
    ch.fillStyle = '#000'; ch.fillRect(0, 0, size, size);
    const rows = 8, cols = 5;
    const rh = size / rows, cw = size / cols;
    const gap = size * 0.006;
    const round = (c, x, y, w, hh, r) => {
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, w, hh, r); else c.rect(x, y, w, hh);
      c.fill();
    };
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? cw / 2 : 0;
      for (let i = -1; i <= cols; i++) {
        const x = i * cw + off + gap, y = j * rh + gap, w = cw - gap * 2, hh = rh - gap * 2;
        const v = R.range(0.84, 1);
        const g = ca.createLinearGradient(0, y, 0, y + hh);
        const c0 = Math.round(255 * v), c1 = Math.round(218 * v);
        g.addColorStop(0, `rgb(${c0},${c0},${c0})`);
        g.addColorStop(1, `rgb(${c1},${c1},${Math.round(c1 * 1.04)})`);
        ca.fillStyle = g;
        round(ca, x, y, w, hh, size * 0.018);
        const hg = R.range(0.7, 1);
        const hc = Math.round(255 * hg);
        ch.fillStyle = `rgb(${hc},${hc},${hc})`;
        round(ch, x, y, w, hh, size * 0.018);
      }
    }
    const f = fieldFromCanvas(h);
    blurField(f, size, size, Math.max(1, size >> 9), 2);
    return { albedo: toTexture(a, { repeat: true }), normal: normalFromField(f, size, size, 2.2 * (size / 1024)) };
  });
}

/** Repeating diagonal candy stripes. */
export function stripeTexture(c1 = '#ff8412', c2 = '#7a2be0', { size = 512, bands = 2, diag = true, highlight = true } = {}) {
  return memo(`stripe${c1}${c2}${bands}${diag}`, () => {
    const c = makeCanvas(size), x = c.getContext('2d');
    x.fillStyle = c1; x.fillRect(0, 0, size, size);
    x.fillStyle = c2;
    const w = size / bands;
    for (let i = -bands * 2; i < bands * 2; i++) {
      x.beginPath();
      const x0 = i * w * 1;
      if (diag) {
        x.moveTo(x0, size); x.lineTo(x0 + w / 2, size); x.lineTo(x0 + w / 2 + size, 0); x.lineTo(x0 + size, 0);
      } else {
        x.moveTo(x0, 0); x.lineTo(x0 + w / 2, 0); x.lineTo(x0 + w / 2, size); x.lineTo(x0, size);
      }
      x.closePath(); x.fill();
    }
    if (highlight) {
      const g = x.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, 'rgba(255,255,255,0.0)');
      g.addColorStop(1, 'rgba(0,0,0,0.0)');
      x.fillStyle = g; x.fillRect(0, 0, size, size);
    }
    return toTexture(c, { repeat: true });
  });
}

/** Soft round alpha glow. */
export function glowTexture(size = 256) {
  return memo(`glow${size}`, () => {
    const c = makeCanvas(size), x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return toTexture(c, { mips: true });
  });
}

/** Painted full moon with soft craters. */
export function moonTexture(size = 1024) {
  return memo(`moon${size}`, () => {
    const c = makeCanvas(size), x = c.getContext('2d');
    const R = rng(99);
    const s = size / 2;
    const g = x.createRadialGradient(s * 0.85, s * 0.8, s * 0.1, s, s, s);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.7, '#fff0e2');
    g.addColorStop(1, '#ffe0d6');
    x.fillStyle = g;
    x.beginPath(); x.arc(s, s, s * 0.995, 0, 7); x.fill();
    x.save();
    x.beginPath(); x.arc(s, s, s * 0.995, 0, 7); x.clip();
    for (let i = 0; i < 46; i++) {
      const px = R() * size, py = R() * size, r = size * (R() < 0.15 ? R.range(0.05, 0.12) : R.range(0.008, 0.04));
      const cg = x.createRadialGradient(px + r * 0.15, py + r * 0.2, r * 0.1, px, py, r);
      cg.addColorStop(0, `rgba(240,200,190,${R.range(0.14, 0.3)})`);
      cg.addColorStop(0.75, 'rgba(240,206,196,0.12)');
      cg.addColorStop(1, 'rgba(255,240,226,0)');
      x.fillStyle = cg;
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    x.restore();
    return toTexture(c);
  });
}

/** Four puffy cloud variants in one atlas (2 x 2). Colour comes from the material tint at runtime. */
export function cloudAtlas(size = 1024) {
  return memo(`cloud${size}`, () => {
    const atlas = makeCanvas(size, size), out = atlas.getContext('2d');
    const R = rng(1234);
    const cell = size / 2;
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const c = makeCanvas(cell, cell), x = c.getContext('2d');
        const puffs = [];
        const n = 13 + Math.floor(R() * 8);
        const base = cell * 0.68;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const env = Math.pow(Math.sin(t * Math.PI), 0.8);
          const r = cell * (0.03 + env * R.range(0.05, 0.13));
          puffs.push({ x: cell * (0.1 + t * 0.8) + R.range(-6, 6), y: base - r * 0.55 - env * cell * R.range(0, 0.09), r });
        }
        // A flat-ish base keeps the silhouette reading as stylised cumulus.
        for (let i = 0; i < 7; i++) {
          const t = (i + 0.5) / 7;
          puffs.push({ x: cell * (0.08 + t * 0.84), y: base + cell * 0.004, r: cell * (0.028 + Math.sin(t * Math.PI) * 0.03) });
        }
        // Mask: soft-edged union.
        for (const p of puffs) {
          const g = x.createRadialGradient(p.x, p.y, p.r * 0.72, p.x, p.y, p.r);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = g;
          x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill();
        }
        x.globalCompositeOperation = 'source-atop';
        const v = x.createLinearGradient(0, cell * 0.25, 0, base + cell * 0.04);
        v.addColorStop(0, 'rgb(255,250,255)');
        v.addColorStop(0.62, 'rgb(236,222,255)');
        v.addColorStop(1, 'rgb(176,150,236)');
        x.fillStyle = v; x.fillRect(0, 0, cell, cell);
        // Each puff gets a lit crown and a shaded lower-right, which is what makes it look inflated.
        for (const p of puffs) {
          const s1 = x.createRadialGradient(p.x + p.r * 0.34, p.y + p.r * 0.46, 0, p.x + p.r * 0.34, p.y + p.r * 0.46, p.r * 0.95);
          s1.addColorStop(0, 'rgba(150,120,225,0.34)'); s1.addColorStop(1, 'rgba(150,120,225,0)');
          x.fillStyle = s1; x.fillRect(p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
        }
        for (const p of puffs) {
          const s2 = x.createRadialGradient(p.x - p.r * 0.28, p.y - p.r * 0.42, 0, p.x - p.r * 0.28, p.y - p.r * 0.42, p.r * 0.8);
          s2.addColorStop(0, 'rgba(255,255,255,0.62)'); s2.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = s2; x.fillRect(p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
        }
        out.drawImage(c, cx * cell, cy * cell);
      }
    }
    return toTexture(atlas);
  });
}

/** Particle atlas: 4 x 4 cells (soft dot, star, spark, puff, square, candy, leaf, ring, bat, heart, drop, pumpkin...). */
export function particleAtlas(size = 512) {
  return memo(`part${size}`, () => {
    const c = makeCanvas(size), x = c.getContext('2d');
    const n = 4, s = size / n;
    const cell = (i, draw) => {
      const cx = (i % n) * s + s / 2, cy = Math.floor(i / n) * s + s / 2;
      x.save(); x.translate(cx, cy); x.beginPath(); x.rect(-s / 2, -s / 2, s, s); x.clip(); draw(s / 2); x.restore();
    };
    const glow = (r) => {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2);
    };
    cell(0, glow);
    cell(1, (r) => { // star
      x.fillStyle = '#fff'; x.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2, q = i % 2 ? r * 0.42 : r * 0.88;
        x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * q, Math.sin(a) * q);
      }
      x.closePath(); x.fill();
    });
    cell(2, (r) => { // 4-point spark
      x.fillStyle = '#fff'; x.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, q = i % 2 ? r * 0.12 : r * 0.95;
        x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * q, Math.sin(a) * q);
      }
      x.closePath(); x.fill();
    });
    cell(3, (r) => { // puff
      const R = rng(9);
      for (let i = 0; i < 10; i++) {
        const a = R() * 6.28, d = R() * r * 0.45, pr = r * R.range(0.28, 0.5);
        const px = Math.cos(a) * d, py = Math.sin(a) * d;
        const g = x.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2);
      }
    });
    cell(4, (r) => { x.fillStyle = '#fff'; x.fillRect(-r * 0.5, -r * 0.8, r, r * 1.6); }); // confetti
    cell(5, (r) => { // candy corn (white/orange/yellow baked in)
      x.beginPath(); x.moveTo(0, -r * 0.85); x.lineTo(r * 0.72, r * 0.72); x.quadraticCurveTo(0, r * 0.95, -r * 0.72, r * 0.72); x.closePath(); x.clip();
      x.fillStyle = '#ffd23a'; x.fillRect(-r, r * 0.25, r * 2, r);
      x.fillStyle = '#ff8412'; x.fillRect(-r, -r * 0.25, r * 2, r * 0.5);
      x.fillStyle = '#fff4e0'; x.fillRect(-r, -r, r * 2, r * 0.75);
    });
    cell(6, (r) => { // bat silhouette
      x.fillStyle = '#fff'; x.beginPath();
      x.moveTo(0, -r * 0.1);
      x.quadraticCurveTo(r * 0.3, -r * 0.5, r * 0.95, -r * 0.45);
      x.quadraticCurveTo(r * 0.7, -r * 0.05, r * 0.72, r * 0.25);
      x.quadraticCurveTo(r * 0.45, 0, r * 0.3, r * 0.3);
      x.quadraticCurveTo(r * 0.12, r * 0.1, 0, r * 0.4);
      x.quadraticCurveTo(-r * 0.12, r * 0.1, -r * 0.3, r * 0.3);
      x.quadraticCurveTo(-r * 0.45, 0, -r * 0.72, r * 0.25);
      x.quadraticCurveTo(-r * 0.7, -r * 0.05, -r * 0.95, -r * 0.45);
      x.quadraticCurveTo(-r * 0.3, -r * 0.5, 0, -r * 0.1);
      x.closePath(); x.fill();
    });
    cell(7, (r) => { x.strokeStyle = '#fff'; x.lineWidth = r * 0.14; x.beginPath(); x.arc(0, 0, r * 0.78, 0, 7); x.stroke(); }); // ring
    cell(8, (r) => { // drop
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -r * 0.9);
      x.bezierCurveTo(r * 0.75, -r * 0.1, r * 0.55, r * 0.8, 0, r * 0.8);
      x.bezierCurveTo(-r * 0.55, r * 0.8, -r * 0.75, -r * 0.1, 0, -r * 0.9); x.fill();
    });
    cell(9, (r) => { // heart
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, r * 0.75);
      x.bezierCurveTo(-r * 1.1, 0, -r * 0.6, -r * 0.9, 0, -r * 0.3);
      x.bezierCurveTo(r * 0.6, -r * 0.9, r * 1.1, 0, 0, r * 0.75); x.fill();
    });
    cell(10, (r) => { // tiny ghost
      x.fillStyle = '#fff'; x.beginPath(); x.arc(0, -r * 0.2, r * 0.58, Math.PI, 0);
      x.lineTo(r * 0.58, r * 0.7);
      x.quadraticCurveTo(r * 0.3, r * 0.4, 0, r * 0.7);
      x.quadraticCurveTo(-r * 0.3, r * 0.4, -r * 0.58, r * 0.7);
      x.closePath(); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.ellipse(-r * 0.2, -r * 0.2, r * 0.1, r * 0.15, 0, 0, 7); x.ellipse(r * 0.2, -r * 0.2, r * 0.1, r * 0.15, 0, 0, 7); x.fill();
    });
    cell(11, (r) => { // bubble
      x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = r * 0.12; x.beginPath(); x.arc(0, 0, r * 0.72, 0, 7); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.arc(0, 0, r * 0.68, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(-r * 0.28, -r * 0.3, r * 0.14, r * 0.2, 0.6, 0, 7); x.fill();
    });
    return toTexture(c);
  });
}

/** Pumpkin-face pennant for the hanging banners. */
export function bannerTexture(size = 256) {
  return memo('banner', () => {
    const c = makeCanvas(size, size * 1.5), x = c.getContext('2d');
    const w = size, h = size * 1.5;
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3a1c78'); g.addColorStop(1, '#231050');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff8a17';
    x.beginPath(); x.ellipse(w / 2, h * 0.45, w * 0.32, w * 0.27, 0, 0, 7); x.fill();
    x.fillStyle = '#3d7a2a'; x.fillRect(w * 0.47, h * 0.26, w * 0.07, h * 0.06);
    x.fillStyle = '#2a0f04';
    const tri = (cx, cy, r, f) => { x.beginPath(); x.moveTo(cx - r, cy + r * 0.7); x.lineTo(cx + r, cy + r * 0.7); x.lineTo(cx + f * r * 0.4, cy - r * 0.8); x.closePath(); x.fill(); };
    tri(w * 0.38, h * 0.41, w * 0.075, 1); tri(w * 0.62, h * 0.41, w * 0.075, -1);
    x.beginPath(); x.moveTo(w * 0.28, h * 0.5); x.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.72, h * 0.5);
    x.quadraticCurveTo(w * 0.5, h * 0.54, w * 0.28, h * 0.5); x.closePath(); x.fill();
    return toTexture(c);
  });
}

/** Cut-out shape helper for a jack-o'-lantern face painted into a face texture. */
export function roundedPoly(ctx, pts, r) {
  ctx.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v1x = p0[0] - p1[0], v1y = p0[1] - p1[1], v2x = p2[0] - p1[0], v2y = p2[1] - p1[1];
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
    const q = Math.min(r, l1 / 2, l2 / 2);
    const ax = p1[0] + (v1x / l1) * q, ay = p1[1] + (v1y / l1) * q, bx = p1[0] + (v2x / l2) * q, by = p1[1] + (v2y / l2) * q;
    if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(p1[0], p1[1], bx, by);
  }
  ctx.closePath();
}

/**
 * Generic jack-o'-lantern face drawn into three layers:
 *   albedo  — dark carved interior with an inner gradient,
 *   emissive — candle glow inside the cuts,
 *   mask    — blurred carve mask read back to displace the head mesh.
 * Coordinates are in a square of size S with the face centred.
 */
export function paintJackFace(S, opts = {}) {
  const {
    glow = 0.9, // 0 = no candle, 1 = fully lit
    eye = 'tri', mouth = 'grin', innerA = '#ffd54a', innerB = '#ff8a1a', dark = '#2a0f04', teeth = 2, scary = false,
  } = opts;
  const albedo = makeCanvas(S), emis = makeCanvas(S), mask = makeCanvas(S);
  const a = albedo.getContext('2d'), e = emis.getContext('2d'), m = mask.getContext('2d', { willReadFrequently: true });
  a.fillStyle = '#fff'; a.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  m.fillStyle = '#000'; m.fillRect(0, 0, S, S);
  const u = S / 100;

  const shapes = [];
  const eyeL = eye === 'tri'
    ? (scary ? [[27, 46], [46, 40], [37, 25]] : [[26, 47], [46, 47], [34, 26]])
    : [[28, 42], [44, 42], [44, 42]];
  const mirror = (pts) => pts.map(([x, y]) => [100 - x, y]);
  shapes.push({ pts: eyeL, r: 3.2, kind: 'eye' }, { pts: mirror(eyeL), r: 3.2, kind: 'eye' });
  shapes.push({ pts: [[46.5, 53.5], [53.5, 53.5], [50, 47.5]], r: 1.4, kind: 'nose' });

  // Mouth polygon, with teeth notches when requested.
  let mouthPts;
  if (mouth === 'smile') {
    mouthPts = [[23, 59], [33, 62], [50, 63.5], [67, 62], [77, 59], [72, 72], [60, 79], [50, 80.5], [40, 79], [28, 72]];
  } else if (mouth === 'zig') {
    mouthPts = [[20, 58], [30, 63], [36, 58], [43, 64], [50, 59], [57, 64], [64, 58], [70, 63], [80, 58], [72, 72], [62, 78], [55, 72], [50, 79], [45, 72], [38, 78], [28, 72]];
  } else { // grin with two square teeth
    mouthPts = teeth >= 2
      ? [[21, 57], [34, 60.5], [36, 66.5], [44, 67.5], [45.5, 62], [54.5, 62], [56, 67.5], [64, 66.5], [66, 60.5], [79, 57], [74, 71], [63, 79], [58.5, 73], [50, 75], [41.5, 73], [37, 79], [26, 71]]
      : [[21, 57], [38, 62], [40, 68], [48, 68], [49, 63], [79, 57], [74, 71], [60, 80], [40, 80], [26, 71]];
  }
  shapes.push({ pts: mouthPts, r: 2.6, kind: 'mouth' });

  const scaled = (pts) => pts.map(([x, y]) => [x * u, y * u]);
  for (const s of shapes) {
    const pts = scaled(s.pts);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minY = Math.min(...ys), maxY = Math.max(...ys), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    roundedPoly(a, pts, s.r * u);
    a.fillStyle = dark; a.fill();
    // Interior light: brightest low in the cut, as if a candle sits behind the face.
    const g = a.createRadialGradient(cx, maxY - (maxY - minY) * 0.3, 0, cx, maxY - (maxY - minY) * 0.3, (maxY - minY) * 1.05);
    g.addColorStop(0, innerA); g.addColorStop(0.55, innerB); g.addColorStop(1, dark);
    a.save(); roundedPoly(a, pts, s.r * u); a.clip();
    a.globalAlpha = glow > 0.05 ? 1 : 0.25; a.fillStyle = g; a.fillRect(0, 0, S, S);
    a.globalAlpha = 1;
    // Dark rim, drawn inside the shape, reads as the thickness of the pumpkin wall.
    a.lineWidth = 2.6 * u; a.strokeStyle = dark; roundedPoly(a, pts, s.r * u); a.stroke();
    a.restore();
    if (glow > 0.05) {
      const eg = e.createRadialGradient(cx, maxY - (maxY - minY) * 0.3, 0, cx, maxY - (maxY - minY) * 0.3, (maxY - minY) * 1.0);
      eg.addColorStop(0, `rgba(255,242,150,${glow})`);
      eg.addColorStop(0.55, `rgba(255,190,50,${glow * 0.95})`);
      eg.addColorStop(1, `rgba(255,120,10,${glow * 0.5})`);
      e.save(); roundedPoly(e, pts, s.r * u); e.clip(); e.fillStyle = eg; e.fillRect(0, 0, S, S); e.restore();
    }
    roundedPoly(m, pts, s.r * u);
    m.fillStyle = '#fff'; m.fill();
  }
  return { albedo, emis, mask, sampler: maskSampler(mask) };
}

/**
 * The hero's friendly smile: a wide dark mouth with square teeth and a warm candle glow low inside it.
 * Eyes are modelled as glossy domes, so only the mouth and nose live in the texture.
 */
export function paintHeroFace(S, { dark = '#2a0e06', glow = '#ffb22e', lip = 'rgba(176,62,0,0.6)', base = '#ffffff', lowerTooth = true } = {}) {
  const albedo = makeCanvas(S), emis = makeCanvas(S);
  const a = albedo.getContext('2d'), e = emis.getContext('2d');
  a.fillStyle = '#ffffff'; a.fillRect(0, 0, S, S);
  a.fillStyle = base; a.beginPath(); a.arc(S / 2, S / 2, S * 0.505, 0, 7); a.fill();
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const u = S / 100;
  // Wide smile, drawn in the fish-eye face space: two square teeth from above, two from below.
  const P = [[29.5, 50.5], [36, 54], [41.5, 55.5], [42, 61], [46.8, 61.5], [47.2, 56], [52.8, 56], [53.2, 61.5], [58, 61], [58.5, 55.5], [64, 54], [70.5, 50.5], [68, 61], [62, 67.5], [57.5, 70.6], [56.5, 66.2], [52.2, 66.2], [51.6, 71.6], [48.4, 71.6], [47.8, 66.2], [43.5, 66.2], [42.5, 70.6], [38, 67.5], [32, 61]]
    .map(([x, y]) => [x * u, y * u]);
  const corner = 0.9 * u;
  // Soft lip so the cut reads as having depth.
  roundedPoly(a, P, corner); a.lineWidth = 1.5 * u; a.strokeStyle = lip; a.lineJoin = 'round'; a.stroke();
  roundedPoly(a, P, corner); a.fillStyle = dark; a.fill();
  a.save(); roundedPoly(a, P, corner); a.clip();
  const g = a.createRadialGradient(50 * u, 73 * u, 0, 50 * u, 73 * u, 7.5 * u);
  g.addColorStop(0, glow); g.addColorStop(0.5, 'rgba(255,120,30,0.42)'); g.addColorStop(1, 'rgba(255,90,20,0)');
  a.fillStyle = g; a.fillRect(0, 0, S, S);
  a.restore();
  if (lowerTooth) {
    e.save(); roundedPoly(e, P, corner); e.clip();
    const eg = e.createRadialGradient(50 * u, 73 * u, 0, 50 * u, 73 * u, 6 * u);
    eg.addColorStop(0, 'rgba(255,170,60,0.55)'); eg.addColorStop(1, 'rgba(120,30,0,0)');
    e.fillStyle = eg; e.fillRect(0, 0, S, S); e.restore();
  }
  // Tiny nose.
  a.fillStyle = dark;
  a.beginPath(); a.ellipse(50 * u, 47.4 * u, 1.3 * u, 0.9 * u, 0, 0, 7); a.fill();
  a.lineWidth = 0.8 * u; a.strokeStyle = dark; a.lineCap = 'round';
  a.beginPath(); a.moveTo(48.2 * u, 47.9 * u); a.quadraticCurveTo(50 * u, 49.2 * u, 51.8 * u, 47.9 * u); a.stroke();
  return { albedo, emis };
}

/** Bilinear sampler over a blurred mask canvas, used to displace head vertices inward. */
export function maskSampler(canvas, blur = 3) {
  const w = canvas.width, h = canvas.height;
  const f = fieldFromCanvas(canvas);
  blurField(f, w, h, Math.max(1, Math.round((blur * w) / 256)), 2);
  return (u, v) => {
    const x = clamp(u) * (w - 1), y = (1 - clamp(v)) * (h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = f[y0 * w + x0], b = f[y0 * w + x1], c = f[y1 * w + x0], d = f[y1 * w + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
