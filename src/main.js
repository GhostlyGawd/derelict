import './style.css';
import * as THREE from 'three';

import { Assets } from './core/assets.js';
import { AudioBus } from './core/audio.js';
import { Hud } from './core/hud.js';
import { Input } from './core/input.js';
import { MaterialLibrary } from './core/materials.js';
import { createRenderer } from './core/renderer.js';

import { buildDoors, buildPowerPanel, buildSwitches } from './game/fixtures.js';
import { Interactor } from './game/interact.js';
import { ESCAPE_TRIGGER, SPAWN, ZONE_POWER, spaceAt } from './game/layout.js';
import { buildLevel } from './game/level.js';
import { buildLighting } from './game/lighting.js';
import { Player } from './game/player.js';
import { buildStaticProps } from './game/props.js';
import { buildViewmodel, fovFor } from './game/viewmodel.js';

const FOG_NEAR = 5;
const FOG_FAR = 30;
const BASE_FOV = 72;
const EMERGENCY_TINT = new THREE.Color(0xff7a5a);
const POWERED_TINT = new THREE.Color(0xd6f4e2);

class Derelict {
  constructor() {
    this.canvas = document.getElementById('view');
    this.hud = new Hud();
    this.assets = new Assets();

    this.input = new Input({
      canvas: this.canvas,
      stickEl: document.getElementById('stick'),
      knobEl: document.getElementById('stick-knob'),
      interactBtn: document.getElementById('touch-interact'),
    });

    this.view = createRenderer(this.canvas, { mobile: this.input.usingTouch });
    this.audio = new AudioBus(this.assets);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.Fog(0x05070a, FOG_NEAR, FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 60);
    this.player = new Player(this.camera);
    this.player.onFootstep = () => this.#footstep();

    this.phase = 'loading';
    this.cells = 0;
    this.poweredZones = new Set();
    this.elapsed = 0;
    this.runTime = 0;
    this.lastFrame = 0;
    this.escapeArmed = false;

    this.#bindUi();
  }

  // --------------------------------------------------------------- boot --

  async boot() {
    this.hud.setLoading(0.03, 'Reading manifest…');
    await this.assets.load((fraction, text) => this.hud.setLoading(0.05 + fraction * 0.85, text));

    this.hud.setLoading(0.94, 'Assembling deck…');
    // Yield so the loading bar actually paints before the world build.
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    this.materials = new MaterialLibrary(this.assets);
    this.#buildWorld();

    this.hud.setLoading(1, this.assets.generated ? 'Ready' : 'Ready — placeholder assets');
    this.hud.hide('loading');
    this.hud.show('title');
    if (this.input.usingTouch) this.hud.useTouchLayout();

    this.#resize();
    window.addEventListener('resize', () => this.#resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.#resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.#pause();
    });

