// Velocity model / time-depth conversion tests. The linear V0+kZ case
// is validated against RK4 numeric integration of dz/dt = v0 + k·z —
// the analytic form must match the ODE it claims to solve.

import {
  normalizeVelocity, twtMsToDepthM, depthGridFromPicks, sampleToExportZ,
  describeVelocity, M_PER_FT,
} from '@/pages/apps/Seismolord/engine/velocityModel';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

/** RK4 integrate dz/dt = v0 + k·z from 0 to t. */
const rk4Depth = (t, v0, k, steps = 4000) => {
  const h = t / steps;
  const f = (z) => v0 + k * z;
  let z = 0;
  for (let i = 0; i < steps; i++) {
    const k1 = f(z);
    const k2 = f(z + (h / 2) * k1);
    const k3 = f(z + (h / 2) * k2);
    const k4 = f(z + h * k3);
    z += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return z;
};

describe('twtMsToDepthM', () => {
  test('constant velocity: z = v0 · twt/2000', () => {
    expect(twtMsToDepthM(2000, { v0: 2000, k: 0 })).toBeCloseTo(2000, 6);
    expect(twtMsToDepthM(1500, { v0: 3000, k: 0 })).toBeCloseTo(2250, 6);
    expect(twtMsToDepthM(0, { v0: 2500, k: 0.4 })).toBe(0);
  });

  test('linear V0+kZ matches RK4 integration of dz/dt = v0 + k·z', () => {
    for (const [twt, v0, k] of [[800, 1500, 0.5], [2400, 1800, 0.3], [3000, 2000, -0.1]]) {
      const analytic = twtMsToDepthM(twt, { v0, k });
      const numeric = rk4Depth(twt / 2000, v0, k);
      expect(Math.abs(analytic - numeric)).toBeLessThan(1e-4 * Math.abs(numeric));
    }
  });

  test('k -> 0 is continuous with the constant-velocity limit', () => {
    const a = twtMsToDepthM(2000, { v0: 2000, k: 1e-12 });
    const b = twtMsToDepthM(2000, { v0: 2000, k: 0 });
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
  });
});

describe('depthGridFromPicks', () => {
  test('scales by dt and propagates nulls; ft unit divides by 0.3048', () => {
    const picks = Float32Array.from([250, NULL_F32, 500]);   // samples
    const dtUs = 4000;                                        // 4 ms
    const m = depthGridFromPicks(picks, dtUs, { v0: 2000, k: 0 });
    expect(m[0]).toBeCloseTo(1000, 3);          // 1000 ms TWT -> 1000 m
    expect(m[1]).toBe(NULL_F32);
    expect(m[2]).toBeCloseTo(2000, 3);
    const ft = depthGridFromPicks(picks, dtUs, { v0: 2000, k: 0 }, { unit: 'ft' });
    expect(ft[0]).toBeCloseTo(1000 / M_PER_FT, 2);
  });
});

describe('sampleToExportZ', () => {
  test('produces the playbook export convention: NEGATIVE feet', () => {
    const toZ = sampleToExportZ({ v0: 2000, k: 0 }, 4000);
    // matches the legacy constant-ft/s formula for the equivalent velocity
    const vFtS = 2000 / M_PER_FT;
    const legacy = (s) => -(((s * 4) / 1000) * (vFtS / 2));
    expect(toZ(250)).toBeCloseTo(legacy(250), 4);
    expect(toZ(250)).toBeLessThan(0);
  });
});

describe('normalizeVelocity / describeVelocity', () => {
  test('rejects unusable models, defaults k to 0', () => {
    expect(normalizeVelocity(null)).toBeNull();
    expect(normalizeVelocity({ v0: -5 })).toBeNull();
    expect(normalizeVelocity({ v0: 'x' })).toBeNull();
    expect(normalizeVelocity({ v0: 2000 })).toEqual({ v0: 2000, k: 0 });
    expect(describeVelocity({ v0: 2000, k: 0 })).toBe('V = 2000 m/s');
    expect(describeVelocity({ v0: 2000, k: 0.3 })).toBe('V(z) = 2000 + 0.3·z m/s');
    expect(describeVelocity(undefined)).toBe('not set');
  });
});
