// Encodes pre-rendered art to WebP inside headless Chromium, so `npm run art` needs nothing installed
// beyond the project's own dependencies.

/**
 * @param {import('playwright').Browser} browser
 * @param {Buffer} png  source image
 * @param {object} o    quality 0-1, width to scale down to, trim to crop transparent margins
 * @returns {Promise<Buffer>} WebP bytes
 */
export async function pngToWebp(browser, png, { quality = 0.8, width = null, trim = false } = {}) {
  const page = await browser.newPage();
  try {
    const b64 = await page.evaluate(async ({ src, quality, width, trim }) => {
      const bitmap = await createImageBitmap(await (await fetch(src)).blob());
      let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
      if (trim) {
        const probe = new OffscreenCanvas(sw, sh).getContext('2d', { willReadFrequently: true });
        probe.drawImage(bitmap, 0, 0);
        const { data } = probe.getImageData(0, 0, sw, sh);
        let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            if (data[(y * sw + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        }
        if (x1 >= x0) { sx = x0; sy = y0; sw = x1 - x0 + 1; sh = y1 - y0 + 1; }
      }
      const w = width ?? sw, h = Math.round((sh * w) / sw);
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
      if (blob.type !== 'image/webp') throw new Error(`this browser encoded ${blob.type}, not WebP`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let out = '';
      for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(out);
    }, { src: `data:image/png;base64,${png.toString('base64')}`, quality, width, trim });
    return Buffer.from(b64, 'base64');
  } finally {
    await page.close();
  }
}
