import { PALETTE as P } from '../style-bible.js';
import { rasteriseGlyph } from '../lib/glyphs.js';
import { Raster, fbm, mix, rng, tint } from '../lib/raster.js';

/**
 * Offline texture synthesis.
 *
 * Used when the pipeline runs with `--backend=offline`, i.e. with no image
 * generation credentials available. Each surface is built from the same
 * palette and the same wear vocabulary the style bible describes, so the set
 * stays coherent, and every result is tileable.
 */

export function synthesiseTexture(spec, size) {
  const seed = seedOf(spec.id);
  switch (spec.synth) {
    case 'wall':
      return wallPanel(size, seed, spec.variant | 0);
    case 'floor':
      return floorPlate(size, seed);
    case 'ceiling':
      return ceilingPlate(size, seed);
    case 'greeble':
      return greeblePanel(size, seed);
    case 'trim':
      return doorTrim(size, seed);
    case 'conduit':
      return conduitStrip(size, seed);
    default:
      return wallPanel(size, seed, 0);
  }
}

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rivetRow(r, x0, y0, x1, y1, count, radius, colour) {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    r.rivet(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), radius, colour);
  }
}

/* ------------------------------------------------------------------ walls */

/**
 * Text-shaped stencil wear — the "suggestive small print" of spec 3.3.
 *
 * Drawn with the same glyph generator as the readable signage, at a scale and
 * contrast where it registers as markings from across the room and never
 * resolves into words. That is the point: without it the twelve legible
 * markings look like the only writing on a ship that otherwise has none.
 *
 * The characters are drawn from a pool at random, so no run can accidentally
 * spell anything, and `Raster.set` wraps at the edges so a run that overhangs
 * simply continues on the far side and stays tileable.
 */
function stencilPrint(r, seed, { runs = 3, cap = 13, alpha = 0.17, colour } = {}) {
  const place = rng(seed);
  const shape = rng(seed + 3);

  // Codes rather than characters. Random letters read as noise — as a smear
  // with no reason to be there — where a plate number or a pressure rating
  // reads as something a shipyard stencilled on for a reason, even when it is
  // far too small to make out. None of these can spell a word.
  const LETTERS = 'ABCDEFHJKLMNPRSTVX';
  const L = () => LETTERS[(place() * LETTERS.length) | 0];
  const N = (n) => String((place() * Math.pow(10, n)) | 0).padStart(n, '0');
  const FORMS = [
    () => `${L()}-${N(2)}`,
    () => `${L()}${L()} ${N(3)}`,
    () => `${N(2)}${L()}`,
    () => `${L()}${N(3)}`,
    () => `MK ${['I', 'II', 'III', 'IV', 'V'][(place() * 5) | 0]}`,
    () => `${N(3)} KPA`,
    () => `SEC ${N(1)}`,
  ];

  for (let i = 0; i < runs; i++) {
    const y = Math.round(place() * r.size);
    let x = Math.round(place() * r.size);
    const text = FORMS[(place() * FORMS.length) | 0]();
    // Each run fades along its length, so it reads as paint worn off rather
    // than as type someone chose to set faintly.
    for (let n = 0; n < text.length; n++) {
      const mask = rasteriseGlyph(text[n], cap, { jitter: 0.06, random: shape });
      const fade = alpha * (0.5 + 0.5 * (1 - n / text.length));
      for (let my = 0; my < mask.h; my++) {
        for (let mx = 0; mx < mask.w; mx++) {
          const a = mask.data[my * mask.w + mx];
          if (a <= 0.03) continue;
          r.set(x + mx, y + my, colour, a * fade);
        }
      }
      x += Math.round(mask.advance + cap * 0.2);
    }
  }
}

