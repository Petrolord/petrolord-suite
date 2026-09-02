// PS10: Hingle + matrix quicklooks vs the MATRIX golden, the analytic
// anchors, and the TVD lookup through the survey kernel.

import fs from 'fs';
import path from 'path';
import { hingleY, hingleWaterLine, hingleFitDepthWindow } from '../engine/crossplot';
import { rhoMaa, uMaa, thomasStieber, twoMineralSolve } from '../engine/matrix';
import { makeTvdLookup } from '../viewer/depthModes';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const analytic = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'analytic_cases.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

const P = typewell.params;
const depth = curve('DEPT');
const rt = curve('RT');
const phind = Float64Array.from(goldens.PHIND_AVG, (v) => (v === null ? NaN : v));

test('Hingle transform and water-leg fit match the golden (construction Rw recovered)', () => {
  const want = goldens.MATRIX.HINGLE_Y;
  for (let i = 0; i < want.length; i++) {
    if (want[i] === null) expect(Number.isNaN(hingleY(rt[i], P.m))).toBe(true);
    else expect(close(hingleY(rt[i], P.m), want[i])).toBe(true);
  }
  const phid = Float64Array.from(goldens.PHID, (v) => (v === null ? NaN : v));
  const fit = hingleFitDepthWindow(depth, phid, rt, P.water_leg[0], P.water_leg[1], { a: P.a, m: P.m });
  expect(Math.abs(fit.rw - P.rw)).toBeLessThan(1e-9);
  const wl = hingleWaterLine({ a: P.a, m: P.m, rw: fit.rw }, 0.4);
  expect(wl.pts[0]).toEqual({ x: 0, y: 0 });
});

test('rho_maa matches the golden and round-trips the matrix density on clean rock', () => {
  const rhob = curve('RHOB');
  const want = goldens.MATRIX.RHOMAA;
  for (let i = 0; i < want.length; i++) {
    if (want[i] === null) expect(Number.isNaN(rhoMaa(rhob[i], phind[i], P.rho_fl))).toBe(true);
    else expect(close(rhoMaa(rhob[i], phind[i], P.rho_fl), want[i])).toBe(true);
  }
});

test('Thomas-Stieber nearest-model classification matches the golden', () => {
  const vsh = goldens.VSH_LARIONOV_TERTIARY;
  const tsP = goldens.MATRIX.params;
  goldens.MATRIX.TS_NEAREST.forEach((want, i) => {
    const v = vsh[i] === null ? NaN : vsh[i];
    const got = thomasStieber(phind[i], v, tsP);
    expect(got.nearest).toBe(want);
  });
});

test('two-mineral solve analytic anchors (pure limestone from a ss/dol pair)', () => {
  const a = analytic.two_mineral_ss_dol.out;
  const got = twoMineralSolve(2.71, 0.0, {
    m1: { rho: 2.65, nphi: -0.02 }, m2: { rho: 2.87, nphi: 0.02 }, fluid: { rho: 1.0, nphi: 1.0 },
  });
  expect(close(got.v1, a.v1)).toBe(true);
  expect(close(got.v2, a.v2)).toBe(true);
  expect(close(got.phi, a.phi)).toBe(true);
  // exact reconstruction of the inputs
  expect(close(got.v1 * 2.65 + got.v2 * 2.87 + got.phi * 1.0, 2.71)).toBe(true);
  expect(close(uMaa(1.81, 2.65, 0), analytic.u_maa_quartz.out)).toBe(true);
});

test('TVD lookup: vertical survey is the identity; missing survey is null', () => {
  const vertical = makeTvdLookup([{ md: 0, inc: 0, azi: 0 }, { md: 3000, inc: 0, azi: 0 }]);
  expect(Math.abs(vertical(2050) - 2050)).toBeLessThan(1e-9);
  expect(makeTvdLookup([])).toBeNull();
  expect(makeTvdLookup(null)).toBeNull();
  // a deviated survey reads shallower TVD than MD below the kickoff
  const dev = makeTvdLookup([{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 3000, inc: 60, azi: 90 }]);
  expect(dev(2500)).toBeLessThan(2500);
  expect(Number.isNaN(dev(5000))).toBe(true);
});
