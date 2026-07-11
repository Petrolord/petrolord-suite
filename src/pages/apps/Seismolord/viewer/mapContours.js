// Map-window math: null-aware marching-squares contouring of horizon
// grids, nice contour levels, and the color-fill pixel buffer. Pure and
// jest-tested; MapView paints the results through its ViewTransform.
//
// Grid convention (matches horizon pick grids): value[il * nXl + xl],
// 1e30 = null. Contour coordinates come back in NODE units — x = xl
// index, y = il index; painters add the +0.5 cell-centre offset when
// projecting, exactly like the slice overlays.

import { NULL_VALUE } from '../engine/manifest';
import { niceStepUp } from './annotations';

const NULL_F32 = Math.fround(NULL_VALUE);

/**
 * Contour level values covering [zMin, zMax] on a nice step.
 * @returns {{levels: number[], step: number}}
 */
export function contourLevels(zMin, zMax, target = 10) {
  if (!Number.isFinite(zMin) || !Number.isFinite(zMax) || !(zMax > zMin)) {
    return { levels: [], step: 0 };
  }
  const step = niceStepUp((zMax - zMin) / Math.max(target, 1));
  const levels = [];
  for (let v = Math.ceil(zMin / step) * step; v <= zMax + step * 1e-9; v += step) {
    levels.push(Number(v.toPrecision(12)));
  }
  return { levels, step };
}

/**
 * Marching squares for one level. Cells touching a null node are
 * skipped (holes keep hard edges, playbook null rule).
 *
 * @param {Float32Array} grid nIl x nXl values, 1e30 nulls
 * @returns {Float32Array} segment soup [x0, y0, x1, y1, ...] in node units
 */
export function contourSegments(grid, nIl, nXl, level) {
  const out = [];
  const val = (i, j) => grid[i * nXl + j];
  for (let i = 0; i < nIl - 1; i++) {
    for (let j = 0; j < nXl - 1; j++) {
      const vA = val(i, j);          // (x=j,   y=i)
      const vB = val(i, j + 1);      // (x=j+1, y=i)
      const vC = val(i + 1, j + 1);  // (x=j+1, y=i+1)
      const vD = val(i + 1, j);      // (x=j,   y=i+1)
      if (vA === NULL_F32 || vB === NULL_F32 || vC === NULL_F32 || vD === NULL_F32) continue;
      let mask = 0;
      if (vA >= level) mask |= 1;
      if (vB >= level) mask |= 2;
      if (vC >= level) mask |= 4;
      if (vD >= level) mask |= 8;
      if (mask === 0 || mask === 15) continue;

      const frac = (a, b) => (b === a ? 0.5 : (level - a) / (b - a));
      const top = () => [j + frac(vA, vB), i];
      const right = () => [j + 1, i + frac(vB, vC)];
      const bottom = () => [j + frac(vD, vC), i + 1];
      const left = () => [j, i + frac(vA, vD)];
      const seg = (p, q) => out.push(p[0], p[1], q[0], q[1]);

      switch (mask) {
        case 1: case 14: seg(left(), top()); break;
        case 2: case 13: seg(top(), right()); break;
        case 4: case 11: seg(right(), bottom()); break;
        case 8: case 7: seg(bottom(), left()); break;
        case 3: case 12: seg(left(), right()); break;
        case 6: case 9: seg(top(), bottom()); break;
        case 5: {   // A & C high — resolve the saddle with the centre mean
          if ((vA + vB + vC + vD) / 4 >= level) {
            seg(left(), bottom()); seg(top(), right());
          } else {
            seg(top(), left()); seg(right(), bottom());
          }
          break;
        }
        case 10: {  // B & D high
          if ((vA + vB + vC + vD) / 4 >= level) {
            seg(top(), left()); seg(right(), bottom());
          } else {
            seg(top(), right()); seg(left(), bottom());
          }
          break;
        }
        default: break;
      }
    }
  }
  return Float32Array.from(out);
}

/**
 * RGBA pixel buffer (nXl wide, nIl tall, row = inline) for the map's
 * color fill: linear zMin..zMax through the LUT, nulls transparent.
 * @param {Uint8Array} lut 256x4 RGBA (shaderChunks buildLut)
 * @returns {Uint8ClampedArray} nXl * nIl * 4
 */
export function buildMapPixels(grid, nIl, nXl, lut, zMin, zMax) {
  const out = new Uint8ClampedArray(nIl * nXl * 4);
  const span = zMax - zMin;
  for (let i = 0; i < nIl; i++) {
    for (let j = 0; j < nXl; j++) {
      const v = grid[i * nXl + j];
      if (v === NULL_F32 || !Number.isFinite(v)) continue;
      const f = span > 0 ? (v - zMin) / span : 0.5;
      const li = Math.max(0, Math.min(255, Math.round(f * 255))) * 4;
      const o = (i * nXl + j) * 4;
      out[o] = lut[li];
      out[o + 1] = lut[li + 1];
      out[o + 2] = lut[li + 2];
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Min/max of a grid ignoring nulls.
 * @returns {{zMin: number|null, zMax: number|null}}
 */
export function gridRange(grid) {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let k = 0; k < grid.length; k++) {
    const v = grid[k];
    if (v === NULL_F32 || !Number.isFinite(v)) continue;
    if (v < zMin) zMin = v;
    if (v > zMax) zMax = v;
  }
  return zMin === Infinity ? { zMin: null, zMax: null } : { zMin, zMax };
}
