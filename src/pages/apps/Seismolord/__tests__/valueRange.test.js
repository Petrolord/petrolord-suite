/**
 * Value range display for property volumes (Geoscience video Part B):
 * the signed range of a one-signed slice, the centre/clip it maps to, the
 * auto decision, the colour bar labels, and that a centre of 0 leaves the
 * seismic display exactly as it was.
 */
import { valueRange, rangeToCentreClip, wantsValueRange, isPropertyVolumeName } from '../lib/valueRange';
import { shadeAmpPixels, buildLut, DISPLAY_GLSL } from '../viewer/shaderChunks';
import { colorbarLabels } from '../viewer/annotations';

const NULL = 1e30;

describe('valueRange', () => {
  test('impedance-like slice: P2 to P98 of the live values, nulls ignored', () => {
    const data = new Float32Array(1001);
    for (let i = 0; i < 1001; i++) data[i] = 4500 + i * 1.6; // 4500 .. 6100
    data[3] = NULL; data[7] = NULL;
    const r = valueRange(data, 98);
    expect(r.min).toBeCloseTo(4500, 3);
    expect(r.max).toBeCloseTo(6100, 3);
    expect(r.low).toBeGreaterThan(4500);
    expect(r.low).toBeLessThan(4560);
    expect(r.high).toBeLessThan(6100);
    expect(r.high).toBeGreaterThan(6040);
  });

  test('a flat slice still gives a usable range; an all-null slice gives none', () => {
    const flat = valueRange(new Float32Array(50).fill(0.25), 98);
    expect(flat.high).toBeGreaterThan(flat.low);
    expect(valueRange(new Float32Array(10).fill(NULL), 98)).toBeNull();
  });

  test('centre and clip map [low, high] to the colormap ends', () => {
    expect(rangeToCentreClip(4500, 6100)).toEqual({ centre: 5300, clip: 800 });
  });
});

describe('which volumes open in Value range', () => {
  test('QI products by name', () => {
    for (const n of [
      'EKENE3D-v4-full.sgy AI, Model-based',
      'EKENE3D-v4-full.sgy AI, Model-based, porosity Q50',
      'EKENE3D-v4-near.sgy: AI, SI, density, Vp/Vs (AI), probability of Hydrocarbon sand',
      'EKENE3D-v4-near.sgy: AI, SI, density, Vp/Vs (AI), most likely facies',
      'EKENE3D-v4-near.sgy Vp/Vs, simultaneous',
    ]) expect(isPropertyVolumeName(n)).toBe(true);
  });

  test('seismic volumes and attributes do not qualify by name', () => {
    for (const n of ['EKENE3D-v4-full.sgy', 'EKENE3D-v4-far.sgy matched to EKENE3D-v4-near.sgy',
      'EKENE3D-v4-full.sgy [Spectral decomposition 12 Hz 120 ms]', 'EKENE3D-v4-full.sgy [Variance 40 ms]']) {
      expect(isPropertyVolumeName(n)).toBe(false);
    }
  });

  test('one-signed data qualifies, seismic with both signs does not', () => {
    const pos = Float32Array.from({ length: 200 }, (_, i) => 0.1 + i / 1000);
    const seis = Float32Array.from({ length: 200 }, (_, i) => Math.sin(i / 3) * 100);
    expect(wantsValueRange({ name: 'some volume', data: pos })).toBe(true);
    expect(wantsValueRange({ name: 'some volume', data: seis })).toBe(false);
  });
});

describe('display math with a centre', () => {
  const lut = buildLut('spectrum');
  const data = new Float32Array([-2, -0.5, 0, 0.7, 3, NULL]);

  test('centre 0 is the seismic display, pixel for pixel', () => {
    const before = shadeAmpPixels(data, 6, 1, lut, { gain: 1.5, polarity: -1, clip: 2 });
    const after = shadeAmpPixels(data, 6, 1, lut, { gain: 1.5, polarity: -1, clip: 2, centre: 0 });
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  test('a centre maps low to the first LUT texel and high to the last', () => {
    const v = new Float32Array([4500, 5300, 6100]);
    const { centre, clip } = rangeToCentreClip(4500, 6100);
    const px = shadeAmpPixels(v, 3, 1, lut, { gain: 1, polarity: 1, clip, centre });
    expect(Array.from(px.slice(0, 3))).toEqual(Array.from(lut.slice(0, 3)));
    expect(Array.from(px.slice(8, 11))).toEqual(Array.from(lut.slice(255 * 4, 255 * 4 + 3)));
  });

  test('the shader subtracts the centre before gain and clip', () => {
    expect(DISPLAY_GLSL).toContain('uniform float u_centre;');
    expect(DISPLAY_GLSL).toContain('float a = (balanced - u_centre) * u_gain * u_polarity;');
  });
});

describe('colour bar labels', () => {
  const fmt = (v) => String(Math.round(v));
  test('seismic: +a, 0, -a', () => {
    expect(colorbarLabels({ ampAtEnds: 120, fmt })).toEqual({ top: '+120', mid: '0', bottom: '-120' });
  });
  test('value range: high on top, the centre in the middle, low at the bottom', () => {
    expect(colorbarLabels({ ampAtEnds: 800, centre: 5300, fmt })).toEqual({ top: '6100', mid: '5300', bottom: '4500' });
  });
  test('reversed polarity swaps the ends', () => {
    expect(colorbarLabels({ ampAtEnds: 800, centre: 5300, polarity: -1, fmt })).toEqual({ top: '4500', mid: '5300', bottom: '6100' });
  });
});
