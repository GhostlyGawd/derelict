import './style.css';
import * as THREE from 'three';

import { Assets } from './core/assets.js';
import { AudioBus } from './core/audio.js';
import { Hud } from './core/hud.js';
import { Input } from './core/input.js';
import { MaterialLibrary } from './core/materials.js';
import { createRenderer } from './core/renderer.js';

import { buildCarryables } from './game/carryables.js';
import { buildDoors, buildPowerPanel, buildSwitches } from './game/fixtures.js';
import { Interactor } from './game/interact.js';
import { ESCAPE_TRIGGER, SPACES, SPAWN, ZONE_POWER, spaceAt } from './game/layout.js';
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
    /** Seated cells, not switch flips — the panel counts what is in the sockets. */
    this.cells = 0;
    /** The single carry slot. Shared by reference with the interactives. */
    this.carry = { held: null };
    /** The room table, so tools/deadend.mjs can tell inside from outside. */
    this.spaces = SPACES;
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

    this.carryables = buildCarryables(this.assets, modelCache, this.carry, this.materials);
    this.scene.add(this.carryables.group);
    this.staticColliders = this.staticColliders.concat(this.carryables.colliders);

    this.doors = buildDoors(this.assets, modelCache);
    for (const door of this.doors) this.scene.add(door.object);
    this.doorsById = new Map(this.doors.map((d) => [d.id, d]));

    this.panel = buildPowerPanel(this.materials);
    this.scene.add(this.panel.group);

    this.viewmodel = buildViewmodel(this.assets);

    this.interactor = new Interactor(this.camera);
    for (const sw of this.switches) this.interactor.register(sw);
    for (const target of this.carryables.interactives) this.interactor.register(target);

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
    this.carry.held = null;
    this.carryables.reset();
    this.viewmodel.setCarrying(false);
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

  /**
   * One interact press. A null target means the crosshair is on nothing, which
   * is how a carried cell gets set down.
   */
  #press(target) {
    if (target) this.#use(target);
    else if (this.carry.held) this.#setDown();
  }

  /** Dispatch for whatever the crosshair is on. */
  #use(target) {
    if (target.kind === 'switch') this.#flip(target);
    else if (target.kind === 'cell') this.#take(target);
    else if (target.kind === 'socket') this.#seat(target);
  }

  #flip(sw) {
    if (!sw.activate()) return;
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

    this.#updateGates();
  }

  #take(cell) {
    if (!cell.canUse()) return;
    cell.take();
    this.carry.held = cell;
    this.viewmodel.setCarrying(true);
    this.viewmodel.play();
    this.audio.playAt('cell_lift', cell.point.toArray(), this.player.position, { volume: 1 });
  }

  #seat(socket) {
    const cell = this.carry.held;
    if (!cell || socket.filled) return;
    this.carryables.seat(cell, socket);
    this.carry.held = null;
    this.viewmodel.setCarrying(false);
    this.viewmodel.play();

    this.cells = this.carryables.sockets.filter((s) => s.filled).length;
    this.panel.setCount(this.cells);
    // cell_seat already carries the circuit waking up behind the latch, so the
    // room surge comes in later and quieter than it does off a wall switch.
    this.audio.playAt('cell_seat', socket.point.toArray(), this.player.position, { volume: 1 });
    this.audio.play('power_surge', { volume: 0.4, delay: 0.55 });

    // Seating the first cell brings the Bay up on its own power.
    if (this.cells >= 1 && !this.poweredZones.has('bay')) {
      this.lighting.setPowered('bay', true);
      this.poweredZones.add('bay');
    }

    this.#updateGates();
    if (this.cells >= 2) this.#openAirlock();
  }

  #setDown() {
    const cell = this.carry.held;
    if (!cell) return;
    this.carryables.setDown(cell, this.player.position, this.player.yaw);
    this.carry.held = null;
    this.viewmodel.setCarrying(false);
    this.audio.play('footstep_1', { volume: 0.5, rate: 0.7 });
  }

  /**
   * Releases any cradle whose conditions are now all met. Called after every
   * state change rather than polled, so the release is always the direct
   * consequence of the action that earned it.
   */
  #updateGates() {
    const satisfied = (need) => {
      if (need === 'bay-live') return this.cells >= 1;
      return this.switches.some((sw) => sw.id === need && sw.used);
    };
    for (const cradle of this.carryables.cradles) {
      if (cradle.released || !cradle.needs.every(satisfied)) continue;
      cradle.release();
      // Loud enough to carry across the room it is in, since it lands under the
      // power surge from the switch that just earned it — cradle 2 is 10 m from
      // switch 2, and distance falloff had it near-masked at half volume.
      this.audio.playAt(
        'door_motor',
        cradle.mount.toArray(),
        this.player.position,
        { volume: 0.9, rate: 1.6 }
      );
    }
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
    // Carrying with nothing in the crosshair still has an action — putting the
    // cell down — and on touch the context button is lit only when a prompt is
    // showing. Without this the set-down gesture would be invisible on a phone.
    const action = target?.prompt ?? (this.carry.held ? 'Set Down Cell' : null);
    this.hud.setPrompt(action && (this.input.usingTouch ? action : `[E] ${action}`));
    if (this.input.takeInteract()) this.#press(target);
  }

  /**
   * The interact press with the aim taken out of it, for tools/chain.mjs. The
   * chain harness is about ordering, not about whether a thing is reachable —
   * walkthrough.mjs owns reachability. Routing through #press means the two can
   * never test different dispatch.
   */
  pressInteractForTest(target = null) {
    if (this.phase === 'playing') this.#press(target);
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
