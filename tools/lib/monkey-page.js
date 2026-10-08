/**
 * The monkey's brain — phase 8, spec 8.3.3. Runs inside the game page.
 *
 * Injected by tools/monkey.mjs. Defines `window.__monkey`:
 *
 *   drive({ seed, hostileUntil, cap })  plays a run from the start: an autopilot
 *       that heads for the next step of the chain, interrupted by seeded
 *       bursts of hostile input. Every input is a real DOM event, so the
 *       game's own trace recorder writes the run down and it replays exactly.
 *   finish({ cap })    the autopilot alone, from wherever a run was left. This
 *       is the moving-player version of the dead-end proof: every state the
 *       monkey can reach must still be playable out.
 *   check(frame)       the invariants, read off the game after a frame. Returns
 *       a reason when one breaks.
 *
 * Nothing here reads the game's private state to *move*: the autopilot sees
 * positions, door states and what the crosshair is on, the same things a
 * player sees, and acts only through keys, mouse, touches and the buttons.
 */
(() => {
  const g = window.__derelict;
  const touch = g.input.usingTouch;
  /** A synthetic pad (tools/lib/fakepad.js): the run moves, crouches and presses with it. */
  const pad = window.__pad || null;
  const LOOK = touch ? 0.0042 : 0.0022;
  const STEP = 0.1;
  const THRESHOLD = { x: [-2.2, 2.2], z: [-14.8, -11.4] };

  // ------------------------------------------------------------------ rng --
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- input --
  // One layer that speaks the device the page was opened as. The autopilot
  // asks for "forward", "turn by", "crouch", "press"; this turns those into
  // the events a hand would make.
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const canvas = g.canvas;
  const interactBtn = document.getElementById('touch-interact');
  const crouchBtn = document.getElementById('touch-crouch');

  function key(code, down) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  }
  function mouse(dx, dy) {
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
  }
  const live = new Map(); // touch id -> { target, x, y }
  function fire(type, id, x, y, target = canvas) {
    // A touch belongs to the element it started on for its whole life: every
    // move and the end go there, wherever the finger has wandered. That is how
    // the browser does it, and the crouch button's release depends on it.
    if (type !== 'touchstart' && live.has(id)) target = live.get(id).target;
    if (type === 'touchstart' || type === 'touchmove') live.set(id, { target, x, y });
    const changed = [new Touch({ identifier: id, target, clientX: x, clientY: y })];
    if (type === 'touchend' || type === 'touchcancel') live.delete(id);
    const all = [...live.entries()].map(
      ([identifier, t]) => new Touch({ identifier, target: t.target, clientX: t.x, clientY: t.y })
    );
    target.dispatchEvent(new TouchEvent(type, { changedTouches: changed, touches: all, bubbles: true, cancelable: true }));
  }
  function centre(el) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  const hands = {
    forward: false,
    crouch: false,
    stick: null, // touch: { id, x, y }
    look: null, // touch: { id, x, y, ox, oy }
    nextId: 100,
    release: 0,
  };

  function setForward(on) {
    if (on === hands.forward) return;
    hands.forward = on;
    if (pad) {
      pad.axes[1] = on ? -1 : 0;
      return;
    }
    if (!touch) return key('KeyW', on);
    if (on) {
      const x = W() * 0.14;
      const y = H() * 0.86;
      const id = hands.nextId++;
      hands.stick = { id, x, y };
      fire('touchstart', id, x, y);
      fire('touchmove', id, x, y - 60);
    } else if (hands.stick) {
      fire('touchend', hands.stick.id, hands.stick.x, hands.stick.y - 60);
      hands.stick = null;
    }
  }
  function setCrouch(on) {
    if (on === hands.crouch) return;
    hands.crouch = on;
    if (pad) {
      pad.buttons[1] = on ? 1 : 0;
      return;
    }
    if (!touch) return key('KeyC', on);
    const [x, y] = centre(crouchBtn);
    fire(on ? 'touchstart' : 'touchend', 7, x, y, crouchBtn);
  }
  function turn(dyaw, dpitch) {
    // yaw -= dx * sensitivity, pitch -= dy * sensitivity.
    let px = Math.round(-dyaw / LOOK);
    let py = Math.round(-dpitch / LOOK);
    if (!px && !py) return;
    if (!touch) return mouse(px, py);
    const lim = Math.min(W(), H()) * 0.25;
    px = Math.max(-lim, Math.min(lim, px));
    py = Math.max(-lim, Math.min(lim, py));
    if (!hands.look) {
      const ox = W() * 0.62;
      const oy = H() * 0.32;
      const id = hands.nextId++;
      hands.look = { id, x: ox, y: oy, ox, oy };
      fire('touchstart', id, ox, oy);
    }
    const l = hands.look;
    l.x += px;
    l.y += py;
    fire('touchmove', l.id, l.x, l.y);
    // A thumb runs out of glass: lift and put it back down.
    if (Math.abs(l.x - l.ox) > W() * 0.3 || Math.abs(l.y - l.oy) > H() * 0.2) {
      fire('touchend', l.id, l.x, l.y);
      hands.look = null;
    }
  }
  function press() {
    // A pad is polled once a frame, so a press has to stay down for one.
    if (pad) {
      pad.buttons[0] = 1;
      hands.release = 2;
      return;
    }
    if (!touch) {
      key('KeyE', true);
      key('KeyE', false);
      return;
    }
    const [x, y] = centre(interactBtn);
    fire('touchstart', 8, x, y, interactBtn);
    fire('touchend', 8, x, y, interactBtn);
  }
  /** Once a frame: lets go of pad buttons that were only pressed. */
  function handsTick() {
    if (pad && hands.release > 0 && --hands.release === 0) pad.buttons[0] = 0;
  }

  function letGo() {
    setForward(false);
    setCrouch(false);
    if (hands.look) {
      fire('touchend', hands.look.id, hands.look.x, hands.look.y);
      hands.look = null;
    }
  }

  // ----------------------------------------------------------------- grid --
  // The dead-end search's grid (tools/deadend.mjs), rebuilt here from the live
  // colliders: a square is free for a stance when the player's box at that
  // stance, centred there, hits nothing.
  const inside = (x, z) =>
    g.spaces.some((s) => x >= s.x[0] && x <= s.x[1] && z >= s.z[0] && z <= s.z[1]) ||
    (x >= THRESHOLD.x[0] && x <= THRESHOLD.x[1] && z >= THRESHOLD.z[0] && z <= THRESHOLD.z[1]);
  const X0 = -33.6;
  const Z0 = -15.0;
  const COLS = 674;
  const ROWS = 248;
  const xOf = (i) => X0 + i * STEP;
  const zOf = (j) => Z0 + j * STEP;
  const cellOf = (x, z) => {
    const i = Math.round((x - X0) / STEP);
    const j = Math.round((z - Z0) / STEP);
    return i >= 0 && i < COLS && j >= 0 && j < ROWS ? i * ROWS + j : -1;
  };

  function colliders() {
    const list = [...g.staticColliders];
    for (const d of g.doors) list.push(...d.colliders());
    return list;
  }

  let grid = null;
  let gridKey = '';
  function buildGrid() {
    const list = colliders();
    const key = list.map((c) => `${c.minX.toFixed(1)},${c.minZ.toFixed(1)}`).join('|');
    if (grid && key === gridKey) return grid;
    gridKey = key;
    const R = g.metrics.radius + 0.04; // a little margin: the follower cuts corners
    const heights = [g.metrics.standing, g.metrics.crouched];
    const active = list.filter((c) => c.minY < heights[0] && c.maxY > 0.05);
    const buckets = new Array(COLS);
    for (const c of active) {
      const from = Math.max(0, Math.floor((c.minX - R - X0) / STEP) - 1);
      const to = Math.min(COLS - 1, Math.ceil((c.maxX + R - X0) / STEP) + 1);
      for (let i = from; i <= to; i++) (buckets[i] ||= []).push(c);
    }
    const free = [new Uint8Array(COLS * ROWS), new Uint8Array(COLS * ROWS)];
    for (let i = 0; i < COLS; i++) {
      const x = xOf(i);
      for (let j = 0; j < ROWS; j++) {
        const z = zOf(j);
        if (!inside(x, z)) continue;
        for (let s = 0; s < 2; s++) {
          let ok = true;
          for (const c of buckets[i] || []) {
            if (c.minY >= heights[s]) continue;
            if (x + R <= c.minX || x - R >= c.maxX || z + R <= c.minZ || z - R >= c.maxZ) continue;
            ok = false;
            break;
          }
          if (ok) free[s][i * ROWS + j] = 1;
        }
      }
    }
    grid = { free };
    return grid;
  }

  /** Breadth-first over the crouched grid (the superset), 8-connected without cutting corners. */
  function flood(fromX, fromZ) {
    const { free } = buildGrid();
    const walk = free[1];
    const prev = new Int32Array(COLS * ROWS).fill(-2);
    let start = cellOf(fromX, fromZ);
    // Standing somewhere the margin calls blocked (pressed against a wall):
    // start from the nearest square that is free.
    if (start < 0 || !walk[start]) {
      let best = -1;
      let bd = Infinity;
      const ci = Math.round((fromX - X0) / STEP);
      const cj = Math.round((fromZ - Z0) / STEP);
      for (let i = ci - 6; i <= ci + 6; i++) {
        for (let j = cj - 6; j <= cj + 6; j++) {
          if (i < 0 || j < 0 || i >= COLS || j >= ROWS || !walk[i * ROWS + j]) continue;
          const d = (i - ci) ** 2 + (j - cj) ** 2;
          if (d < bd) {
            bd = d;
            best = i * ROWS + j;
          }
        }
      }
      start = best;
    }
    if (start < 0) return null;
    const queue = [start];
    prev[start] = -1;
    for (let h = 0; h < queue.length; h++) {
      const at = queue[h];
      const i = (at / ROWS) | 0;
      const j = at % ROWS;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
        const n = ni * ROWS + nj;
        if (prev[n] !== -2 || !walk[n]) continue;
        if (di && dj && (!walk[ni * ROWS + j] || !walk[i * ROWS + nj])) continue;
        prev[n] = at;
        queue.push(n);
      }
    }
    return { prev, start };
  }

  function pathTo(f, goal) {
    if (goal < 0 || f.prev[goal] === -2) return null;
    const out = [];
    for (let at = goal; at !== -1; at = f.prev[at]) out.push(at);
    return out.reverse();
  }

  /** The nearest reachable square to stand at, between `near` and `far` metres from a point. */
  function spotNear(f, [x, z], near, far, avoid) {
    const { free } = buildGrid();
    const span = Math.ceil(far / STEP) + 1;
    const ci = Math.round((x - X0) / STEP);
    const cj = Math.round((z - Z0) / STEP);
    let best = -1;
    let bestLen = Infinity;
    for (let i = ci - span; i <= ci + span; i++) {
      for (let j = cj - span; j <= cj + span; j++) {
        if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
        const k = i * ROWS + j;
        if (!free[0][k] || f.prev[k] === -2 || avoid.has(k)) continue;
        const d = Math.hypot(xOf(i) - x, zOf(j) - z);
        if (d < near || d > far) continue;
        // Path length by walking the predecessor chain is expensive; distance
        // from the start square is a fair stand-in for "nearest".
        const len = Math.hypot(xOf(i) - xOf((f.start / ROWS) | 0), zOf(j) - zOf(f.start % ROWS)) + d * 0.5;
        if (len < bestLen) {
          bestLen = len;
          best = k;
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------ autopilot --
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const pilot = {
    goalKey: null,
    path: null,
    spot: -1,
    avoid: new Set(),
    pressedAt: -1,
    lastProgress: 0,
    progressFrom: null,
    goalSince: 0,
    jiggle: 0,
    frame: 0,
    replans: 0,
    retryAt: 0,
    noPath: null,
  };

  function resetPilot() {
    pilot.goalKey = null;
    pilot.path = null;
    pilot.spot = -1;
    pilot.avoid.clear();
    pilot.pressedAt = -1;
    pilot.progressFrom = null;
    pilot.goalSince = pilot.frame;
    pilot.jiggle = 0;
    pilot.retryAt = 0;
    pilot.noPath = null;
  }

  /** What to do next, from what a player could see. */
  function decide() {
    const sw = (id) => g.switches.find((s) => s.id === id);
    const cells = g.carryables.cells;
    if (g.carry.held) {
      const free = g.carryables.sockets.find((s) => !s.filled);
      return free ? { key: `seat:${free.id}`, target: free, at: free.point } : null;
    }
    const loose = cells.find((c) => c.status === 'loose');
    if (loose) return { key: `pick:${loose.id}`, target: loose, at: loose.point, underfoot: true };
    if (!sw('switch1').used) return { key: 'switch1', target: sw('switch1'), at: sw('switch1').point };
    const c1 = g.carryables.cell('cell1');
    if (c1.status === 'cradled') return { key: 'take:cell1', target: c1, at: c1.point };
    if (!sw('switch2').used) return { key: 'switch2', target: sw('switch2'), at: sw('switch2').point };
    const c2 = g.carryables.cell('cell2');
    if (c2.status === 'cradled' && c2.cradle.released) return { key: 'take:cell2', target: c2, at: c2.point };
    if (g.cells >= 2) return { key: 'chamber', walk: [0, -9.5] };
    return { key: 'wait' };
  }

  function face(tx, tz, ty = null) {
    const p = g.player.position;
    const want = Math.atan2(-(tx - p.x), -(tz - p.z));
    const dyaw = wrap(want - g.player.yaw);
    let dpitch = -g.player.pitch;
    if (ty !== null) {
      const d = Math.hypot(tx - p.x, tz - p.z);
      dpitch = Math.atan2(ty - g.camera.position.y, Math.max(0.2, d)) - g.player.pitch;
    }
    turn(dyaw, dpitch);
    return Math.abs(dyaw);
  }

  /** Follows the current path one frame. Returns true on arrival. */
  function follow(arrive) {
    const p = g.player.position;
    const path = pilot.path;
    if (!path || !path.length) return true;
    const last = path[path.length - 1];
    const lx = xOf((last / ROWS) | 0);
    const lz = zOf(last % ROWS);
    if (Math.hypot(lx - p.x, lz - p.z) <= arrive) {
      setForward(false);
      return true;
    }
    // Nearest point on the path, then a little way past it.
    let near = 0;
    let nd = Infinity;
    for (let k = 0; k < path.length; k++) {
      const d = Math.hypot(xOf((path[k] / ROWS) | 0) - p.x, zOf(path[k] % ROWS) - p.z);
      if (d < nd) {
        nd = d;
        near = k;
      }
    }
    const ahead = path[Math.min(path.length - 1, near + 4)];
    const err = face(xOf((ahead / ROWS) | 0), zOf(ahead % ROWS));
    // Crouch for the squares the standing box will not fit through, a little
    // before reaching them and until a little after.
    const { free } = buildGrid();
    let low = false;
    for (let k = Math.max(0, near - 4); k < Math.min(path.length, near + 10); k++) {
      if (!free[0][path[k]]) low = true;
    }
    setCrouch(low);
    setForward(err < 0.7);
    return false;
  }

  function plan(goal) {
    const p = g.player.position;
    const f = flood(p.x, p.z);
    if (!f) return false;
    let k;
    if (goal.walk) k = cellOf(goal.walk[0], goal.walk[1]);
    else if (goal.underfoot) k = spotNear(f, [goal.at.x, goal.at.z], 0, 0.5, pilot.avoid);
    else k = spotNear(f, [goal.at.x, goal.at.z], 0.7, 1.3, pilot.avoid);
    pilot.spot = k;
    pilot.path = pathTo(f, k);
    pilot.replans++;
    return Boolean(pilot.path);
  }

  /**
   * One frame of the autopilot. Returns 'done' when the run has ended, a
   * string reason when it cannot go on, or null to keep going.
   */
  function pilotStep() {
    pilot.frame++;
    const phase = g.phase;
    if (phase === 'ended') return 'done';
    if (phase === 'paused') {
      letGo();
      document.getElementById('resume').click();
      return null;
    }
    if (phase === 'leaving' || phase === 'ending') {
      setCrouch(false);
      const outer = g.doorsById.get('airlock-outer');
      face(0, -14.4, g.camera.position.y);
      setForward(Boolean(outer?.open) || g.player.position.z > -10.2);
      return null;
    }
    if (phase !== 'playing') return null;

    const goal = decide();
    if (!goal) return 'no free socket while carrying a cell';
    if (goal.key !== pilot.goalKey) {
      resetPilot();
      pilot.goalKey = goal.key;
    }
    if (goal.key === 'wait') {
      setForward(false);
      return pilot.frame - pilot.goalSince > 1800 ? 'nothing left to do, and the run is not over' : null;
    }
    const p = g.player.position;
    if (pilot.frame - pilot.goalSince > 4800) {
      const at = goal.at ? ` at (${goal.at.x.toFixed(2)}, ${goal.at.y.toFixed(2)}, ${goal.at.z.toFixed(2)})` : '';
      return (
        `could not complete "${goal.key}"${at}${pilot.noPath === goal.key ? ', no path to it' : ''}; ` +
        `player at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}), crosshair on ${g.interactor.current?.id ?? 'nothing'}`
      );
    }

    // A stuck follower re-plans, and wiggles first.
    if (!pilot.progressFrom) pilot.progressFrom = { x: p.x, z: p.z, frame: pilot.frame };
    if (Math.hypot(p.x - pilot.progressFrom.x, p.z - pilot.progressFrom.z) > 0.3) {
      pilot.progressFrom = { x: p.x, z: p.z, frame: pilot.frame };
    } else if (hands.forward && pilot.frame - pilot.progressFrom.frame > 150) {
      pilot.path = null;
      pilot.jiggle = 24;
      pilot.progressFrom = { x: p.x, z: p.z, frame: pilot.frame };
    }
    if (pilot.jiggle > 0) {
      pilot.jiggle--;
      setForward(false);
      if (!touch) {
        key(pilot.jiggle > 12 ? 'KeyS' : 'KeyA', true);
        if (pilot.jiggle === 13 || pilot.jiggle === 0) key(pilot.jiggle === 13 ? 'KeyS' : 'KeyA', false);
      } else {
        turn(0.25, 0);
      }
      return null;
    }

    if (!pilot.path) {
      // No way there yet is usually a door still cycling. Wait, and look again
      // now and then; the goal's own time limit decides when waiting is a bug.
      if (pilot.frame < pilot.retryAt) return null;
      if (!plan(goal)) {
        pilot.avoid.clear();
        if (!plan(goal)) {
          setForward(false);
          setCrouch(false);
          pilot.retryAt = pilot.frame + 30;
          pilot.noPath = goal.key;
          return null;
        }
      }
    }
    const arrived = follow(goal.walk ? 0.8 : 0.22);
    if (goal.walk || !arrived) return null;

    // At the spot: look at it, and press once the crosshair is on it.
    setForward(false);
    setCrouch(false);
    if (g.player.crouching) return null;
    face(goal.at.x, goal.at.z, goal.underfoot ? null : goal.at.y);
    if (g.interactor.current === goal.target && pilot.frame - pilot.pressedAt > 20) {
      press();
      pilot.pressedAt = pilot.frame;
    } else if (pilot.frame - pilot.goalSince > 200 && pilot.pressedAt < 0 && pilot.path) {
      // Standing in the right place and the crosshair never found it: try
      // another square.
      pilot.avoid.add(pilot.spot);
      pilot.path = null;
      pilot.goalSince = pilot.frame - 100;
    }
    return null;
  }

  // ------------------------------------------------------------- invariants
  const ORDER = { title: 0, playing: 1, paused: 1, leaving: 2, ending: 3, ended: 4 };
  const memory = { phase: 'playing', used: new Set(), released: new Set(), seated: 0, powered: 0 };

  function check(frame) {
    const p = g.player.position;
    if (![p.x, p.y, p.z, g.player.yaw, g.player.pitch].every(Number.isFinite)) {
      return 'player position or view is not a number';
    }
    if (Math.abs(p.y) > 1e-6) return `player left the deck (y=${p.y.toFixed(3)})`;
    if (!inside(p.x, p.z)) return `player outside every space at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;

    const h = g.player.height;
    const r = g.metrics.radius;
    for (const c of colliders()) {
      if (c.minY >= h || c.maxY <= 0.05) continue;
      const ox = Math.min(p.x + r, c.maxX) - Math.max(p.x - r, c.minX);
      const oz = Math.min(p.z + r, c.maxZ) - Math.max(p.z - r, c.minZ);
      if (ox > 0.02 && oz > 0.02) {
        return `player inside geometry at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}), ${(Math.min(ox, oz) * 100).toFixed(0)} cm deep`;
      }
    }

    const cells = g.carryables.cells;
    if (cells.length !== 2) return `${cells.length} cells exist`;
    const STATUSES = new Set(['cradled', 'carried', 'loose', 'seated']);
    for (const c of cells) if (!STATUSES.has(c.status)) return `${c.id} is "${c.status}"`;
    const carried = cells.filter((c) => c.status === 'carried');
    if (carried.length !== (g.carry.held ? 1 : 0) || (g.carry.held && g.carry.held !== carried[0])) {
      return `carry slot holds ${g.carry.held?.id ?? 'nothing'} but ${carried.length} cell(s) are carried`;
    }
    const seated = cells.filter((c) => c.status === 'seated').length;
    const filled = g.carryables.sockets.filter((s) => s.filled).length;
    if (seated !== filled || seated !== g.cells) return `${seated} seated, ${filled} sockets filled, panel reads ${g.cells}`;
    for (const c of cells) {
      if (c.status === 'loose' && !inside(c.point.x, c.point.z)) {
        return `${c.id} lies outside the ship at (${c.point.x.toFixed(2)}, ${c.point.z.toFixed(2)})`;
      }
    }

    // Everything only moves forward.
    if (ORDER[g.phase] === undefined) return `unknown phase "${g.phase}"`;
    if (ORDER[g.phase] < ORDER[memory.phase]) return `phase went back from ${memory.phase} to ${g.phase}`;
    memory.phase = g.phase;
    for (const s of g.switches) {
      if (memory.used.has(s.id) && !s.used) return `${s.id} came unflipped`;
      if (s.used) memory.used.add(s.id);
    }
    for (const c of g.carryables.cradles) {
      if (memory.released.has(c.id) && !c.released) return `${c.id} clamped again`;
      if (c.released) memory.released.add(c.id);
    }
    if (g.cells < memory.seated) return `seated cells went from ${memory.seated} to ${g.cells}`;
    memory.seated = g.cells;
    if (g.poweredZones.size < memory.powered) return `powered compartments went from ${memory.powered} to ${g.poweredZones.size}`;
    memory.powered = g.poweredZones.size;
    return null;
  }

  // ---------------------------------------------------------------- hostile
  const KINDS = touch
    ? ['tapstorm', 'thumbs', 'cancel', 'mash', 'crouchflicker', 'spin', 'hitch', 'pause', 'drop']
    : pad
      ? ['padmash', 'unplug', 'mash', 'crouchflicker', 'spin', 'keysoup', 'hitch', 'drop']
      : ['mash', 'crouchflicker', 'spin', 'wander', 'hitch', 'pause', 'drop', 'keysoup'];

  function hostile(kind, rand, t, len) {
    const r = rand();
    switch (kind) {
      case 'mash':
        if (t % (1 + ((r * 3) | 0)) === 0) press();
        if (r < 0.3) setForward(rand() < 0.5);
        break;
      case 'crouchflicker':
        setCrouch(r < 0.5);
        if (rand() < 0.4) setForward(rand() < 0.7);
        break;
      case 'spin':
        turn((rand() - 0.5) * 1.2, (rand() - 0.5) * 0.6);
        break;
      case 'wander':
        for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) if (rand() < 0.08) key(code, rand() < 0.5);
        if (rand() < 0.2) turn((rand() - 0.5) * 0.3, 0);
        break;
      case 'keysoup':
        // Every key a desk can offer, held and released at random, including
        // the ones that move and crouch at once.
        for (const code of ['KeyW', 'KeyS', 'ControlLeft', 'KeyC', 'ArrowLeft', 'ArrowUp', 'Space', 'Enter']) {
          if (rand() < 0.05) key(code, rand() < 0.5);
        }
        break;
      case 'hitch':
        // Handled by the frame clock: long steps. Keep moving through them.
        setForward(true);
        break;
      case 'pause':
        if (t === 0) key('Escape', true);
        if (t === 0) key('Escape', false);
        if (t === len - 1) document.getElementById('resume').click();
        break;
      case 'drop':
        // Set a carried cell down somewhere awkward and walk off.
        if (t === 0 && g.carry.held) {
          turn(0, -1.4 - g.player.pitch);
          press();
        }
        if (t > 2) {
          setForward(true);
          if (rand() < 0.1) turn((rand() - 0.5) * 0.8, 0);
        }
        break;
      case 'padmash':
        // Both sticks anywhere, and A, B and Start in any order, with the
        // keyboard and mouse still live: two hands on two devices.
        for (let i = 0; i < 4; i++) if (rand() < 0.2) pad.axes[i] = Math.round((rand() * 2 - 1) * 1000) / 1000;
        for (const b of [0, 1, 9]) if (rand() < (b === 9 ? 0.02 : 0.15)) pad.buttons[b] = pad.buttons[b] ? 0 : 1;
        if (rand() < 0.05) key('KeyW', rand() < 0.5);
        break;
      case 'unplug':
        // Pulled out mid-stride, B held, and plugged back in.
        if (t === 0) {
          pad.axes[1] = -1;
          pad.buttons[1] = 1;
        }
        if (t === 5) pad.unplugged = true;
        if (t === len - 5) pad.unplugged = false;
        break;
      case 'tapstorm': {
        const id = 200 + ((rand() * 6) | 0);
        const x = rand() * W();
        const y = rand() * H();
        const roll = rand();
        if (live.has(id)) fire(roll < 0.7 ? 'touchmove' : 'touchend', id, x, y);
        else fire('touchstart', id, x, y, roll < 0.1 ? interactBtn : roll < 0.2 ? crouchBtn : canvas);
        break;
      }
      case 'thumbs': {
        // Three and four thumbs at once, dragging.
        for (let id = 300; id < 304; id++) {
          const x = rand() * W();
          const y = rand() * H();
          if (!live.has(id)) {
            if (rand() < 0.3) fire('touchstart', id, x, y);
          } else if (rand() < 0.1) fire('touchend', id, x, y);
          else {
            const t0 = live.get(id);
            fire('touchmove', id, t0.x + (rand() - 0.5) * 40, t0.y + (rand() - 0.5) * 40);
          }
        }
        break;
      }
      case 'cancel':
        // The OS takes the touches away (a notification, a gesture).
        setForward(true);
        if (t === len - 1 || rand() < 0.05) {
          for (const [id, l] of [...live.entries()]) fire('touchcancel', id, l.x, l.y, l.target);
          hands.stick = null;
          hands.look = null;
          hands.forward = false;
          hands.crouch = false;
        }
        break;
    }
  }

  /** The situations worth a burst of their own (8.3.3). */
  const SITUATED = {
    squeeze: touch ? ['crouchflicker', 'thumbs', 'cancel', 'mash'] : pad ? ['crouchflicker', 'padmash', 'unplug'] : ['crouchflicker', 'keysoup', 'mash', 'spin'],
    strike: ['pause', 'mash', 'hitch', 'spin'],
    carrying: touch ? ['drop', 'mash', 'tapstorm'] : ['drop', 'mash', 'keysoup'],
    departure: touch ? ['mash', 'spin', 'thumbs', 'hitch'] : ['mash', 'spin', 'keysoup', 'hitch'],
  };
  function situation() {
    const p = g.player.position;
    if (g.phase === 'leaving') return 'departure';
    if (g.phase !== 'playing') return null;
    if (p.x > 11 && p.x < 16.6 && Math.abs(p.z) < 1.3 && g.player.crouching) return 'squeeze';
    if (g.lighting.striking()) return 'strike';
    if (g.carry.held && p.x > -18 && p.x < -8) return 'carrying';
    return null;
  }

  function endHostile() {
    letGo();
    if (pad) {
      pad.axes.fill(0);
      pad.buttons.fill(0);
      pad.unplugged = false;
      hands.release = 0;
    }
    if (!touch) {
      for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'ControlLeft', 'ArrowLeft', 'ArrowUp', 'Space', 'Enter']) {
        key(code, false);
      }
    }
    for (const [id, l] of [...live.entries()]) fire('touchend', id, l.x, l.y, l.target);
    hands.stick = null;
    hands.look = null;
    hands.forward = false;
    hands.crouch = false;
    resetPilot();
  }

  // ------------------------------------------------------------------- run
  async function waitForEnd() {
    for (let i = 0; i < 80 && g.phase === 'ending'; i++) await new Promise((r) => setTimeout(r, 100));
  }

  async function drive({ seed, hostileUntil = 4200, cap = 24000 }) {
    const rand = rng(seed);
    const log = [];
    let burst = null;
    let nextBurst = 60 + ((rand() * 300) | 0);
    let reason = null;
    let frame = 0;
    const seen = new Set();
    for (; frame < cap; frame++) {
      let dt = (1 / 60) * (0.85 + rand() * 0.3);
      if (burst && frame >= burst.end) {
        endHostile();
        burst = null;
        nextBurst = frame + 120 + ((rand() * 500) | 0);
      }
      if (!burst && frame >= nextBurst && frame < hostileUntil && g.phase === 'playing') {
        const kind = KINDS[(rand() * KINDS.length) | 0];
        const len = 30 + ((rand() * 210) | 0);
        burst = { kind, start: frame, end: frame + len, len };
        log.push([frame, kind, len]);
      }
      // And the moments most likely to break: once each per run, whatever the
      // schedule says. Under the slab, mid-strike, carrying, walking out.
      if (!burst) {
        const at = situation();
        if (at && !seen.has(at)) {
          seen.add(at);
          const kinds = SITUATED[at];
          const kind = kinds[(rand() * kinds.length) | 0];
          const len = 40 + ((rand() * 120) | 0);
          burst = { kind, start: frame, end: frame + len, len };
          log.push([frame, `${kind}@${at}`, len]);
        }
      }
      if (burst) {
        hostile(burst.kind, rand, frame - burst.start, burst.len);
        if (burst.kind === 'hitch') dt = 0.05;
      } else {
        const r = pilotStep();
        if (r === 'done') break;
        if (r) {
          reason = `autopilot: ${r}`;
          break;
        }
      }
      handsTick();
      try {
        g.stepForTest(dt, { render: false });
      } catch (err) {
        reason = `exception: ${err?.message || err}`;
        break;
      }
      reason = window.__monkey.check(frame);
      if (reason) break;
      if (g.phase === 'ending') await waitForEnd();
      if (frame % 500 === 499) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reason && g.phase !== 'ended') reason = `the run did not end inside ${cap} frames (phase ${g.phase})`;
    letGo();
    if (g.trace?.recording) g.trace.end();
    return { reason, frame, log, phase: g.phase, cells: g.cells, replans: pilot.replans };
  }

  /** The autopilot alone, from wherever the game is now. */
  async function finish({ cap = 20000 } = {}) {
    // Taking over a run this brain did not play: lift every finger and key the
    // run might have left down, whichever hand it was.
    if (touch) {
      for (const id of [g.input.stick.id, g.input.lookTouch.id]) if (id !== null) fire('touchend', id, 0, 0);
      const [x, y] = centre(crouchBtn);
      fire('touchend', 7, x, y, crouchBtn);
    }
    endHostile();
    memory.phase = g.phase === 'paused' ? 'playing' : g.phase;
    let reason = null;
    let frame = 0;
    for (; frame < cap; frame++) {
      const r = pilotStep();
      if (r === 'done') break;
      if (r) {
        reason = `autopilot: ${r}`;
        break;
      }
      handsTick();
      try {
        g.stepForTest(1 / 60, { render: false });
      } catch (err) {
        reason = `exception: ${err?.message || err}`;
        break;
      }
      reason = window.__monkey.check(frame);
      if (reason) break;
      if (g.phase === 'ending') await waitForEnd();
      if (frame % 500 === 499) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reason && g.phase !== 'ended') reason = `the autopilot did not finish inside ${cap} frames (phase ${g.phase})`;
    return { reason, frames: frame, phase: g.phase, cells: g.cells };
  }

  window.__monkey = { drive, finish, check };
})();
