// Colour look-up tables for the map viewports (Mapping MS1, 2026-09-05).
// `buildLut` moved here from Seismolord's viewer/shaderChunks.js at the
// second consumer (that module re-exports it); STRUCTURE_LUT is the
// five-stop structure-map ramp both map twins used to inline,
// byte-identical to it.

import { COLOR_MAPS } from '@/utils/colorMaps';

/** 256x4 RGBA LUT of a COLOR_MAPS entry. */
export function buildLut(key, reverse = false) {
  const map = COLOR_MAPS[key];
  if (!map) throw new Error(`Unknown colormap: ${key}`);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = map.fn((reverse ? 255 - i : i) / 255);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

// blue -> cyan -> green -> yellow -> red: the classic structure-map
// colouring (shallow = warm)
const STRUCTURE_STOPS = [
  [0.0, [40, 60, 160]], [0.25, [40, 180, 200]], [0.5, [60, 190, 90]],
  [0.75, [230, 210, 70]], [1.0, [210, 60, 50]],
];

function structureLut(reverse = false) {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const f = (reverse ? 255 - i : i) / 255;
    let a = STRUCTURE_STOPS[0];
    let b = STRUCTURE_STOPS[STRUCTURE_STOPS.length - 1];
    for (let s = 0; s < STRUCTURE_STOPS.length - 1; s++) {
      if (f >= STRUCTURE_STOPS[s][0] && f <= STRUCTURE_STOPS[s + 1][0]) { a = STRUCTURE_STOPS[s]; b = STRUCTURE_STOPS[s + 1]; break; }
    }
    const t = (f - a[0]) / (b[0] - a[0] || 1);
    for (let k = 0; k < 3; k++) lut[i * 4 + k] = Math.round(a[1][k] + t * (b[1][k] - a[1][k]));
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

export const STRUCTURE_LUT = structureLut(false);
export const STRUCTURE_KEY = 'structure';

/** Colour maps a map viewport offers: the structure ramp plus every
 *  shared COLOR_MAPS entry. */
export const MAP_COLORMAPS = [
  { key: STRUCTURE_KEY, name: 'Structure (blue to red)' },
  ...Object.keys(COLOR_MAPS).map((key) => ({ key, name: COLOR_MAPS[key].name || key })),
];

const cache = new Map();

/** LUT for a viewport's colour choice (cached). */
export function lutOf({ colormap = STRUCTURE_KEY, reverse = false } = {}) {
  const key = `${colormap || STRUCTURE_KEY}|${reverse ? 1 : 0}`;
  let lut = cache.get(key);
  if (!lut) {
    lut = (!colormap || colormap === STRUCTURE_KEY) ? (reverse ? structureLut(true) : STRUCTURE_LUT) : buildLut(colormap, reverse);
    cache.set(key, lut);
  }
  return lut;
}
