/**
 * The consumption gate — phase 5, spec 5.3.3.
 *
 * Twice this project has shipped an asset that was generated correctly, listed
 * in the manifest correctly, wired up correctly, and never reached the thing
 * meant to consume it:
 *
 *   - the normal maps, caught only because phase 4 built relief.mjs
 *     specifically to look for that one failure;
 *   - the footstep send, which fed the convolvers almost nothing for a whole
 *     phase while acoustics.mjs happily proved the responses themselves were
 *     right. The owner found it by ear.
 *
 * relief.mjs guards one instance. Nothing guarded the class. This does: every
 * entry in the manifest has to be *observed in use* — bound to a material on
 * something being drawn, instantiated into a scene, or audible at a real
 * destination while the game plays itself.
 *
 * Static analysis would have passed both of the bugs above. In each case the
 * code that referenced the asset was present and correct; what failed was
 * everything after that. So this harness never reads the source. It boots the
 * built game, taps the graphs, plays the whole route, and looks.
 *
 *   node tools/consume.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';

/**
 * A sound has to peak this far above the room's own noise floor to count as
 * heard. The floor is measured, not assumed — the ambient bed is running
 * throughout, which is the point: it is one of the thirteen.
 */
const OVER_FLOOR = 2.5;
/** And it has to clear this outright, so a silent room cannot pass by ratio. */
const AUDIBLE = 0.004;
/** Metres of walking allowed while trying to hear every footstep variant. */
const STRIDE_BUDGET = 320;

const errors = [];
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failures = 0;
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

console.log(`consume: ${BASE}`);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__derelict?.phase === 'title', null, { timeout: 60000 });
await page.click('#start');
await page.waitForFunction(() => window.__derelict?.phase === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(1500);

const manifest = await page.evaluate(() => {
  const m = window.__derelict.assets.manifest;
  if (!m) return null;
  return {
    textures: Object.keys(m.textures || {}),
    normals: Object.entries(m.textures || {})
      .filter(([, e]) => e.normal)
      .map(([id]) => id),
    models: Object.keys(m.models || {}),
    audio: Object.keys(m.audio || {}),
    acoustics: Object.entries(m.acoustics || {}).map(([id, e]) => [id, e.spaces || []]),
    sky: Boolean(m.sky),
  };
});
if (!manifest) throw new Error('no manifest — the gate has nothing to check against');
console.log(
  `  manifest: ${manifest.textures.length} textures (${manifest.normals.length} with relief), ` +
    `${manifest.models.length} models, ${manifest.audio.length} sounds, ` +
    `${manifest.acoustics.length} responses${manifest.sky ? ', 1 sky' : ''}`
);

// ---- Every texture and every model, observed on something being drawn ------
//
// Identity, not filename. A material holding a *different* texture that happens
// to have loaded from the same URL is exactly the bug this is looking for, and
// comparing paths would call it a pass.
console.log('\n  bound to something the renderer draws');
const drawn = await page.evaluate(() => {
  const g = window.__derelict;
  const SLOTS = [
    'map',
    'alphaMap',
    'normalMap',
    'emissiveMap',
    'specularMap',
    'bumpMap',
    'aoMap',
    'lightMap',
    'displacementMap',
  ];

  const textures = new Set();
  const models = new Set();
  // A mesh hanging off an invisible parent is not being drawn, and an asset
  // only reachable there has not really arrived.
  const visible = (node) => {
    for (let n = node; n; n = n.parent) if (!n.visible) return false;
    return true;
  };

  for (const scene of [g.scene, g.viewmodel?.scene].filter(Boolean)) {
    scene.traverse((node) => {
      if (!node.isMesh || !visible(node)) return;
      if (node.userData.model) models.add(node.userData.model);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        for (const slot of SLOTS) if (material[slot]) textures.add(material[slot]);
      }
    });
  }

  const idsOf = (map) => [...map.entries()].filter(([, tex]) => textures.has(tex)).map(([id]) => id);
  return {
    textures: idsOf(g.assets.textures),
    normals: idsOf(g.assets.normals),
    models: [...models],
    loadedModels: [...g.assets.models.keys()],
    missing: [...g.assets.missing],
  };
});

expect(
  'nothing in the manifest failed to load',
  drawn.missing.length === 0,
  `unavailable: ${drawn.missing.join(', ')}`
);

