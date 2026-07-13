/**
 * LAS-driven synthetics (Geoscience G5 deferred item): the JS engine is
 * held to the Python oracle goldens (test-data/seismolord/synthetics/,
 * self-asserting generator tools/validation/seismolord/synthetics/
 * gen_synthetics.py) plus wellImportFuzz-style malformed-input fuzz —
 * plain domain Errors, never a raw TypeError/RangeError, never a crash.
 */
import fs from 'fs';
import path from 'path';

import {
  isGap, slownessToVelocity, computeImpedance, mdSeriesToTwt, resampleToDt,
  reflectivity, rickerWavelet, convolveSame, extractStatisticalWavelet,
  suggestBulkShift, buildSynthetic,
} from '@/pages/apps/Seismolord/engine/synthetics';
import { makeTvdssToTwt } from '@/pages/apps/Seismolord/engine/wellSection';
import { computeWellPath, positionAtMd } from '@/pages/apps/Seismolord/engine/wellPath';

const DATA_DIR = path.join(
  __dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord', 'synthetics',
);
const golden = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf8'));

/** JSON list (null = gap) -> Float64Array with NaN gaps. */
const fromJson = (a) => Float64Array.from(a, (v) => (v === null ? NaN : v));

/** Element-wise comparison with relative tolerance; NaN must pair with NaN. */
const expectClose = (actual, expected, { rtol = 1e-5, atol = 1e-6 } = {}) => {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i] === null ? NaN : expected[i];
    const a = actual[i];
    if (Number.isNaN(e) || Number.isNaN(a)) {
      if (!(Number.isNaN(e) && Number.isNaN(a))) {
        throw new Error(`sample ${i}: expected ${e}, got ${a}`);
      }
      continue;
    }
    const tol = atol + rtol * Math.max(Math.abs(e), Math.abs(a));
    if (Math.abs(a - e) > tol) {
      throw new Error(`sample ${i}: expected ${e}, got ${a} (|diff| ${Math.abs(a - e)} > ${tol})`);
    }
  }
};

// ---------------------------------------------------------------------------
// golden (a): analytic Ricker
// ---------------------------------------------------------------------------

