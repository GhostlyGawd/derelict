import * as THREE from 'three';

/**
 * Phase 4 — idle life.
 *
 * Before this the only moving things on the ship were the lighting states and
 * two doors, which is what made it read as a well-lit diorama rather than a
 * vessel. Four places now move on their own, none of them interactive and none
 * of them on the critical path: a slow extractor fan in the Annex, a vent that
 * breathes in the Hold, a failing lamp in Corridor B, and sparks at the
 * collapsed debris in Corridor B.
 *
 * All of it built in engine from surfaces the pipeline already produces — the
 * phase 2 precedent that the socket "is the third interactive type but not a
 * third model". §4.7 keeps the model count at zero for this phase, so anything
 * that moves is parametric geometry or an additive sprite.
 */

/** Fan blade count and how slowly a half-dead extractor turns. */
const FAN_BLADES = 5;
const FAN_RPM = 26;

export function buildMechanism(materials, lighting) {
  const group = new THREE.Group();
  group.name = 'mechanism';

  const metal = materials.surface('greeble_panel');
  const trim = materials.surface('door_trim');

  // ---------------------------------------------------------------- fan --
  // Ceiling extractor in the Engine Annex. A ring housing with blades on a
  // hub, turning slowly enough to read as struggling rather than as running.
  const fan = new THREE.Group();
  fan.position.set(26, 3.66, -5.4);
  // A collar set into the ceiling, then the throat behind it. Without the
  // collar the blades read as a piece of broken geometry stuck to the deckhead
  // rather than as something the ship was built with — which is what the first
  // version looked like, and which no amount of reading the code would show.
  const collarMaterial = metal.clone();
  collarMaterial.side = THREE.DoubleSide;
  const collar = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.02, 16), collarMaterial);
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = 0.13;
  fan.add(collar);
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.3, 16, 1, true),
    collarMaterial
  );
  housing.position.y = 0.14;
  fan.add(housing);
  const hub = new THREE.Group();
  for (let i = 0; i < FAN_BLADES; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.2), trim);
    blade.position.set(Math.cos((i / FAN_BLADES) * Math.PI * 2) * 0.33, 0, Math.sin((i / FAN_BLADES) * Math.PI * 2) * 0.33);
    blade.rotation.y = (i / FAN_BLADES) * Math.PI * 2;
    blade.rotation.z = 0.42;
    hub.add(blade);
  }
  hub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8), trim));
  fan.add(hub);
  group.add(fan);

  // --------------------------------------------------------------- vent --
  // A louvred extract in the Storage Hold's west bulkhead. The slats do not
  // spin, they breathe: the ship still drawing air through a duct that no
  // longer has the pressure to hold them open.
  const vent = new THREE.Group();
  vent.position.set(-32.72, 2.15, 2.6);
  vent.rotation.y = Math.PI / 2;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.72, 0.09), metal);
  vent.add(frame);
  const slats = [];
  for (let i = 0; i < 5; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.11, 0.05), trim);
    slat.position.set(0, 0.26 - i * 0.13, 0.07);
    vent.add(slat);
    slats.push(slat);
  }
  group.add(vent);

  // Breath, as an additive puff off the conduit strip — the one generated
  // surface that is already a soft glow rather than a picture of something.
  const puffMaterial = new THREE.MeshBasicMaterial({
    map: materials.textureFor('conduit_strip'),
    color: 0x9fb4a6,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const puff = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.5), puffMaterial);
  puff.position.set(-32.3, 2.05, 2.6);
  puff.rotation.y = Math.PI / 2;
  group.add(puff);

  // ------------------------------------------------------------- sparks --
  // At the collapsed structure in Corridor B, where something is still live.
  // Short additive flashes, never a light: the point-light count is fixed for
  // the lifetime of the scene because changing it recompiles every material.
  const sparkMaterial = new THREE.MeshBasicMaterial({
    map: materials.textureFor('conduit_strip'),
    color: 0xbfe9ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const spark = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), sparkMaterial);
  spark.position.set(12.55, 1.62, 0.18);
  group.add(spark);

  // -------------------------------------------------------- failing lamp --
  // Corridor B's far lamp is on its way out. Modulated after the lighting pass
  // rather than inside it, so it rides on top of whatever state that zone is
  // in — dying red on emergency power and dying green once the Annex is up.
  const failing = lighting.lampsIn('corrB').slice(-1);

  let time = 0;
  let sparkAt = 2.4;

  function update(dt, camera) {
    time += dt;

    hub.rotation.y += (FAN_RPM / 60) * Math.PI * 2 * dt;

    // Two breaths a cycle, uneven, so it never settles into a metronome.
    const breath = Math.sin(time * 0.9) * 0.5 + Math.sin(time * 0.37 + 1.1) * 0.5;
    for (let i = 0; i < slats.length; i++) {
      slats[i].rotation.x = 0.22 + breath * 0.2 + Math.sin(time * 0.9 + i * 0.4) * 0.03;
    }
    puffMaterial.opacity = Math.max(0, breath) * 0.11;
    puff.scale.setScalar(1 + Math.max(0, breath) * 0.5);

    // Sparks come in bursts with dead air between them, which is what makes
    // them read as a fault rather than as an effect.
    sparkAt -= dt;
    if (sparkAt <= 0) {
      sparkAt = 1.6 + Math.random() * 3.4;
      sparkMaterial.userData.burst = 0.28 + Math.random() * 0.22;
      spark.position.set(12.3 + Math.random() * 0.5, 1.5 + Math.random() * 0.3, 0.05 + Math.random() * 0.3);
    }
    const burst = sparkMaterial.userData.burst || 0;
    if (burst > 0) {
      sparkMaterial.userData.burst = Math.max(0, burst - dt);
      // Flicker hard within the burst rather than fading smoothly.
      sparkMaterial.opacity = Math.random() < 0.45 ? 0 : 0.5 + Math.random() * 0.5;
    } else {
      sparkMaterial.opacity = 0;
    }

    for (const lamp of failing) {
      // Mostly fine, with brownouts that drop it almost out.
      const n = Math.sin(time * 11.3) + Math.sin(time * 4.7 + 2.1) + Math.sin(time * 23.9 + 0.7);
      lamp.intensity *= n < -1.55 ? 0.12 : 0.82 + 0.18 * (n * 0.5 + 0.5);
    }

    // The sprites are flat quads, so they have to be turned to face the eye.
    if (camera) {
      puff.quaternion.copy(camera.quaternion);
      spark.quaternion.copy(camera.quaternion);
    }
  }

  function reset() {
    time = 0;
    sparkAt = 2.4;
    sparkMaterial.opacity = 0;
    sparkMaterial.userData.burst = 0;
    puffMaterial.opacity = 0;
  }

  return { group, update, reset };
}
