/**
 * W1.1 Suite-side display upgrades: LUT-level colormap reversal (so
 * shaders, colorbars, and the map raster mirror all reverse identically)
 * and the AGC uniform contract in the shared sampling chunk. The AGC /
 * percentile / wiggle math itself is oracle-tested in the vendored
 * engines suite (seismolord.displayenhance.test.js); GPU==CPU parity is
 * pinned by the viewer self-test's AGC cases.
 */
import { buildLut, SAMPLING_GLSL } from '@/pages/apps/Seismolord/viewer/shaderChunks';

describe('buildLut reversal', () => {
  test('reverse flips the map end for end, alpha stays opaque', () => {
    const fwd = buildLut('grayscale');
    const rev = buildLut('grayscale', true);
    for (let i = 0; i < 256; i++) {
      for (let c = 0; c < 3; c++) {
        expect(rev[i * 4 + c]).toBe(fwd[(255 - i) * 4 + c]);
      }
      expect(rev[i * 4 + 3]).toBe(255);
    }
  });

  test('default is unreversed (existing callers unchanged)', () => {
    expect(Array.from(buildLut('seismic_rwb')))
      .toEqual(Array.from(buildLut('seismic_rwb', false)));
  });
});

describe('AGC shader contract', () => {
  test('the shared sampling chunk declares the AGC path both shaders inherit', () => {
    expect(SAMPLING_GLSL).toContain('uniform sampler2D u_agc');
    expect(SAMPLING_GLSL).toContain('u_useAgc');
  });
});
