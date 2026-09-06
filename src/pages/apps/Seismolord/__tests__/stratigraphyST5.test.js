// Stratigraphy ST5 in Seismolord: the flatten shader chunk is the only
// place the display shift lives and it degrades to identity when off; the
// engine shim resolves; the termination vocabulary is fixed. The GPU
// path itself is exercised by the e2e on the section harness.

import { FLATTEN_GLSL, SAMPLING_GLSL, DISPLAY_GLSL } from '../viewer/shaderChunks';
import { flattenOffsets, datumForHorizon, shiftedSample } from '../engine/flatten';
import { extractStratalSlice, bricksForStratalSlice } from '../engine/horizonAmplitude';
import { TERMINATION_KINDS } from '../components/workspace/ribbonTabs/InterpretationTab';

test('the flatten chunk declares its uniforms and shifts in data space before sampling', () => {
  expect(FLATTEN_GLSL).toMatch(/uniform sampler2D u_offset;/);
  expect(FLATTEN_GLSL).toMatch(/uniform int\s+u_flattenOn;/);
  expect(FLATTEN_GLSL).toMatch(/uniform float u_offsetScale;/);
  expect(FLATTEN_GLSL).toMatch(/vec2 flattenT\(vec2 t, out bool outside\)/);
  // off = identity, untracked (>= 1e29) = unshifted, out of range = outside
  expect(FLATTEN_GLSL).toMatch(/if \(u_flattenOn == 0\) return t;/);
  expect(FLATTEN_GLSL).toMatch(/if \(abs\(o\) > 1\.0e29\) return t;/);
  expect(FLATTEN_GLSL).toMatch(/if \(x < 0\.0 \|\| x > 1\.0\) outside = true;/);
  // nothing else in the sampling or display chunks knows about flattening
  expect(SAMPLING_GLSL).not.toMatch(/u_offset/);
  expect(DISPLAY_GLSL).not.toMatch(/u_offset/);
});

test('the engine shims resolve and agree with the vendored modules', () => {
  const geom = { nIl: 2, nXl: 3, ns: 8 };
  const grid = Float32Array.from([2, 3, 4, 5, 6, 7]);
  expect(datumForHorizon(grid, geom, 'inline', 0)).toBe(3);
  const { offsets, tracked } = flattenOffsets(grid, geom, 'inline', 0, 3);
  expect(Array.from(offsets)).toEqual([1, 0, -1]);
  expect(tracked).toBe(3);
  expect(shiftedSample(4, -1)).toBe(3);
  expect(typeof extractStratalSlice).toBe('function');
  expect(typeof bricksForStratalSlice).toBe('function');
});

test('termination kinds are the four Mitchum terminations with distinct colours', () => {
  expect(TERMINATION_KINDS.map((k) => k.key)).toEqual(['onlap', 'downlap', 'toplap', 'truncation']);
  expect(new Set(TERMINATION_KINDS.map((k) => k.colour)).size).toBe(4);
});