function wallPanel(size, seed, variant) {
  const r = new Raster(size, seed);
  const painted = variant === 1;
  const base = painted ? P.olive : P.gunmetal;
  const random = rng(seed + 5);

  r.fill(base);
  r.mottle({ frequency: 6, octaves: 5, amount: 0.15 });

  const plate = size / 2;
  const seam = Math.max(2, Math.round(size / 128));
  const inset = seam * 2;
  const boltR = Math.max(2, Math.round(size / 160));
  const boltColour = tint(P.gunmetalLight, painted ? 0.85 : 1);

  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x = px * plate;
      const y = py * plate;
      // Each plate came off a different batch.
      r.shadeRect(x + seam, y + seam, plate - seam * 2, plate - seam * 2, 0.86 + random() * 0.24);

      // A recessed service sub-panel breaks up the sheet.
      if (random() > 0.35) {
        const sw = Math.round(plate * (0.3 + random() * 0.26));
        const sh = Math.round(plate * (0.18 + random() * 0.22));
        const sx = x + inset + Math.round(random() * (plate - inset * 2 - sw));
        const sy = y + inset + Math.round(random() * (plate - inset * 2 - sh));
        r.shadeRect(sx, sy, sw, sh, 0.78);
        r.bevel(sx, sy, sw, sh, -0.8, 2);
      }
    }
  }

  // Recessed seams between plates, then a bevel to lift each plate face.
  for (let i = 0; i < 2; i++) {
    r.shadeRect(0, i * plate, size, seam, 0.4);
    r.shadeRect(i * plate, 0, seam, size, 0.4);
  }
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      r.bevel(px * plate + seam, py * plate + seam, plate - seam * 2, plate - seam * 2, 0.9, Math.max(1, Math.round(size / 256)));
    }
  }

  // Bolt rows just inside every plate edge.
  const perEdge = 6;
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x = px * plate + inset;
      const y = py * plate + inset;
      const w = plate - inset * 2;
      rivetRow(r, x, y, x + w, y, perEdge, boltR, boltColour);
      rivetRow(r, x, y + w, x + w, y + w, perEdge, boltR, boltColour);
      rivetRow(r, x, y, x, y + w, perEdge, boltR, boltColour);
      rivetRow(r, x + w, y, x + w, y + w, perEdge, boltR, boltColour);
    }
  }

  if (painted) {
    // A stencilled hazard block, mostly worn away.
    const bx = Math.round(plate * 0.28);
    const by = Math.round(plate * 1.24);
    const bw = Math.round(plate * 0.48);
    const bh = Math.round(plate * 0.2);
    r.rect(bx, by, bw, bh, tint(P.hazard, 1.05), 0.5);
    r.outline(bx, by, bw, bh, tint(P.gunmetalDark, 0.8), 0.5, 2);
    r.chip({ under: P.gunmetal, frequency: 22, octaves: 4, threshold: 0.665, seed: seed + 130 });
    r.grime({ frequency: 3, octaves: 5, amount: 0.5, colour: P.grime, seed: seed + 41 });
  } else {
    // Weld scars along the seams.
    const random2 = rng(seed + 77);
    for (let i = 0; i < 5; i++) {
      const horizontal = random2() > 0.5;
      const at = Math.round(plate * (random2() > 0.5 ? 1 : 0)) + Math.round((random2() - 0.5) * 4);
      const from = random2() * size;
      const len = size * (0.15 + random2() * 0.3);
      for (let s = 0; s < len; s++) {
        const wob = Math.sin(s * 0.5 + i) * 1.5;
        if (horizontal) r.set(from + s, at + wob, tint(P.gunmetalLight, 0.95), 0.28);
        else r.set(at + wob, from + s, tint(P.gunmetalLight, 0.95), 0.28);
      }
    }
    r.grime({ frequency: 4, octaves: 5, amount: 0.58, colour: P.grime, seed: seed + 23 });
  }

  r.streaks({ count: painted ? 26 : 36, colour: tint(P.grime, 0.9), seed: seed + 61, maxLength: 0.48 });
  r.scratches({ count: 34, seed: seed + 83, bright: tint(P.gunmetalLight, 1.05) });
  // Broad soiling pass — keeps the sheet from reading as fresh from the mill.
  r.grime({ frequency: 2, octaves: 4, amount: 0.32, colour: P.grime, seed: seed + 151 });
  // Small print goes on after the soiling, not before it. Under the grime
  // passes a 0.2 alpha vanishes completely — the marks have to sit on top of
  // the dirt the way sprayed paint actually does.
  //
  // The contrast is a balance the spec anticipated: this is a *tiling* sheet,
  // so whatever is printed here repeats along the wall. Faint enough and the
  // repetition reads as grime; bold enough to be legible and it reads as the
  // same stencil stamped every two metres. Kept at the low end of visible.
  stencilPrint(r, seed + (painted ? 311 : 419), {
    runs: painted ? 4 : 3,
    cap: Math.round(size / 22),
    alpha: painted ? 0.46 : 0.38,
    colour: tint(P.gunmetalLight, painted ? 1.2 : 1.1),
  });
  r.each((x, y) => r.shade(x, y, 0.9));
  return r;
}

