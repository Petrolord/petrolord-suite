// Velocity model / time-depth conversion tests. The linear V0+kZ case
// is validated against RK4 numeric integration of dz/dt = v0 + k·z —
// the analytic form must match the ODE it claims to solve.

import {
  normalizeVelocity, twtMsToDepthM, depthGridFromPicks, sampleToExportZ,
  describeVelocity, M_PER_FT,
  layercakeDepthM, makeDepthConverter, velocityToManifest, velocityKey,
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
    expect(normalizeVelocity({ v0: 2000 })).toEqual({ kind: 'linear', v0: 2000, k: 0 });
    expect(describeVelocity({ v0: 2000, k: 0 })).toBe('V = 2000 m/s');
    expect(describeVelocity({ v0: 2000, k: 0.3 })).toBe('V(z) = 2000 + 0.3·z m/s');
    expect(describeVelocity(undefined)).toBe('not set');
  });
});

// ---------------------------------------------------------------------
// Layer cake

/** RK4 through the piecewise model, segment by segment: within layer n,
 *  dz/dt = v0ₙ + kₙ·(z − zTopₙ) between the boundary TIMES — a fully
 *  independent check of the analytic accumulation. */
function rk4Layercake(layers, boundaryTwtMs, twtMs, steps = 4000) {
  let tTop = 0;
  let zTop = 0;
  for (let i = 0; i < layers.length; i++) {
    const bounds = boundaryTwtMs
      .slice(i)
      .filter((b) => b != null && Number.isFinite(b));
    const tBase = i < layers.length - 1 && boundaryTwtMs[i] != null
      ? boundaryTwtMs[i]
      : (i === layers.length - 1 ? Infinity : NaN);
    // this reference implementation only handles clean monotonic,
    // fully-defined boundaries — the convention edge cases are asserted
    // separately against hand-computed values
    void bounds;
    const end = Math.min(twtMs, tBase);
    if (end > tTop) {
      const h = (end - tTop) / 2000 / steps;
      const f = (dz) => layers[i].v0 + layers[i].k * dz;
      let dz = 0;
      for (let s = 0; s < steps; s++) {
        const k1 = f(dz);
        const k2 = f(dz + (h / 2) * k1);
        const k3 = f(dz + (h / 2) * k2);
        const k4 = f(dz + h * k3);
        dz += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      }
      zTop += dz;
    }
    if (twtMs <= tBase) return zTop;
    tTop = tBase;
  }
  return zTop;
}

