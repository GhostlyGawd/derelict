/**
 * A minimal parametric mesh builder.
 *
 * Emits flat-shaded, hard-edged geometry with box-projected UVs — the mapping
 * a level designer would have got out of a 1998 editor, and exactly right for
 * props that are meant to look like they were built out of blocks.
 *
 * UVs are projected from world space, so every part of a prop lines up with
 * every other part and a single tileable texture covers the whole thing.
 */

export class MeshBuilder {
  constructor({ uvScale = 1 } = {}) {
    this.uvScale = uvScale;
    this.position = [];
    this.normal = [];
    this.uv = [];
    this.color = [];
    this.index = [];
  }

  get triangleCount() {
    return this.index.length / 3;
  }

  get vertexCount() {
    return this.position.length / 3;
  }

  /** Quad in CCW winding; UVs are projected onto the dominant face axis. */
  quad(p0, p1, p2, p3, colour, uvScale = this.uvScale) {
    const n = normal(p0, p1, p3);
    const base = this.vertexCount;
    for (const p of [p0, p1, p2, p3]) {
      this.position.push(p[0], p[1], p[2]);
      this.normal.push(n[0], n[1], n[2]);
      const [u, v] = project(p, n, uvScale);
      this.uv.push(u, v);
      this.color.push(colour[0], colour[1], colour[2]);
    }
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  triangle(p0, p1, p2, colour, uvScale = this.uvScale) {
    const n = normal(p0, p1, p2);
    const base = this.vertexCount;
    for (const p of [p0, p1, p2]) {
      this.position.push(p[0], p[1], p[2]);
      this.normal.push(n[0], n[1], n[2]);
      const [u, v] = project(p, n, uvScale);
      this.uv.push(u, v);
      this.color.push(colour[0], colour[1], colour[2]);
    }
    this.index.push(base, base + 1, base + 2);
    return this;
  }

  /**
   * Axis-aligned-then-rotated box. `size` is full extent, `pos` is the centre,
   * `rot` is XYZ Euler in radians. `taper` shrinks the +Y face for wedges.
   */
  box({ size, pos = [0, 0, 0], rot = [0, 0, 0], colour = [1, 1, 1], taper = 1, uvScale }) {
    const [w, h, d] = size;
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const tx = hx * taper;
    const tz = hz * taper;
    const m = matrix(pos, rot);

    const v = [
      [-hx, -hy, hz],
      [hx, -hy, hz],
      [tx, hy, tz],
      [-tx, hy, tz],
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [tx, hy, -tz],
      [-tx, hy, -tz],
    ].map((p) => apply(m, p));

    this.quad(v[0], v[1], v[2], v[3], colour, uvScale); // +Z
    this.quad(v[5], v[4], v[7], v[6], colour, uvScale); // -Z
    this.quad(v[1], v[5], v[6], v[2], colour, uvScale); // +X
    this.quad(v[4], v[0], v[3], v[7], colour, uvScale); // -X
    this.quad(v[3], v[2], v[6], v[7], colour, uvScale); // +Y
    this.quad(v[4], v[5], v[1], v[0], colour, uvScale); // -Y
    return this;
  }

  /** Y-axis cylinder/cone, optionally capped. */
  cylinder({
    radiusTop,
    radiusBottom,
    height,
    segments = 10,
    pos = [0, 0, 0],
    rot = [0, 0, 0],
    colour = [1, 1, 1],
    capTop = true,
    capBottom = true,
    uvScale,
  }) {
    const m = matrix(pos, rot);
    const hy = height / 2;
    const ring = (radius, y) =>
      Array.from({ length: segments }, (_, i) => {
        const a = (i / segments) * Math.PI * 2;
        return apply(m, [Math.cos(a) * radius, y, Math.sin(a) * radius]);
      });

    const top = ring(radiusTop, hy);
    const bottom = ring(radiusBottom, -hy);

    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      this.quad(bottom[i], bottom[j], top[j], top[i], colour, uvScale);
    }
    if (capTop && radiusTop > 1e-5) {
      const centre = apply(m, [0, hy, 0]);
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        this.triangle(centre, top[i], top[j], colour, uvScale);
      }
    }
    if (capBottom && radiusBottom > 1e-5) {
      const centre = apply(m, [0, -hy, 0]);
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        this.triangle(centre, bottom[j], bottom[i], colour, uvScale);
      }
    }
    return this;
  }

  /** Ring of boxes around a Y axis — bolt circles, bracket collars. */
  boltRing({ count, radius, y, size, pos = [0, 0, 0], colour }) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.box({
        size,
        pos: [pos[0] + Math.cos(a) * radius, pos[1] + y, pos[2] + Math.sin(a) * radius],
        rot: [0, -a, 0],
        colour,
      });
    }
    return this;
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.position.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], this.position[i + a]);
        max[a] = Math.max(max[a], this.position[i + a]);
      }
    }
    return { min, max };
  }

  build() {
    return {
      position: new Float32Array(this.position),
      normal: new Float32Array(this.normal),
      uv: new Float32Array(this.uv),
      color: new Float32Array(this.color),
      index: new Uint32Array(this.index),
      triangles: this.triangleCount,
    };
  }
}

/* ---------------------------------------------------------------- helpers */

function matrix(pos, rot) {
  const [rx, ry, rz] = rot;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // R = Rz * Ry * Rx
  return {
    r: [
      [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
      [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
      [-sy, cy * sx, cy * cx],
    ],
    t: pos,
  };
}

function apply(m, p) {
  const [x, y, z] = p;
  return [
    m.r[0][0] * x + m.r[0][1] * y + m.r[0][2] * z + m.t[0],
    m.r[1][0] * x + m.r[1][1] * y + m.r[1][2] * z + m.t[1],
    m.r[2][0] * x + m.r[2][1] * y + m.r[2][2] * z + m.t[2],
  ];
}

function normal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

function project(p, n, scale) {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0] / scale, p[2] / scale];
  if (ax >= az) return [p[2] / scale, -p[1] / scale];
  return [p[0] / scale, -p[1] / scale];
}
