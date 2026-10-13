// Pressures from shale samples (2026-10-13), gated on the Ekene kit's
// designed prognosis (ekene-demo-v4 05-pressure/ekene-1-designed-prognosis.csv),
// computed through the shipped path: the WDM LAS reader, prep, the NCT
// panel's auto picks and fit, and computePrognosis around the vendored engine.
// Fixture: tools/validation/porepressure/make-ekene1-fixture.mjs (every 4th
// sample of Ekene-1's DEPT, GR, RHOB, DT).
import fs from 'fs';
import path from 'path';
import { parseLas } from '../../WellDataManager/engine/lasParse';
import { normalizePpCurves, buildProfileInput } from '../services/prep';
import { autoShalePicks, fitSegments, DEFAULT_VSH_CUTOFF } from '../services/shalePicks';
import {
  computePrognosis, interpolateFromShale, runningMedian, shaleCutoffFor, prognosisModeText,
} from '../services/shalePressure';
import { computeProfile } from '../engine/profile';
import { preparePublishLogs } from '../services/publish';
import { inputNotes } from '../services/honesty';

const FIX = path.join(__dirname, 'fixtures');
const PSI = 6894.757293168;
const ppg = (pa, tvdM) => pa / PSI / (0.052 * (tvdM / 0.3048));

