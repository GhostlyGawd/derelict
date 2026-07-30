/**
 * Renders a specimen sheet for the generated stencil alphabet: the full
 * charset, the three compartment labels, and those labels put through the
 * texture crunch at the cap heights they actually reach on screen.
 *
 * This is the evidence for phase 3 build step 1 — "proven legible on its own
 * before a single label is placed". A pixel measurement cannot tell anyone
 * whether type reads, so the deliverable is an image a human looks at.
 *
 *   node tools/specimen.mjs   → tools/shots/glyphs.png
 */
import sharp from 'sharp';
import { CHARSET, rasteriseGlyph } from '../pipeline/lib/glyphs.js';
import { rng } from '../pipeline/lib/raster.js';

const W = 1000;
const H = 560;
const buf = new Uint8ClampedArray(W * H * 3);
// Gunmetal, like a bulkhead.
for (let i = 0; i < buf.length; i += 3) {
  buf[i] = 44;
  buf[i + 1] = 48;
  buf[i + 2] = 45;
}

function blit(mask, dx, dy, scale = 1, paint = [226, 230, 222]) {
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      const a = mask.data[y * mask.w + x];
      if (a <= 0.01) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = dx + x * scale + sx;
          const py = dy + y * scale + sy;
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          const i = (py * W + px) * 3;
          buf[i] = buf[i] * (1 - a) + paint[0] * a;
          buf[i + 1] = buf[i + 1] * (1 - a) + paint[1] * a;
          buf[i + 2] = buf[i + 2] * (1 - a) + paint[2] * a;
        }
      }
    }
  }
}

/** Lays out a string, returning its pixel width. */
function text(str, cap, dx, dy, { scale = 1, jitter = 0, seed = 7, paint } = {}) {
  const random = rng(seed);
  let x = dx;
  for (const ch of str) {
    const mask = rasteriseGlyph(ch, cap, { jitter, random });
    blit(mask, x - mask.pad * scale, dy, scale, paint);
    x += Math.round(mask.advance + cap * 0.17) * scale;
  }
  return x - dx;
}

/** Simulates the texture crunch: render big, box-downsample, nearest upscale. */
function crunched(str, cap, shrink, dx, dy, upscale) {
  const random = rng(11);
  const masks = [...str].map((ch) => rasteriseGlyph(ch, cap, { jitter: 0.02, random }));
  const totalW = masks.reduce((n, m) => n + Math.round(m.advance + cap * 0.17), 0) + 8;
  const totalH = masks[0].h + 4;
  const line = new Float32Array(totalW * totalH);
  let x = 4;
  for (const m of masks) {
    for (let y = 0; y < m.h; y++) {
      for (let xx = 0; xx < m.w; xx++) {
        const a = m.data[y * m.w + xx];
        const px = x - m.pad + xx;
        if (px < 0 || px >= totalW) continue;
        const i = y * totalW + px;
        if (a > line[i]) line[i] = a;
      }
    }
    x += Math.round(m.advance + cap * 0.17);
  }

  const sw = Math.max(1, Math.round(totalW / shrink));
  const sh = Math.max(1, Math.round(totalH / shrink));
  const small = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let xx = 0; xx < sw; xx++) {
      let sum = 0;
      let n = 0;
      for (let oy = 0; oy < shrink; oy++) {
        for (let ox = 0; ox < shrink; ox++) {
          const sxp = Math.round(xx * shrink + ox);
          const syp = Math.round(y * shrink + oy);
          if (sxp >= totalW || syp >= totalH) continue;
          sum += line[syp * totalW + sxp];
          n++;
        }
      }
      small[y * sw + xx] = n ? sum / n : 0;
    }
  }
  blit({ w: sw, h: sh, data: small, pad: 0 }, dx, dy, upscale);
  return sh * upscale;
}

let y = 14;
text('ABCDEFGHIJKLM', 26, 16, y);
y += 46;
text('NOPQRSTUVWXYZ', 26, 16, y);
y += 46;
text('0123456789 -.:/() O0', 26, 16, y);
y += 52;

text('STORAGE HOLD', 26, 16, y, { jitter: 0.03, seed: 3 });
y += 46;
text('ENGINE ANNEX', 26, 16, y, { jitter: 0.03, seed: 9 });
y += 46;
text('AIRLOCK BAY', 26, 16, y, { jitter: 0.03, seed: 5 });
y += 56;

// The sizes that actually matter, magnified so the pixel grid is visible.
text('CAP 11PX, 4x:', 13, 16, y, { paint: [150, 170, 150] });
y += 26;
crunched('STORAGE HOLD', 44, 4, 16, y, 4);
y += 60;
text('CAP 8PX, 5x:', 13, 16, y, { paint: [150, 170, 150] });
y += 26;
crunched('ENGINE ANNEX', 40, 5, 16, y, 5);

await sharp(Buffer.from(buf.buffer), { raw: { width: W, height: H, channels: 3 } })
  .png()
  .toFile('tools/shots/glyphs.png');
console.log('wrote tools/shots/glyphs.png');