/* ------------------------------------------------------------------ floor */

function floorPlate(size, seed) {
  const r = new Raster(size, seed);
  r.fill(tint(P.gunmetalDark, 1.18));
  r.mottle({ frequency: 8, octaves: 5, amount: 0.14 });

  // Diamond tread: two alternating diagonal bar directions per cell.
  const cell = Math.max(16, Math.round(size / 8));
  const bar = Math.max(2, Math.round(cell * 0.16));
  r.each((x, y, u, v) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const dir = (gx + gy) % 2 === 0 ? 1 : -1;
    const lx = x - gx * cell;
    const ly = y - gy * cell;
    let d = (lx - dir * ly + cell * 2) % cell;
    const edge = Math.abs(d - cell / 2);
    if (edge < bar) {
      // Raised bar: bright leading edge, dark trailing edge.
      const across = (d - cell / 2) / bar;
      r.shade(x, y, 1.32 - 0.42 * (across * 0.5 + 0.5));
    } else if (edge < bar + 1.5) {
      r.shade(x, y, 0.72);
    }
  });

  // Wear polishes the tread flat along the walk lines.
  r.each((x, y, u, v) => {
    const wear = fbm(u, v, 3, 4, seed + 17);
    if (wear > 0.55) {
      const k = Math.min(1, (wear - 0.55) / 0.3);
      const cur = r.get(x, y);
      r.set(x, y, mix(cur, tint(P.gunmetalLight, 0.82), k * 0.5));
    }
  });

  // Deck plates bolted down at their corners.
  const half = size / 2;
  const boltR = Math.max(2, Math.round(size / 150));
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      r.shadeRect(px * half, py * half, half, 2, 0.5);
      r.shadeRect(px * half, py * half, 2, half, 0.5);
      const inset = Math.round(size / 24);
      for (const [ox, oy] of [
        [inset, inset],
        [half - inset, inset],
        [inset, half - inset],
        [half - inset, half - inset],
      ]) {
        r.rivet(px * half + ox, py * half + oy, boltR, P.gunmetalLight);
      }
    }
  }

  r.grime({ frequency: 4, octaves: 5, amount: 0.66, colour: P.grime, seed: seed + 37 });
  r.scratches({ count: 46, seed: seed + 53, bright: tint(P.gunmetalLight, 0.95) });
  r.each((x, y) => r.shade(x, y, 0.92));
  return r;
}

/* ---------------------------------------------------------------- ceiling */