describe('layercakeDepthM', () => {
  const layers = [
    { v0: 1800, k: 0.4 },
    { v0: 2400, k: 0 },
    { v0: 3200, k: 0.2 },
  ];
  const bounds = [800, 1900]; // TWT ms of layer bases

  test('matches RK4 integration through the piecewise model', () => {
    for (const twt of [300, 800, 1200, 1900, 2600]) {
      const analytic = layercakeDepthM(layers, bounds, twt);
      const numeric = rk4Layercake(layers, bounds, twt);
      expect(Math.abs(analytic - numeric)).toBeLessThan(1e-4 * Math.max(1, numeric));
    }
  });

  test('constant-velocity stack matches the hand computation', () => {
    const cake = [{ v0: 2000, k: 0 }, { v0: 3000, k: 0 }];
    // one-way: 0.4 s at 2000 + 0.35 s at 3000 = 800 + 1050
    expect(layercakeDepthM(cake, [800], 1500)).toBeCloseTo(1850, 6);
    // above the boundary: single segment
    expect(layercakeDepthM(cake, [800], 600)).toBeCloseTo(600, 6);
  });

  test('null boundary: the layer above extends, the layer below vanishes', () => {
    const cake = [{ v0: 2000, k: 0 }, { v0: 9999, k: 0 }, { v0: 3000, k: 0 }];
    // middle boundary defined, first null: layer 0 runs to 1900 ms,
    // layer 1 (9999 m/s) contributes nothing
    const z = layercakeDepthM(cake, [null, 1900], 2500);
    expect(z).toBeCloseTo(2000 * 0.95 + 3000 * 0.3, 6);
    // no boundary defined at all: the top layer converts everything
    expect(layercakeDepthM(cake, [null, null], 2500)).toBeCloseTo(2000 * 1.25, 6);
    // 1e30 float32 null behaves like null
    expect(layercakeDepthM(cake, [NULL_F32, 1900], 2500))
      .toBeCloseTo(2000 * 0.95 + 3000 * 0.3, 6);
  });

  test('crossing boundaries clamp to zero thickness (depth stays monotonic)', () => {
    const cake = [{ v0: 2000, k: 0 }, { v0: 4000, k: 0 }, { v0: 3000, k: 0 }];
    // second boundary ABOVE the first: layer 1 gets zero thickness
    const z = layercakeDepthM(cake, [1000, 700], 2000);
    expect(z).toBeCloseTo(2000 * 0.5 + 3000 * 0.5, 6);
    // monotonicity across a fine time sweep
    let prev = -1;
    for (let t = 0; t <= 3000; t += 25) {
      const d = layercakeDepthM(cake, [1000, 700], t);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('layer-cake converter + model plumbing', () => {
  const manifestModel = {
    type: 'layercake',
    layers: [
      { base_horizon_id: 'h-top', v0: 2000, k: 0 },
      { base_horizon_id: null, v0: 3000, k: 0 },
    ],
  };

  test('normalize / manifest round-trip and key stability', () => {
    const m = normalizeVelocity(manifestModel);
    expect(m.kind).toBe('layercake');
    expect(m.layers[0].baseHorizonId).toBe('h-top');
    expect(velocityToManifest(m)).toEqual(manifestModel);
    expect(velocityKey(m)).toBe(velocityKey(manifestModel));
    expect(velocityKey(m)).not.toBe(velocityKey({ v0: 2000, k: 0 }));
    // any invalid layer rejects the whole model
    expect(normalizeVelocity({
      type: 'layercake',
      layers: [{ v0: 2000, k: 0 }, { v0: -1, k: 0 }],
    })).toBeNull();
    expect(normalizeVelocity({ type: 'layercake', layers: [] })).toBeNull();
  });

  test('cell-aware conversion reads the boundary grid per column', () => {
    // boundary pick grid in SAMPLES (dt 4 ms): cell 0 -> 800 ms,
    // cell 1 -> null (top layer extends)
    const boundary = Float32Array.from([200, NULL_F32]);
    const conv = makeDepthConverter(manifestModel, { dtUs: 4000, boundaries: [boundary] });
    expect(conv.columnDependent).toBe(true);
    expect(conv.toDepthM(1500, 0)).toBeCloseTo(2000 * 0.4 + 3000 * 0.35, 6);
    expect(conv.toDepthM(1500, 1)).toBeCloseTo(2000 * 0.75, 6);
    // linear models ignore the cell
    const lin = makeDepthConverter({ v0: 2000, k: 0 });
    expect(lin.columnDependent).toBe(false);
    expect(lin.toDepthM(1500)).toBeCloseTo(1500, 6);
  });

  test('sampleToExportZ and depthGridFromPicks go per-column for layer cakes', () => {
    const boundary = Float32Array.from([200, NULL_F32]);
    const toZ = sampleToExportZ(manifestModel, 4000, { boundaries: [boundary] });
    expect(toZ(375, 0)).toBeCloseTo(-(2000 * 0.4 + 3000 * 0.35) / M_PER_FT, 4);
    expect(toZ(375, 1)).toBeCloseTo(-(2000 * 0.75) / M_PER_FT, 4);

    const picks = Float32Array.from([375, 375]);
    const g = depthGridFromPicks(picks, 4000, manifestModel, { boundaries: [boundary] });
    expect(g[0]).toBeCloseTo(2000 * 0.4 + 3000 * 0.35, 3);
    expect(g[1]).toBeCloseTo(2000 * 0.75, 3);
  });

  test('describeVelocity labels layer cakes', () => {
    expect(describeVelocity(manifestModel))
      .toBe('Layer cake, 2 layers (2000 / 3000 m/s at layer tops)');
  });
});