// Ekene-1, vertical: MD = TVD below RKB; mudline 60 m MD, water 35 m.
// VSH from GR on the kit's lines (clean 18, shale 125 API: the
// Petrophysics series' truth), read against the app's default VSH cutoff.
function ekene1() {
  const p = parseLas(fs.readFileSync(path.join(FIX, 'ekene-1-pp.las'), 'utf8'));
  const c = Object.fromEntries(p.curves.map((x) => [x.mnemonic.toUpperCase(), x]));
  const norm = normalizePpCurves({
    depth: c.DEPT.data, dt: c.DT.data, rho: c.RHOB.data,
    dtLog: { mnemonic: 'DT', unit: c.DT.unit }, rhoLog: { mnemonic: 'RHOB', unit: c.RHOB.unit },
  });
  const vsh = Array.from(c.GR.data, (g) => (Number.isFinite(g) ? Math.min(1, Math.max(0, (g - 18) / (125 - 18))) : NaN));
  const input = { ...buildProfileInput({ depth: norm.depth, dt: norm.dt, rho: norm.rho, shale: vsh }, norm.units, { mudlineMdM: 60 }), shaleKind: 'vsh' };
  // the NCT panel: one pick per 50 m in the normally pressured section (above 1,290 m MD)
  const picks = autoShalePicks(input, { trend: 'dt', cutoff: DEFAULT_VSH_CUTOFF, fromM: 100, toM: 1230, everyM: 50 });
  const fit = fitSegments(picks, { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, []);
  const params = {
    waterDepthM: 35, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 60,
    nct: fit.nct, method: 'eaton', eatonN: 3, nu: 0.3,
  };
  const truth = fs.readFileSync(path.join(FIX, 'ekene-1-designed-prognosis.csv'), 'utf8').trim().split('\n').slice(1)
    .map((l) => l.split(',').map(Number)).map((r) => ({ md: r[0], ppPpg: r[8] }));
  const at = (md) => { let b = 0; for (let i = 1; i < input.mdM.length; i++) if (Math.abs(input.mdM[i] - md) < Math.abs(input.mdM[b] - md)) b = i; return b; };
  return { input, params, truth, at, picks };
}

function score(E, r) {
  const errs = E.truth.map((t) => { const i = E.at(t.md); return { md: t.md, e: ppg(r.porePressurePa[i], E.input.mdM[i]) - t.ppPpg }; });
  const over = errs.filter((x) => x.md >= 1300);
  let minPpg = Infinity;
  for (let i = 0; i < E.input.mdM.length; i++) if (E.input.mdM[i] > 300) minPpg = Math.min(minPpg, ppg(r.porePressurePa[i], E.input.mdM[i]));
  const i1560 = E.at(1560);
  return {
    rms: Math.sqrt(errs.reduce((a, x) => a + x.e * x.e, 0) / errs.length),
    maxOver: Math.max(...over.map((x) => Math.abs(x.e))),
    minPpg,
    at1560: ppg(r.porePressurePa[i1560], E.input.mdM[i1560]),
  };
}

describe('Pressures from shale samples on Ekene-1 against the designed prognosis', () => {
  const E = ekene1();

  test('the NCT panel path picks shales and fits a trend in the normal section', () => {
    // the Benin sands leave few shales above the ramp: four windows carry one
    expect(E.picks.length).toBeGreaterThanOrEqual(3);
    expect(E.params.nct.cPerM).toBeGreaterThan(0);
  });

  test('negative control: every sample reads the sands, so the pore pressure spikes far below hydrostatic', () => {
    const r = computePrognosis(E.input, E.params);
    // option off: the engine result, untouched
    expect(r).toEqual(computeProfile({ ...E.input, params: E.params }));
    const s = score(E, r);
    expect(s.minPpg).toBeLessThan(0);
    expect(s.rms).toBeGreaterThan(5);
    expect(s.at1560).toBeLessThan(0); // the Ekene Sand oil leg is a sand
  });

  test('shale samples follow the designed prognosis: RMS 0.54 ppg, within 1.7 ppg through the overpressure, 12.78 ppg at 1,560 m', () => {
    const r = computePrognosis(E.input, { ...E.params, ppFromShale: true });
    expect(r.shaleMode).toMatchObject({ kind: 'vsh', cutoff: DEFAULT_VSH_CUTOFF, applied: true });
    const s = score(E, r);
    expect(s.rms).toBeLessThan(0.6);
    expect(s.maxOver).toBeLessThan(1.8);
    expect(s.minPpg).toBeGreaterThan(7.5);
    // episode 9: Eaton n 3 returns 12.02 ppg at the contact (1,560 m, 3,200 psia)
    expect(Math.abs(s.at1560 - 12.02)).toBeLessThan(0.8);
    expect(s.at1560).toBeCloseTo(12.78, 1);
  });

  test('overburden and hydrostatic keep every sample; fracture pressure follows the shale pore pressure', () => {
    const base = computeProfile({ ...E.input, params: E.params });
    const r = computePrognosis(E.input, { ...E.params, ppFromShale: true });
    expect(r.overburdenPa).toEqual(base.overburdenPa);
    expect(r.hydrostaticPa).toEqual(base.hydrostaticPa);
    const K = 0.3 / 0.7;
    const i = E.at(1700);
    expect(r.fracPressurePa[i]).toBeCloseTo(K * (r.overburdenPa[i] - r.porePressurePa[i]) + r.porePressurePa[i], 3);
  });

  test('the running median is recorded and does not change the overburden', () => {
    const r = computePrognosis(E.input, { ...E.params, ppFromShale: true, sonicMedianM: 15 });
    expect(r.sonicMedianM).toBe(15);
    expect(r.overburdenPa).toEqual(computeProfile({ ...E.input, params: E.params }).overburdenPa);
  });

  test('publish provenance and the notes line say which samples the pressures came from', () => {
    const r = computePrognosis(E.input, { ...E.params, ppFromShale: true });
    const logs = preparePublishLogs(E.input, r, { ...E.params, ppFromShale: true }, { projectId: 'p' });
    expect(logs[0].provenance.pressure_samples).toMatchObject({ mode: 'shale', indicator: 'vsh', cutoff: 0.6 });
    const notes = inputNotes({ input: E.input, result: r, params: { ...E.params, ppFromShale: true }, nctFitted: true });
    expect(notes.find((n) => n.key === 'pressures').text).toMatch(/^Pore pressure from \d+ shale samples \(VSH at or above 0\.60\), carried across the other \d+ samples by depth\.$/);
    const off = preparePublishLogs(E.input, computePrognosis(E.input, E.params), E.params, { projectId: 'p' });
    expect(off[0].provenance.pressure_samples).toEqual({ mode: 'every sample' });
  });
});

describe('shale pressure helpers', () => {
  test('interpolation by depth between shale samples, hydrostatic above the first, overpressure carried below the last', () => {
    const z = [0, 10, 20, 30, 40, 50];
    const ph = [0, 100, 200, 300, 400, 500];
    const pp = [999, 150, -50, 450, -80, 777];
    const sh = [false, true, false, true, false, false];
    expect(interpolateFromShale(z, pp, ph, sh)).toEqual([0, 150, 300, 450, 550, 650]);
    expect(interpolateFromShale(z, pp, ph, sh.map(() => false))).toBeNull();
  });

  test('running median over a depth window keeps gaps and steps', () => {
    const z = [0, 1, 2, 3, 4, 5, 6];
    expect(runningMedian(z, [1, 1, 9, 1, 1, null, 1], 2)).toEqual([1, 1, 1, 1, 1, null, 1]);
    expect(runningMedian(z, [1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  test('a cutoff typed for another indicator is not used', () => {
    const input = { shale: [0.1, 0.9], zBmlM: [0, 1] };
    expect(shaleCutoffFor({ shaleCutoff: 80, shaleCutoffKind: 'gr' }, input, 'vsh')).toBe(DEFAULT_VSH_CUTOFF);
    expect(shaleCutoffFor({ shaleCutoff: 0.5, shaleCutoffKind: 'vsh' }, input, 'vsh')).toBe(0.5);
  });

  test('without a shale curve the option says so and every sample is used', () => {
    expect(prognosisModeText({}, { ppFromShale: true })).toMatch(/needs a VSH or GR curve/);
    expect(prognosisModeText({}, {})).toBe('Pore pressure from every sample.');
  });
});
