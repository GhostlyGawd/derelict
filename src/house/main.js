import '../style.css';
import * as THREE from 'three';

import { Hud } from '../core/hud.js';
import { INPUT_VERSION, Input } from '../core/input.js';
import { createRenderer } from '../core/renderer.js';
import { Player } from '../game/player.js';
import { fovFor } from '../game/viewmodel.js';

import { buildHouse } from './level.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS, SPACES, SPAWN, floorAt, spaceAt } from './layout.js';

const BASE_FOV = 72;

/**
 * The house (phase 9) — milestone 1: two storeys in greybox.
 *
 * Built from the same core as the ship: the renderer and its retro treatment,
 * the input layer with touch and pad, the player and its collision. It keeps
 * the ship's handles for the harnesses — `phase`, `player`, `stepForTest`, the
 * manual clock — so the instruments that already exist can be pointed at it.
 */
class House {
  constructor() {
    this.canvas = document.getElementById('view');
    this.hud = new Hud();
    this.input = new Input({
      canvas: this.canvas,
      stickEl: document.getElementById('stick'),
      knobEl: document.getElementById('stick-knob'),
      interactBtn: document.getElementById('touch-interact'),
      crouchBtn: document.getElementById('touch-crouch'),
    });
    this.view = createRenderer(this.canvas, { mobile: this.input.usingTouch });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020403);
    this.scene.fog = new THREE.Fog(0x020403, 4, 22);
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 60);
    this.player = new Player(this.camera);
    this.player.floorAt = floorAt;

    this.phase = 'loading';
    this.spaces = SPACES;
    this.metrics = { radius: PLAYER_RADIUS, standing: PLAYER_HEIGHT, crouched: 1.15 };
    this.floorAt = floorAt;
    this.elapsed = 0;
    this.runTime = 0;
    this.lastFrame = 0;
    this.frameIndex = 0;
    this.manualClock = false;
    this.manualClockOnStart = false;
    this.inputVersion = INPUT_VERSION;
    this.cells = 0; // the trace's snapshot reads it; the house has keys instead (milestone 2)

    document.getElementById('start').addEventListener('click', () => this.#start());
    document.getElementById('resume').addEventListener('click', () => this.#resume());
    document.getElementById('restart').addEventListener('click', () => window.location.reload());
    this.input.onEscape = () => this.phase === 'playing' && this.#pause();
    this.input.onPadStart = () => (this.phase === 'playing' ? this.#pause() : this.phase === 'paused' && this.#resume());
  }

  async boot() {
    this.hud.setLoading(0.3, 'Building the house…');
    await new Promise((r) => requestAnimationFrame(() => r()));
    const house = buildHouse();
    this.scene.add(house.group);
    this.staticColliders = house.colliders;

    // Greybox light: enough to read the shapes, one lamp per room.
    this.scene.add(new THREE.HemisphereLight(0x8a9a88, 0x1a1c18, 0.55));
    for (const s of SPACES) {
      const lamp = new THREE.PointLight(0xd8e6c8, 6, 9, 1.6);
      lamp.position.set((s.x[0] + s.x[1]) / 2, s.y + s.h - 0.3, (s.z[0] + s.z[1]) / 2);
      this.scene.add(lamp);
    }

    this.player.reset(SPAWN.pos, SPAWN.yaw);
    this.hud.setLoading(1, 'Ready');
    this.hud.hide('loading');
    this.hud.show('title');
    if (this.input.usingTouch) this.hud.useTouchLayout();
    this.#resize();
    window.addEventListener('resize', () => this.#resize());
    this.phase = 'title';
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.#frame(t));
  }

  #start() {
    this.hud.hide('title');
    this.phase = 'playing';
    this.runTime = 0;
    this.frameIndex = 0;
    if (this.manualClockOnStart) this.manualClock = true;
    this.hud.setHudVisible(true);
    this.hud.setTouchVisible(this.input.usingTouch);
    this.input.setEnabled(true);
    this.input.requestPointerLock();
    this.hud.fade(0, 1.2);
  }

  #pause() {
    this.phase = 'paused';
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.hud.show('paused');
  }

  #resume() {
    if (this.phase !== 'paused') return;
    this.hud.hide('paused');
    this.phase = 'playing';
    this.input.setEnabled(true);
    this.input.requestPointerLock();
  }

  #resize() {
    const aspect = this.view.resize();
    this.camera.fov = fovFor(BASE_FOV, aspect);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  #frame(now) {
    requestAnimationFrame((t) => this.#frame(t));
    const raw = now - this.lastFrame;
    const dt = Math.min(0.05, raw / 1000);
    this.lastFrame = now;
    if (this.manualClock) return;
    this.#tick(dt);
  }

  stepForTest(dt, { render = true } = {}) {
    this.#tick(dt, render);
  }

  #tick(dt, render = true) {
    this.input.pollPad();
    this.input.applyPad(dt);
    this.frameIndex++;
    this.elapsed += dt;
    if (this.view.sample(dt)) this.#resize();
    if (this.phase === 'playing') {
      this.runTime += dt;
      this.player.update(dt, this.input, this.staticColliders);
      this.input.takeInteract();
      // Milestone 1 has no front door yet: stepping out of it ends the run.
      if (this.player.position.z > 5.3) this.#out();
    }
    if (render) this.view.render(this.scene, this.camera, null);
    else {
      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();
    }
  }

  #out() {
    this.phase = 'ended';
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.hud.setHudVisible(false);
    this.hud.setTouchVisible(false);
    document.getElementById('end-readout').innerHTML = `<dt>Time</dt><dd>${this.runTime.toFixed(0)} s</dd>`;
    this.hud.show('endcard');
  }

  /** Where the player is, for the harnesses. */
  where() {
    const p = this.player.position;
    return { x: p.x, y: p.y, z: p.z, space: spaceAt(p.x, p.z, p.y)?.id ?? null };
  }
}

const game = new House();
window.__derelict = game;
window.__house = game;
game.boot().catch((err) => {
  console.error(err);
  document.getElementById('loading-text').textContent = `Failed to start: ${err.message}`;
});
