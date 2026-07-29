import { PALETTE as P } from '../style-bible.js';
import { MeshBuilder } from '../lib/mesh.js';
import { Raster, rng, tint } from '../lib/raster.js';
import { encodeRaster } from '../lib/image.js';

/**
 * Offline model synthesis.
 *
 * Stands in for the image→3D leg of the pipeline when no generation
 * credentials are available. Each prop is built out of blocks and cylinders at
 * its real-world size with a box-projected UV set, and ships with its own
 * generated texture — the same shape of output the post-process expects back
 * from an image→3D service.
 */

// Vertex tints, multiplied against the base texture. Kept in 0..1 as glTF
// requires, with the texture carrying the brightness.
const C = {
  body: [0.84, 0.86, 0.82],
  light: [1.0, 1.0, 0.97],
  mid: [0.66, 0.68, 0.65],
  dark: [0.4, 0.42, 0.4],
  black: [0.2, 0.22, 0.21],
  olive: [0.63, 0.63, 0.45],
  oliveDark: [0.42, 0.43, 0.31],
  rust: [0.56, 0.36, 0.26],
  hazard: [0.78, 0.68, 0.26],
  glow: [0.42, 0.98, 0.55],
  glass: [0.26, 0.34, 0.3],
};

export async function synthesiseModel(spec) {
  const seed = seedOf(spec.id);
  const build = BUILDERS[spec.synth];
  if (!build) throw new Error(`no offline synthesiser for model "${spec.id}"`);
  const mesh = build(seed);
  const texture = await encodeRaster(propSurface(512, seed, SURFACE[spec.synth] || 'plate'));
  return { geometry: mesh.build(), texture };
}

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------- prop surfaces --- */

const SURFACE = {
  cargo_crate: 'painted',
  canister: 'banded',
  wall_console: 'device',
  pipe_cluster: 'banded',
  floor_debris: 'plate',
  power_switch: 'device',
  airlock_door: 'plate',
  scanner: 'device',
  power_cell: 'device',
  cell_cradle: 'device',
};

/**
 * One tileable metal surface per prop. Box-projected UVs mean this covers the
 * whole model at a consistent world scale, exactly like the level surfaces.
 */
function propSurface(size, seed, kind) {
  const r = new Raster(size, seed);
  const random = rng(seed + 13);

  const base =
    kind === 'painted' ? P.olive : kind === 'device' ? tint(P.gunmetalDark, 1.12) : P.gunmetal;
  r.fill(base);
  r.mottle({ frequency: 7, octaves: 5, amount: 0.17 });

  const cell = size / 4;
  const boltR = Math.max(2, Math.round(size / 150));

  if (kind === 'banded') {
    // Horizontal banding for cylindrical stock.
    for (let y = 0; y < size; y += cell) {
      r.shadeRect(0, y, size, Math.max(2, cell * 0.06), 1.3);
      r.shadeRect(0, y + cell * 0.06, size, Math.max(2, cell * 0.05), 0.66);
    }
    for (let i = 0; i < 4; i++) {
      r.rect(Math.round(random() * size), 0, Math.max(3, size / 90), size, tint(P.gunmetalDark, 1.2), 0.7);
    }
  } else if (kind === 'device') {
    // Panel lines and small hardware for machined housings.
    for (let i = 0; i < 14; i++) {
      const w = Math.round(size * (0.1 + random() * 0.22));
      const h = Math.round(size * (0.08 + random() * 0.2));
      const x = Math.round(random() * size);
      const y = Math.round(random() * size);
      r.shadeRect(x, y, w, h, 0.86 + random() * 0.34);
      r.bevel(x, y, w, h, 0.7, 1);
    }
    for (let i = 0; i < 8; i++) {
      r.rivet(Math.round(random() * size), Math.round(random() * size), boltR, P.gunmetalLight);
    }
  } else {
    // Riveted plate: a quartered grid with bolts down every seam.
    for (let i = 1; i < 4; i++) {
      r.shadeRect(0, i * cell, size, 2, 0.5);
      r.shadeRect(i * cell, 0, 2, size, 0.5);
    }
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        r.shadeRect(gx * cell + 2, gy * cell + 2, cell - 4, cell - 4, 0.9 + random() * 0.2);
        r.bevel(gx * cell + 2, gy * cell + 2, cell - 4, cell - 4, 0.7, 1);
        r.rivet(gx * cell + cell * 0.12, gy * cell + cell * 0.12, boltR, P.gunmetalLight);
        r.rivet(gx * cell + cell * 0.88, gy * cell + cell * 0.12, boltR, P.gunmetalLight);
        r.rivet(gx * cell + cell * 0.12, gy * cell + cell * 0.88, boltR, P.gunmetalLight);
        r.rivet(gx * cell + cell * 0.88, gy * cell + cell * 0.88, boltR, P.gunmetalLight);
      }
    }
  }

  if (kind === 'painted') {
    r.chip({ under: P.gunmetal, frequency: 20, octaves: 4, threshold: 0.64, seed: seed + 71 });
  }
  r.grime({ frequency: 5, octaves: 5, amount: 0.55, colour: P.grime, seed: seed + 33 });
  r.streaks({ count: 22, colour: P.grime, seed: seed + 51, maxLength: 0.4 });
  r.scratches({ count: 30, seed: seed + 97, bright: tint(P.gunmetalLight, 1.04) });
  r.each((x, y) => r.shade(x, y, 0.94));
  return r;
}