for (const id of manifest.textures) {
  expect(
    `texture  ${id.padEnd(14)} bound on a drawn mesh`,
    drawn.textures.includes(id),
    'generated and loaded, but no visible material samples it'
  );
}
for (const id of manifest.normals) {
  expect(
    `relief   ${id.padEnd(14)} bound on a drawn mesh`,
    drawn.normals.includes(id),
    'the normal map loaded and nothing is sampling it'
  );
}
for (const id of manifest.models) {
  expect(
    `model    ${id.padEnd(14)} instantiated`,
    drawn.loadedModels.includes(id) && drawn.models.includes(id),
    drawn.loadedModels.includes(id)
      ? 'the generated model loaded but nothing in either scene came from it'
      : 'the model never loaded, so anything wearing its name is the greybox stand-in'
  );
}

// ---- The sky, and the rule that nothing inside the hull sees it -------------
//
// 6.4: no views out before the end. A crack between two wall boxes would show
// stars without failing a single other check, so every compartment is looked
// round from its centre and four corners, level and up toward the deckhead,
// with every door still shut — the state the whole run before the ending is in.
// The sky is swapped for a flat marker and counted, so this measures geometry
// rather than how dark the stars happen to be.
if (manifest.sky) {
  console.log('\n  the sky, unseen from inside');
  const leaks = await page.evaluate(() => {
    const g = window.__derelict;
    const found = [];
    let looks = 0;
    for (const space of g.spaces) {
      const inset = 0.8;
      const cx = (space.x[0] + space.x[1]) / 2;
      const cz = (space.z[0] + space.z[1]) / 2;
      const points = [
        [cx, cz],
        [space.x[0] + inset, space.z[0] + inset],
        [space.x[1] - inset, space.z[0] + inset],
        [space.x[0] + inset, space.z[1] - inset],
        [space.x[1] - inset, space.z[1] - inset],
      ];
      for (const [x, z] of points) {
        for (let k = 0; k < 4; k++) {
          for (const pitch of [0, 0.55]) {
            looks++;
            const fraction = g.skyCoverageForTest(x, z, (k * Math.PI) / 2, pitch);
            if (fraction > 0) found.push(`${space.id} (${x.toFixed(1)}, ${z.toFixed(1)}) ${(fraction * 100).toFixed(2)}%`);
          }
        }
      }
    }
    return { looks, found };
  });
  expect(
    `sky      not visible from ${leaks.looks} interior looks`,
    leaks.found.length === 0,
    `stars through the hull at ${leaks.found.slice(0, 6).join('; ')}`
  );
}

