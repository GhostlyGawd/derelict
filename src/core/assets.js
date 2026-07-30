import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MANIFEST_URL = 'assets/manifest.json';

/**
 * Loads whatever the build-time pipeline produced into `/public/assets`.
 *
 * The game never hard-fails on a missing asset: anything the manifest does not
 * cover falls back to a procedural placeholder, which is what makes the
 * greybox stage of the build playable before the pipeline has ever run.
 */
export class Assets {
  constructor() {
    this.manifest = null;
    this.textures = new Map();
    this.normals = new Map();
    this.acoustics = new Map();
    this.models = new Map();
    this.audioBuffers = new Map(); // id -> ArrayBuffer, decoded later by AudioBus
    this.missing = new Set();
    this.generated = false;
  }

  async load(onProgress = () => {}) {
    this.manifest = await this.#fetchManifest();
    this.generated = Boolean(this.manifest);

    const jobs = [];
    if (this.manifest) {
      for (const [id, entry] of Object.entries(this.manifest.textures || {})) {
        jobs.push({ kind: 'texture', id, entry });
        // Relief rides in the same manifest entry as a second map. Loaded
        // linear, because a normal map is a vector field and running it through
        // the sRGB transfer would bend every surface on the ship.
        if (entry.normal) {
          jobs.push({ kind: 'normal', id, entry: { file: entry.normal, linear: true } });
        }
      }
      for (const [id, entry] of Object.entries(this.manifest.models || {})) {
        jobs.push({ kind: 'model', id, entry });
      }
      // Impulse responses are WAV rather than MP3 — lossy coding of an impulse
      // smears its transients, which on a reverb is the artefact you would hear.
      for (const [id, entry] of Object.entries(this.manifest.acoustics || {})) {
        jobs.push({ kind: 'acoustic', id, entry });
      }
      for (const [id, entry] of Object.entries(this.manifest.audio || {})) {
        jobs.push({ kind: 'audio', id, entry });
      }
    }

    if (jobs.length === 0) {
      onProgress(1, 'no generated assets — running on placeholders');
      return this;
    }

    let done = 0;
    const step = () => onProgress(++done / jobs.length, `loading ${done}/${jobs.length}`);

    // Textures and audio are cheap; models are the long pole. Run them all at
    // once and let the browser's connection pool sort out the ordering.
    await Promise.all(
      jobs.map(async (job) => {
        try {
          if (job.kind === 'texture') {
            this.textures.set(job.id, await this.#loadTexture(job.entry));
          } else if (job.kind === 'normal') {
            this.normals.set(job.id, await this.#loadTexture(job.entry));
          } else if (job.kind === 'acoustic') {
            this.acoustics.set(job.id, await this.#loadArrayBuffer(job.entry));
          } else if (job.kind === 'model') {
            this.models.set(job.id, await this.#loadModel(job.entry));
          } else {
            this.audioBuffers.set(job.id, await this.#loadArrayBuffer(job.entry));
          }
        } catch (err) {
          this.missing.add(job.id);
          console.warn(`[assets] ${job.kind} "${job.id}" unavailable:`, err.message);
        } finally {
          step();
        }
      })
    );

    return this;
  }

  texture(id) {
    return this.textures.get(id) || null;
  }

  normal(id) {
    return this.normals.get(id) || null;
  }

  /** Returns a fresh clone; callers are free to transform or merge it. */
  model(id) {
    const src = this.models.get(id);
    return src ? src.clone(true) : null;
  }

  audio(id) {
    return this.audioBuffers.get(id) || null;
  }

  acoustic(id) {
    return this.acoustics.get(id) || null;
  }

  async #fetchManifest() {
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  #loadTexture(entry) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        `assets/${entry.file}`,
        (tex) => {
          tex.colorSpace = entry.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          // The whole point of the art direction: hard texel edges.
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestMipmapLinearFilter;
          tex.anisotropy = 1;
          tex.generateMipmaps = true;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        () => reject(new Error(`failed to load ${entry.file}`))
      );
    });
  }

  #loadModel(entry) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        `assets/${entry.file}`,
        (gltf) => resolve(prepareModel(gltf.scene)),
        undefined,
        () => reject(new Error(`failed to load ${entry.file}`))
      );
    });
  }

  async #loadArrayBuffer(entry) {
    const res = await fetch(`assets/${entry.file}`);
    if (!res.ok) throw new Error(`failed to load ${entry.file}`);
    return await res.arrayBuffer();
  }
}

/**
 * Normalises an imported GLB for the retro look: point-sampled textures and
 * cheap Lambert shading so a mid-range phone can afford the light count.
 */
export function prepareModel(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.material = retroMaterial(node.material);
    if (node.geometry && !node.geometry.attributes.normal) node.geometry.computeVertexNormals();
  });
  return root;
}

function retroMaterial(source) {
  const list = Array.isArray(source) ? source : [source];
  const converted = list.map((mat) => {
    if (!mat) return new THREE.MeshLambertMaterial({ color: 0x8a8f86 });
    if (mat.isMeshLambertMaterial) return mat;

    const map = mat.map || null;
    if (map) {
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestMipmapLinearFilter;
      map.anisotropy = 1;
      map.needsUpdate = true;
    }

    const next = new THREE.MeshLambertMaterial({
      color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
      map,
      emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
      emissiveMap: mat.emissiveMap || null,
      emissiveIntensity: mat.emissiveIntensity ?? 1,
      transparent: mat.transparent === true,
      opacity: mat.opacity ?? 1,
      alphaTest: mat.alphaTest ?? 0,
      side: mat.side ?? THREE.FrontSide,
      vertexColors: mat.vertexColors === true,
    });
    next.name = mat.name;
    mat.dispose?.();
    return next;
  });
  return Array.isArray(source) ? converted : converted[0];
}
