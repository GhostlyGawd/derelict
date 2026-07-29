import * as THREE from 'three';

/**
 * The retro rendering treatment.
 *
 * The scene is drawn into a deliberately small backbuffer and stretched to the
 * viewport by the compositor with `image-rendering: pixelated`, which is what
 * gives the picture its chunky, late-90s resolution. Antialiasing is off,
 * texture filtering is point-sampled at the material level, and fog does the
 * rest of the work of hiding the draw distance.
 */

const MIN_SCALE = 0.5;
const MAX_SCALE = 0.66;

export function createRenderer(canvas, { mobile = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    precision: mobile ? 'mediump' : 'highp',
  });

  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x05070a, 1);
  renderer.setPixelRatio(1);

  let scale = mobile ? 0.55 : 0.62;
  let width = 1;
  let height = 1;

  function resize() {
    const cssWidth = Math.max(1, canvas.clientWidth || window.innerWidth);
    const cssHeight = Math.max(1, canvas.clientHeight || window.innerHeight);
    width = Math.max(160, Math.floor(cssWidth * scale));
    height = Math.max(120, Math.floor(cssHeight * scale));
    renderer.setSize(width, height, false);
    return cssWidth / cssHeight;
  }

  // Frame-time watchdog: if the device cannot hold the target, step the
  // internal resolution down (never outside the range the spec allows).
  let samples = 0;
  let accumulated = 0;
  let settled = false;

  function sample(dt) {
    if (settled) return false;
    accumulated += dt;
    samples++;
    if (samples < 90) return false;
    const average = accumulated / samples;
    samples = 0;
    accumulated = 0;
    if (average > 0.0235 && scale > MIN_SCALE) {
      scale = Math.max(MIN_SCALE, scale - 0.06);
      return true;
    }
    settled = true;
    return false;
  }

  return {
    renderer,
    resize,
    get size() {
      return { width, height };
    },
    get scale() {
      return scale;
    },
    setScale(next) {
      scale = THREE.MathUtils.clamp(next, MIN_SCALE, MAX_SCALE);
      settled = true;
      return resize();
    },
    sample,
    render(scene, camera, viewmodel) {
      renderer.clear();
      renderer.render(scene, camera);
      if (viewmodel) {
        renderer.clearDepth();
        renderer.render(viewmodel.scene, viewmodel.camera);
      }
    },
    dispose() {
      renderer.dispose();
    },
  };
}
