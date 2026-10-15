// Previews of a local volume for the cloud (owner decision 4: uploaded by
// default, off for members-only projects, per-volume override): a decimated
// middle inline, middle crossline and middle time slice, grey scale, a few
// hundred pixels each, so a colleague without the volume sees what it looks
// like. Built from the coarse display level of a v4 store (a few dozen small
// bricks), or by stepping through a derived volume's float bricks.
//
// Pure image building here; the page encodes PNGs (OffscreenCanvas) and
// uploads them to <owner>/<volume>/previews/{inline,xline,time}.png.

import { geomFromManifest } from '../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { decodeU8Brick, decodeF32Brick, nativeInflateRaw, DEFLATE_RAW, NO_COMPRESSION } from '../../../packages/engines/engines/seismolord/brickCodecV4.js';

export const PREVIEW_NAMES = Object.freeze(['inline', 'xline', 'time']);
export const PREVIEW_MAX_PX = 512;
const MAX_F32_BRICKS = 2000;
const LRU_BRICKS = 96;

const codecOf = (compression, inflate) => (compression === NO_COMPRESSION ? { compression: NO_COMPRESSION } : { compression: DEFLATE_RAW, inflate: inflate || nativeInflateRaw });

/** Grey RGBA of a w x h value grid; nulls white. value(x, y) -> number|null, scaled by clip. */
function grey(w, h, value, clip) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = value(x, y);
      const o = (y * w + x) * 4;
      if (v == null || !Number.isFinite(v)) { rgba[o] = 255; rgba[o + 1] = 255; rgba[o + 2] = 255; rgba[o + 3] = 255; continue; }
      const g = Math.max(0, Math.min(255, Math.round(128 - (v / clip) * 127)));
      rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255;
    }
  }
  return rgba;
}

const fit = (n) => Math.max(1, Math.ceil(n / PREVIEW_MAX_PX));

/**
 * @param {Object} p
 * @param {Object} p.manifest
 * @param {(key: string) => Promise<Uint8Array>} p.read a key relative to the volume directory
 * @param {Function} [p.inflate]
 * @returns {Promise<Array<{name: string, width: number, height: number, rgba: Uint8ClampedArray}>>}
 */
export async function buildPreviews({ manifest, read, inflate = null }) {
  const out = [];
  if (manifest?.manifest_version === 4 && manifest.display?.levels?.length) {
    const levels = manifest.display.levels;
    const lvl = levels.find((l) => Math.max(l.dims[0], l.dims[1], l.dims[2]) <= PREVIEW_MAX_PX) || levels[levels.length - 1];
    const b = manifest.display.brick_size;
    const [ni, nj, nk] = lvl.bricks;
    const [nIl, nXl, ns] = lvl.dims;
    const codec = codecOf(manifest.display.compression, inflate);
    const bricks = new Map();
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) for (let k = 0; k < nk; k++) {
      // eslint-disable-next-line no-await-in-loop
      bricks.set(`${i}-${j}-${k}`, await decodeU8Brick(await read(`v4/d${lvl.level}/${i}-${j}-${k}.u8z`), codec));
    }
    const at = (il, xl, s) => {
      const c = bricks.get(`${Math.floor(il / b)}-${Math.floor(xl / b)}-${Math.floor(s / b)}`);
      const q = c ? c[((il % b) * b + (xl % b)) * b + (s % b)] : 0;
      return q === 0 ? null : q - 128;
    };
    const mi = Math.floor(nIl / 2); const mx = Math.floor(nXl / 2); const ms = Math.floor(ns / 2);
    out.push({ name: 'inline', width: nXl, height: ns, rgba: grey(nXl, ns, (x, y) => at(mi, x, y), 127) });
    out.push({ name: 'xline', width: nIl, height: ns, rgba: grey(nIl, ns, (x, y) => at(x, mx, y), 127) });
    out.push({ name: 'time', width: nXl, height: nIl, rgba: grey(nXl, nIl, (x, y) => at(y, x, ms), 127) });
    return out;
  }
  // a derived volume: float bricks, stepped so each image stays small
  const g = geomFromManifest(manifest);
  const b = g.brickSize;
  const clip = Math.max(1e-12, (manifest.stats?.rms || 1) * 3);
  const codec = codecOf(manifest.f32?.compression || NO_COMPRESSION, inflate);
  const cache = new Map();
  let reads = 0;
  const brick = async (i, j, k) => {
    const key = `${i}-${j}-${k}`;
    if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
    if (reads >= MAX_F32_BRICKS) return null;
    reads += 1;
    const isV4 = manifest.manifest_version === 4;
    const raw = await read(isV4 ? `v4/f/${key}.f32z` : `bricks/${key}.f32`).catch(() => null);
    const f = raw ? (isV4 ? await decodeF32Brick(raw, codec) : new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)) : null;
    cache.set(key, f);
    if (cache.size > LRU_BRICKS) cache.delete(cache.keys().next().value);
    return f;
  };
  const sample = async (il, xl, s) => {
    const f = await brick(Math.floor(il / b), Math.floor(xl / b), Math.floor(s / b));
    if (!f) return null;
    const v = f[((il % b) * b + (xl % b)) * b + (s % b)];
    return Math.abs(v) < 1e29 ? v : null;
  };
  const plane = async (w, h, stepX, stepY, f) => {
    const W = Math.ceil(w / stepX); const H = Math.ceil(h / stepY);
    const vals = new Float32Array(W * H).fill(NaN);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // eslint-disable-next-line no-await-in-loop
        const v = await f(x * stepX, y * stepY);
        vals[y * W + x] = v == null ? NaN : v;
      }
    }
    return { W, H, vals };
  };
  const mi = Math.floor(g.nIl / 2); const mx = Math.floor(g.nXl / 2); const ms = Math.floor(g.ns / 2);
  const shapes = [
    ['inline', g.nXl, g.ns, (x, y) => sample(mi, x, y)],
    ['xline', g.nIl, g.ns, (x, y) => sample(x, mx, y)],
    ['time', g.nXl, g.nIl, (x, y) => sample(y, x, ms)],
  ];
  for (const [name, w, h, f] of shapes) {
    reads = 0;
    // eslint-disable-next-line no-await-in-loop
    const { W, H, vals } = await plane(w, h, fit(w), fit(h), f);
    out.push({ name, width: W, height: H, rgba: grey(W, H, (x, y) => vals[y * W + x], clip) });
  }
  return out;
}

/** PNG bytes of an RGBA image (browser: OffscreenCanvas). */
export async function encodePng({ width, height, rgba }) {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('This browser cannot draw previews.');
  const c = new OffscreenCanvas(width, height);
  c.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}
