import * as THREE from 'three';
import { CONDUITS, EMERGENCY, ESCAPE_LIGHT, LIGHTS, POWERED, SHAFTS } from './layout.js';

/**
 * Zone lighting.
 *
 * The whole ship starts on dim red emergency power. Restoring power brings a
 * room and its corridor up to green-white — since phase 6 lamp by lamp, from
 * the switch or socket outward, each with its own short surge, while the
 * conduit strips fill green along their runs from the same end.
 *
 * The point-light count is fixed for the lifetime of the scene: Three.js
 * recompiles every material when it changes, which would stall the frame at
 * exactly the moment the player flips a switch.
 */

const EMERGENCY_COLOR = new THREE.Color(EMERGENCY.color);
const POWERED_COLOR = new THREE.Color(POWERED.color);
// Phase 8 (8.3.1): dead and live differ by brightness as well as hue, at least
// 3:1 in luminance under every common colour-vision deficiency as rendered —
// tools/colour.mjs measures it. Dead went darker and live brighter; the hues
// are what they always were.
const CONDUIT_OFF = new THREE.Color(0xc22f18);
// Over 1 on purpose: the strip's generated texture darkens whatever it is
// multiplied by, and a live run has to clear its dead red by 3:1 after that.
// Vertex colours are floats, so a live strip can be driven past its texture.
const CONDUIT_ON = new THREE.Color(0xa5ffca).multiplyScalar(1.45);
/**
 * The lens of a lamp running on emergency power. Darker than the light it
 * throws, which stays EMERGENCY.color: a lamp's face is what a player reads
 * the state from, and the room it lights is not an indicator.
 */
const EMERGENCY_LENS = new THREE.Color(0xd92d19);
const DEAD_LENS = new THREE.Color(0x140705);
const blend = new THREE.Color();

/**
 * How long the departure takes to resolve: the chamber to full flood, and the
 * ship behind it to dark. Long enough to be a passage rather than a cut, short
 * enough that a player walking briskly does not outrun it.
 */
const ESCAPE_SECONDS = 4.2;

/**
 * Phase 6 — power travels. Seconds per metre between the thing that restored
 * power and a lamp or a run of conduit striking. Slow enough that a room is
 * seen coming up from one end, fast enough that the far end of Corridor A is
 * lit before the surge under it has finished.
 */
const PACE = 0.05;
/** How long one lamp takes to strike and settle — `surge` runs over this. */
const STRIKE_SECONDS = 1.15;
/** Conduit vertex spacing, metres. The fill front is one segment wide. */
const CONDUIT_SEGMENT = 0.3;

/** Two stutters and a settle — the lamps fighting the surge back on. */
function surge(t) {
  if (t < 0.10) return 0.25;
  if (t < 0.18) return 1.55;
  if (t < 0.26) return 0.18;
  if (t < 0.40) return 1.3;
  if (t < 0.46) return 0.55;
  return 1 + 0.28 * Math.exp(-(t - 0.46) * 9) * Math.sin((t - 0.46) * 34);
}

/**
 * Phase 8 — air in the light (8.3.5). Motes per shaft: square points, no
 * texture, nearest like everything else, lit only by their own lamp.
 */
const MOTES = 36;
/** World size of a mote. About three backbuffer pixels a metre away, and gone by the far wall. */
const MOTE_SIZE = 0.02;
/** How bright the dust is in a lamp at full power. Found by standing in it; quiet on purpose. */
const DUST_OPACITY = 0.55;

/** A small deterministic hash: the same mote drifts the same way in every run and every replay. */
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The motes for one shaft, as a child of its cone so they are shown and hidden
 * with it. Each mote is a fixed set of numbers — where in the cone, how fast it
 * turns, how far it bobs — and its position is a function of the game clock,
 * never a simulation, so a replay draws the same dust (and asserts on none of
 * it).
 */