// ---- Tap the mixer ---------------------------------------------------------
//
// Analysers hang off the master and off both wet gains. They observe; they are
// not in anybody's path, and removing them would not change a single sample.
const tapped = await page.evaluate(() => {
  const bus = window.__derelict.audio;
  if (!bus.ctx) return { ok: false, why: 'no audio context' };

  const analyser = (node) => {
    const a = bus.ctx.createAnalyser();
    // The largest window the API allows — 32768 samples is about 740 ms at
    // 44.1 kHz. A small window would make this a measurement of the main
    // thread rather than of the mixer: the poll below runs on a timer, and on
    // a software rasteriser a 20 ms timer routinely lands 100 ms late, so a
    // 46 ms window walks straight past the transients it is looking for. That
    // read as "the convolver is not being fed" on three of five compartments
    // when every one of them was working.
    a.fftSize = 32768;
    node.connect(a);
    return a;
  };

  const state = {
    master: analyser(bus.master),
    wets: bus.wet.map((w) => analyser(w.gain)),
    /** Ids the *game* played, as opposed to ids this harness played at it. */
    played: new Set(),
    sweeping: false,

    /** Largest sample in the analysers' windows, right now. */
    sample(analysers) {
      const list = Array.isArray(analysers) ? analysers : [analysers];
      const buf = new Float32Array(list[0].fftSize);
      let max = 0;
      for (const a of list) {
        a.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i]);
          if (v > max) max = v;
        }
      }
      return max;
    },

    /**
     * Fires `shot`, waits, samples — and counts rounds rather than watching a
     * clock.
     *
     * A wall-clock window is the wrong instrument here for the reason this
     * project keeps rediscovering: the main thread stalls under a software
     * rasteriser, and a loop bounded by elapsed time can execute its body once,
     * at the top, before the sound it is measuring has been played at all. That
     * returned an exact 0.00000 for three perfectly healthy footsteps. Counting
     * rounds guarantees every measurement is taken *after* an excitation, and
     * the analyser's 740 ms window means a late sample still sees it.
     */
    async peakWhile(analysers, shot, rounds = 8, gap = 130) {
      let max = 0;
      for (let i = 0; i < rounds; i++) {
        shot();
        await new Promise((r) => setTimeout(r, gap));
        max = Math.max(max, state.sample(analysers));
      }
      return max;
    },

    /** The same, with nothing fired — for measuring a floor or a running bed. */
    async peakIdle(analysers, rounds = 6, gap = 130) {
      return state.peakWhile(analysers, () => {}, rounds, gap);
    },
  };

  // The bed was already running when this tap went in — the game started it
  // from #start, before the harness touched anything, which is exactly the
  // observation the run-coverage check below wants.
  if (bus.ambient) state.played.add('ambient_hum');

  /** Where the game last placed each positional sound — phase 6's pan check. */
  state.placed = {};
  for (const name of ['play', 'playAt', 'loop']) {
    const original = bus[name].bind(bus);
    bus[name] = (id, ...rest) => {
      const source = original(id, ...rest);
      // Only a call that actually started a source counts. `play` returns null
      // when the buffer is missing or the volume rounds to nothing, and a
      // sound that never starts has not reached anything.
      if (source && !state.sweeping) {
        state.played.add(id);
        if (name !== 'play') state.placed[id] = [...rest[0]];
      }
      return source;
    };
  }
  // The voice the lamp already holds was built before this tap went in.
  window.__derelict.mechanism.resetAudio?.();

  // Left and right at the master, for the pan check. Observing only, like the
  // analysers above.
  const split = bus.ctx.createChannelSplitter(2);
  bus.master.connect(split);
  state.sides = [0, 1].map((ch) => {
    const a = bus.ctx.createAnalyser();
    a.fftSize = 32768;
    split.connect(a, ch);
    return a;
  });

  window.__consume = state;
  const t0 = bus.ctx.currentTime;
  return { ok: true, t0, wets: bus.wet.length };
});
if (!tapped.ok) throw new Error(`could not tap the mixer: ${tapped.why}`);

// A suspended context renders nothing, and every audio assertion below would
// read as silence and fail for the wrong reason. Say so plainly instead.
await page.waitForTimeout(600);
const advanced = await page.evaluate(
  (t0) => window.__derelict.audio.ctx.currentTime - t0,
  tapped.t0
);
if (advanced < 0.2) {
  throw new Error(`the audio context is not running (currentTime advanced ${advanced.toFixed(3)}s)`);
}

// ---- Every sound is audible at a real destination --------------------------
console.log('\n  audible at the master bus');

// The bed first, while it is the only thing playing: that measurement *is*
// ambient_hum being observed. Then it comes off, so the twelve below are
// weighed against real silence rather than against the loudest continuous
// signal in the game — several of them are quieter than the room tone, which
// is correct for a footstep and would make a ratio against it meaningless.
const bed = await page.evaluate(() => window.__consume.peakIdle(window.__consume.master));
expect(
  `sound    ${'ambient_hum'.padEnd(14)} audible (bed at ${bed.toFixed(4)})`,
  bed >= AUDIBLE,
  `the room tone measures ${bed.toFixed(5)} at the master — the bed is not reaching the output`
);

// The bed is ducked rather than stopped. stopAmbient/startAmbient tears down a
// running set of scheduled voices and builds another, which is a state change
// this harness has no business making — and the automation curves of the two
// beds collide when it does. Riding its gain leaves the graph exactly as the
// game built it and is reversible in one line.
const floor = await page.evaluate(async () => {
  const bus = window.__derelict.audio;
  const gain = bus.ambient?.bus.gain;
  const level = gain ? gain.value : 0;
  if (gain) {
    gain.cancelScheduledValues(bus.ctx.currentTime);
    gain.setValueAtTime(0.00001, bus.ctx.currentTime);
  }
  window.__consume.bedLevel = level;
  await new Promise((r) => setTimeout(r, 400));
  return window.__consume.peakIdle(window.__consume.master);
});
console.log(`  floor with the bed ducked: ${floor.toFixed(5)}`);