function ceilingPlate(size, seed) {
  const r = new Raster(size, seed);
  r.fill(tint(P.gunmetalDark, 1.02));
  r.mottle({ frequency: 6, octaves: 4, amount: 0.13 });

  // Ribbed panelling.
  const rib = Math.max(4, Math.round(size / 16));
  for (let y = 0; y < size; y += rib) {
    r.shadeRect(0, y, size, Math.max(1, rib / 4), 1.2);
    r.shadeRect(0, y + rib - Math.max(1, rib / 4), size, Math.max(1, rib / 4), 0.76);
  }

  // A vent grille occupying one quadrant.
  const vx = Math.round(size * 0.08);
  const vy = Math.round(size * 0.55);
  const vw = Math.round(size * 0.38);
  const vh = Math.round(size * 0.34);
  r.rect(vx, vy, vw, vh, tint(P.gunmetalDark, 0.8));
  r.bevel(vx, vy, vw, vh, 1, 2);
  const hole = Math.max(3, Math.round(size / 42));
  for (let y = vy + hole; y < vy + vh - hole; y += hole * 2) {
    for (let x = vx + hole; x < vx + vw - hole; x += hole * 2) {
      r.disc(x, y, hole * 0.6, tint(P.gunmetalDark, 0.32));
    }
  }

  const boltR = Math.max(2, Math.round(size / 128));
  rivetRow(r, size * 0.6, size * 0.12, size * 0.95, size * 0.12, 4, boltR, P.gunmetalLight);
  rivetRow(r, size * 0.6, size * 0.4, size * 0.95, size * 0.4, 4, boltR, P.gunmetalLight);

  r.grime({ frequency: 3, octaves: 5, amount: 0.55, colour: P.grime, seed: seed + 19 });
  r.streaks({ count: 14, colour: tint(P.rust, 0.6), seed: seed + 29, maxLength: 0.3 });
  return r;
}

/* ---------------------------------------------------------------- greeble */

function greeblePanel(size, seed) {
  const r = new Raster(size, seed);
  const random = rng(seed + 3);
  r.fill(tint(P.gunmetalDark, 0.92));
  r.mottle({ frequency: 10, octaves: 4, amount: 0.2 });

  // Boxes, ducts and cooling fins packed edge to edge.
  for (let i = 0; i < 26; i++) {
    const w = Math.round(size * (0.08 + random() * 0.26));
    const h = Math.round(size * (0.06 + random() * 0.22));
    const x = Math.round(random() * size);
    const y = Math.round(random() * size);
    const shade = 0.7 + random() * 0.7;
    r.rect(x, y, w, h, tint(P.gunmetal, shade));
    r.bevel(x, y, w, h, 0.9, 2);

    const roll = random();
    if (roll < 0.34) {
      // Cooling fins.
      const step = Math.max(3, Math.round(size / 64));
      for (let fx = x + step; fx < x + w - step; fx += step) {
        r.shadeRect(fx, y + 2, Math.max(1, step / 2), h - 4, 0.62);
      }
    } else if (roll < 0.6) {
      // Access hatch with corner bolts.
      const b = Math.max(2, Math.round(size / 170));
      const inset = Math.max(4, Math.round(size / 48));
      for (const [ox, oy] of [
        [inset, inset],
        [w - inset, inset],
        [inset, h - inset],
        [w - inset, h - inset],
      ]) {
        if (ox > 0 && oy > 0 && ox < w && oy < h) r.rivet(x + ox, y + oy, b, P.gunmetalLight);
      }
    }
  }

  // Conduit runs threaded over the top.
  for (let i = 0; i < 9; i++) {
    const horizontal = random() > 0.5;
    const at = Math.round(random() * size);
    const thickness = Math.max(2, Math.round(size * (0.008 + random() * 0.018)));
    const colour = random() > 0.7 ? tint(P.oliveDark, 1.1) : tint(P.gunmetalDark, 1.3);
    if (horizontal) {
      r.rect(0, at, size, thickness, colour);
      r.rect(0, at, size, 1, tint(colour, 1.5), 0.7);
      r.rect(0, at + thickness - 1, size, 1, tint(colour, 0.5), 0.8);
    } else {
      r.rect(at, 0, thickness, size, colour);
      r.rect(at, 0, 1, size, tint(colour, 1.5), 0.7);
      r.rect(at + thickness - 1, 0, 1, size, tint(colour, 0.5), 0.8);
    }
  }

  // Dead indicator lamps — a couple still have a little charge in them.
  const lampR = Math.max(2, Math.round(size / 100));
  for (let i = 0; i < 14; i++) {
    const x = Math.round(random() * size);
    const y = Math.round(random() * size);
    const alive = random() > 0.72;
    r.disc(x, y, lampR + 1, tint(P.gunmetalDark, 0.6));
    r.disc(x, y, lampR, alive ? P.glowGreenDim : tint(P.rust, 0.55));
  }

  r.grime({ frequency: 5, octaves: 5, amount: 0.5, colour: P.grime, seed: seed + 67 });
  r.streaks({ count: 20, colour: P.grime, seed: seed + 89, maxLength: 0.35 });
  return r;
}

