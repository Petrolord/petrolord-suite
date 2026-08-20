/**
 * W2.4 co-render shader contracts (the GPU==CPU pixel parity itself runs
 * in the WebGL self-test, e2e): the suffix-parameterized sampling chunk
 * reproduces the primary chunk byte-for-byte at suffix '' (overlay-off
 * arithmetic unchanged), the 'B' instance declares the full overlay
 * uniform family without colliding with the primary names, and the
 * overlay chunk carries the blend contract.
 */

import {
  SAMPLING_GLSL, makeSamplingGlsl, OVERLAY_GLSL,
} from '@/pages/apps/Seismolord/viewer/shaderChunks';

describe('makeSamplingGlsl', () => {
  test("suffix '' IS the primary chunk, byte for byte", () => {
    expect(makeSamplingGlsl('')).toBe(SAMPLING_GLSL);
  });

  test("suffix 'B' declares the overlay family and only the overlay family", () => {
    const b = makeSamplingGlsl('B');
    expect(b).toContain('uniform sampler2D u_dataB;');
    expect(b).toContain('uniform sampler2D u_traceRmsB;');
    expect(b).toContain('uniform sampler2D u_agcB;');
    expect(b).toContain('uniform int   u_traceBalanceB;');
    expect(b).toContain('uniform int   u_useAgcB;');
    expect(b).toContain('uniform int   u_interpB;');
    expect(b).toContain('float sampleBalancedB(vec2 t, out bool isNull)');
    // no unsuffixed declarations that would collide with the primary chunk
    expect(b).not.toMatch(/uniform sampler2D u_data;/);
    expect(b).not.toMatch(/float sampleBalanced\(/);
    expect(b).not.toMatch(/vec4 cubicWeights\(/);
  });

  test('the two chunks concatenate without duplicate symbols', () => {
    const both = SAMPLING_GLSL + makeSamplingGlsl('B');
    const count = (re) => (both.match(re) || []).length;
    expect(count(/uniform sampler2D u_data;/g)).toBe(1);
    expect(count(/uniform sampler2D u_dataB;/g)).toBe(1);
    expect(count(/float sampleBalanced\(vec2 t/g)).toBe(1);
    expect(count(/float sampleBalancedB\(vec2 t/g)).toBe(1);
  });
});

describe('OVERLAY_GLSL contract', () => {
  test('declares the blend uniforms and helpers', () => {
    for (const decl of ['uniform sampler2D u_lutB', 'uniform float u_gainB',
      'uniform float u_polarityB', 'uniform float u_clipB',
      'uniform int   u_overlayOn', 'uniform int   u_blendMode',
      'uniform float u_overlayOpacity']) {
      expect(OVERLAY_GLSL).toContain(decl);
    }
    expect(OVERLAY_GLSL).toContain('bool primaryIsNull(vec2 t)');
    expect(OVERLAY_GLSL).toContain('vec4 blendOverlay(vec2 t, vec4 base)');
    // null overlay leaves the primary untouched
    expect(OVERLAY_GLSL).toContain('if (isNullB) return base;');
  });
});