for (const id of manifest.audio) {
  if (id === 'ambient_hum') continue; // it *is* the bed, measured above
  const peak = await page.evaluate(async (soundId) => {
    const s = window.__consume;
    s.sweeping = true;
    const measured = await s.peakWhile(s.master, () =>
      window.__derelict.audio.play(soundId, { volume: 1 })
    );
    s.sweeping = false;
    return measured;
  }, id);
  expect(
    `sound    ${id.padEnd(14)} audible (${peak.toFixed(4)} over ${floor.toFixed(4)})`,
    peak >= Math.max(AUDIBLE, floor * OVER_FLOOR),
    `${peak.toFixed(5)} against a ${floor.toFixed(5)} floor — decoded, and inaudible`
  );
}

await page.evaluate(() => {
  const bus = window.__derelict.audio;
  const gain = bus.ambient?.bus.gain;
  if (gain) gain.setValueAtTime(window.__consume.bedLevel, bus.ctx.currentTime);
});

// ---- Every impulse response is convolving something ------------------------
//
// This is the shipped bug, generalised. The convolvers ran for a whole phase
// with a send that was fed almost nothing: the responses were correct, loaded,
// selected and crossfaded, and the room did nothing because no signal arrived.
// So the assertion is not "a buffer is loaded" — it is "put the listener in
// this compartment, make the noise a player makes, and hear the room answer".
console.log('\n  convolving a real signal, per compartment');
const spaces = await page.evaluate(() => window.__derelict.spaces.map((s) => [s.id, s.x, s.z]));
const centreOf = (id) => {
  const s = spaces.find(([sid]) => sid === id);
  return s ? [(s[1][0] + s[1][1]) / 2, (s[2][0] + s[2][1]) / 2] : null;
};

for (const [irId, usedBy] of manifest.acoustics) {
  const spaceId = usedBy[0];
  const centre = spaceId ? centreOf(spaceId) : null;
  if (!centre) {
    expect(`response ${irId.padEnd(14)} maps to a real compartment`, false, `spaces: ${usedBy}`);
    continue;
  }

  const measured = await page.evaluate(
    async ([id, x, z]) => {
      const g = window.__derelict;
      const s = window.__consume;
      // Move the listener and let the game's own frame loop notice: nothing
      // here reaches past the player into the mixer, so what gets selected is
      // whatever a player standing in this compartment would get.
      g.player.position.set(x, 0, z);

      const look = () => {
        const active = g.audio.wet[g.audio.activeWet];
        const hit = [...g.audio.responses.entries()].find(([, buf]) => buf === active.conv.buffer);
        return { selected: hit ? hit[0] : null, level: active.level.value };
      };
      // Wait for the frame loop to notice the teleport and select a response.
      // Generously bounded: under a software rasteriser the loop can be several
      // seconds late, and a budget sized for the 0.4 s crossfade spends itself
      // waiting to be noticed.
      let polls = 0;
      let seen = look();
      while (polls < 150 && !(seen.selected === id && seen.level > 0.95)) {
        await new Promise((r) => setTimeout(r, 120));
        seen = look();
        polls++;
      }
      const { selected, level } = seen;

      s.sweeping = true;
      // A footstep, because a footstep is the signal that was missing. Not
      // routed specially — `room: true` is what the game's own step uses.
      const wet = await s.peakWhile(s.wets, () =>
        g.audio.play('footstep_1', { volume: 1, room: true })
      );
      s.sweeping = false;

      return { selected, level, wet, polls };
    },
    [irId, centre[0], centre[1]]
  );

  // Identity, on the buffer object itself — not a name, not a level.
  expect(
    `response ${irId.padEnd(14)} selected in ${spaceId}`,
    measured.selected === irId,
    `${spaceId} convolved through ${measured.selected ?? 'nothing'} after ${measured.polls} polls`
  );
  // And the claim the done-bar actually makes: the room answers.
  //
  // The crossfade level is printed and not asserted on, deliberately. It is
  // read from AudioParam.value, and that getter goes stale under automation on
  // a loaded main thread: a compartment reported 0.797 in one run and 1.000 in
  // the next while its measured wet output differed by under 2%. Gating on a
  // number that lies about a graph that is working would be a flaky test
  // guarding a fixed bug. What the signal says is not in doubt, so the signal
  // is what this asserts — and the stranded crossfade the level *did* catch is
  // fixed at source, in the `ramp` this file's investigation rewrote.
  expect(
    `response ${irId.padEnd(14)} answers a footstep (${measured.wet.toFixed(4)}, level ${measured.level.toFixed(2)})`,
    measured.wet >= AUDIBLE,
    `the wet bus measured ${measured.wet.toFixed(5)} — the convolver is loaded and nothing is feeding it`
  );
}

