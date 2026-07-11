// Pure-math tests for the map window: nice contour levels, null-aware
// marching squares (crossings, holes, saddles), color-fill pixels.

import {
  contourLevels, contourSegments, buildMapPixels, gridRange,
} from '../viewer/mapContours';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

describe('contourLevels', () => {
  it('spans the range on a nice step', () => {
    const { levels, step } = contourLevels(1012, 1988, 10);
    expect(step).toBe(100);
    expect(levels[0]).toBe(1100);
    expect(levels[levels.length - 1]).toBe(1900);
  });

  it('is empty for a degenerate range', () => {
    expect(contourLevels(5, 5).levels).toEqual([]);
    expect(contourLevels(NaN, 3).levels).toEqual([]);
  });
});

describe('contourSegments', () => {
  it('finds the straight crossing of a linear ramp', () => {
    // 3x3 grid, value = xl * 10 -> the 15-contour is the vertical line x=1.5
    const grid = Float32Array.from([0, 10, 20, 0, 10, 20, 0, 10, 20]);
    const segs = contourSegments(grid, 3, 3, 15);
    expect(segs.length).toBe(2 * 4);                // one segment per cell row
    for (let s = 0; s < segs.length; s += 4) {
      expect(segs[s]).toBeCloseTo(1.5);             // x0
      expect(segs[s + 2]).toBeCloseTo(1.5);         // x1
    }
  });

  it('skips cells that touch a null node', () => {
    const grid = Float32Array.from([0, 10, 20, 0, NULL_F32, 20, 0, 10, 20]);
    const segs = contourSegments(grid, 3, 3, 15);
    expect(segs.length).toBe(0);                    // every cell touches the null
  });

  it('emits two segments per saddle cell', () => {
    // checkerboard saddle: A=C=10 high, B=D=0 low at level 5
    const grid = Float32Array.from([10, 0, 0, 10]);
    const segs = contourSegments(grid, 2, 2, 5);
    expect(segs.length).toBe(2 * 4);
  });

  it('closes around an interior high', () => {
    const grid = Float32Array.from([
      0, 0, 0,
      0, 10, 0,
      0, 0, 0,
    ]);
    const segs = contourSegments(grid, 3, 3, 5);
    expect(segs.length).toBe(4 * 4);                // a diamond: 4 segments
  });
});

describe('buildMapPixels', () => {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    lut[i * 4] = i; lut[i * 4 + 1] = 0; lut[i * 4 + 2] = 255 - i; lut[i * 4 + 3] = 255;
  }

  it('maps zMin/zMax to the LUT ends and nulls to transparent', () => {
    const grid = Float32Array.from([100, 200, NULL_F32, 150]);
    const px = buildMapPixels(grid, 2, 2, lut, 100, 200);
    expect(px[0]).toBe(0);          // zMin -> LUT[0].r
    expect(px[3]).toBe(255);
    expect(px[4]).toBe(255);        // zMax -> LUT[255].r
    expect(px[11]).toBe(0);         // null -> alpha 0
    expect(px[12]).toBe(128);       // midpoint
  });
});

describe('gridRange', () => {
  it('ignores nulls and reports null for an all-null grid', () => {
    expect(gridRange(Float32Array.from([NULL_F32, 3, 7]))).toEqual({ zMin: 3, zMax: 7 });
    expect(gridRange(Float32Array.from([NULL_F32]))).toEqual({ zMin: null, zMax: null });
  });
});
