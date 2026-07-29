import * as THREE from 'three';
import { LABELS, LABEL_CAP, SPACES } from './layout.js';

/**
 * Phase 3 — markings composed in engine from the generated glyph atlas.
 *
 * One asset serves every sign on the ship: each marking is a strip of quads,
 * one per glyph, UV'd into the atlas. Rewording a label costs nothing and adds
 * nothing to the manifest, which is why this beat a baked decal per sign.
 *
 * The atlas is a coverage mask, so it drives `alphaMap` rather than `map`. The
 * paint colour comes from the material and the light comes from the room, which
 * is what keeps a label sitting *on* a bulkhead instead of glowing off it.
 */

/** Tracking between glyphs, as a fraction of cap height. Matches the specimen. */
const TRACKING = 0.17;
/** Sprayed stencil white, dirtied down so it never reads as UI. */
const PAINT = 0xb9c2b4;

/**
 * Lays a string out into a geometry, with the baseline at y = 0 and the pen
 * starting at x = 0. Returns null if the atlas has no metrics — the game stays
 * playable with no assets at all, so signage simply does not appear.
 */
export function labelGeometry(text, metrics, cap) {
  if (!metrics) return null;
  const { chars, cell, grid, cap: capPx } = metrics;
  const [cellW, cellH] = cell;
  const [cols] = grid;
  const atlas = cellW * cols;
  // World units per atlas pixel.
  const k = cap / capPx;

  const positions = [];
  const uvs = [];
  const indices = [];
  let pen = 0;

  for (const ch of text.toUpperCase()) {
    const g = chars[ch];
    if (!g) {
      pen += cap * 0.42;
      continue;
    }
    if (ch !== ' ') {
      const pxW = Math.ceil(g.advance) + g.pad * 2;
      const pxH = capPx + g.pad * 2;
      const col = g.cell % cols;
      const row = (g.cell / cols) | 0;
      const px = col * cellW;
      const py = row * cellH;

      // The mask carries `pad` of margin on every side, so ink lines up with
      // the pen once that margin is taken back off.
      const x0 = pen - g.pad * k;
      const y0 = -g.pad * k;
      const x1 = x0 + pxW * k;
      const y1 = y0 + pxH * k;

      // v is flipped: atlas row 0 is the top of the image, uv 0 is the bottom.
      const u0 = px / atlas;
      const u1 = (px + pxW) / atlas;
      const v1 = 1 - py / atlas;
      const v0 = 1 - (py + pxH) / atlas;

      const base = positions.length / 3;
      positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    pen += g.advance * k + cap * TRACKING;
  }

  if (!positions.length) return null;

  // Centre horizontally on the placement point; a label is positioned by where
  // it sits on the wall, not by where its first letter happens to land.
  const width = pen - cap * TRACKING;
  for (let i = 0; i < positions.length; i += 3) positions[i] -= width / 2;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.width = width;
  return geometry;
}

/**
 * Builds every compartment label. Returns the group plus the placements, so the
 * cap-height harness can ask where each one is without re-deriving it.
 */
export function buildSignage(assets) {
  const group = new THREE.Group();
  group.name = 'signage';

  const atlas = assets.texture('glyph_atlas');
  const metrics = assets.manifest?.textures?.glyph_atlas?.glyphs || null;
  const placed = [];

  if (!atlas || !metrics) return { group, labels: placed, metrics: null };

  // One material for every marking on the ship: same sheet, same paint. Lit, so
  // a label in an unpowered room is as dim as the wall it is painted on.
  const material = new THREE.MeshLambertMaterial({
    color: PAINT,
    alphaMap: atlas,
    transparent: true,
    alphaTest: 0.42,
    fog: true,
    side: THREE.FrontSide,
  });

  for (const def of LABELS) {
    const space = SPACES.find((s) => s.id === def.space);
    if (!space) continue;
    const text = space.name.toUpperCase();
    const geometry = labelGeometry(text, metrics, def.cap ?? LABEL_CAP);
    if (!geometry) continue;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...def.pos);
    mesh.rotation.y = Math.atan2(def.facing[0], def.facing[2]);
    group.add(mesh);
    placed.push({
      space: def.space,
      text,
      cap: def.cap ?? LABEL_CAP,
      width: geometry.userData.width,
      pos: [...def.pos],
      facing: [...def.facing],
    });
  }

  return { group, labels: placed, metrics };
}