// ---- Phase 6: the machinery, heard from where it is --------------------------
//
// 6.5: each of the four idle sounds is placed where its source is seen, panned
// toward it, and carried by the reverb of the compartment it is in. The
// position is the one the *game* passed, captured at the mixer, and it is
// compared with the moving part in the scene — not with a number restated here.
// Then the listener stands in that compartment with the source off to one
// side, the game's own machinery is held still so nothing else is sounding, and
// the sound is played from that captured position: the near ear has to be the
// louder one, and the wet bus has to answer.
console.log('\n  the machinery, heard from where it is');
await page.waitForFunction(
  () => ['fan_pass', 'vent_breath', 'spark_crackle', 'lamp_buzz'].every((id) => window.__consume.placed[id]),
  null,
  { timeout: 60000 }
).catch(() => {});

const IDLE = [
  { id: 'fan_pass', part: 'fanHub', space: 'annex', stand: [26, -1], yaw: Math.PI / 2 },
  { id: 'vent_breath', part: 'ventPuff', space: 'hold', stand: [-28, 2.6], yaw: 0 },
  { id: 'spark_crackle', part: 'spark', space: 'corrB', stand: [8.6, 0.6], yaw: 0, near: 0.7 },
  { id: 'lamp_buzz', part: 'failingLamp', space: 'corrB', stand: [15.2, 0.6], yaw: Math.PI },
];
for (const source of IDLE) {
  const r = await page.evaluate(async (src) => {
    const g = window.__derelict;
    const s = window.__consume;
    const placed = s.placed[src.id];
    if (!placed) return { placed: null };
    const node = g.mechanism.parts[src.part];
    const seen = node.getWorldPosition ? node.getWorldPosition(node.position.clone()) : node.position;
    const off = Math.hypot(placed[0] - seen.x, placed[1] - seen.y, placed[2] - seen.z);

    // Hold the machinery still and put the listener in the compartment.
    const update = g.mechanism.update;
    g.mechanism.update = () => {};
    g.mechanism.powerDown();
    g.player.position.set(src.stand[0], 0, src.stand[1]);
    g.player.yaw = src.yaw;
    g.player.pitch = 0;
    let polls = 0;
    while (polls++ < 150 && g.audio.space !== src.space) await new Promise((r) => setTimeout(r, 120));
    await new Promise((r) => setTimeout(r, 900));

    s.sweeping = true;
    let voice = null;
    const fire = () => {
      if (src.id === 'lamp_buzz') {
        if (!voice) {
          voice = g.audio.loop('lamp_buzz', placed, { volume: 1 });
          voice.setLevel(1);
        }
      } else {
        g.audio.playAt(src.id, placed, { volume: 1 });
      }
    };
    const wet = await s.peakWhile(s.wets, fire, 6, 160);
    const left = s.sample(s.sides[0]);
    const right = s.sample(s.sides[1]);
    voice?.stop();
    s.sweeping = false;
    g.mechanism.update = update;

    // Which ear should be nearer: the listener's right is (cos yaw, 0, -sin yaw).
    const side =
      (placed[0] - src.stand[0]) * Math.cos(src.yaw) - (placed[2] - src.stand[1]) * Math.sin(src.yaw);
    return { placed, off, wet, left, right, side, space: g.audio.space };
  }, source);

  if (!r.placed) {
    expect(`idle     ${source.id.padEnd(14)} placed by the game`, false, 'never played during the run');
    continue;
  }
  expect(
    `idle     ${source.id.padEnd(14)} placed at its source (${r.off.toFixed(2)} m off)`,
    r.off <= (source.near ?? 0.5),
    `the game plays it at [${r.placed.map((v) => v.toFixed(1))}], ${r.off.toFixed(2)} m from the ${source.part} the player sees`
  );
  const nearEar = r.side > 0 ? r.right : r.left;
  const farEar = r.side > 0 ? r.left : r.right;
  expect(
    `idle     ${source.id.padEnd(14)} panned toward it (${r.side > 0 ? 'right' : 'left'} ${nearEar.toFixed(4)} over ${farEar.toFixed(4)})`,
    nearEar > farEar * 1.15,
    'the source is off to one side and both ears hear it the same'
  );
  expect(
    `idle     ${source.id.padEnd(14)} carried by ${source.space}'s room (${r.wet.toFixed(4)})`,
    r.space === source.space && r.wet >= AUDIBLE / 4,
    `listener in ${r.space}, wet bus at ${r.wet.toFixed(5)} — it never reaches the room's response`
  );
}

