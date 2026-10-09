import '../style.css';
import './house.css';
import * as THREE from 'three';

import { Hud } from '../core/hud.js';
import { INPUT_VERSION, Input } from '../core/input.js';
import { createRenderer } from '../core/renderer.js';
import { TraceRecorder, traceRequested } from '../core/trace.js';
import { Player } from '../game/player.js';
import { Interactor } from '../game/interact.js';
import { fovFor } from '../game/viewmodel.js';

import { buildHouse } from './level.js';
import { ITEMS, LOOP, OUT_Z, PLAYER_HEIGHT, PLAYER_RADIUS, RING_SIZE, SPACES, SPAWN, floorAt, spaceAt } from './layout.js';
import * as LAYOUT from './layout.js';
import { buildThings } from './things.js';

const BASE_FOV = 72;
/** No input at all, for the frames a note is open. */
const STILL = { move: { x: 0, y: 0 }, crouchHeld: false, takeLook: () => ({ dx: 0, dy: 0 }) };

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
    /** The key ring (9.4.2): item ids, in the order they were found. */
    this.ring = [];
    /** The note being read, or null. While one is open the player stands still. */
    this.reading = null;
    this.loop = LOOP;
    /** The layout tables, for the harnesses that run inside the page. */
    this.layout = LAYOUT;
    this.refusal = 0;

    // ?trace records a run here exactly as on the ship (7.3.2).
    this.trace = traceRequested() ? new TraceRecorder(this, { inputVersion: INPUT_VERSION }) : null;
    if (this.trace) this.input.onPadChange = (raw) => this.trace.pad(raw);
    document.getElementById('save-trace')?.addEventListener('click', () => this.trace?.save());
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
    this.things = buildThings();
    this.scene.add(this.things.group);
    this.staticColliders = house.colliders.concat(this.things.staticColliders);
    this.doors = this.things.doors;
    this.doorsById = new Map(this.things.doors.map((d) => [d.id, d]));
    this.thingsById = new Map(this.things.all.map((t) => [t.id, t]));
    // The shell occludes the interact ray: walls, floors and ceilings.
    const shell = [];
    house.group.traverse((o) => o.isMesh && shell.push(o));
    this.interactor = new Interactor(this.camera, { occluders: shell });
    for (const t of this.things.targets) this.interactor.register(t);
    this.ringEl = document.getElementById('ring');
    this.readerEl = document.getElementById('reader');
    this.readerEl.addEventListener('click', () => this.#closeNote());
    this.#drawRing();

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
    this.trace?.begin();
    this.hud.setHudVisible(true);
    this.ringEl.classList.remove('hidden');
    this.ringEl.classList.toggle('touch', this.input.usingTouch);
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
    this.#tick(dt, true, raw);
  }

  stepForTest(dt, { render = true } = {}) {
    this.#tick(dt, render);
  }

  #tick(dt, render = true, raw = dt * 1000) {
    this.input.pollPad();
    this.trace?.tick(dt, raw);
    this.input.applyPad(dt);
    this.frameIndex++;
    this.elapsed += dt;
    if (this.view.sample(dt)) {
      this.#resize();
      this.trace?.scaleChanged(this.view.scale);
    }
    if (this.phase === 'playing') {
      this.runTime += dt;
      if (this.reading) {
        // Reading holds the player still; any interact puts the note away.
        this.input.takeLook();
        this.player.update(dt, STILL, this.colliders());
        this.hud.setPrompt(null);
        if (this.input.takeInteract()) this.#closeNote();
      } else {
        this.player.update(dt, this.input, this.colliders());
        this.#updateInteraction();
      }
      if (this.player.position.z > OUT_Z) this.#out();
    }
    for (const t of this.things.all) t.update(dt);
    this.refusal = Math.max(0, this.refusal - dt);
    if (render) this.view.render(this.scene, this.camera, null);
    else {
      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();
    }
  }

  /** Every collider the player meets now: the shell, furniture, and every door and gate as it stands. */
  colliders() {
    return this.staticColliders.concat(this.things.colliders());
  }

  #updateInteraction() {
    const target = this.interactor.update();
    const action = target ? this.#promptFor(target) : null;
    const key = this.input.promptKey;
    this.hud.setPrompt(action && (key ? `[${key}] ${action}` : action));
    if (this.input.takeInteract()) this.#press(target);
  }

  #promptFor(target) {
    if (target.kind === 'door') {
      if (this.refusal > 0 && this.lastRefused === target) return 'Locked';
      if (!target.lock.length) return 'Open';
      return target.lock.every((k) => this.ring.includes(k)) ? 'Unlock' : 'Locked';
    }
    return target.prompt;
  }

  /** The interact press with the aim taken out, for the chain harness, as on the ship. */
  pressInteractForTest(target = null) {
    if (this.phase === 'playing') this.#press(typeof target === 'string' ? this.thingsById.get(target) : target);
  }

  #press(target) {
    if (!target) return;
    if (target.kind === 'door') this.#tryDoor(target);
    else if (target.kind === 'container') this.#openContainer(target);
    else if (target.kind === 'clock') this.#turnClock(target);
    else if (target.kind === 'note') this.#openNote(target);
  }

  #tryDoor(door) {
    if (door.open) return false;
    if (!door.lock.every((k) => this.ring.includes(k))) {
      this.refusal = 1.2;
      this.lastRefused = door;
      return false;
    }
    // The key is used at its door, and is then spent (9.4.2).
    this.ring = this.ring.filter((k) => !door.lock.includes(k));
    door.open = true;
    this.#drawRing();
    return true;
  }

  #openContainer(c) {
    if (c.opened) return false;
    if (this.ring.length >= RING_SIZE) throw new Error(`the key ring is full: ${this.ring.join(', ')}`);
    c.opened = true;
    if (c.holds) this.ring.push(c.holds);
    this.#drawRing();
    return true;
  }

  #turnClock(clock) {
    if (clock.turn() && !this.things.gate.open) this.things.gate.open = true;
  }

  #openNote(note) {
    note.read = true;
    this.reading = note;
    this.readerEl.querySelector('h2').textContent = note.title;
    this.readerEl.querySelector('p').textContent = note.text;
    this.readerEl.classList.remove('hidden');
  }

  #closeNote() {
    if (!this.reading) return;
    this.reading = null;
    this.readerEl.classList.add('hidden');
  }

  #drawRing() {
    const names = this.ring.map((k) => ITEMS[k].name);
    this.ringEl.querySelector('.count').textContent = `${this.ring.length}/${RING_SIZE}`;
    this.ringEl.querySelector('.items').textContent = names.length ? names.join(' · ') : '—';
  }

  /** Which steps of the loop are done, for the harnesses: one boolean per LOOP row. */
  progress() {
    return LOOP.map((row) => {
      if (row.container) return this.thingsById.get(row.container).opened;
      if (row.door) return this.thingsById.get(row.door).open;
      if (row.clock) return this.things.gate.open;
      return false;
    });
  }

  #out() {
    this.phase = 'ended';
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.hud.setHudVisible(false);
    this.hud.setTouchVisible(false);
    this.ringEl.classList.add('hidden');
    this.#closeNote();
    this.trace?.end();
    document.getElementById('save-trace')?.classList.toggle('hidden', !this.trace);
    document.getElementById('end-readout').innerHTML = `<dt>Time</dt><dd>${this.runTime.toFixed(0)} s</dd>`;
    this.hud.show('endcard');
  }

  /** Where the player is, for the harnesses. */
  where() {
    const p = this.player.position;
    return { x: p.x, y: p.y, z: p.z, space: spaceAt(p.x, p.z, p.y)?.id ?? null };
  }

  /**
   * How far through the loop the run is. The trace's checkpoints read a
   * game's `cells`; on the ship that is the cells seated, and here it is the
   * steps of the loop done, so a replay that diverges shows it the same way.
   */
  get cells() {
    return this.progress().filter(Boolean).length;
  }

  /** A snapshot of the loop's state, for the harnesses. */
  state() {
    return {
      phase: this.phase,
      ring: [...this.ring],
      progress: this.progress(),
      clock: this.things.clock.hour,
      gate: this.things.gate.open,
      doors: Object.fromEntries(this.things.doors.map((d) => [d.id, d.open])),
      opened: Object.fromEntries(this.things.containers.map((c) => [c.id, c.opened])),
      read: this.things.notes.filter((n) => n.read).map((n) => n.id),
      reading: this.reading?.id ?? null,
    };
  }
}

const game = new House();
window.__derelict = game;
window.__house = game;
game.boot().catch((err) => {
  console.error(err);
  document.getElementById('loading-text').textContent = `Failed to start: ${err.message}`;
});
