// Layer-cake depth conversion across an interior hole in a boundary horizon
// (2026-10-12): the hole used to switch that column to the next layer's
// velocity, so depth maps showed bullseyes and depth sections streaks.
import { boundaryGridForDepth } from '../lib/velocityBoundaries';
import { makeDepthConverter } from '../engine/velocityModel';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const geom = { nIl: 9, nXl: 9 };
const dtUs = 4000;
const model = {
  kind: 'layercake',
  layers: [{ baseHorizonId: 'b', v0: 2000, k: 0 }, { v0: 3500, k: 0 }],
};
// a flat boundary at sample 250 (1000 ms) with a 3 x 3 interior hole
const boundary = () => {
  const g = new Float32Array(geom.nIl * geom.nXl).fill(250);
  for (let i = 3; i <= 5; i++) for (let j = 3; j <= 5; j++) g[i * geom.nXl + j] = NULL_F32;
  return g;
};
const centre = 4 * geom.nXl + 4;
const edge = 0;

test('a hole in a boundary converts like its neighbours', () => {
  const conv = makeDepthConverter(model, { dtUs, boundaries: [boundaryGridForDepth(boundary(), geom)] });
  expect(conv.toDepthM(1500, centre)).toBeCloseTo(conv.toDepthM(1500, edge), 6);
});

test('negative control: the unfilled boundary jumps at the hole', () => {
  const conv = makeDepthConverter(model, { dtUs, boundaries: [boundary()] });
  // 1000 ms at 2000 m/s then 500 ms at 3500 m/s, against 1500 ms all at 2000 m/s
  expect(conv.toDepthM(1500, edge)).toBeCloseTo(1000 + 875, 6);
  expect(conv.toDepthM(1500, centre)).toBeCloseTo(1500, 6);
});

test('the uninterpreted exterior stays null, so the engine convention holds there', () => {
  const g = new Float32Array(geom.nIl * geom.nXl).fill(250);
  for (let i = 0; i < geom.nIl; i++) for (let j = 0; j < 3; j++) g[i * geom.nXl + j] = NULL_F32; // a horizon stopping at a fault
  const filled = boundaryGridForDepth(g, geom);
  expect(filled[4 * geom.nXl + 1]).toBe(NULL_F32);
  expect(filled).not.toBe(g); // a copy: the cached horizon grid is untouched
});
