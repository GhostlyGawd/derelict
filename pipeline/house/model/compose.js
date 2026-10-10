import sharp from 'sharp';

import { keptStats, matchMasked } from './colour.js';
import { paintedCharts, paintingSource } from './run.js';
import { unwrapHall } from './unwrap.js';

/**
 * The hall's charts as the game shows them (9.3, the owner's painting as a
 * source): the painting exactly where the painter saw it, and the model's
 * paint everywhere else, held to the painting's colour on that surface
 * (colour.js). Deterministic: the pipeline does this, from the committed
 * painting and the model's committed output, so it is turned here without
 * running the model again.
 */

/**
 * The colour each chart's new paint is held to. A surface the painter saw
 * enough of keeps its own. One they barely saw takes the colour of the one
 * of its kind they saw lit best: the wall behind the player faces the lamp,
 * as the front door's wall does, and is as lit as it, not as dark as the
 * back wall in the lamp's shadow.
 */
export function composeTargets(unwrapped) {
  const own = new Map(unwrapped.map((u) => [u.chart.id, keptStats(u)]));
  const lum = (t) => 0.2126 * t.mean[0] + 0.7152 * t.mean[1] + 0.0722 * t.mean[2];
  const out = new Map();
  for (const u of unwrapped) {
    let t = u.seen >= 0.1 ? own.get(u.chart.id) : null;
    if (!t) {
      const lit = unwrapped
        .filter((v) => v.chart.kind === u.chart.kind && v.seen >= 0.1 && own.get(v.chart.id))
        .sort((a, b) => lum(own.get(b.chart.id)) - lum(own.get(a.chart.id)))[0];
      t = lit ? own.get(lit.chart.id) : [...own.values()].find(Boolean);
    }
    out.set(u.chart.id, t);
  }
  return out;
}

export async function composePainted() {
  const files = paintedCharts();
  if (!Object.keys(files).length) return [];
  const unwrapped = await unwrapHall(paintingSource());
  const target = composeTargets(unwrapped);
  const out = [];
  for (const u of unwrapped) {
    const { data } = await sharp(files[u.chart.id]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgb = matchMasked(data, u, target.get(u.chart.id));
    for (let i = 0; i < u.w * u.h; i++) if (u.kept[i]) for (let k = 0; k < 3; k++) rgb[i * 3 + k] = u.rgb[i * 3 + k];
    const jpg = await sharp(Buffer.from(rgb), { raw: { width: u.w, height: u.h, channels: 3 } })
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: false })
      .toBuffer();
    out.push({ id: u.chart.id, w: u.w, h: u.h, jpg });
  }
  return out;
}
