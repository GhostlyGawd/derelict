/**
 * The style bible.
 *
 * One shared prompt block is prepended to every generation in the pipeline —
 * textures, model concept images and sound alike. This is the single lever
 * that keeps the whole asset set stylistically coherent, so it lives on its
 * own and nothing else is allowed to define look.
 */

export const STYLE_BIBLE = [
  'Late-1990s retro sci-fi FPS aesthetic.',
  'Derelict industrial spaceship interior.',
  'Dark gunmetal and olive metal, heavy rivets, scuffed grimy surfaces, utilitarian machinery.',
  'Sickly green energy glow from conduits and readouts.',
  'Low-resolution game-texture look, slightly desaturated, moody.',
  'No text, no watermarks, no people.',
].join(' ');

export const TEXTURE_SUFFIX = 'seamless tileable texture, flat frontal view, even lighting.';

export const MODEL_SUFFIX =
  'single object centered on a plain dark gray background, three-quarter view, entire object visible, video game prop.';

/**
 * Sound generation gets its own tail — the visual bible still sets the world,
 * but "no watermarks" means nothing to an audio model.
 */
export const AUDIO_SUFFIX =
  'dry recording, no music, no voices, mono, game sound effect.';

export function texturePrompt(subject) {
  return `${STYLE_BIBLE} ${subject} ${TEXTURE_SUFFIX}`;
}

export function modelPrompt(subject) {
  return `${STYLE_BIBLE} ${subject} ${MODEL_SUFFIX}`;
}

export function audioPrompt(subject) {
  return `${STYLE_BIBLE} ${subject} ${AUDIO_SUFFIX}`;
}

/**
 * Shared palette, in linear-ish sRGB hex. The offline synthesiser samples from
 * this so its output lands in the same colour space as the prompt describes.
 */
export const PALETTE = {
  gunmetalDark: [0x33, 0x38, 0x36],
  gunmetal: [0x5a, 0x60, 0x5c],
  gunmetalLight: [0x8f, 0x95, 0x8d],
  olive: [0x6b, 0x6c, 0x4e],
  oliveDark: [0x44, 0x46, 0x33],
  rust: [0x6d, 0x45, 0x30],
  grime: [0x24, 0x26, 0x22],
  glowGreen: [0x7b, 0xff, 0x9a],
  glowGreenDim: [0x2c, 0x6e, 0x42],
  hazard: [0x9a, 0x8a, 0x3a],
};
