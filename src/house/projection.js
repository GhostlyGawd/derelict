import * as THREE from 'three';

import { PAINTING } from './layout.js';
import { FACING, paintingCamera } from './painter.js';

export { FACING, paintingCamera };

/**
 * How squarely the projector must see a surface to paint it, at run time.
 * Looser than FACING, which decides what the pipeline keeps of the painting
 * on the hall's walls: a smear of the painting's own colour on a surface seen
 * edge-on reads better than a generated one in its middle.
 */
const SEEN = [0.0, 0.05];

/**
 * The owner's painting, projected onto the hall (9.3, the owner's painting as
 * a source).
 *
 * The painting was painted from one place, and the hall is laid out to it, so
 * a projector standing where the painter stood throws each of its pixels onto
 * the surface that pixel shows. Every material in the house learns to take
 * the painting's colour in place of its own wherever its surface is seen from
 * that place: inside the painting's frame, nearest to the projector (a depth
 * map drawn from there decides), and not seen too edge-on, where a pixel would
 * smear across the surface. From where the player starts, the hall is the
 * painting; walking round it, everything keeps the paint it was given.
 *
 * The painting already carries its own light, grade and vignette. Where it is
 * shown, the fragment says so in its alpha, and the frame's grade (grade.js)
 * lets it through untouched rather than grading it twice.
 *
 * A door is projected as it stands closed: its paint goes with it when it
 * swings, rather than sliding across it.
 */
export function createProjection(renderer, scene, texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  const [W, H] = PAINTING.size;
  const camera = paintingCamera();
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  // The depth map: what the painter could see, drawn once with the doors shut.
  const depth = new THREE.WebGLRenderTarget(W, H, {
    depthTexture: new THREE.DepthTexture(W, H, THREE.FloatType),
    depthBuffer: true,
  });
  depth.depthTexture.minFilter = THREE.NearestFilter;
  depth.depthTexture.magFilter = THREE.NearestFilter;

  const uniforms = {
    pPaint: { value: texture },
    pDepth: { value: depth.depthTexture },
    pMatrix: { value: matrix },
    pEye: { value: camera.position.clone() },
  };

  const patched = new WeakSet();
  /** Teaches one material to take the painting; `closed` pins a moving part's projection to its shut pose. */
  function patch(material, closed = null) {
    if (patched.has(material)) return material;
    patched.add(material);
    // A surface whose own texture is already the painting (a hall chart,
    // unwrapped from it) is painting everywhere, seen by the painter or not.
    const raw = material.userData.painted ? 1 : 0;
    // A thing aimed at is lit by tinting its material (things.js): the paint
    // takes the same tint, as the colour now over the colour it had here.
    const base = material.color ? material.color.clone() : new THREE.Color(1, 1, 1);
    const own = {
      pModel: { value: closed ?? new THREE.Matrix4() },
      pOwn: { value: closed ? 1 : 0 },
      pRaw: { value: raw },
      pBase: { value: new THREE.Vector3(Math.max(base.r, 1e-3), Math.max(base.g, 1e-3), Math.max(base.b, 1e-3)) },
    };
    const before = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      before?.call(material, shader, r);
      Object.assign(shader.uniforms, uniforms, own);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform mat4 pMatrix;
          uniform mat4 pModel;
          uniform float pOwn;
          varying vec4 vPaintClip;
          varying vec3 vPaintPos;
          varying vec3 vPaintNormal;`
        )
        .replace(
          '#include <fog_vertex>',
          `#include <fog_vertex>
          {
            mat4 m = pOwn > 0.5 ? pModel : modelMatrix;
            vec4 wp = m * vec4(transformed, 1.0);
            vPaintPos = wp.xyz;
            vPaintClip = pMatrix * wp;
            vPaintNormal = normalize(mat3(m) * normal);
          }`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D pPaint;
          uniform sampler2D pDepth;
          uniform vec3 pEye;
          uniform float pRaw;
          uniform vec3 pBase;
          varying vec4 vPaintClip;
          varying vec3 vPaintPos;
          varying vec3 vPaintNormal;`
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          {
            vec3 ndc = vPaintClip.xyz / vPaintClip.w;
            vec2 puv = ndc.xy * 0.5 + 0.5;
            float w = 0.0;
            if (vPaintClip.w > 0.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
              float z = ndc.z * 0.5 + 0.5;
              // The farthest the painter saw in the pixels round this one: a
              // thin edge (a tread's nosing, a jamb) lands between depth
              // samples, and is painted rather than left out.
              vec2 px = 1.0 / vec2(textureSize(pDepth, 0));
              float seen = max(
                max(texture2D(pDepth, puv).r, texture2D(pDepth, puv + vec2(px.x, 0.0)).r),
                max(texture2D(pDepth, puv - vec2(px.x, 0.0)).r, max(texture2D(pDepth, puv + vec2(0.0, px.y)).r, texture2D(pDepth, puv - vec2(0.0, px.y)).r))
              );
              // Nearest to the painter, with room for the depth map's own steps.
              float near = step(z, seen + 0.0004 + fwidth(z) * 1.5);
              vec3 n = normalize(vPaintNormal);
              vec3 toEye = normalize(pEye - vPaintPos);
              float facing = abs(dot(n, toEye));
              w = near * smoothstep(${SEEN[0].toFixed(3)}, ${SEEN[1].toFixed(3)}, facing);
            }
            if (w > 0.0) {
              vec3 paint = texture2D(pPaint, vec2(puv.x, puv.y)).rgb * (diffuse / pBase);
              gl_FragColor.rgb = mix(gl_FragColor.rgb, paint, w);
            }
            gl_FragColor.a = pRaw > 0.5 ? 0.0 : 1.0 - w;
          }`
        );
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => `${key ? key() : ''}|paint`;
    material.needsUpdate = true;
    return material;
  }

  return {
    camera,
    uniforms,
    patch,
    /**
     * Patches everything in the scene, gives each moving part its own
     * material pinned to its shut pose, and draws the depth map. Call once,
     * with the house built and every door shut.
     */
    install(moving = []) {
      scene.updateMatrixWorld(true);
      const pinned = new Set();
      for (const root of moving) {
        root.traverse((o) => {
          if (!o.isMesh || pinned.has(o)) return;
          pinned.add(o);
          o.material = patch(o.material.clone(), o.matrixWorld.clone());
        });
      }
      scene.traverse((o) => {
        if (!o.isMesh || pinned.has(o)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m.transparent && (m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) patch(m);
        }
      });
      const target = renderer.getRenderTarget();
      const override = scene.overrideMaterial;
      scene.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
      renderer.setRenderTarget(depth);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(target);
      scene.overrideMaterial.dispose();
      scene.overrideMaterial = override;
    },
  };
}
