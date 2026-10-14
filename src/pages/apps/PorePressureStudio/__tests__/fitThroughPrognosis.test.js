// The calibration fit goes through the prognosis the app shows (2026-10-14).
// Ekene-1 kit fixture through the shipped path with pressures from shale
// samples, and the kit's own MDT pretests on Ekene-1 (ekene-demo-v4
// 05-pressure/ekene-mdt-pressures.csv, psia, MD = TVD, mudline 60 m MD). The
// pretests sit in the Ekene Sand, a sand: the per-sample Eaton fit read the
// sand samples, drove n to its bound and made the shown misfit worse.
import fs from 'fs';
import path from 'path';
import { parseLas } from '../../WellDataManager/engine/lasParse';
import { normalizePpCurves, buildProfileInput } from '../services/prep';
import { autoShalePicks, fitSegments } from '../services/shalePicks';
import { computePrognosis } from '../services/shalePressure';
import { fitToCalibration, fitsThroughPrognosis, matchedPoints } from '../services/calibrate';
import { calibrationMisfit } from '../services/honesty';
import { fitEatonExponent } from '../engine/calibrationFit';

const FIX = path.join(__dirname, 'fixtures');
const PSI = 6894.757293168;
const ppg = (pa, tvdM) => pa / PSI / (0.052 * (tvdM / 0.3048));

// the kit's Ekene-1 pretests (md_m, pressure_psia)
const MDT = [[1549.0, 3187.9], [1552.0, 3191.2], [1555.0, 3194.5], [1558.0, 3197.8], [1561.0, 3201.4], [1565.0, 3207.2], [1570.0, 3214.4], [1576.0, 3223.0]];

