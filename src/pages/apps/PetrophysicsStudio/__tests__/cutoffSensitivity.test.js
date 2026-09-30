/**
 * AppUpgrade PETRO-U2-005: cutoff sensitivity (Worthington and Cosentino
 * 2005, SPE 84387; IP's Cutoff Sensitivity plot). Every point calls the
 * shipped zone report on the same curves with one cutoff replaced, so the
 * gates below assert the shipped function's output against numbers counted
 * by hand on a ten-sample case, the volumetric invariant at every point, the
 * monotone direction of each sweep on the real pipeline, and that the
 * current point is the zone card's number (overrides included).
 *
 * Negative control (run 2026-09-29): with zoneSensitivities sweeping on the
 * BASE parameters instead of the zone's merged set, the override case sweeps
 * around the base 0.08 porosity cutoff where the zone card uses its own 0.29,
 * and fails.
 */
import typewell from '../../../../../packages/engines/test-data/petrophysics/typewell.json';
import { computeWellZoned, DEFAULT_PARAMS } from '../engine/pipeline';
import { zoneReports } from '../services/zoneAverages';
import {
  SENSITIVITY_CUTOFFS, sweepValues, cutoffSensitivity, zoneSensitivities, pointsAround, relativeSwing,
} from '../services/cutoffSensitivity';

const F = (a) => Float64Array.from(a);

// ten 1 m samples; Vsh 0.1 everywhere
const curves = { DEPT: F([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) };
const phi = [0.02, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.25, 0.30];
const sw = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.3, 0.2, 0.2];
const outputs = { PHIE: F(phi), PHIT: F(phi), VSH: F(phi.map(() => 0.1)), SW: F(sw) };
const zone = { id: 'z', name: 'Z', top_md_m: 0, base_md_m: 9 };
const params = { ...DEFAULT_PARAMS, cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6 };
const at = (sweep, v) => sweep.points.find((p) => Math.abs(p.value - v) < 1e-9);

describe('hand-counted ten-sample case', () => {
  const s = cutoffSensitivity({ curves, outputs, params, zone });

  test('porosity sweep: net pay counted by hand (Sw 0.6 also applies)', () => {
    const phiSweep = s.sweeps.cutPhi;
    // samples 3..9 pass Sw <= 0.6; their porosities .10 .12 .15 .18 .20 .25 .30
    expect(at(phiSweep, 0.10).net_m).toBe(7);
    expect(at(phiSweep, 0.11).net_m).toBe(6);
    expect(at(phiSweep, 0.13).net_m).toBe(5);
    expect(at(phiSweep, 0.16).net_m).toBe(4);
    expect(at(phiSweep, 0.19).net_m).toBe(3);
    expect(at(phiSweep, 0.21).net_m).toBe(2);
    expect(at(phiSweep, 0.26).net_m).toBe(1);
    expect(at(phiSweep, 0.30).net_m).toBe(1);
    // HCPV at 0.20: 0.20 x 0.7 + 0.25 x 0.8 + 0.30 x 0.8
    expect(at(phiSweep, 0.20).hcpv_m).toBeCloseTo(0.58, 12);
    // net reservoir ignores Sw: at 0.08 samples 2..9
    expect(at(phiSweep, 0.08).net_res_m).toBe(8);
  });

  test('Sw and Vsh sweeps', () => {
    expect(at(s.sweeps.cutSw, 0.5).net_m).toBe(6);
    expect(at(s.sweeps.cutSw, 0.65).net_m).toBe(7);
    expect(at(s.sweeps.cutSw, 0.7).net_m).toBe(8);
    expect(at(s.sweeps.cutSw, 0.2).net_m).toBe(2);
    expect(at(s.sweeps.cutSw, 0.15).net_m).toBe(0);
    expect(at(s.sweeps.cutVsh, 0.05).net_m).toBe(0);
    expect(at(s.sweeps.cutVsh, 0.1).net_m).toBe(7);
  });

  test('the current point is the zone report at the chosen cutoffs; the invariant holds everywhere', () => {
    for (const def of SENSITIVITY_CUTOFFS) {
      const sweep = s.sweeps[def.key];
      expect(at(sweep, params[def.key]).net_m).toBe(s.current.net_m);
      for (const p of sweep.points) {
        if (p.net_m > 0) expect(p.net_m * p.phi_avg * (1 - p.sw_avg)).toBeCloseTo(p.hcpv_m, 12);
      }
    }
  });

  test('table points and swing', () => {
    const around = pointsAround(s.sweeps.cutPhi, 2);
    expect(around.map((p) => p.value)).toEqual([0.06, 0.07, 0.08, 0.09, 0.1]);
    expect(around.filter((p) => p.isCurrent)).toHaveLength(1);
    // net at 0.07 is 7 (samples 3..9), at 0.09 also 7: flat, swing 0
    expect(relativeSwing(s.sweeps.cutPhi)).toBe(0);
    // Sw at 0.6: neighbours 0.55 (6 m) and 0.65 (7 m) around 7 m
    expect(relativeSwing(s.sweeps.cutSw)).toBeCloseTo(1 / 7, 12);
  });
});

test('sweep grid always contains the current value', () => {
  const v = sweepValues(SENSITIVITY_CUTOFFS[0], 0.083);
  expect(v).toContain(0.083);
  expect(v[0]).toBe(0);
  expect(v[v.length - 1]).toBe(0.3);
  expect([...v].sort((a, b) => a - b)).toEqual(v);
});

describe('type well through the pipeline', () => {
  const c = {};
  for (const [k, v] of Object.entries(typewell.curves)) c[k] = Float64Array.from(v, (x) => (x === null ? NaN : x));
  const [top, base] = typewell.params.zones.SAND_A;
  const zA = { id: 'zA', name: 'SAND A', top_md_m: top, base_md_m: base };

  test('net pay falls as the porosity cutoff rises and grows as the Vsh and Sw cutoffs loosen', () => {
    const { outputs: o } = computeWellZoned(c, DEFAULT_PARAMS, []);
    const s = cutoffSensitivity({ curves: c, outputs: o, params: DEFAULT_PARAMS, zone: zA });
    const nets = (k) => s.sweeps[k].points.map((p) => p.net_m);
    const nonInc = (a) => a.every((v, i) => i === 0 || v <= a[i - 1] + 1e-12);
    const nonDec = (a) => a.every((v, i) => i === 0 || v >= a[i - 1] - 1e-12);
    expect(nonInc(nets('cutPhi'))).toBe(true);
    expect(nonDec(nets('cutVsh'))).toBe(true);
    expect(nonDec(nets('cutSw'))).toBe(true);
    expect(nets('cutPhi')[0]).toBeGreaterThan(nets('cutPhi').at(-1));
  });

  test('a zone with its own cutoff: the current point matches the card (negative control target)', () => {
    const zoneParams = { zA: { cutPhi: 0.29 } };
    const { outputs: o } = computeWellZoned(c, DEFAULT_PARAMS, [{ top, base, params: zoneParams.zA }]);
    const cards = zoneReports({ curves: c, outputs: o, params: DEFAULT_PARAMS, zones: [zA], zoneParams });
    const sens = zoneSensitivities({ curves: c, outputs: o, params: DEFAULT_PARAMS, zones: [zA], zoneParams });
    expect(sens.zA.sweeps.cutPhi.current).toBe(0.29);
    expect(at(sens.zA.sweeps.cutPhi, 0.29).net_m).toBe(cards.zA.net_m);
    expect(sens.zA.current.net_m).toBe(cards.zA.net_m);
  });
});