// The run below needs the machinery running again from the top.
await page.evaluate(() => window.__derelict.mechanism.reset());

// ---- Now play the game, and see what it actually reaches for ---------------
//
// Everything above proves an asset *can* be heard or drawn. This proves the
// game asks for it: a sound nothing in the run ever plays is a sound the
// pipeline is generating for no one.
console.log('\n  played during a full run');

const state = () => page.evaluate(() => {
  const g = window.__derelict;
  return {
    phase: g.phase,
    cells: g.cells,
    carrying: g.carry.held ? g.carry.held.id : null,
    pos: [+g.player.position.x.toFixed(2), +g.player.position.z.toFixed(2)],
    played: [...window.__consume.played],
  };
});

async function place(x, z, yaw) {
  await page.evaluate(
    ([px, pz, py]) => {
      const g = window.__derelict;
      g.player.position.set(px, 0, pz);
      g.player.yaw = py;
      g.player.pitch = 0;
    },
    [x, z, yaw]
  );
  await page.waitForTimeout(120);
}

async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(60);
}

/**
 * Real walking, on each of the two surfaces, then a bounded top-up.
 *
 * Variants are picked at random per step, so covering all six by walking is a
 * coupon-collector problem and the tail is long — long enough that bounding it
 * by wall-clock time would make this harness a measurement of the renderer,
 * which is the mistake walkthrough.mjs documents at length.
 *
 * So the walk runs first and is the real thing, and whatever it has not turned
 * up by the budget is topped up by driving `player.onFootstep` directly. That
 * is the game's own footstep dispatch with the stride taken out of it — the
 * same move chain.mjs makes when it drives an interaction with the aim taken
 * out. The surface still comes from where the player is standing.
 */
async function stepsOn(want, lane, budget) {
  let covered = 0;
  let walked = 0;
  let passes = 0;
  const [from, to] = lane;
  const yaw = Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));

  // Bounded on passes as well as on metres: a lane that turns out to be
  // blocked covers nothing, and "until we have walked far enough" would then
  // never finish. The top-up below is what makes that survivable rather than
  // fatal, so the walk is allowed to come up short.
  while (covered < budget && passes++ < 12) {
    for (const [start, heading] of [
      [from, yaw],
      [to, yaw + Math.PI],
    ]) {
      await place(start[0], start[1], heading);
      await hold(['KeyW'], 1500);
      const now = (await state()).pos;
      covered += Math.hypot(now[0] - start[0], now[1] - start[1]);
    }
    const heard = new Set((await state()).played);
    walked = want.filter((id) => heard.has(id)).length;
    if (walked === want.length) break;
  }

  if (walked < want.length) {
    await place(from[0], from[1], yaw);
    await page.evaluate(async (n) => {
      const g = window.__derelict;
      for (let i = 0; i < n; i++) {
        g.player.onFootstep();
        await new Promise((r) => setTimeout(r, 12));
      }
    }, 60);
    await page.waitForTimeout(200);
  }
  return { covered, walked };
}

// Deck plate: down the middle of the Storage Hold, the longest clear run of it.
const deck = await stepsOn(
  ['footstep_1', 'footstep_2', 'footstep_3'],
  [
    [-21, 6.5],
    [-21, -6.5],
  ],
  STRIDE_BUDGET / 2
);
console.log(`  deck plate: ${deck.covered.toFixed(0)} m walked, ${deck.walked}/3 variants from the walk`);

// Grating: the length of Corridor A, which is where the grate set actually plays.
const grate = await stepsOn(
  ['footstep_grate_1', 'footstep_grate_2', 'footstep_grate_3'],
  [
    [-8.5, 0],
    [-17.5, 0],
  ],
  STRIDE_BUDGET / 2
);
console.log(`  grating:    ${grate.covered.toFixed(0)} m walked, ${grate.walked}/3 variants from the walk`);