function ekene1() {
  const p = parseLas(fs.readFileSync(path.join(FIX, 'ekene-1-pp.las'), 'utf8'));
  const c = Object.fromEntries(p.curves.map((x) => [x.mnemonic.toUpperCase(), x]));
  const norm = normalizePpCurves({ depth: c.DEPT.data, dt: c.DT.data, rho: c.RHOB.data, dtLog: { mnemonic: 'DT', unit: c.DT.unit }, rhoLog: { mnemonic: 'RHOB', unit: c.RHOB.unit } });
  const input = { ...buildProfileInput({ depth: norm.depth, dt: norm.dt, rho: norm.rho, shale: Array.from(c.GR.data) }, norm.units, { mudlineMdM: 60 }), shaleKind: 'gr' };
  const fit = fitSegments(autoShalePicks(input, { trend: 'dt', cutoff: 60, fromM: 100, toM: 1230, everyM: 30.48 }), { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, []);
  const params = { waterDepthM: 35, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 60, nct: fit.nct, method: 'eaton', eatonN: 3, nu: 0.3, ppFromShale: true, shaleCutoff: 82, shaleCutoffKind: 'gr' };
  // gauge, the app's frame: depth below mudline
  const calibration = MDT.map(([md, psia]) => ({ z: md - 60, pMpa: ((psia - 14.696) * PSI) / 1e6, kind: 'rft' }));
  const at = (md) => { let b = 0; for (let i = 1; i < input.mdM.length; i++) if (Math.abs(input.mdM[i] - md) < Math.abs(input.mdM[b] - md)) b = i; return b; };
  return { input, params, calibration, at };
}

describe('Fit n through the shown prognosis on Ekene-1', () => {
  const E = ekene1();
  const r0 = computePrognosis(E.input, E.params);

  test('negative control: the per-sample fit reads the sand samples and goes to its bound', () => {
    const pts = matchedPoints(E.calibration, E.input, r0);
    const f = fitEatonExponent(pts.map(({ i, ppMeasured }) => ({ S: r0.overburdenPa[i], Ph: r0.hydrostaticPa[i], ratio: r0.dtNormalUsPerM[i] / E.input.dtUsPerM[i], ppMeasured })));
    expect(f.atBound).toBe(true);
    const shown = computePrognosis(E.input, { ...E.params, eatonN: f.n });
    const before = calibrationMisfit(E.calibration, E.input.zBmlM, r0.porePressurePa, 'pp').rmsMpa;
    const after = calibrationMisfit(E.calibration, E.input.zBmlM, shown.porePressurePa, 'pp').rmsMpa;
    expect(after).toBeGreaterThan(before * 2);
  });

  test('the fit goes through the prognosis: the misfit falls and the Ekene Sand reads its 3,200 psia', () => {
    expect(fitsThroughPrognosis(E.params, E.input)).toBe(true);
    const r = fitToCalibration(E.params, E.input, r0, E.calibration);
    expect(r.error).toBeUndefined();
    expect(r.kept).toBeUndefined();
    expect(r.rmsAfterMpa).toBeLessThan(r.rmsBeforeMpa);
    expect(r.rmsAfterMpa).toBeLessThan(0.2);
    expect(r.params.eatonN).toBeGreaterThan(0.2);
    expect(r.params.eatonN).toBeLessThan(6);
    expect(r.text).toMatch(/^Fitted n \d\.\d{3} on the shown prognosis to 8 measured pressures: misfit RMS \d+\.\d\d MPa before, \d+\.\d\d MPa after\.$/);
    const shown = computePrognosis(E.input, r.params);
    const i = E.at(1560);
    expect(Math.abs(ppg(shown.porePressurePa[i], E.input.mdM[i]) - 12.02)).toBeLessThan(0.25);
  });

  test('every-sample mode keeps the exact per-sample engine fit', () => {
    const p = { ...E.params, ppFromShale: false };
    expect(fitsThroughPrognosis(p, E.input)).toBe(false);
    const r = fitToCalibration(p, E.input, computePrognosis(E.input, p), E.calibration);
    expect(r.text).not.toMatch(/shown prognosis/);
    expect(r.rmsAfterMpa).toBeLessThanOrEqual(r.rmsBeforeMpa + 1e-9);
  });
});

describe('a fit never makes the shown misfit worse', () => {
  test('a parameter that would raise the misfit is not applied, and it is said', () => {
    jest.isolateModules(() => {
      jest.doMock('../engine/calibrationFit', () => ({
        ...jest.requireActual('../engine/calibrationFit'),
        fitEatonExponent: () => ({ n: 6, atBound: true, rmsPa: 0, residualsPa: [] }),
      }));
      // eslint-disable-next-line global-require
      const { fitToCalibration: fit } = require('../services/calibrate');
      const E = ekene1();
      const p = { ...E.params, ppFromShale: false };
      const res = computePrognosis(E.input, p);
      const pts = E.calibration.map((c) => ({ ...c, pMpa: c.pMpa }));
      const r = fit(p, E.input, res, pts);
      expect(r.kept).toBe(true);
      expect(r.params).toBe(p);
      expect(r.text).toMatch(/^The fit did not improve on the current parameters \(n 6\.000 \(at the search bound/);
    });
  });
});

describe('Daines calibrated where no tectonic term is needed', () => {
  test('beta reads 0.000, not -0.000', () => {
    const E = ekene1();
    const { calibrateFracToLot } = jest.requireActual('../services/calibrate');
    const p = { ...E.params, fracMethod: 'daines', nu: 0.3, beta: 0 };
    const r0 = computePrognosis(E.input, p);
    // a leak-off exactly on Eaton's line at nu 0.3: Daines needs no tectonic term
    const i = 300;
    const K = 0.3 / 0.7;
    const lot = r0.porePressurePa[i] + K * (r0.overburdenPa[i] - r0.porePressurePa[i]);
    const r = calibrateFracToLot(p, E.input, r0, [{ z: E.input.zBmlM[i], pMpa: lot / 1e6, kind: 'lot' }]);
    expect(r.text).toMatch(/beta 0\.000 with nu 0\.3/);
    expect(Object.is(r.params.beta, -0)).toBe(false);
  });
});
