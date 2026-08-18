/**
 * shadeAmpPixels — the CPU mirror of DISPLAY_GLSL's shadeAmp used by the
 * Map window's time-slice raster. Pins the amplitude→LUT mapping to the
 * shader convention (SliceRenderer.referenceRender: symmetric clip around
 * zero, floor(x*256) texel pick, nulls transparent) so the map can never
 * drift from the section/3D shading.
 */
import { buildLut, shadeAmpPixels } from '@/pages/apps/Seismolord/viewer/shaderChunks';

const NULL_VALUE = 1.0e30;

// identity-ish LUT where each texel's red channel encodes its index —
// lets the tests read back exactly which LUT entry was picked
const indexLut = () => {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    lut[i * 4] = i;
    lut[i * 4 + 3] = 255;
  }
  return lut;
};

const shadeOne = (amp, display) => {
  const px = shadeAmpPixels(Float32Array.of(amp), 1, 1, indexLut(), display);
  return { r: px[0], a: px[3] };
};

const DISP = { gain: 1, polarity: 1, clip: 1 };

describe('shadeAmpPixels', () => {
  test('zero amplitude maps to the LUT midpoint (symmetric around zero)', () => {
    expect(shadeOne(0, DISP).r).toBe(128);      // floor(0.5 * 256)
  });

  test('amplitudes at ±clip map to the LUT ends', () => {
    expect(shadeOne(1, DISP).r).toBe(255);      // clamped top texel
    expect(shadeOne(-1, DISP).r).toBe(0);
  });

  test('amplitudes beyond the clip clamp to the ends', () => {
    expect(shadeOne(50, DISP).r).toBe(255);
    expect(shadeOne(-50, DISP).r).toBe(0);
  });

  test('gain scales the amplitude before the clip', () => {
    // 0.25 * gain 2 = 0.5 → x = 0.75 → floor(192)
    expect(shadeOne(0.25, { ...DISP, gain: 2 }).r).toBe(192);
  });

  test('polarity -1 mirrors around the midpoint', () => {
    const normal = shadeOne(0.5, DISP).r;                       // 192
    const reversed = shadeOne(0.5, { ...DISP, polarity: -1 }).r; // 64
    expect(normal).toBe(192);
    expect(reversed).toBe(64);
    expect(normal + reversed).toBe(256);
  });

  test('nulls are fully transparent, everything else opaque', () => {
    expect(shadeOne(NULL_VALUE, DISP).a).toBe(0);
    expect(shadeOne(-NULL_VALUE, DISP).a).toBe(0);
    expect(shadeOne(0, DISP).a).toBe(255);
  });

  test('matches the shader formula across a sweep (floor(x*256), clamped)', () => {
    const lut = indexLut();
    const disp = { gain: 1.7, polarity: 1, clip: 2.3 };
    const amps = [-3, -2.3, -1, -0.01, 0, 0.42, 1.9, 2.3, 3];
    const px = shadeAmpPixels(Float32Array.from(amps), amps.length, 1, lut, disp);
    amps.forEach((amp, i) => {
      const a = amp * disp.gain * disp.polarity;
      const x = Math.min(1, Math.max(0, 0.5 + (0.5 * a) / disp.clip));
      const li = Math.min(255, Math.floor(x * 256));
      expect(px[i * 4]).toBe(li);
    });
  });

  test('a real colormap LUT paints null-free rows fully opaque', () => {
    const lut = buildLut('seismic_rwb');
    const data = Float32Array.of(-1, 0, 1, NULL_VALUE);
    const px = shadeAmpPixels(data, 4, 1, lut, DISP);
    expect(px[3]).toBe(255);
    expect(px[7]).toBe(255);
    expect(px[11]).toBe(255);
    expect(px[15]).toBe(0);
  });
});