// The six-step chain, driven the way smoke.mjs drives it — teleport to each
// fixture, press the button. Ordering is chain.mjs's job; all this needs is
// for every sound on the critical path to have been reached for once.
await place(-29.5, -7.55, 0);
await page.keyboard.press('KeyE'); // refused: cradle 1 is still clamped
await page.waitForTimeout(200);

await place(-31.6, -3.4, Math.PI / 2);
await page.waitForTimeout(250);
await page.keyboard.press('KeyE'); // switch 1 → clunk, surge, cradle 1 motor
await page.waitForTimeout(1400);

await place(-29.5, -7.55, 0);
await page.waitForTimeout(250);
await page.keyboard.press('KeyE'); // cell 1 → lift
await page.waitForTimeout(400);

await place(1.72, -5.9, 0);
await page.waitForTimeout(250);
await page.keyboard.press('KeyE'); // socket 1 → seat, surge
await page.waitForTimeout(1200);

await place(31.6, 1.6, -Math.PI / 2);
await page.waitForTimeout(250);
await page.keyboard.press('KeyE'); // switch 2 → hatch motors, cradle 2 motor
await page.waitForTimeout(1600);

await place(31.2, -7.55, 0);
await page.waitForTimeout(250);
await page.keyboard.press('KeyE'); // cell 2
await page.waitForTimeout(400);

// Set it down and take it back up: the one action with nothing in the
// crosshair, and the only caller of the set-down step sound.
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);

await place(2.58, -5.9, 0);
await page.waitForTimeout(250);
await page.keyboard.press('KeyE'); // socket 2 → 2/2, airlock motor
await page
  .waitForFunction(() => window.__derelict.doorsById.get('airlock').open, null, { timeout: 40000 })
  .catch(() => {
    throw new Error('airlock never finished cycling');
  });

// Out through the airlock, which is the only thing that plays the end sting.
// Walked in bursts rather than for a fixed duration: dt is clamped, so a fixed
// wall-clock walk covers less ground under a software rasteriser.
await place(0, -6.2, 0);
for (let burst = 0; burst < 30; burst++) {
  if ((await state()).phase === 'ended') break;
  await hold(['KeyW'], 1000);
}
await page.waitForFunction(() => window.__derelict?.phase === 'ended', null, { timeout: 45000 });

// The run is over and the player has walked out under it. Bound by identity,
// as every other texture is, and actually filling the view from the threshold.
if (manifest.sky) {
  console.log('\n  the sky, seen on the way out');
  const sky = await page.evaluate(() => {
    const g = window.__derelict;
    const mesh = g.outside.sky;
    let visible = Boolean(mesh);
    for (let n = mesh; n; n = n.parent) if (!n.visible) visible = false;
    return {
      bound: Boolean(mesh) && mesh.material.envMap === g.assets.sky() && Boolean(g.assets.sky()),
      visible,
      fog: mesh ? mesh.material.fog : null,
      ahead: g.skyCoverageForTest(0, -13.6, 0, 0),
      through: g.skyCoverageForTest(0, -8.4, 0, 0),
    };
  });
  expect('sky      bound on the drawn sky mesh', sky.bound && sky.visible, 'the cube map loaded and the sky mesh does not hold it');
  expect('sky      exempt from fog', sky.fog === false, 'the sky is being fogged like the inside of the ship');
  expect(
    `sky      fills the view from the threshold (${(sky.ahead * 100).toFixed(0)}%)`,
    sky.ahead > 0.5,
    'walking out, most of what is ahead should be outside'
  );
  expect(
    `sky      seen through the open outer door (${(sky.through * 100).toFixed(0)}%)`,
    sky.through > 0.03,
    'from inside the chamber with the door open, the outside should show through it'
  );
}

const played = new Set((await state()).played);
for (const id of manifest.audio) {
  expect(
    `sound    ${id.padEnd(14)} played by the game`,
    played.has(id),
    'generated, decoded, audible — and nothing in a complete run ever asks for it'
  );
}

await browser.close();

if (errors.length) {
  console.error('\nconsole errors:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (failures) {
  console.error(`\nconsume: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nconsume: OK — every generated asset was observed reaching its consumer');