/* ------------------------------------------------------------ geometry --- */

const BUILDERS = {
  cargo_crate(seed) {
    const m = new MeshBuilder({ uvScale: 0.5, chamfer: 0.014 });
    const s = 0.8;
    const h = 0.78;

    m.box({ size: [s - 0.1, h - 0.08, s - 0.1], pos: [0, h / 2, 0], colour: C.olive });

    // Corner posts and top/bottom rails.
    const post = 0.09;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        m.box({
          size: [post, h, post],
          pos: [(sx * (s - post)) / 2, h / 2, (sz * (s - post)) / 2],
          colour: C.mid,
        });
      }
    }
    for (const y of [post / 2 + 0.01, h - post / 2 - 0.01]) {
      for (const sz of [-1, 1]) {
        m.box({ size: [s, post, post], pos: [0, y, (sz * (s - post)) / 2], colour: C.mid });
      }
      for (const sx of [-1, 1]) {
        m.box({ size: [post, post, s], pos: [(sx * (s - post)) / 2, y, 0], colour: C.mid });
      }
    }

    // Ribbing on all four faces.
    for (let i = -1; i <= 1; i++) {
      for (const sz of [-1, 1]) {
        m.box({ size: [0.07, h - 0.22, 0.03], pos: [i * 0.21, h / 2, (sz * s) / 2 - sz * 0.035], colour: C.oliveDark });
      }
      for (const sx of [-1, 1]) {
        m.box({ size: [0.03, h - 0.22, 0.07], pos: [(sx * s) / 2 - sx * 0.035, h / 2, i * 0.21], colour: C.oliveDark });
      }
    }

    // Lid and latches.
    m.box({ size: [s - 0.04, 0.06, s - 0.04], pos: [0, h + 0.02, 0], colour: C.mid });
    for (const sz of [-1, 1]) {
      m.box({ size: [0.14, 0.12, 0.05], pos: [0, h - 0.06, (sz * s) / 2 - sz * 0.005], colour: C.dark });
    }
    return m;
  },

  canister(seed) {
    const m = new MeshBuilder({ uvScale: 0.45, chamfer: 0.012 });
    const r = 0.22;

    m.cylinder({ radiusTop: r, radiusBottom: r, height: 0.98, segments: 18, pos: [0, 0.56, 0], colour: C.olive });
    m.cylinder({ radiusTop: r * 1.1, radiusBottom: r * 1.16, height: 0.09, segments: 18, pos: [0, 0.045, 0], colour: C.mid });
    m.cylinder({ radiusTop: r * 0.72, radiusBottom: r * 1.02, height: 0.12, segments: 18, pos: [0, 1.11, 0], colour: C.mid });

    for (const y of [0.28, 0.62, 0.92]) {
      m.cylinder({ radiusTop: r * 1.07, radiusBottom: r * 1.07, height: 0.05, segments: 18, pos: [0, y, 0], colour: C.dark, capTop: false, capBottom: false });
    }

    // Valve stack and gauge.
    m.cylinder({ radiusTop: 0.07, radiusBottom: 0.09, height: 0.1, segments: 8, pos: [0, 1.21, 0], colour: C.mid });
    m.cylinder({ radiusTop: 0.045, radiusBottom: 0.045, height: 0.09, segments: 8, pos: [0, 1.29, 0], colour: C.dark });
    m.cylinder({ radiusTop: 0.075, radiusBottom: 0.075, height: 0.025, segments: 10, pos: [0, 1.34, 0], colour: C.light });
    m.box({ size: [0.05, 0.05, 0.13], pos: [0, 1.24, 0.1], colour: C.rust });
    m.cylinder({ radiusTop: 0.055, radiusBottom: 0.055, height: 0.02, segments: 10, pos: [0, 1.24, 0.17], rot: [Math.PI / 2, 0, 0], colour: C.glass });

    // Carry handle.
    for (const sx of [-1, 1]) {
      m.box({ size: [0.04, 0.1, 0.04], pos: [sx * 0.11, 1.2, 0], colour: C.dark });
    }
    m.box({ size: [0.26, 0.035, 0.05], pos: [0, 1.25, 0], colour: C.dark });
    return m;
  },

  wall_console(seed) {
    const m = new MeshBuilder({ uvScale: 0.5, chamfer: 0.016 });

    m.box({ size: [0.96, 1.42, 0.34], pos: [0, 0.71, 0.17], colour: C.body });
    m.box({ size: [1.06, 0.1, 0.42], pos: [0, 1.47, 0.19], colour: C.mid });
    m.box({ size: [1.02, 0.09, 0.4], pos: [0, 0.05, 0.2], colour: C.mid });

    // Angled screen bezel with a dead display.
    m.box({ size: [0.78, 0.46, 0.12], pos: [0, 1.1, 0.4], rot: [-0.32, 0, 0], colour: C.dark });
    m.box({ size: [0.66, 0.34, 0.02], pos: [0, 1.105, 0.465], rot: [-0.32, 0, 0], colour: C.black });

    // Keypad slab and keys.
    m.box({ size: [0.72, 0.26, 0.1], pos: [0, 0.76, 0.38], rot: [-0.75, 0, 0], colour: C.mid });
    for (let row = 0; row < 2; row++) {
      for (let col = -2; col <= 2; col++) {
        m.box({
          size: [0.09, 0.05, 0.04],
          pos: [col * 0.12, 0.79 - row * 0.09, 0.415 - row * 0.055],
          rot: [-0.75, 0, 0],
          colour: row === 0 ? C.dark : C.black,
        });
      }
    }

    // Indicator strip and cable ducts.
    for (let i = 0; i < 4; i++) {
      m.box({ size: [0.05, 0.05, 0.02], pos: [-0.3 + i * 0.2, 1.38, 0.345], colour: i === 1 ? C.glow : C.black });
    }
    for (const sx of [-1, 1]) {
      m.cylinder({ radiusTop: 0.05, radiusBottom: 0.05, height: 0.3, segments: 8, pos: [sx * 0.34, 0.16, 0.36], rot: [0, 0, Math.PI / 2 + sx * 0.3], colour: C.oliveDark });
    }
    return m;
  },

  pipe_cluster(seed) {
    const m = new MeshBuilder({ uvScale: 0.55, chamfer: 0.014 });
    const random = rng(seed + 7);
    const pipes = [
      { x: -0.3, r: 0.11, colour: C.mid },
      { x: -0.09, r: 0.15, colour: C.olive },
      { x: 0.16, r: 0.08, colour: C.rust },
      { x: 0.32, r: 0.06, colour: C.dark },
    ];

    for (const pipe of pipes) {
      m.cylinder({
        radiusTop: pipe.r,
        radiusBottom: pipe.r,
        height: 2.0,
        segments: 14,
        pos: [pipe.x, 1.0, 0.22],
        colour: pipe.colour,
        capTop: false,
        capBottom: false,
      });
      // Flange couplings partway up.
      for (const y of [0.42 + random() * 0.2, 1.32 + random() * 0.2]) {
        m.cylinder({
          radiusTop: pipe.r * 1.28,
          radiusBottom: pipe.r * 1.28,
          height: 0.07,
          segments: 14,
          pos: [pipe.x, y, 0.22],
          colour: C.mid,
          capTop: false,
          capBottom: false,
        });
      }
    }

    // Wall brackets strapping the run down.
    for (const y of [0.28, 1.06, 1.82]) {
      m.box({ size: [0.92, 0.09, 0.1], pos: [0.01, y, 0.06], colour: C.dark });
      m.box({ size: [0.1, 0.14, 0.08], pos: [-0.44, y, 0.05], colour: C.mid });
      m.box({ size: [0.1, 0.14, 0.08], pos: [0.46, y, 0.05], colour: C.mid });
    }

    // A valve wheel and its stem.
    m.cylinder({ radiusTop: 0.05, radiusBottom: 0.05, height: 0.14, segments: 8, pos: [-0.09, 1.62, 0.42], rot: [Math.PI / 2, 0, 0], colour: C.mid });
    m.cylinder({ radiusTop: 0.17, radiusBottom: 0.17, height: 0.035, segments: 10, pos: [-0.09, 1.62, 0.5], rot: [Math.PI / 2, 0, 0], colour: C.rust });
    m.cylinder({ radiusTop: 0.06, radiusBottom: 0.06, height: 0.05, segments: 8, pos: [-0.09, 1.62, 0.52], rot: [Math.PI / 2, 0, 0], colour: C.dark });

    // Cable loom sagging across the front.
    for (let i = 0; i < 3; i++) {
      m.box({ size: [0.86, 0.045, 0.045], pos: [0.02, 0.72 + i * 0.035, 0.4 + i * 0.02], rot: [0, 0, 0.05 - i * 0.05], colour: C.black });
    }
    return m;
  },

  floor_debris(seed) {
    const m = new MeshBuilder({ uvScale: 0.6, chamfer: 0.009 });
    const random = rng(seed + 3);

    // Buckled deck panels heaped up.
    const plates = [
      { size: [0.86, 0.05, 0.54], pos: [0, 0.03, 0], rot: [0.06, 0.2, 0.04] },
      { size: [0.62, 0.045, 0.44], pos: [0.17, 0.11, 0.12], rot: [-0.34, 1.1, 0.22] },
      { size: [0.5, 0.04, 0.36], pos: [-0.22, 0.13, -0.1], rot: [0.4, 0.6, -0.3] },
      { size: [0.4, 0.05, 0.3], pos: [0.05, 0.21, -0.06], rot: [0.16, 2.2, 0.5] },
      { size: [0.32, 0.04, 0.26], pos: [-0.3, 0.06, 0.2], rot: [0.05, 0.9, 0.1] },
    ];
    for (const plate of plates) {
      m.box({ ...plate, colour: random() > 0.6 ? C.oliveDark : C.mid });
    }

    // Twisted struts and loose fragments.
    for (let i = 0; i < 5; i++) {
      m.box({
        size: [0.06 + random() * 0.05, 0.05, 0.24 + random() * 0.3],
        pos: [(random() - 0.5) * 0.7, 0.04 + random() * 0.22, (random() - 0.5) * 0.5],
        rot: [random() * 0.6 - 0.3, random() * Math.PI, random() * 0.6 - 0.3],
        colour: C.dark,
      });
    }
    for (let i = 0; i < 4; i++) {
      m.box({
        size: [0.1 + random() * 0.1, 0.04, 0.09 + random() * 0.1],
        pos: [(random() - 0.5) * 0.85, 0.02, (random() - 0.5) * 0.6],
        rot: [0, random() * Math.PI, 0],
        colour: C.rust,
      });
    }
    return m;
  },

  power_switch(seed) {
    const m = new MeshBuilder({ uvScale: 0.32, chamfer: 0.012 });

    // Mounting backplate and armoured body.
    m.box({ size: [0.66, 1.36, 0.06], pos: [0, 0.68, 0.03], colour: C.mid });
    m.box({ size: [0.52, 1.06, 0.16], pos: [0, 0.72, 0.13], colour: C.body });
    m.box({ size: [0.58, 0.08, 0.19], pos: [0, 1.24, 0.13], colour: C.mid });
    m.box({ size: [0.58, 0.08, 0.19], pos: [0, 0.2, 0.13], colour: C.mid });

    // Corner bolts on the flange.
    for (const sx of [-1, 1]) {
      for (const sy of [0.1, 1.26]) {
        m.box({ size: [0.07, 0.07, 0.05], pos: [sx * 0.27, sy, 0.055], colour: C.light });
      }
    }

    // Warning plate and the recessed lever slot the game's throw sits in.
    m.box({ size: [0.36, 0.14, 0.02], pos: [0, 1.06, 0.22], colour: C.hazard });
    m.box({ size: [0.2, 0.38, 0.06], pos: [0, 0.66, 0.2], colour: C.black });
    m.box({ size: [0.26, 0.44, 0.03], pos: [0, 0.66, 0.185], colour: C.dark });

    // Indicator lamps.
    for (let i = 0; i < 3; i++) {
      m.cylinder({
        radiusTop: 0.035,
        radiusBottom: 0.035,
        height: 0.035,
        segments: 8,
        pos: [-0.13 + i * 0.13, 0.34, 0.215],
        rot: [Math.PI / 2, 0, 0],
        colour: i === 0 ? C.rust : C.black,
      });
    }

    // Conduit entering from the top.
    m.cylinder({ radiusTop: 0.05, radiusBottom: 0.05, height: 0.18, segments: 8, pos: [0, 1.34, 0.13], colour: C.oliveDark });
    return m;
  },

  /**
   * The carryable cell. Authored 0.4 m tall with its origin on its own base,
   * because the game drops it at y = 0 and mounts it at CELL_MOUNT — so the
   * body has to span the eye line from a shelf at 1.45 m without the model
   * needing an offset anywhere.
   */
  power_cell(seed) {
    const m = new MeshBuilder({ uvScale: 0.16, chamfer: 0.006 });

    // Contact pins underneath, then the base and cap flanges.
    for (const sx of [-1, 1]) {
      m.box({ size: [0.03, 0.03, 0.05], pos: [sx * 0.06, 0.015, 0], colour: C.hazard });
    }
    m.box({ size: [0.31, 0.05, 0.31], pos: [0, 0.052, 0], colour: C.mid });
    m.box({ size: [0.26, 0.27, 0.26], pos: [0, 0.21, 0], colour: C.body });
    m.box({ size: [0.31, 0.05, 0.31], pos: [0, 0.37, 0], colour: C.mid });

    // Corner ribs down the body.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        m.box({ size: [0.04, 0.25, 0.04], pos: [sx * 0.12, 0.21, sz * 0.12], colour: C.oliveDark });
      }
    }

    // Charge readout and the sickly green glow strip the style bible asks for.
    m.box({ size: [0.15, 0.08, 0.02], pos: [0, 0.29, 0.135], colour: C.black });
    m.box({ size: [0.11, 0.045, 0.012], pos: [0, 0.29, 0.145], colour: C.glass });
    m.box({ size: [0.17, 0.025, 0.016], pos: [0, 0.15, 0.14], colour: C.glow });

    // Hazard band round the back, and the carry handle across the top.
    m.box({ size: [0.2, 0.05, 0.015], pos: [0, 0.2, -0.14], colour: C.hazard });
    for (const sx of [-1, 1]) {
      m.box({ size: [0.03, 0.06, 0.04], pos: [sx * 0.07, 0.42, 0], colour: C.dark });
    }
    m.box({ size: [0.19, 0.03, 0.045], pos: [0, 0.447, 0], colour: C.dark });
    return m;
  },

  /**
   * The wall cradle. The shelf top lands on 1.45 m — CELL_MOUNT.y — so the cell
   * it presents sits across the player's eye line and can be aimed at from any
   * distance, including from right up against it.
   */
  cell_cradle(seed) {
    const m = new MeshBuilder({ uvScale: 0.34, chamfer: 0.012 });

    // Backplate against the bulkhead, then the armoured pedestal.
    m.box({ size: [0.72, 1.5, 0.06], pos: [0, 0.75, 0.03], colour: C.mid });
    m.box({ size: [0.62, 1.3, 0.32], pos: [0, 0.65, 0.19], colour: C.body });
    m.box({ size: [0.68, 0.08, 0.36], pos: [0, 0.06, 0.19], colour: C.mid });

    // Bolts down the backplate flange.
    for (const sx of [-1, 1]) {
      for (const y of [0.14, 0.72, 1.3]) {
        m.box({ size: [0.07, 0.07, 0.05], pos: [sx * 0.32, y, 0.055], colour: C.light });
      }
    }

    // The shelf. Its upper face is the mount height.
    m.box({ size: [0.78, 0.1, 0.46], pos: [0, 1.4, 0.2], colour: C.mid });
    m.box({ size: [0.5, 0.03, 0.34], pos: [0, 1.46, 0.22], colour: C.black });

    // Sprung clamp arms either side of where the cell stands.
    for (const sx of [-1, 1]) {
      m.box({ size: [0.07, 0.34, 0.26], pos: [sx * 0.22, 1.62, 0.22], colour: C.dark });
      m.box({ size: [0.05, 0.1, 0.2], pos: [sx * 0.17, 1.62, 0.22], colour: C.oliveDark });
      m.cylinder({
        radiusTop: 0.045,
        radiusBottom: 0.045,
        height: 0.07,
        segments: 8,
        pos: [sx * 0.22, 1.44, 0.22],
        rot: [0, 0, Math.PI / 2],
        colour: C.mid,
      });
    }

    // Status lamp housing. The lamp itself is drawn in engine so it can change
    // colour the moment the cradle releases.
    m.box({ size: [0.5, 0.12, 0.06], pos: [0, 0.95, 0.37], colour: C.black });
    m.box({ size: [0.56, 0.18, 0.04], pos: [0, 0.95, 0.35], colour: C.mid });

    // Conduit from the shelf down into the deck.
    m.cylinder({ radiusTop: 0.055, radiusBottom: 0.055, height: 1.3, segments: 8, pos: [0.26, 0.68, 0.02], colour: C.oliveDark });

    // Caution striping along the base.
    for (let i = 0; i < 5; i++) {
      m.box({
        size: [0.1, 0.14, 0.02],
        pos: [-0.26 + i * 0.13, 0.2, 0.36],
        rot: [0, 0, 0.5],
        colour: i % 2 === 0 ? C.hazard : C.black,
      });
    }
    return m;
  },

  airlock_door(seed) {
    const m = new MeshBuilder({ uvScale: 0.7, chamfer: 0.018 });
    const w = 2.34;
    const h = 2.4;

    m.box({ size: [w, h, 0.16], pos: [0, h / 2, 0], colour: C.body });
    // Central reinforcing rib.
    m.box({ size: [0.3, h, 0.06], pos: [0, h / 2, 0.11], colour: C.mid });
    // Horizontal ribs.
    for (const y of [0.5, 1.2, 1.9]) {
      m.box({ size: [w - 0.12, 0.14, 0.05], pos: [0, y, 0.105], colour: C.mid });
    }
    // Recessed panels either side of the rib.
    for (const sx of [-1, 1]) {
      for (const y of [0.85, 1.55]) {
        m.box({ size: [0.74, 0.42, 0.03], pos: [sx * 0.62, y, 0.075], colour: C.dark });
      }
    }
    // Bolt rows down the edges.
    for (let i = 0; i < 7; i++) {
      const y = 0.16 + i * ((h - 0.32) / 6);
      for (const sx of [-1, 1]) {
        m.box({ size: [0.08, 0.08, 0.05], pos: [sx * (w / 2 - 0.09), y, 0.1], colour: C.light });
      }
    }
    // Viewport.
    m.box({ size: [0.34, 0.34, 0.06], pos: [0, 1.86, 0.12], colour: C.mid });
    m.box({ size: [0.24, 0.24, 0.03], pos: [0, 1.86, 0.155], colour: C.glass });
    // Caution striping along the bottom edge.
    for (let i = 0; i < 9; i++) {
      m.box({
        size: [0.14, 0.2, 0.03],
        pos: [-w / 2 + 0.16 + i * 0.26, 0.16, 0.09],
        rot: [0, 0, 0.5],
        colour: i % 2 === 0 ? C.hazard : C.black,
      });
    }
    return m;
  },

  scanner(seed) {
    // Authored pointing down -Z with +Y up, which is how the viewmodel holds it.
    const m = new MeshBuilder({ uvScale: 0.12, chamfer: 0.004 });

    // Main body and rubberised grip.
    m.box({ size: [0.1, 0.062, 0.19], pos: [0, 0, -0.01], colour: C.body });
    m.box({ size: [0.085, 0.05, 0.055], pos: [0, -0.05, 0.055], rot: [0.32, 0, 0], colour: C.black });
    m.box({ size: [0.092, 0.026, 0.05], pos: [0, -0.088, 0.068], rot: [0.32, 0, 0], colour: C.dark });

    // Sensor head at the front, slightly tapered.
    m.box({ size: [0.088, 0.05, 0.07], pos: [0, 0.004, -0.13], taper: 0.78, rot: [Math.PI / 2, 0, 0], colour: C.mid });
    m.box({ size: [0.055, 0.02, 0.028], pos: [0, 0.004, -0.168], colour: C.glass });
    for (const sx of [-1, 1]) {
      m.box({ size: [0.012, 0.03, 0.05], pos: [sx * 0.05, 0.012, -0.118], colour: C.dark });
    }

    // Readout screen and hood.
    // Screen bezel and dark glass — the lit readout is drawn in engine so the
    // tool can animate on every interaction.
    m.box({ size: [0.072, 0.012, 0.052], pos: [0, 0.036, -0.012], rot: [-0.22, 0, 0], colour: C.black });
    m.box({ size: [0.06, 0.004, 0.04], pos: [0, 0.043, -0.014], rot: [-0.22, 0, 0], colour: C.glass });
    m.box({ size: [0.084, 0.014, 0.012], pos: [0, 0.04, -0.044], colour: C.mid });

    // Buttons, vent and stubby antenna.
    for (let i = 0; i < 3; i++) {
      m.box({ size: [0.014, 0.008, 0.014], pos: [-0.02 + i * 0.02, 0.033, 0.036], colour: i === 1 ? C.rust : C.dark });
    }
    for (let i = 0; i < 4; i++) {
      m.box({ size: [0.062, 0.006, 0.006], pos: [0, -0.032, -0.03 + i * 0.016], colour: C.dark });
    }
    m.cylinder({ radiusTop: 0.005, radiusBottom: 0.008, height: 0.075, segments: 6, pos: [0.036, 0.058, 0.05], rot: [0.34, 0, -0.18], colour: C.dark });
    m.cylinder({ radiusTop: 0.011, radiusBottom: 0.011, height: 0.012, segments: 6, pos: [0.043, 0.09, 0.061], colour: C.rust });

    // Battery pack under the barrel.
    m.box({ size: [0.07, 0.026, 0.08], pos: [0, -0.042, -0.05], colour: C.oliveDark });
    return m;
  },
};
