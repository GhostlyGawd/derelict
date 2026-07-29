import * as THREE from 'three';
import { CONDUITS, EMERGENCY, ESCAPE_LIGHT, LIGHTS, POWERED, SHAFTS } from './layout.js';

/**
 * Zone lighting.
 *
 * The whole ship starts on dim red emergency power. Restoring a cell snaps its
 * room and corridor to green-white over a short surge, brings up the light
 * shafts, and flips the conduit strips from red to green.
 *
 * The point-light count is fixed for the lifetime of the scene: Three.js
 * recompiles every material when it changes, which would stall the frame at
 * exactly the moment the player flips a switch.
 */

const EMERGENCY_COLOR = new THREE.Color(EMERGENCY.color);
const POWERED_COLOR = new THREE.Color(POWERED.color);
const CONDUIT_OFF = new THREE.Color(0xd8351c);
const CONDUIT_ON = new THREE.Color(0x8effae);
const DEAD_LENS = new THREE.Color(0x140705);

/** Two stutters and a settle — the lamps fighting the surge back on. */
function surge(t) {
  if (t < 0.10) return 0.25;
  if (t < 0.18) return 1.55;
  if (t < 0.26) return 0.18;
  if (t < 0.40) return 1.3;
  if (t < 0.46) return 0.55;
  return 1 + 0.28 * Math.exp(-(t - 0.46) * 9) * Math.sin((t - 0.46) * 34);
}

export function buildLighting(materials) {
  const group = new THREE.Group();
  group.name = 'lighting';

  // Just enough bounce that unlit corners read as dark, not as holes.
  group.add(new THREE.AmbientLight(0x2c322e, 1.0));

  const zones = new Map(); // zone -> { t, powered, lights, shafts, conduits }
  const zoneOf = (id) => {
    if (!zones.has(id)) {
      zones.set(id, { t: 0, powered: false, lights: [], shafts: [], conduits: [], lenses: [] });
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
      new THREE.MeshBasicMaterial({ color: EMERGENCY.color, toneMapped: false, fog: true })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(def.pos[0], def.pos[1] + 0.088, def.pos[2]);
    if (def.zone === 'chamber') lens.material.color.setHex(0x140705);
    group.add(lens);
    zoneOf(def.zone).lenses.push(lens.material);
  }

  // --------------------------------------------------------- light shafts
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
  }

  // ------------------------------------------------------------ conduits
  for (const def of CONDUITS) {
    const length = Math.abs(def.to - def.from);
    const geo = new THREE.PlaneGeometry(length, 0.17);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * length);
    uv.needsUpdate = true;

    const material = materials.conduit(CONDUIT_OFF.getHex());
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
    zoneOf(def.zone).conduits.push(material);
  }

  const escaping = { active: false, t: 0 };

  function setPowered(zoneId, powered) {
    const zone = zoneOf(zoneId);
    if (zone.powered === powered) return;
    zone.powered = powered;
    zone.t = 0;
    for (const shaft of zone.shafts) shaft.visible = powered;
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
      for (const material of zone.conduits) material.color.copy(CONDUIT_OFF);
      for (const material of zone.lenses) {
        material.color.copy(id === 'chamber' ? DEAD_LENS : EMERGENCY_COLOR);
      }
      for (const light of zone.lights) {
        light.color.copy(EMERGENCY_COLOR);
        light.intensity = id === 'chamber' ? 0 : EMERGENCY.intensity;
      }
    }
  }

  /** Called when the airlock finishes cycling: the chamber floods white. */
  function floodChamber() {
    escaping.active = true;
    escaping.t = 0;
  }

  function update(dt, elapsed) {
    for (const [id, zone] of zones) {
      if (zone.t < 1) {
        zone.t = Math.min(1, zone.t + dt / 1.15);
        const k = zone.powered ? surge(zone.t) : 1;
        const mix = zone.powered ? Math.min(1, zone.t / 0.3) : 0;
        const base = zone.powered ? POWERED.intensity : EMERGENCY.intensity;

        for (const light of zone.lights) {
          light.color.copy(EMERGENCY_COLOR).lerp(POWERED_COLOR, mix);
          light.intensity = base * k;
        }
        for (const material of zone.conduits) {
          material.color.copy(CONDUIT_OFF).lerp(CONDUIT_ON, mix);
        }
        for (const material of zone.lenses) {
          material.color
            .copy(EMERGENCY_COLOR)
            .lerp(POWERED_COLOR, mix)
            .multiplyScalar(Math.min(1.35, 0.55 + 0.45 * k));
        }
        for (const shaft of zone.shafts) {
          shaft.material.opacity = 0.06 * Math.min(1, zone.t * 1.6) * (0.6 + 0.4 * k);
        }
      } else if (!zone.powered && id !== 'chamber') {
        // A dying ship: the emergency lamps never sit quite still.
        const wobble = 0.86 + 0.14 * Math.sin(elapsed * 2.3 + zone.lights.length);
        for (const light of zone.lights) light.intensity = EMERGENCY.intensity * wobble;
      }
    }

    if (escaping.active && escaping.t < 1) {
      escaping.t = Math.min(1, escaping.t + dt / 2.6);
      const eased = escaping.t * escaping.t;
      for (const light of zoneOf('chamber').lights) {
        light.color.copy(POWERED_COLOR).lerp(new THREE.Color(ESCAPE_LIGHT.color), eased);
        light.intensity = ESCAPE_LIGHT.intensity * eased;
      }
    }
  }

  return { group, setPowered, floodChamber, reset, update };
}
