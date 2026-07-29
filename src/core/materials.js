import * as THREE from 'three';

/**
 * Surface material library.
 *
 * Every surface asks for a generated texture first and drops to a procedural
 * greybox placeholder when the pipeline has not produced one. Materials are
 * Lambert throughout — cheap enough to afford ten point lights on a phone, and
 * a good match for the flat, pooled lighting of the reference era.
 */

// Mid-grey on purpose: the art direction is dark, but that darkness comes from
// the lighting, not from albedo. Near-black textures leave nothing to light.
const PLACEHOLDER_TINTS = {
  wall_panel_a: '#8d928a',
  wall_panel_b: '#83887f',
  floor_plate: '#7e837b',
  ceiling_plate: '#70756d',
  greeble_panel: '#8a8f86',
  door_trim: '#9aa093',
  conduit_strip: '#7bff9a',
};

function placeholderTexture(id) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = PLACEHOLDER_TINTS[id] || '#55595333';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  if (id === 'conduit_strip') {
    ctx.fillStyle = '#0a1410';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = base;
    ctx.fillRect(0, size * 0.34, size, size * 0.32);
  } else {
    // Panel seams plus a little value noise so the greybox reads as surfaces
    // rather than as flat fill.
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.anisotropy = 1;
  return tex;
}

export class MaterialLibrary {
  constructor(assets) {
    this.assets = assets;
    this.cache = new Map();
    this.placeholders = new Map();
  }

  textureFor(id) {
    const generated = this.assets.texture(id);
    if (generated) return generated;
    if (!this.placeholders.has(id)) this.placeholders.set(id, placeholderTexture(id));
    return this.placeholders.get(id);
  }

  /** Opaque, lit surface. */
  surface(id, { color = 0xffffff } = {}) {
    const key = `surf:${id}:${color}`;
    if (!this.cache.has(key)) {
      this.cache.set(
        key,
        new THREE.MeshLambertMaterial({ map: this.textureFor(id), color, fog: true })
      );
    }
    return this.cache.get(key);
  }

  /**
   * Unlit emissive strip. Colour is driven at runtime by the power state, so
   * each zone gets its own instance.
   */
  conduit(color = 0xff3a22) {
    return new THREE.MeshBasicMaterial({
      map: this.textureFor('conduit_strip'),
      color,
      fog: true,
      toneMapped: false,
    });
  }

  /** Additive cone used for visible light shafts in powered rooms. */
  shaft(color = 0xd8ffe4) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
  }
}

/**
 * Rewrites a box's UVs so the texture tiles at a fixed world scale instead of
 * stretching once across each face.
 */
export function applyWorldUVs(geometry, w, h, d, tile = 2) {
  const uv = geometry.attributes.uv;
  // BoxGeometry emits faces in the order +x, -x, +y, -y, +z, -z, four vertices
  // each, with UVs already normalised 0..1 across the face.
  const spans = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * (su / tile), uv.getY(idx) * (sv / tile));
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

export function applyPlaneUVs(geometry, w, d, tile = 2) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
  }
  uv.needsUpdate = true;
  return geometry;
}