describe('rickerWavelet vs golden (a)', () => {
  const g = golden('ricker');

  test('matches the oracle samples', () => {
    const w = rickerWavelet(g.freq_hz, g.dt_ms, g.half_length_ms);
    expectClose(w, g.samples);
  });

  test('analytic properties: peak 1.0 at centre, symmetric, straddles the analytic zero', () => {
    const w = rickerWavelet(g.freq_hz, g.dt_ms, g.half_length_ms);
    const n = (w.length - 1) / 2;
    expect(w[n]).toBe(1);
    for (let k = 1; k <= n; k++) expect(w[n + k]).toBe(w[n - k]);
    const k = Math.floor(g.zero_crossing_ms / g.dt_ms);
    expect(w[n + k]).toBeGreaterThan(0);
    expect(w[n + k + 1]).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// golden (b): 3-layer wedge, spikes placed in TWT through checkshots
// ---------------------------------------------------------------------------

describe('wedge vs golden (b)', () => {
  const g = golden('wedge');

  test('hand-checked RCs from impedances', () => {
    const [z1, z2, z3] = g.impedances;
    expect(reflectivity([z1, z2])[1]).toBeCloseTo(1500 / 9500, 6);   // float32 output
    expect(reflectivity([z2, z3])[1]).toBeCloseTo(1700 / 12700, 6);
  });

  test('spike placement through makeTvdssToTwt + convolution match the golden trace', () => {
    // the app's own checkshot converter places the interfaces
    const conv = makeTvdssToTwt({
      checkshots: g.checkshots, velocity: null, boundaries: null, dtUs: g.dt_ms * 1000, maxTwtMs: 0,
    });
    expect(conv.source).toBe('checkshots');
    const rc = new Float32Array(g.ns);
    for (const s of g.spikes) {
      const t = conv.toTwtMs(s.tvdss_m);
      expect(t).toBeCloseTo(s.twt_ms, 9);
      rc[Math.round(t / g.dt_ms)] += s.rc;
    }
    expectClose(rc, g.rc);

    const w = rickerWavelet(g.wavelet.freq_hz, g.dt_ms, g.wavelet.half_length_ms);
    const { data, valid } = convolveSame(rc, w);
    expectClose(data, g.synthetic);
    expect([...valid].every((v) => v === 1)).toBe(true);
    // SEG normal polarity: impedance increases -> positive peaks AT the spikes
    for (const s of g.spikes) expect(data[s.sample]).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// golden (c): full LAS pipeline down a deviated path
// ---------------------------------------------------------------------------

describe('full pipeline vs golden (c)', () => {
  const g = golden('las_pipeline');
  const pathPts = computeWellPath(g.stations, { surfaceX: 0, surfaceY: 0, kb: g.kb_m });
  const mdToTvdss = (md) => {
    const p = positionAtMd(g.stations, pathPts, md);
    return p ? p.tvdss : null;
  };
  const conv = makeTvdssToTwt({
    checkshots: g.checkshots, velocity: null, boundaries: null, dtUs: g.dt_ms * 1000, maxTwtMs: 0,
  });

  const run = () => buildSynthetic({
    dtCurve: Float32Array.from(g.dt_curve_us_per_m),
    rhobCurve: Float32Array.from(g.rhob_curve_gcc),
    mdStartM: g.md_start_m,
    mdStepM: g.md_step_m,
    mdToTvdss,
    tvdssToTwt: (z) => conv.toTwtMs(z),
    dtMs: g.dt_ms,
    ns: g.ns,
    wavelet: rickerWavelet(g.wavelet.freq_hz, g.dt_ms, g.wavelet.half_length_ms),
  });

  test('TWT per MD sample (min-curvature + checkshots) matches the oracle', () => {
    expectClose(run().twtMs, g.expected.twt_ms, { rtol: 1e-9, atol: 1e-9 });
  });

  test('impedance in time, RC, synthetic and validity match the oracle', () => {
    const r = run();
    expectClose(r.impedanceTime, g.expected.impedance_time, { rtol: 1e-5, atol: 1e-3 });
    expectClose(r.rc, g.expected.rc);
    expectClose(r.synthetic, g.expected.synthetic);
    expect([...r.validity]).toEqual(g.expected.validity);
  });

  test('both gap encodings (-999.25 raw LAS null and 1.0E+30) become gaps', () => {
    const r = run();
    // the -999.25 zone (MD samples 250..259) and the 1e30 zone (400..404)
    expect(Number.isNaN(r.velocity[255])).toBe(true);
    expect(Number.isNaN(r.velocity[402])).toBe(true);
    expect(Number.isNaN(r.impedance[255])).toBe(true);
    // and the golden's validity mask has real holes
    expect(g.expected.validity.some((v) => v === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// golden (d): statistical wavelet extraction
// ---------------------------------------------------------------------------

describe('extractStatisticalWavelet vs golden (d)', () => {
  const g = golden('wavelet_extract');

  test('matches the oracle wavelet', () => {
    const traces = g.traces.map(fromJson);
    const w = extractStatisticalWavelet(traces, g.dt_ms, {
      waveletLengthMs: g.opts.wavelet_length_ms, smoothHz: g.opts.smooth_hz,
    });
    expectClose(w, g.expected_wavelet);
  });

  test('zero phase: symmetric with peak 1.0 at the centre', () => {
    const traces = g.traces.map(fromJson);
    const w = extractStatisticalWavelet(traces, g.dt_ms, {
      waveletLengthMs: g.opts.wavelet_length_ms, smoothHz: g.opts.smooth_hz,
    });
    const n = (w.length - 1) / 2;
    expect(w[n]).toBeCloseTo(1, 6);
    for (let k = 1; k <= n; k++) expect(w[n + k]).toBeCloseTo(w[n - k], 6);
  });
});

// ---------------------------------------------------------------------------
// golden (e): cross-correlation bulk shift
// ---------------------------------------------------------------------------

describe('suggestBulkShift vs golden (e)', () => {
  const g = golden('bulk_shift');

  test('recovers the known 8 ms delay through noise and a null gap', () => {
    const r = suggestBulkShift(fromJson(g.synthetic), fromJson(g.seismic), g.dt_ms, g.max_lag_ms);
    expect(r).not.toBeNull();
    expect(r.lagMs).toBe(g.expected.lag_ms);           // positive = shift synthetic DOWN
    expect(r.corr).toBeCloseTo(g.expected.corr, 5);
    expect(r.series.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// unit behaviour not pinned by goldens
// ---------------------------------------------------------------------------

describe('unit behaviour', () => {
  test('isGap: LAS raw nulls, seismic null, NaN/Infinity; plain values pass', () => {
    for (const v of [NaN, Infinity, -Infinity, 1.0e30, -1.0e30, 9.0e29, -999.25, -999, -9999, -9999.25]) {
      expect(isGap(v)).toBe(true);
    }
    for (const v of [0, 1, -1, 2.3, 500, -998, 4200]) expect(isGap(v)).toBe(false);
  });

  test('slownessToVelocity: 500 US/M -> 2000 m/s; zero/negative slowness is a gap', () => {
    const v = slownessToVelocity([500, 0, -10, NaN]);
    expect(v[0]).toBeCloseTo(2000, 6);
    expect(Number.isNaN(v[1])).toBe(true);
    expect(Number.isNaN(v[2])).toBe(true);
    expect(Number.isNaN(v[3])).toBe(true);
  });

  test('computeImpedance despike: 3-point median removes a lone spike, keeps edges', () => {
    const v = Float32Array.from([2000, 2000, 4000, 2000, 2000]);
    const z = computeImpedance(v, 1.0, { despike: true });
    expect(z[2]).toBe(2000);
    expect(z[0]).toBe(2000);
    expect(z[4]).toBe(2000);
    // a genuine step survives despiking
    const step = computeImpedance(Float32Array.from([2000, 2000, 3000, 3000, 3000]), 1.0,
      { despike: true });
    expect(step[2]).toBe(3000);
  });

  test('constant-density fallback produces velocity-contrast-only RCs', () => {
    const z = computeImpedance(Float32Array.from([2000, 2500]), 2.3);
    const rc = reflectivity(z);
    expect(rc[1]).toBeCloseTo(500 / 4500, 6);          // rho cancels
  });

  test('resampleToDt preserves gaps and leaves the outside NaN', () => {
    const out = resampleToDt([10, 20, 30, 40], [1, 2, NaN, 4], 10, 6);
    expect(Number.isNaN(out[0])).toBe(true);            // before coverage
    expect(out[1]).toBe(1);                             // interval (10,20) fully valid
    expect(out[2]).toBe(2);
    expect(Number.isNaN(out[3])).toBe(true);            // bracketing value is a gap
    expect(Number.isNaN(out[4])).toBe(true);            // gap-bounded interval too
    expect(Number.isNaN(out[5])).toBe(true);            // after coverage
  });

  test('convolveSame validity mask follows the input gaps', () => {
    const w = Float32Array.from([0.5, 1, 0.5]);
    const { data, valid } = convolveSame([1, NaN, 2], w);
    expect([...valid]).toEqual([1, 0, 1]);
    expect(data[0]).toBeCloseTo(1, 6);                  // gap zero-filled
    expect(data[1]).toBeCloseTo(0.5 + 1, 6);
  });
});

// ---------------------------------------------------------------------------
// fuzz: malformed inputs -> plain domain errors, never a crash
// ---------------------------------------------------------------------------

describe('synthetics fuzz', () => {
  const okConverters = {
    mdToTvdss: (md) => md,
    tvdssToTwt: (z) => z,                               // 1 ms per metre, monotonic
  };
  const base = {
    ...okConverters,
    dtMs: 2,
    ns: 100,
    wavelet: rickerWavelet(25, 2, 60),
  };

  /** Assert a clean domain error (wellImportFuzz style). */
  const expectDomainError = (fn, pattern) => {
    let threw = null;
    try {
      fn();
    } catch (e) {
      threw = e;
    }
    expect(threw).not.toBeNull();
    expect(threw.constructor).toBe(Error);              // never TypeError/RangeError
    expect(threw.message.length).toBeGreaterThan(10);
    expect(threw.message).toMatch(pattern);
  };

  test('missing sonic', () => {
    expectDomainError(() => buildSynthetic({ ...base, dtCurve: null }), /sonic \(DT\) curve/);
    expectDomainError(() => buildSynthetic({ ...base, dtCurve: new Float32Array(0) }),
      /sonic \(DT\) curve/);
  });

  test('single-sample curve', () => {
    expectDomainError(
      () => buildSynthetic({ ...base, dtCurve: Float32Array.from([500]), mdStartM: 0, mdStepM: 1 }),
      /single sample/,
    );
  });

  test('all-null sonic', () => {
    expectDomainError(
      () => buildSynthetic({
        ...base,
        dtCurve: Float32Array.from([-999.25, -999.25, 1e30, NaN]),
        mdStartM: 0,
        mdStepM: 1,
      }),
      /fewer than 2 valid samples/,
    );
  });

  test('all-null density', () => {
    expectDomainError(
      () => buildSynthetic({
        ...base,
        dtCurve: Float32Array.from([500, 500, 500, 500]),
        rhobCurve: Float32Array.from([NaN, -999.25, 1e30, NaN]),
        mdStartM: 0,
        mdStepM: 1,
      }),
      /density curve has no valid samples/,
    );
  });

  test('non-monotonic checkshots surface as a row-numbered domain error', () => {
    // a dipping checkshot table makes T(z) non-monotonic along the log
    const conv = makeTvdssToTwt({
      checkshots: [
        { tvdss_m: 0, twt_ms: 0 },
        { tvdss_m: 100, twt_ms: 200 },
        { tvdss_m: 200, twt_ms: 150 },
        { tvdss_m: 300, twt_ms: 400 },
      ],
      velocity: null,
      boundaries: null,
      dtUs: 2000,
      maxTwtMs: 0,
    });
    expectDomainError(
      () => buildSynthetic({
        ...base,
        tvdssToTwt: (z) => conv.toTwtMs(z),
        dtCurve: Float32Array.from({ length: 300 }, () => 500),
        mdStartM: 0,
        mdStepM: 1,
      }),
      /Sample \d+: the time-depth relationship is not strictly increasing/,
    );
  });

  test('non-increasing MD grid', () => {
    expectDomainError(
      () => buildSynthetic({
        ...base,
        dtCurve: Float32Array.from([500, 500, 500]),
        mdArray: [0, 10, 10],
      }),
      /Depth sample 3: MD 10 does not increase/,
    );
    expectDomainError(
      () => buildSynthetic({
        ...base,
        dtCurve: Float32Array.from([500, 500, 500]),
        mdStartM: null,
        mdStepM: null,
      }),
      /no usable MD grid/,
    );
  });

  test('depth vector length mismatch', () => {
    expectDomainError(
      () => buildSynthetic({
        ...base,
        dtCurve: Float32Array.from([500, 500, 500]),
        mdArray: [0, 10],
      }),
      /does not match the sonic curve/,
    );
  });

  test('irregular (step_m = null) logs synthesize through an explicit depth vector', () => {
    const r = buildSynthetic({
      ...base,
      dtCurve: Float32Array.from([500, 490, 480, 470, 460, 450]),
      mdArray: [10, 11.5, 12, 14, 17.5, 20],            // genuinely irregular
      ns: 30,
      dtMs: 1,
    });
    expect(r.synthetic.length).toBe(30);
    let any = false;
    for (let i = 0; i < r.rc.length; i++) if (!Number.isNaN(r.rc[i])) any = true;
    expect(any).toBe(true);
  });

  test('even-length wavelet is rejected', () => {
    expectDomainError(() => convolveSame([1, 2, 3], [1, 1]), /odd number of samples/);
  });

  test('bulk shift on hopeless traces returns null instead of nonsense', () => {
    const allNull = Float32Array.from({ length: 50 }, () => 1e30);
    expect(suggestBulkShift(new Float32Array(50), allNull, 2, 20)).toBeNull();
  });

  test('wavelet extraction rejects empty and too-short inputs', () => {
    expectDomainError(() => extractStatisticalWavelet([], 2), /at least one seismic trace/);
    expectDomainError(
      () => extractStatisticalWavelet([new Float32Array(5)], 2, { waveletLengthMs: 120 }),
      /too short/,
    );
  });
});
