import * as THREE from 'three';

/**
 * The green grade (phase 9, 9.4.4), as the last step of the retro treatment.
 *
 * The frame is drawn at the backbuffer's size into a half-float target, so
 * the darks keep their steps, then drawn to the canvas once through the
 * pipeline's lookup table: every colour mapped onto the damp green ramp with
 * some of itself kept, so the rug stays ochre and the night stays blue. An
 * ordered dither then quantises it to fifteen-bit colour, which is where the
 * reference's slightly painted banding comes from.
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D src;
  uniform sampler2D lut;
  uniform float strength;
  uniform float paint;
  uniform vec2 texel;
  varying vec2 vUv;

  // A Kuwahara filter: of the four squares round a pixel, take the mean of
  // the one that varies least. Edges stay sharp and the inside of every patch
  // flattens into a stroke of one colour, which is how a painting reads.
  vec3 painted(vec2 uv) {
    vec3 m[4];
    float v[4];
    for (int q = 0; q < 4; q++) {
      vec2 dir = vec2(q == 1 || q == 3 ? 1.0 : -1.0, q >= 2 ? 1.0 : -1.0);
      vec3 sum = vec3(0.0);
      vec3 sq = vec3(0.0);
      for (int j = 0; j <= 2; j++) {
        for (int i = 0; i <= 2; i++) {
          vec3 c = texture2D(src, uv + dir * vec2(float(i), float(j)) * texel).rgb;
          sum += c;
          sq += c * c;
        }
      }
      m[q] = sum / 9.0;
      vec3 var3 = sq / 9.0 - m[q] * m[q];
      v[q] = var3.r + var3.g + var3.b;
    }
    vec3 best = m[0];
    float low = v[0];
    for (int q = 1; q < 4; q++) {
      if (v[q] < low) {
        low = v[q];
        best = m[q];
      }
    }
    return best;
  }

  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  // 16 x 16 x 16, sixteen tiles of 16 x 16 side by side, blue picking the tile.
  vec3 grade(vec3 c) {
    float b = c.b * 15.0;
    float b0 = floor(b);
    float b1 = min(b0 + 1.0, 15.0);
    float v = 1.0 - (c.g * 15.0 + 0.5) / 16.0;
    vec3 a = texture2D(lut, vec2((b0 * 16.0 + c.r * 15.0 + 0.5) / 256.0, v)).rgb;
    vec3 d = texture2D(lut, vec2((b1 * 16.0 + c.r * 15.0 + 0.5) / 256.0, v)).rgb;
    return mix(a, d, b - b0);
  }

  float bayer(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    // The 4 x 4 Bayer matrix, row by row.
    if (i < 0.5) return 0.0; if (i < 1.5) return 8.0; if (i < 2.5) return 2.0; if (i < 3.5) return 10.0;
    if (i < 4.5) return 12.0; if (i < 5.5) return 4.0; if (i < 6.5) return 14.0; if (i < 7.5) return 6.0;
    if (i < 8.5) return 3.0; if (i < 9.5) return 11.0; if (i < 10.5) return 1.0; if (i < 11.5) return 9.0;
    if (i < 12.5) return 15.0; if (i < 13.5) return 7.0; if (i < 14.5) return 13.0; return 5.0;
  }

  void main() {
    vec4 frame = texture2D(src, vUv);
    vec3 c = toSrgb(paint > 0.5 ? painted(vUv) : frame.rgb);
    // Where the owner's painting is shown (projection.js) it already carries
    // its own vignette and grade: alpha says how much of the pixel is
    // painting, and that much passes through untouched.
    vec3 raw = c;
    // The reference's frame darkens toward its corners, as an old lens and an
    // old monitor both did. Applied before the grade, so the corners fall
    // down the same green ramp as everything else that is dark.
    vec2 d = (vUv - 0.5) * vec2(1.0, 0.85);
    c *= 1.0 - smoothstep(0.32, 0.8, length(d)) * 0.45;
    c = mix(c, grade(c), strength);
    c = mix(raw, c, clamp(frame.a, 0.0, 1.0));
    // Fifteen-bit colour, dithered.
    float levels = 31.0;
    c = floor(c * levels + bayer(gl_FragCoord.xy) / 16.0) / levels;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function createGrade(view, lut) {
  const { renderer } = view;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: { src: { value: target.texture }, lut: { value: lut }, strength: { value: 1 }, paint: { value: 0 }, texel: { value: new THREE.Vector2(1, 1) } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const camera = new THREE.Camera();

  return {
    material,
    target,
    /** Draws a frame through the grade, in place of view.render. */
    render(scene, cam, viewmodel) {
      const { width, height } = view.size;
      if (target.width !== width || target.height !== height) {
        target.setSize(width, height);
        material.uniforms.texel.value.set(1 / width, 1 / height);
      }
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, cam);
      if (viewmodel) {
        renderer.clearDepth();
        renderer.render(viewmodel.scene, viewmodel.camera);
      }
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(post, camera);
    },
  };
}
