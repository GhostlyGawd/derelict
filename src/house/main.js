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
import { loadSurfaces } from './surfaces.js';
import { NIGHT_FILL, dressHouse } from './dress.js';
import { createGrade } from './grade.js';
import { buildHandheld } from './handheld.js';
import { bakedSkins } from './baked.js';
import { ITEMS, LOOP, PLAYER_HEIGHT, PLAYER_RADIUS, RING_SIZE, SPACES, SPAWN, floorAt, isOut, spaceAt } from './layout.js';
import * as LAYOUT from './layout.js';
import { buildThings } from './things.js';

// Wider than the ship's 72: the reference hall is seen through a wide lens,
// with the front door at the right edge of the frame and the window at the left.
const BASE_FOV = 80;
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
    this.scene.fog = new THREE.Fog(0x050a05, 5, 16);
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 60);
    this.player = new Player(this.camera);
    this.player.floorAt = floorAt;
    this.player.touch = 1e-6;

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
    this.hud.setLoading(0.2, 'Opening the door…');
    this.surfaces = await loadSurfaces();
    this.hud.setLoading(0.6, 'Building the house…');
    await new Promise((r) => requestAnimationFrame(() => r()));
    const house = buildHouse(this.surfaces.materials);
    this.scene.add(house.group);
    this.dressing = dressHouse(this.surfaces.materials);
    this.scene.add(this.dressing.group);
    this.scene.add(bakedSkins(this.surfaces));
    for (const light of this.dressing.lights) this.scene.add(light);
    this.things = buildThings(this.surfaces.materials);
    this.scene.add(this.things.group);
    this.staticColliders = house.colliders.concat(this.things.staticColliders, this.dressing.colliders);
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
    // The reader lets every touch and click through to the view, so putting a
    // note away is an input the trace records and replay sees, never a DOM
    // click on the wall clock. A click reaches the canvas as an interact; a tap
    // anywhere off the buttons is queued here and taken on the next frame.
    this.dismissQueued = false;
    window.addEventListener(
      'touchstart',
      (e) => {
        if (this.reading && !e.target?.closest?.('#touch-interact, #touch-crouch')) this.dismissQueued = true;
      },
      { passive: true }
    );
    this.#drawRing();

    // The light: one lamp a room at most, each in something that can be seen
    // (dress.js and rooms.js), and a little night that comes in everywhere.
    this.scene.add(new THREE.HemisphereLight(NIGHT_FILL.sky, NIGHT_FILL.ground, NIGHT_FILL.intensity));
    this.grade = createGrade(this.view, this.surfaces.grade);
    this.handheld = buildHandheld(this.surfaces);

    this.player.reset(SPAWN.pos, SPAWN.yaw);
    this.player.pitch = SPAWN.pitch ?? 0;
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
    this.#resize();
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
    this.handheld?.resize(aspect, this.#thumbRoom());
  }

  /**
   * Where the thumbs' controls are, as fractions of the screen's width, as on
   * the ship: the handheld keeps between the stick and the buttons (9.4.7).
   */
  #thumbRoom() {
    if (!this.input.usingTouch) return {};
    const edge = (ids, side) => {
      let v = side === 'left' ? Infinity : -Infinity;
      for (const id of ids) {
        const b = document.getElementById(id)?.getBoundingClientRect();
        if (b && b.width > 0) v = side === 'left' ? Math.min(v, b.left) : Math.max(v, b.right);
      }
      return Number.isFinite(v) ? v : null;
    };
    const buttons = edge(['touch-interact', 'touch-crouch'], 'left');
    const stick = edge(['stick'], 'right');
    if (buttons === null) return {};
    const w = window.innerWidth;
    return { rightLimit: (buttons - 10) / w, leftLimit: stick === null ? null : (stick + 10) / w };
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
        const tapped = this.dismissQueued;
        this.dismissQueued = false;
        if (this.input.takeInteract() || tapped) this.#closeNote();
      } else {
        this.player.update(dt, this.input, this.colliders());
        this.#updateInteraction();
      }
      if (isOut(this.player.position)) this.#out();
    }
    for (const t of this.things.all) t.update(dt);
    this.refusal = Math.max(0, this.refusal - dt);
    this.handheld.update(dt, this.player.bobPhase, this.player.speed);
    if (render) this.grade.render(this.scene, this.camera, this.reading ? null : this.handheld);
    else {
      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();
    }
  }

  /** Every collider the player meets now: the shell, furniture, and every door as it stands. */
  colliders() {
    return this.staticColliders.concat(this.things.colliders());
  }

  #updateInteraction() {
    const target = this.interactor.update();
    const action = target ? this.#promptFor(target) : null;
    const key = this.input.promptKey;
    this.hud.setPrompt(action && (key ? `[${key}] ${action}` : action));
    if (this.input.takeInteract()) {
      this.handheld.play();
      this.#press(target);
    }
  }

  #promptFor(target) {
    if (target.kind === 'door') {
      if (this.refusal > 0 && this.lastRefused === target) return 'Locked';
      if (this.#latched(target)) return 'Locked';
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
    if (this.#latched(door) || !door.lock.every((k) => this.ring.includes(k))) {
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

  /** A door held shut by something other than a key: the clock, for the door at the head of the stairs. */
  #latched(door) {
    return door.heldBy === 'clock' && !this.things.clock.set;
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
    if (clock.turn()) clock.set = true;
  }

  #openNote(note) {
    note.read = true;
    this.reading = note;
    this.dismissQueued = false;
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
    this.ringEl.querySelector('.items').textContent = names.length ? names.join(' ') : '';
  }

  /** Which steps of the loop are done, for the harnesses: one boolean per LOOP row. */
  progress() {
    return LOOP.map((row) => {
      if (row.container) return this.thingsById.get(row.container).opened;
      if (row.door) return this.thingsById.get(row.door).open;
      if (row.clock) return this.things.clock.set;
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
      clockSet: this.things.clock.set,
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