/* ------------------------------------------------------------------- trim */

function doorTrim(size, seed) {
  const r = new Raster(size, seed);
  r.fill(tint(P.gunmetal, 1.05));
  r.mottle({ frequency: 8, octaves: 4, amount: 0.12 });

  // Diagonal caution striping across the middle band.
  const stripe = Math.max(8, Math.round(size / 8));
  const bandTop = Math.round(size * 0.24);
  const bandHeight = Math.round(size * 0.52);
  r.each((x, y) => {
    if (y < bandTop || y >= bandTop + bandHeight) return;
    const d = (x + y) % stripe;
    r.set(x, y, d < stripe / 2 ? P.hazard : tint(P.gunmetalDark, 0.85), 0.9);
  });
  r.chip({ under: tint(P.gunmetal, 1.1), frequency: 22, octaves: 4, threshold: 0.68, seed: seed + 12 });

  // Heavy bolted flanges top and bottom.
  const flange = Math.round(size * 0.14);
  for (const y of [0, size - flange]) {
    r.rect(0, y, size, flange, tint(P.gunmetal, 1.12));
    r.bevel(0, y, size, flange, 1, 2);
  }
  const boltR = Math.max(2, Math.round(size / 96));
  rivetRow(r, 0, flange / 2, size, flange / 2, 6, boltR, P.gunmetalLight);
  rivetRow(r, 0, size - flange / 2, size, size - flange / 2, 6, boltR, P.gunmetalLight);

  r.grime({ frequency: 4, octaves: 5, amount: 0.48, colour: P.grime, seed: seed + 31 });
  r.scratches({ count: 40, seed: seed + 59, bright: tint(P.gunmetalLight, 1.02) });
  return r;
}

/* ---------------------------------------------------------------- conduit */

function conduitStrip(size, seed) {
  const r = new Raster(size, seed);
  r.fill(tint(P.gunmetalDark, 0.7));
  r.mottle({ frequency: 10, octaves: 4, amount: 0.22 });

  const channelTop = Math.round(size * 0.3);
  const channelHeight = Math.round(size * 0.4);

  // The light channel itself: hot core falling off to a dim edge.
  r.each((x, y, u, v) => {
    if (y < channelTop || y >= channelTop + channelHeight) return;
    const t = (y - channelTop) / channelHeight;
    const profile = Math.sin(t * Math.PI) ** 1.4;
    const flicker = 0.86 + 0.14 * fbm(u, v, 6, 3, seed + 5);
    r.set(
      x,
      y,
      mix(P.glowGreenDim, tint(P.glowGreen, 1.0), profile * flicker),
      0.55 + 0.45 * profile
    );
  });

  // Housing lip either side of the channel.
  r.shadeRect(0, channelTop - 2, size, 2, 0.55);
  r.shadeRect(0, channelTop + channelHeight, size, 2, 0.55);

  // Mounting brackets straddling the run.
  const brackets = 4;
  const bw = Math.max(4, Math.round(size / 24));
  for (let i = 0; i < brackets; i++) {
    const x = Math.round((i + 0.5) * (size / brackets) - bw / 2);
    r.rect(x, 0, bw, size, tint(P.gunmetal, 0.9));
    r.bevel(x, 0, bw, size, 0.8, 2);
    const boltR = Math.max(2, Math.round(size / 110));
    r.rivet(x + bw / 2, size * 0.12, boltR, P.gunmetalLight);
    r.rivet(x + bw / 2, size * 0.88, boltR, P.gunmetalLight);
  }

  r.grime({ frequency: 5, octaves: 4, amount: 0.3, colour: P.grime, seed: seed + 43 });
  return r;
}