    this.phase = 'title';
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.#frame(t));
  }

  #buildWorld() {
    const modelCache = new Map();

    const level = buildLevel(this.materials);
    this.scene.add(level.group);

    const props = buildStaticProps(this.assets, modelCache);
    this.scene.add(props.group);

    this.staticColliders = [...level.colliders, ...props.colliders];

    this.lighting = buildLighting(this.materials);
    this.scene.add(this.lighting.group);

    this.switches = buildSwitches(this.assets, modelCache);
    for (const sw of this.switches) this.scene.add(sw.object);

    this.doors = buildDoors(this.assets, modelCache);
    for (const door of this.doors) this.scene.add(door.object);
    this.doorsById = new Map(this.doors.map((d) => [d.id, d]));

    this.panel = buildPowerPanel(this.materials);
    this.scene.add(this.panel.group);

    this.viewmodel = buildViewmodel(this.assets);

    this.interactor = new Interactor(this.camera);
    for (const sw of this.switches) this.interactor.register(sw);

    this.player.reset(SPAWN.pos, SPAWN.yaw);
    this.lighting.reset();
  }

  #bindUi() {
    document.getElementById('start').addEventListener('click', () => this.#start());
    document.getElementById('resume').addEventListener('click', () => this.#resume());
    document.getElementById('restart').addEventListener('click', () => this.#restart());
    this.input.onEscape = () => {
      if (this.phase === 'playing') this.#pause();
    };
  }

  // -------------------------------------------------------- run control --

  async #start() {
    this.hud.hide('title');
    await this.audio.unlock();
    this.audio.fadeIn(0.8);
    this.audio.startAmbient();

    this.phase = 'playing';
    this.runTime = 0;
    this.hud.setHudVisible(true);
    this.hud.setTouchVisible(this.input.usingTouch);
    this.input.setEnabled(true);
    this.input.requestPointerLock();
    this.hud.fade(0, 1.6);
  }

  #pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.audio.setSuspended(true);
    this.hud.setPrompt(null);
    this.hud.show('paused');
  }

  #resume() {
    if (this.phase !== 'paused') return;
    this.hud.hide('paused');
    this.audio.setSuspended(false);
    this.phase = 'playing';
    this.input.setEnabled(true);
    this.input.requestPointerLock();
  }

  #restart() {
    this.hud.hide('endcard');
    this.hud.fade(1, 0.01);

    this.cells = 0;
    this.escapeArmed = false;
    this.poweredZones.clear();
    for (const sw of this.switches) {
      sw.used = false;
      sw.leverT = 0;
      sw.recoil = 0;
      sw.pivot.rotation.x = -0.75;
      sw.body.position.z = 0;
      sw.indicator.material.color.setHex(0xff2a18);
      sw.highlight(false);
    }
    this.interactor.current = null;
    for (const door of this.doors) door.reset();
    this.lighting.reset();
    this.panel.setCount(0);
    this.player.reset(SPAWN.pos, SPAWN.yaw);
    this.audio.stopAmbient();

    setTimeout(() => this.#start(), 60);
  }

  // ------------------------------------------------------------- events --

  #flip(sw) {
    if (!sw.activate()) return;

    this.cells++;
    this.panel.setCount(this.cells);
    this.viewmodel.play();

    this.audio.playAt('switch_clunk', sw.point.toArray(), this.player.position, { volume: 1 });
    this.audio.play('power_surge', { volume: 0.55, delay: 0.18 });

    for (const [zone, source] of Object.entries(ZONE_POWER)) {
      if (source === sw.id) {
        this.lighting.setPowered(zone, true);
        this.poweredZones.add(zone);
      }
    }

    if (sw.id === 'switch2') {
      for (const id of ['hatch-bay', 'hatch-annex']) {
        const door = this.doorsById.get(id);
        if (door?.cycle()) {
          this.audio.playAt('door_motor', [13, 1, 4.6], this.player.position, { volume: 0.8 });
        }
      }
    }

    if (this.cells >= 2) this.#openAirlock();
  }

  #openAirlock() {
    const airlock = this.doorsById.get('airlock');
    if (!airlock?.cycle()) return;

    this.lighting.setPowered('bay', true);
    this.poweredZones.add('bay');
    this.lighting.floodChamber();
    this.escapeArmed = true;

    this.audio.playAt('door_motor', [0, 1, -7], this.player.position, { volume: 1, rate: 0.85 });
  }

  #footstep() {
    if (this.phase !== 'playing') return;
    const variant = 1 + ((Math.random() * 3) | 0);
    this.audio.play(`footstep_${Math.min(3, variant)}`, {
      volume: 0.22 + Math.random() * 0.06,
      rate: 0.94 + Math.random() * 0.12,
    });
  }

  #escape() {
    if (this.phase !== 'playing') return;
    this.phase = 'ending';
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.hud.setPrompt(null);
    this.hud.setHudVisible(false);
    this.hud.setTouchVisible(false);
    this.hud.fade(1, 1.5);
    this.audio.fadeOut(1.5);

    setTimeout(() => {
      this.audio.stopAmbient();
      this.audio.fadeIn(0.2, 0.9);
      this.audio.play('end_sting', { volume: 0.85 });
      this.phase = 'ended';
      this.hud.showEnd(this.runTime);
    }, 1700);
  }

  // -------------------------------------------------------------- frame --

  #resize() {
    const aspect = this.view.resize();
    this.camera.fov = fovFor(BASE_FOV, aspect);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewmodel?.resize(aspect);
  }

  #frame(now) {
    requestAnimationFrame((t) => this.#frame(t));
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed += dt;

    if (this.view.sample(dt)) this.#resize();

    if (this.phase === 'playing') this.runTime += dt;

    const look = { dx: this.input.look.dx, dy: this.input.look.dy };

    if (this.phase === 'playing') {
      this.player.update(dt, this.input, this.#colliders());
      this.#updateInteraction();
      this.#checkEscape();
    }

    for (const sw of this.switches) sw.update(dt);
    for (const door of this.doors) door.update(dt);
    this.lighting.update(dt, this.elapsed);

    const space = spaceAt(this.player.position.x, this.player.position.z);
    const powered = space ? this.poweredZones.has(space.id) : false;
    this.viewmodel.setTint(
      powered ? POWERED_TINT : EMERGENCY_TINT,
      powered ? 2.4 : 1.5
    );
    this.viewmodel.update(dt, { look, speed: this.player.speed, powered });

    this.view.render(this.scene, this.camera, this.viewmodel);
  }

  #colliders() {
    const list = this.staticColliders;
    const dynamic = [];
    for (const door of this.doors) dynamic.push(...door.colliders());
    return dynamic.length ? list.concat(dynamic) : list;
  }

  #updateInteraction() {
    const target = this.interactor.update();
    this.hud.setPrompt(
      target ? (this.input.usingTouch ? target.prompt : `[E] ${target.prompt}`) : null
    );
    const pressed = this.input.takeInteract();
    if (pressed && target) this.#flip(target);
  }

  #checkEscape() {
    if (!this.escapeArmed) return;
    const { x, z } = this.player.position;
    if (
      x > ESCAPE_TRIGGER.x[0] &&
      x < ESCAPE_TRIGGER.x[1] &&
      z > ESCAPE_TRIGGER.z[0] &&
      z < ESCAPE_TRIGGER.z[1]
    ) {
      this.#escape();
    }
  }
}

const game = new Derelict();
// Handle for the headless playtest in tools/smoke.mjs.
window.__derelict = game;
game.boot().catch((err) => {
  console.error(err);
  document.getElementById('loading-text').textContent = `Failed to start: ${err.message}`;
});
