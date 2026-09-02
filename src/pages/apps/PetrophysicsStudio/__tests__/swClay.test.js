// PS5: shaly-sand Sw + temperature model vs the CLAY and TEMP goldens
// (oracle solves by pure bisection, the engine by Newton with
// bisection fallback — agreement at 1e-12 is the whole point), plus
// the exact Archie-reduction invariants and the pipeline's coupled
// temperature path.

import fs from 'fs';
import path from 'path';
import { swWaxmanSmits, swDualWater, swModSimandoux, bJuhasz, qvFromCec } from '../engine/swClay';
import { tempAtDepth, rwAtTemp } from '../engine/temperature';
import { swArchie } from '../engine/sw';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const analytic = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'analytic_cases.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));

const curves = {
  DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'),
  NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT'),
};
const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

const expectCurve = (got, want) => {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i++) {
    if (want[i] === null) expect(Number.isNaN(got[i])).toBe(true);
    else expect(close(got[i], want[i])).toBe(true);
  }
};

const P = typewell.params;
const rt = curves.RT;
const phid = goldens.PHID.map((v) => (v === null ? NaN : v));
const vsh = goldens.VSH_LARIONOV_TERTIARY.map((v) => (v === null ? NaN : v));

test('Waxman-Smits, dual-water and modified Simandoux match the CLAY goldens at 1e-12', () => {
  const cp = goldens.CLAY.params;
  expectCurve(
    Float64Array.from(rt, (r, i) => swWaxmanSmits(r, phid[i], P.rw, cp.qv, cp.b, P.a, cp.mStar, cp.nStar)),
    goldens.CLAY.SW_WS,
  );
  expectCurve(
    Float64Array.from(rt, (r, i) => swDualWater(r, phid[i], P.rw, cp.rwb, cp.swb, P.a, P.m, P.n)),
    goldens.CLAY.SW_DW,
  );
  expectCurve(
    Float64Array.from(rt, (r, i) => swModSimandoux(r, phid[i], P.rw, vsh[i], P.rsh, P.a, P.m, P.n)),
    goldens.CLAY.SW_MS,
  );
});

test('temperature model matches the TEMP goldens (TEMP, Rw(T), B(T), Archie(T))', () => {
  const tp = goldens.TEMP.params;
  const temp = Float64Array.from(curves.DEPT, (z) => tempAtDepth(z, tp));
  expectCurve(temp, goldens.TEMP.TEMP);
  expectCurve(Float64Array.from(temp, (t) => rwAtTemp(P.rw, tp.rwRefTempC, t)), goldens.TEMP.RW_T);
  expectCurve(Float64Array.from(temp, (t) => bJuhasz(t)), goldens.TEMP.B_JUHASZ);
  expectCurve(
    Float64Array.from(rt, (r, i) => swArchie(r, phid[i], rwAtTemp(P.rw, tp.rwRefTempC, temp[i]), P.a, P.m, P.n)),
    goldens.TEMP.SW_ARCHIE_T,
  );
});

test('the pipeline couples temperature into every Sw method (Archie(T) end-to-end)', () => {
  const tp = goldens.TEMP.params;
  const { outputs } = computeWell(curves, { ...DEFAULT_PARAMS, tempMode: 'linear', ...tp });
  expectCurve(outputs.TEMP, goldens.TEMP.TEMP);
  expectCurve(outputs.SW, goldens.TEMP.SW_ARCHIE_T);
});

test('pipeline dispatch reproduces the CLAY goldens through computeWell', () => {
  const cp = goldens.CLAY.params;
  const ws = computeWell(curves, {
    ...DEFAULT_PARAMS, swMethod: 'waxman-smits', qv: cp.qv, bMode: 'manual', bValue: cp.b, m: cp.mStar, n: cp.nStar,
  });
  expectCurve(ws.outputs.SW, goldens.CLAY.SW_WS);
  const dw = computeWell(curves, { ...DEFAULT_PARAMS, swMethod: 'dual-water', rwb: cp.rwb, swb: cp.swb });
  expectCurve(dw.outputs.SW, goldens.CLAY.SW_DW);
  const ms = computeWell(curves, { ...DEFAULT_PARAMS, swMethod: 'mod-simandoux' });
  expectCurve(ms.outputs.SW, goldens.CLAY.SW_MS);
});

test('exact Archie reductions: Qv=0, Swb=0, Vsh=0', () => {
  const a0 = swArchie(8, 0.18, 0.05);
  expect(swWaxmanSmits(8, 0.18, 0.05, 0, 3)).toBeCloseTo(a0, 12);
  expect(swDualWater(8, 0.18, 0.05, 0.02, 0)).toBeCloseTo(a0, 12);
  expect(swModSimandoux(8, 0.18, 0.05, 0, 2)).toBeCloseTo(a0, 12);
});

test('analytic scalar cases', () => {
  expect(close(swWaxmanSmits(8, 0.18, 0.05, 0.1, 3), analytic.waxman_smits_basic.out)).toBe(true);
  expect(close(swDualWater(8, 0.18, 0.05, 0.02, 0.25), analytic.dual_water_basic.out)).toBe(true);
  expect(close(swModSimandoux(8, 0.18, 0.05, 0.3, 2), analytic.mod_simandoux_basic.out)).toBe(true);
  expect(close(bJuhasz(80), analytic.b_juhasz_80c.out)).toBe(true);
  expect(close(qvFromCec(10, 0.2, 2.65), analytic.qv_from_cec.out)).toBe(true);
  expect(close(tempAtDepth(2050, { surfaceTempC: 25, bhtC: 90, bhtDepthM: 2100 }), analytic.temp_linear.out)).toBe(true);
});

test('invalid inputs are NaN, never a default', () => {
  expect(Number.isNaN(swWaxmanSmits(NaN, 0.2, 0.05, 0.1, 3))).toBe(true);
  expect(Number.isNaN(swWaxmanSmits(8, -0.1, 0.05, 0.1, 3))).toBe(true);
  expect(Number.isNaN(swDualWater(0, 0.2, 0.05, 0.02, 0.25))).toBe(true);
  expect(Number.isNaN(swModSimandoux(8, 0.2, 0.05, 1.0, 2))).toBe(true);
  expect(Number.isNaN(qvFromCec(10, 0, 2.65))).toBe(true);
  expect(Number.isNaN(rwAtTemp(0.05, 25, NaN))).toBe(true);
});