function buildDust(cone, radius, height, index) {
  const geo = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3);
  const color = new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3);
  const seeds = new Float32Array(MOTES * 5);
  for (let i = 0; i < MOTES; i++) {
    const n = index * 1000 + i;
    seeds[i * 5] = Math.sqrt(hash(n)); // radial fraction, area-even
    seeds[i * 5 + 1] = hash(n + 0.1) * Math.PI * 2; // angle
    seeds[i * 5 + 2] = 0.08 + hash(n + 0.2) * 0.8; // height fraction
    seeds[i * 5 + 3] = (hash(n + 0.3) - 0.5) * 0.12; // turn rate, rad/s
    seeds[i * 5 + 4] = hash(n + 0.4) * Math.PI * 2; // bob phase
    const b = 0.45 + 0.55 * hash(n + 0.5);
    color.setXYZ(i, b, b, b);
  }
  geo.setAttribute('position', position);
  geo.setAttribute('color', color);
  // The cone is the bound: nothing is ever drawn outside it.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(radius, height / 2));
  const material = new THREE.PointsMaterial({
    color: POWERED.color,
    size: MOTE_SIZE,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'dust';
  points.renderOrder = 3;
  cone.add(points);
  return { points, seeds, radius, height };
}

/** Moves one shaft's motes to where they are at `time`. Positions are in the cone's frame. */
function driftDust(dust, time) {
  const { seeds, radius, height } = dust;
  const pos = dust.points.geometry.attributes.position;
  for (let i = 0; i < MOTES; i++) {
    const s = i * 5;
    const y = THREE.MathUtils.clamp(
      seeds[s + 2] * height + 0.18 * Math.sin(time * 0.23 + seeds[s + 4]),
      0.05,
      height * 0.9
    );
    // The cone narrows to its apex at the lamp; a mote stays inside it at
    // whatever height it has drifted to.
    const r = seeds[s] * radius * (1 - y / height) * 0.92;
    const a = seeds[s + 1] + time * seeds[s + 3];
    pos.setXYZ(i, Math.cos(a) * r, y - height / 2, Math.sin(a) * r);
  }
  pos.needsUpdate = true;
}

export function buildLighting(materials) {
  const group = new THREE.Group();
  group.name = 'lighting';

  // Just enough bounce that unlit corners read as dark, not as holes.
  group.add(new THREE.AmbientLight(0x2c322e, 1.0));

  const zones = new Map(); // zone -> { t, powered, lights, shafts, conduits }
  const zoneOf = (id) => {
    if (!zones.has(id)) {
      zones.set(id, {
        t: 0,
        powered: false,
        lights: [],
        shafts: [],
        conduits: [],
        lenses: [],
        lamps: [],
        strips: [],
        origin: null,
        since: 0,
      });
    }
    return zones.get(id);
  };

  // ------------------------------------------------------------- lights --
  const housingGeo = new THREE.BoxGeometry(0.9, 0.09, 0.42);
  const lensGeo = new THREE.PlaneGeometry(0.74, 0.28);

  for (const def of LIGHTS) {
    const light = new THREE.PointLight(EMERGENCY.color, EMERGENCY.intensity, def.distance, 2);
    light.position.set(...def.pos);
    // The chamber past the airlock is dead until the outer door cycles.
    if (def.zone === 'chamber') light.intensity = 0;
    group.add(light);
    zoneOf(def.zone).lights.push(light);

    // A housing so the hotspot reads as a fixture rather than a glow in space.
    const housing = new THREE.Mesh(housingGeo, materials.surface('greeble_panel'));
    housing.position.set(def.pos[0], def.pos[1] + 0.14, def.pos[2]);
    group.add(housing);

    const lens = new THREE.Mesh(
      lensGeo,
      new THREE.MeshBasicMaterial({ color: EMERGENCY_LENS, toneMapped: false, fog: true })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(def.pos[0], def.pos[1] + 0.088, def.pos[2]);
    if (def.zone === 'chamber') lens.material.color.setHex(0x140705);
    group.add(lens);
    zoneOf(def.zone).lenses.push(lens.material);
    zoneOf(def.zone).lamps.push({ light, lens: lens.material.color, lensMesh: lens, shaft: null, pos: def.pos, delay: 0 });
  }

  // --------------------------------------------------------- light shafts
  let dustIndex = 0;
  for (const def of SHAFTS) {
    const height = def.pos[1];
    const material = materials.shaft(POWERED.color);
    material.opacity = 0;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(def.radius, height, 10, 1, true),
      material
    );
    cone.position.set(def.pos[0], height / 2, def.pos[2]);
    cone.renderOrder = 2;
    cone.visible = false;
    group.add(cone);
    zoneOf(def.zone).shafts.push(cone);
    // Each shaft hangs under one lamp, and comes on when that lamp does.
    const lamp = zoneOf(def.zone).lamps.find((l) => l.pos[0] === def.pos[0] && l.pos[2] === def.pos[2]);
    if (lamp) {
      lamp.shaft = cone;
      lamp.dust = buildDust(cone, def.radius, height, dustIndex++);
    }
  }

  // ------------------------------------------------------------ conduits
  // Coloured per vertex rather than per material, so the green can travel
  // along a run instead of the whole strip changing at once (6.3.3). The
  // material colour is left as a multiplier, which the departure uses to take
  // every strip behind the player down together.
  for (const def of CONDUITS) {
    const length = Math.abs(def.to - def.from);
    const segments = Math.max(1, Math.round(length / CONDUIT_SEGMENT));
    const geo = new THREE.PlaneGeometry(length, 0.17, segments, 1);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * length);
    uv.needsUpdate = true;
    const colors = new THREE.BufferAttribute(new Float32Array(uv.count * 3), 3);
    geo.setAttribute('color', colors);

    const material = materials.conduit(0xffffff);
    material.vertexColors = true;
    const strip = new THREE.Mesh(geo, material);
    const mid = (def.from + def.to) / 2;
    if (def.axis === 'z') {
      strip.position.set(mid, def.y, def.at);
      strip.rotation.y = def.side === 1 ? 0 : Math.PI;
    } else {
      strip.position.set(def.at, def.y, mid);
      strip.rotation.y = def.side === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    group.add(strip);
    strip.updateMatrixWorld(true);

    // Where each vertex sits in the world, for its distance from the source.
    const world = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < geo.attributes.position.count; i++) {
      p.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(strip.matrixWorld);
      world.push([p.x, p.z]);
    }
    const record = { mesh: strip, material, colors, world, delays: new Float32Array(world.length) };
    paint(record, () => CONDUIT_OFF);
    zoneOf(def.zone).conduits.push(material);
    zoneOf(def.zone).strips.push(record);
  }

  function paint(record, colourAt) {
    const a = record.colors.array;
    for (let i = 0; i < record.world.length; i++) {
      const c = colourAt(i);
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    record.colors.needsUpdate = true;
  }

  const escaping = { active: false, t: 0 };

  /**
   * `origin` is where the power came from — the switch that was thrown or the
   * socket a cell went into — as [x, y, z]. Every lamp and every metre of
   * conduit in the zone strikes after a delay proportional to its distance
   * from it, so a room comes up from the switch outward and a corridor fills
   * from the end nearest the room that powered it. Without an origin the zone
   * comes up from its own centre.
   *
   * The zone *is* powered from this call on. The strike is something to watch,
   * never something to wait for: nothing reads the lamps to decide anything
   * (4.3.3, 6.3.3).
   */
  function setPowered(zoneId, powered, origin = null) {
    const zone = zoneOf(zoneId);
    if (zone.powered === powered) return;
    zone.powered = powered;
    zone.t = 0;
    zone.since = 0;
    if (!powered) {
      for (const shaft of zone.shafts) shaft.visible = false;
      return;
    }
    const from = origin ?? centreOf(zone);
    zone.origin = from;
    for (const lamp of zone.lamps) {
      lamp.delay = PACE * Math.hypot(lamp.pos[0] - from[0], lamp.pos[2] - from[2]);
    }
    for (const strip of zone.strips) {
      for (let i = 0; i < strip.world.length; i++) {
        strip.delays[i] = PACE * Math.hypot(strip.world[i][0] - from[0], strip.world[i][1] - from[2]);
      }
    }
  }

  function centreOf(zone) {
    if (!zone.lamps.length) return [0, 0, 0];
    let x = 0;
    let z = 0;
    for (const l of zone.lamps) {
      x += l.pos[0];
      z += l.pos[2];
    }
    return [x / zone.lamps.length, 0, z / zone.lamps.length];
  }

  /** How long until everything in a zone has finished striking. */
  function settleTime(zone) {
    let last = 0;
    for (const l of zone.lamps) last = Math.max(last, l.delay);
    for (const s of zone.strips) for (const d of s.delays) last = Math.max(last, d);
    return last + STRIKE_SECONDS;
  }

  function reset() {
    escaping.active = false;
    escaping.t = 0;
    for (const [id, zone] of zones) {
      zone.powered = false;
      zone.t = 1;
      for (const shaft of zone.shafts) {
        shaft.visible = false;
        shaft.material.opacity = 0;
      }
      for (const material of zone.conduits) material.color.setRGB(1, 1, 1);
      for (const strip of zone.strips) paint(strip, () => CONDUIT_OFF);
      for (const material of zone.lenses) {
        material.color.copy(id === 'chamber' ? DEAD_LENS : EMERGENCY_LENS);
      }
      for (const light of zone.lights) {
        light.color.copy(EMERGENCY_COLOR);
        light.intensity = id === 'chamber' ? 0 : EMERGENCY.intensity;
      }
    }
  }

  /**
   * Called when the outer door starts to cycle.
   *
   * Two things at once, and they are the same thing seen from either end: the
   * chamber floods white through the opening door, and every compartment
   * behind the player loses its light. Phase 5 wanted "the ship falls away"
   * without a camera the player does not own, and this is what that is — turn
   * round on the way out and the ship you spent five minutes lighting is dark
   * again.
   */
  function floodChamber() {
    escaping.active = true;
    escaping.t = 0;
  }

  function update(dt, elapsed) {
    for (const [id, zone] of zones) {
      if (zone.powered && zone.t < 1) {
        // Striking: every lamp on its own clock, offset by its distance from
        // where the power came in. A lamp whose turn has not come yet is still
        // on emergency power, which is exactly what it looks like.
        zone.since += dt;
        for (const lamp of zone.lamps) {
          const lt = (zone.since - lamp.delay) / STRIKE_SECONDS;
          if (lt < 0) {
            lamp.light.color.copy(EMERGENCY_COLOR);
            lamp.light.intensity = EMERGENCY.intensity;
            continue;
          }
          const t = Math.min(1, lt);
          const k = surge(t);
          const mix = Math.min(1, t / 0.3);
          lamp.light.color.copy(EMERGENCY_COLOR).lerp(POWERED_COLOR, mix);
          lamp.light.intensity = POWERED.intensity * k;
          lamp.lens
            .copy(EMERGENCY_LENS)
            .lerp(POWERED_COLOR, mix)
            .multiplyScalar(Math.min(1.35, 0.55 + 0.45 * k));
          if (lamp.shaft) {
            lamp.shaft.visible = true;
            lamp.shaft.material.opacity = 0.06 * Math.min(1, t * 1.6) * (0.6 + 0.4 * k);
          }
        }
        for (const strip of zone.strips) {
          paint(strip, (i) => {
            const ct = (zone.since - strip.delays[i]) / 0.25;
            return ct <= 0 ? CONDUIT_OFF : ct >= 1 ? CONDUIT_ON : blend.copy(CONDUIT_OFF).lerp(CONDUIT_ON, ct);
          });
        }
        if (zone.since >= settleTime(zone)) zone.t = 1;
      } else if (!zone.powered && zone.t < 1) {
        zone.t = 1;
        for (const lamp of zone.lamps) {
          lamp.light.color.copy(EMERGENCY_COLOR);
          lamp.light.intensity = id === 'chamber' ? 0 : EMERGENCY.intensity;
          lamp.lens.copy(id === 'chamber' ? DEAD_LENS : EMERGENCY_LENS);
        }
        for (const strip of zone.strips) paint(strip, () => CONDUIT_OFF);
      } else if (!zone.powered && id !== 'chamber' && !escaping.active) {
        // A dying ship: the emergency lamps never sit quite still. Silent
        // during the departure, which owns every lamp behind the airlock.
        const wobble = 0.86 + 0.14 * Math.sin(elapsed * 2.3 + zone.lights.length);
        for (const light of zone.lights) light.intensity = EMERGENCY.intensity * wobble;
      }
    }

    if (escaping.active && escaping.t < 1) {
      escaping.t = Math.min(1, escaping.t + dt / ESCAPE_SECONDS);
      const eased = escaping.t * escaping.t;
      for (const light of zoneOf('chamber').lights) {
        light.color.copy(POWERED_COLOR).lerp(new THREE.Color(ESCAPE_LIGHT.color), eased);
        light.intensity = ESCAPE_LIGHT.intensity * eased;
      }

      // Everything behind the airlock, going out. Assigned rather than
      // accumulated — a per-frame multiply would make the rate of the fade a
      // function of the frame rate, which is the bug this project has already
      // written three comments about.
      const behind = 1 - eased;
      for (const [id, zone] of zones) {
        if (id === 'chamber') continue;
        const base = zone.powered ? POWERED.intensity : EMERGENCY.intensity;
        for (const light of zone.lights) light.intensity = base * behind;
        // The strips hold their own colour per vertex; this takes them all
        // down together, wherever a fill had got to.
        for (const material of zone.conduits) material.color.setRGB(behind, behind, behind);
        for (const material of zone.lenses) {
          material.color
            .copy(zone.powered ? POWERED_COLOR : EMERGENCY_LENS)
            .multiplyScalar(behind);
        }
        for (const shaft of zone.shafts) shaft.material.opacity = 0.06 * behind;
      }
    }
  }

  /**
   * The dust takes its brightness from its own lamp, on the same frame, after
   * everything else has decided what the lamp is doing — so the strike's
   * stutter and the departure's fade both show in the air (8.3.5). It moves
   * only while it can be seen.
   */
  function updateDust(elapsed) {
    for (const zone of zones.values()) {
      for (const lamp of zone.lamps) {
        const dust = lamp.dust;
        if (!dust) continue;
        if (!lamp.shaft.visible) {
          dust.points.material.opacity = 0;
          continue;
        }
        const k = Math.max(0, Math.min(1.6, lamp.light.intensity / POWERED.intensity));
        dust.points.material.opacity = DUST_OPACITY * k;
        driftDust(dust, elapsed);
      }
    }
  }

  /**
   * The lamps in a zone. Phase 4's failing lamp rides on top of whatever state
   * the zone is in rather than replacing it, so it needs the light itself.
   */
  function lampsIn(zoneId) {
    return zones.get(zoneId)?.lights ?? [];
  }

  /** The lamp lenses, conduit strips and dust of a zone, for tools/colour.mjs and tools/consume.mjs. */
  function partsIn(zoneId) {
    const zone = zones.get(zoneId);
    return zone
      ? {
          lenses: zone.lamps.map((l) => l.lensMesh),
          strips: zone.strips.map((s) => s.mesh),
          dust: zone.lamps.filter((l) => l.dust).map((l) => ({ ...l.dust, light: l.light, shaft: l.shaft })),
        }
      : null;
  }

  /** Whether any zone is part-way through its strike, for tools/profile.mjs. */
  function striking() {
    for (const zone of zones.values()) if (zone.powered && zone.t < 1) return true;
    return false;
  }

  return { group, setPowered, floodChamber, reset, update, updateDust, lampsIn, striking, partsIn };
}
