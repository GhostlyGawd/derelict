/**
 * The monkey's brain for the house — phase 9, 9.6 "no monkey can break it".
 * Runs inside the house page.
 *
 * The ship's brain (tools/lib/monkey-page.js) carried over in part. Its input
 * layer and its hostile bursts are copied unchanged below: a hand on a phone,
 * a desk or a pad is the same hand in either game. What did not carry is
 * everything that knew it was on a ship: a one-floor grid with two stances,
 * cells, sockets and switches. The house plans over two floors, opens doors
 * on its way, and heads for whichever step of the loop has everything it
 * needs (LOOP in src/house/layout.js). That it had to be rewritten is a
 * finding of the kind 9.2 asks to be recorded.
 *
 * Defines `window.__monkey` with the same three calls as the ship's, so
 * tools/lib/replayer.mjs replays a house run exactly as it replays a ship run:
 *
 *   drive({ seed, hostileUntil, cap })  the autopilot, interrupted by seeded
 *       bursts of hostile input. Every input is a real DOM event, so the
 *       game's own trace recorder writes the run down.
 *   finish({ cap })    the autopilot alone, from wherever a run was left.
 *   check(frame)       the invariants, read off the game after a frame.
 */
(() => {
  const g = window.__house;
  const touch = g.input.usingTouch;
  /** A synthetic pad (tools/lib/fakepad.js): the run moves, crouches and presses with it. */
  const pad = window.__pad || null;
  const LOOK = touch ? 0.0042 : 0.0022;
  const STEP = 0.1;
  const { floorAt, SPACES, LOOP, ITEMS, RING_SIZE, STAIRS, PLAYER_EYE } = g.layout;

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
  // The two-floor proof's graph (tools/house/lib/grid.mjs), rebuilt here from
  // the live colliders. A node is a square and the floor height under it; a
  // move is the move the player code makes.
  const X0 = Math.min(...SPACES.map((s) => s.x[0])) - 0.5;
  const X1 = Math.max(...SPACES.map((s) => s.x[1])) + 0.5;
  const Z0 = Math.min(...SPACES.map((s) => s.z[0])) - 0.5;
  const Z1 = Math.max(...SPACES.map((s) => s.z[1])) + 0.5;
  const COLS = Math.round((X1 - X0) / STEP) + 1;
  const ROWS = Math.round((Z1 - Z0) / STEP) + 1;
  const xOf = (i) => X0 + i * STEP;
  const zOf = (j) => Z0 + j * STEP;
  /**
   * The player's radius, and the radius the pilot plans with. The proofs use
   * the exact one; a path planned at it hugs every wall, and a follower that
   * looks ahead cuts each corner into the wall it hugs. Ten centimetres to
   * spare keeps the pilot off the jambs.
   */
  const R = g.metrics.radius;
  const RP = R + 0.1;
  const Hs = g.metrics.standing;
  const nodeKey = (i, j, y) => `${i},${j},${y.toFixed(3)}`;

  function clear(cs, ax, bx, az, bz, y) {
    for (const c of cs) {
      if (c.minY >= y + Hs || c.maxY <= y + 0.05) continue;
      if (bx <= c.minX || ax >= c.maxX) continue;
      if (bz <= c.minZ || az >= c.maxZ) continue;
      return false;
    }
    return true;
  }

  const insideHouse = (x, z) => SPACES.some((s) => x >= s.x[0] && x <= s.x[1] && z >= s.z[0] && z <= s.z[1]);
  const onStairs = (x, z) => x >= STAIRS.x[0] && x <= STAIRS.x[1] && z >= STAIRS.z[0] && z <= STAIRS.z[1];

  /** The state of everything that moves a collider. */
  const signature = () =>
    g.things.doors.map((d) => (d.open ? 1 : 0)).join('') + (g.things.gate.open ? 'g' : '');

  let cache = { sig: null, flood: null };
  /** Every node reachable from where the player stands, with the way back to it. */
  function flood() {
    const sig = signature();
    if (cache.sig === sig && cache.flood) return cache.flood;
    const cs = g.colliders();
    const p = g.player.position;
    const pi = Math.round((p.x - X0) / STEP);
    const pj = Math.round((p.z - Z0) / STEP);
    // Start from the nearest square the standing box fits on.
    let start = null;
    for (let r = 0; r <= 4 && !start; r++) {
      for (let di = -r; di <= r && !start; di++) {
        for (let dj = -r; dj <= r && !start; dj++) {
          const i = pi + di;
          const j = pj + dj;
          const y = floorAt(xOf(i), zOf(j), p.y);
          if (y === null) continue;
          if (clear(cs, xOf(i) - RP, xOf(i) + RP, zOf(j) - RP, zOf(j) + RP, y)) start = { i, j, y };
        }
      }
    }
    if (!start) return null;
    const nodes = new Map();
    const k0 = nodeKey(start.i, start.j, start.y);
    nodes.set(k0, { ...start, key: k0, prev: null });
    const queue = [nodes.get(k0)];
    for (let q = 0; q < queue.length; q++) {
      const n = queue[q];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = n.i + di;
        const j = n.j + dj;
        if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
        const y = floorAt(xOf(i), zOf(j), n.y);
        if (y === null) continue;
        const k = nodeKey(i, j, y);
        if (nodes.has(k)) continue;
        const ax = Math.min(xOf(n.i), xOf(i)) - RP;
        const bx = Math.max(xOf(n.i), xOf(i)) + RP;
        const az = Math.min(zOf(n.j), zOf(j)) - RP;
        const bz = Math.max(zOf(n.j), zOf(j)) + RP;
        if (!clear(cs, ax, bx, az, bz, n.y) || !clear(cs, ax, bx, az, bz, y)) continue;
        const m = { i, j, y, key: k, prev: n };
        nodes.set(k, m);
        queue.push(m);
      }
    }
    // The way to a node is found from the player's square each time it is
    // asked for, because the player moves; the reachable set does not.
    cache = { sig, flood: nodes };
    return nodes;
  }

  /** A path of nodes from the player to `goal`, by breadth-first search over the cached component. */
  function pathTo(goal) {
    const nodes = flood();
    if (!nodes || !goal) return null;
    const p = g.player.position;
    let from = null;
    let best = Infinity;
    for (const n of nodes.values()) {
      if (Math.abs(n.y - p.y) > 0.5) continue;
      const d = Math.hypot(xOf(n.i) - p.x, zOf(n.j) - p.z);
      if (d < best) {
        best = d;
        from = n;
      }
    }
    if (!from) return null;
    const prev = new Map([[from.key, null]]);
    const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const n = queue[q];
      if (n.key === goal.key) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (const m of neighbours(nodes, n, di, dj)) {
          if (prev.has(m.key)) continue;
          prev.set(m.key, n);
          queue.push(m);
        }
      }
    }
    if (!prev.has(goal.key)) return null;
    const out = [];
    for (let n = goal; n; n = prev.get(n.key)) out.unshift(n);
    return out;
  }

  function neighbours(nodes, n, di, dj) {
    const y = floorAt(xOf(n.i + di), zOf(n.j + dj), n.y);
    if (y === null) return [];
    const m = nodes.get(nodeKey(n.i + di, n.j + dj, y));
    if (!m) return [];
    // Only moves the fill itself made are moves: the component is symmetric
    // (the floor proof checks it), so a node reached at all is reached here.
    const cs = cache.colliders || (cache.colliders = g.colliders());
    const ax = Math.min(xOf(n.i), xOf(m.i)) - RP;
    const bx = Math.max(xOf(n.i), xOf(m.i)) + RP;
    const az = Math.min(zOf(n.j), zOf(m.j)) - RP;
    const bz = Math.max(zOf(n.j), zOf(m.j)) + RP;
    return clear(cs, ax, bx, az, bz, n.y) && clear(cs, ax, bx, az, bz, y) ? [m] : [];
  }

  /** A reachable node to stand on to use something at `at`: near it, on its floor, not one that failed before. */
  function spotNear(at, near, far, avoid) {
    const nodes = flood();
    if (!nodes) return null;
    let best = null;
    let score = Infinity;
    const mid = (near + far) / 2;
    for (const n of nodes.values()) {
      if (avoid.has(n.key)) continue;
      const eye = n.y + PLAYER_EYE;
      if (Math.abs(at.y - eye) > 1.3) continue;
      const d = Math.hypot(xOf(n.i) - at.x, zOf(n.j) - at.z);
      if (d < near || d > far) continue;
      const s = Math.abs(d - mid);
      if (s < score) {
        score = s;
        best = n;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ autopilot --
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const pilot = {
    goalKey: null,
    path: null,
    spot: null,
    avoid: new Set(),
    pressedAt: -1,
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
    pilot.spot = null;
    pilot.avoid.clear();
    pilot.pressedAt = -1;
    pilot.progressFrom = null;
    pilot.goalSince = pilot.frame;
    pilot.jiggle = 0;
    pilot.retryAt = 0;
    pilot.noPath = null;
  }

  const usable = (t) => spotNear(t.point, 0.5, 1.4, new Set());

  /** What to do next, from what a player could see. */
  function decide() {
    if (g.reading) return { key: 'put-away' };
    // A door that needs nothing, on this side of it: open it. That is how a
    // player gets through a house, and it is how every room comes into reach.
    for (const d of g.things.doors) {
      if (d.open || (d.lock.length && !d.lock.every((k) => g.ring.includes(k)))) continue;
      if (d.lock.length) continue; // locked doors are steps of the loop, taken in order below
      if (usable(d)) return { key: `door:${d.id}`, target: d, at: d.point };
    }
    const prog = g.progress();
    const done = new Set(LOOP.filter((_, i) => prog[i]).map((r) => r.id));
    const row = LOOP.find((r, i) => !prog[i] && r.needs.every((n) => done.has(n)));
    if (!row) return { key: 'out', walk: [0, 4.7], y: 0 };
    // A player sets the clock to the hour a note gave them, so the pilot reads
    // it first. It is also how every run comes to have a note open in it.
    if (row.clock) {
      const note = g.thingsById.get('hour');
      if (!note.read) return { key: 'read:hour', target: note, at: note.point };
    }
    const target = g.thingsById.get(row.container ?? row.door ?? 'clock');
    return { key: `step:${row.id}`, target, at: target.point };
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
    if (Math.hypot(xOf(last.i) - p.x, zOf(last.j) - p.z) <= arrive && Math.abs(last.y - p.y) < 0.3) {
      setForward(false);
      return true;
    }
    let near = 0;
    let nd = Infinity;
    for (let k = 0; k < path.length; k++) {
      const n = path[k];
      const d = Math.hypot(xOf(n.i) - p.x, zOf(n.j) - p.z) + Math.abs(n.y - p.y) * 2;
      if (d < nd) {
        nd = d;
        near = k;
      }
    }
    const ahead = path[Math.min(path.length - 1, near + 4)];
    const err = face(xOf(ahead.i), zOf(ahead.j));
    setCrouch(false);
    setForward(err < 0.7);
    return false;
  }

  function plan(goal) {
    let spot;
    if (goal.walk) {
      const nodes = flood();
      if (!nodes) return false;
      let best = Infinity;
      for (const n of nodes.values()) {
        if (Math.abs(n.y - goal.y) > 0.01) continue;
        const d = Math.hypot(xOf(n.i) - goal.walk[0], zOf(n.j) - goal.walk[1]);
        if (d < best) {
          best = d;
          spot = n;
        }
      }
    } else spot = spotNear(goal.at, 0.5, 1.4, pilot.avoid);
    pilot.spot = spot;
    pilot.path = spot ? pathTo(spot) : null;
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
    if (phase !== 'playing') return null;

    const goal = decide();
    if (goal.key !== pilot.goalKey) {
      resetPilot();
      pilot.goalKey = goal.key;
    }
    if (goal.key === 'put-away') {
      setForward(false);
      if (pilot.frame - pilot.pressedAt > 20) {
        press();
        pilot.pressedAt = pilot.frame;
      }
      return null;
    }
    const p = g.player.position;
    if (pilot.frame - pilot.goalSince > 4800) {
      const at = goal.at ? ` at (${goal.at.x.toFixed(2)}, ${goal.at.y.toFixed(2)}, ${goal.at.z.toFixed(2)})` : '';
      return (
        `could not complete "${goal.key}"${at}${pilot.noPath === goal.key ? ', no path to it' : ''}; ` +
        `player at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), crosshair on ${g.interactor.current?.id ?? 'nothing'}`
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

    // At the front door with it open: out, and no turning back for the
    // waypoint just walked past. Without this the pilot stepped through,
    // found the waypoint behind it, turned round, and did it again.
    if (goal.walk && p.z > 4.4 && Math.abs(p.x) < 0.5 && g.doorsById.get('front-door').open) {
      setCrouch(false);
      face(0, 8, g.camera.position.y);
      setForward(true);
      return null;
    }

    if (!pilot.path) {
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
    const arrived = follow(goal.walk ? 0.3 : 0.22);
    if (!arrived) return null;

    if (goal.walk) {
      // Out of the front door: face the night and keep walking.
      face(0, 8, g.camera.position.y);
      setForward(true);
      return null;
    }

    // At the spot: look at it, and press once the crosshair is on it.
    setForward(false);
    setCrouch(false);
    if (g.player.crouching) return null;
    face(goal.at.x, goal.at.z, goal.at.y);
    if (g.interactor.current === goal.target && pilot.frame - pilot.pressedAt > 20) {
      press();
      pilot.pressedAt = pilot.frame;
    } else if (pilot.frame - pilot.goalSince > 200 && pilot.pressedAt < 0 && pilot.path) {
      // Standing in the right place and the crosshair never found it: try
      // another square.
      if (pilot.spot) pilot.avoid.add(pilot.spot.key);
      pilot.path = null;
      pilot.goalSince = pilot.frame - 100;
    }
    return null;
  }

  // ------------------------------------------------------------- invariants
  const ORDER = { title: 0, playing: 1, paused: 1, ended: 2 };
  const memory = { phase: 'playing', progress: null, doors: new Set(), opened: new Set(), gate: false };

  function check(frame) {
    void frame;
    const p = g.player.position;
    if (![p.x, p.y, p.z, g.player.yaw, g.player.pitch].every(Number.isFinite)) {
      return 'player position or view is not a number';
    }
    // On the floor under them, always; off every floor only out of the open front door.
    const f = floorAt(p.x, p.z, p.y);
    if (f === null) {
      if (!(g.doorsById.get('front-door').open && p.z > 4.8)) return `player outside the house at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
    } else if (Math.abs(f - p.y) > 1e-6) {
      return `player not standing on the floor under them (y=${p.y.toFixed(3)}, floor ${f.toFixed(3)})`;
    }
    if (p.y < -1e-6 || p.y > 3 + 1e-6) return `player off both floors (y=${p.y.toFixed(3)})`;

    const h = g.player.height;
    for (const c of g.colliders()) {
      if (c.minY >= p.y + h || c.maxY <= p.y + 0.05) continue;
      const ox = Math.min(p.x + R, c.maxX) - Math.max(p.x - R, c.minX);
      const oz = Math.min(p.z + R, c.maxZ) - Math.max(p.z - R, c.minZ);
      if (ox > 0.02 && oz > 0.02) {
        return `player inside geometry at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), ${(Math.min(ox, oz) * 100).toFixed(0)} cm deep`;
      }
    }

    // The ring holds exactly what has been found and not yet used at its door.
    if (g.ring.length > RING_SIZE) return `the ring holds ${g.ring.length}`;
    if (new Set(g.ring).size !== g.ring.length) return `the ring holds a duplicate: ${g.ring.join(', ')}`;
    const held = new Set();
    for (const c of g.things.containers) {
      if (!c.opened || !c.holds) continue;
      const spent = g.things.doors.some((d) => d.open && d.lock.includes(c.holds));
      if (!spent) held.add(c.holds);
    }
    for (const k of g.ring) if (!ITEMS[k]) return `the ring holds an unknown item "${k}"`;
    if (held.size !== g.ring.length || g.ring.some((k) => !held.has(k))) {
      return `the ring holds ${g.ring.join(', ') || 'nothing'} but ${[...held].join(', ') || 'nothing'} was found and not used`;
    }
    if (g.things.clock.hour < 1 || g.things.clock.hour > 12) return `the clock reads ${g.things.clock.hour}`;

    // Everything only moves forward.
    if (ORDER[g.phase] === undefined) return `unknown phase "${g.phase}"`;
    if (ORDER[g.phase] < ORDER[memory.phase]) return `phase went back from ${memory.phase} to ${g.phase}`;
    memory.phase = g.phase;
    if (g.reading && g.phase === 'ended') return 'a note is open on the end card';
    for (const d of g.things.doors) {
      if (memory.doors.has(d.id) && !d.open) return `${d.id} closed again`;
      if (d.open) memory.doors.add(d.id);
    }
    for (const c of g.things.containers) {
      if (memory.opened.has(c.id) && !c.opened) return `${c.id} shut again`;
      if (c.opened) memory.opened.add(c.id);
    }
    if (memory.gate && !g.things.gate.open) return 'the gate closed again';
    memory.gate = g.things.gate.open;
    const prog = g.progress();
    if (memory.progress && prog.some((d, i) => memory.progress[i] && !d)) return `the loop went backwards: ${JSON.stringify(prog)}`;
    // And never ahead of itself: no step done before what it needs.
    for (let i = 0; i < LOOP.length; i++) {
      if (!prog[i]) continue;
      for (const n of LOOP[i].needs) {
        if (!prog[LOOP.findIndex((r) => r.id === n)]) return `"${LOOP[i].step}" is done before "${n}"`;
      }
    }
    memory.progress = prog;
    return null;
  }

  // ---------------------------------------------------------------- hostile
  // The ship's kinds, less setting a cell down: the house has none to drop.
  const KINDS = touch
    ? ['tapstorm', 'thumbs', 'cancel', 'mash', 'crouchflicker', 'spin', 'hitch', 'pause']
    : pad
      ? ['padmash', 'unplug', 'mash', 'crouchflicker', 'spin', 'keysoup', 'hitch']
      : ['mash', 'crouchflicker', 'spin', 'wander', 'hitch', 'pause', 'keysoup'];

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

  /** The situations worth a burst of their own: on the stairs, reading, in a swinging doorway, walking out. */
  const SITUATED = {
    stairs: touch ? ['thumbs', 'cancel', 'mash', 'spin'] : pad ? ['padmash', 'unplug', 'spin'] : ['keysoup', 'wander', 'spin', 'mash'],
    reading: touch ? ['mash', 'pause', 'tapstorm'] : ['mash', 'pause', 'keysoup'],
    doorway: touch ? ['mash', 'thumbs', 'hitch'] : ['mash', 'wander', 'hitch'],
    departure: touch ? ['mash', 'spin', 'thumbs', 'hitch'] : ['mash', 'spin', 'keysoup', 'hitch'],
  };
  function situation() {
    const p = g.player.position;
    if (g.phase !== 'playing') return null;
    if (g.reading) return 'reading';
    if (g.doorsById.get('front-door').open) return 'departure';
    if (onStairs(p.x, p.z) && p.y > 0.3 && p.y < 2.7) return 'stairs';
    for (const d of g.things.doors) {
      if (d.t > 0 && d.t < 1 && Math.hypot(d.point.x - p.x, d.point.z - p.z) < 1.5) return 'doorway';
    }
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
  async function drive({ seed, hostileUntil = 4200, cap = 30000 }) {
    const rand = rng(seed);
    const log = [];
    let burst = null;
    let nextBurst = 60 + ((rand() * 300) | 0);
    let reason = null;
    let frame = 0;
    const seen = new Set();
    for (; frame < cap; frame++) {
      // Rounded the way the trace writes it down, so the run and its replay
      // step by the same numbers. Unrounded, a replay drifted under a
      // millimetre and crossed the front step one frame later.
      let dt = Math.round((1 / 60) * (0.85 + rand() * 0.3) * 1e6) / 1e6;
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
      if (frame % 500 === 499) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reason && g.phase !== 'ended') reason = `the run did not end inside ${cap} frames (phase ${g.phase})`;
    letGo();
    if (g.trace?.recording) g.trace.end();
    return { reason, frame, log, phase: g.phase, cells: g.cells, replans: pilot.replans };
  }

  /** The autopilot alone, from wherever the game is now. */
  async function finish({ cap = 20000 } = {}) {
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
      if (frame % 500 === 499) await new Promise((r) => setTimeout(r, 0));
    }
    if (!reason && g.phase !== 'ended') reason = `the autopilot did not finish inside ${cap} frames (phase ${g.phase})`;
    return { reason, frames: frame, phase: g.phase, cells: g.cells };
  }

  /** The pilot's own state, for reading a stuck run. */
  const debug = () => ({
    goal: pilot.goalKey,
    path: pilot.path?.length ?? null,
    spot: pilot.spot ? [xOf(pilot.spot.i), pilot.spot.y, zOf(pilot.spot.j)] : null,
    noPath: pilot.noPath,
    jiggle: pilot.jiggle,
    forward: hands.forward,
    reached: flood()?.size ?? null,
  });

  window.__monkey = { drive, finish, check, debug };
})();
