// The interpreted line (2026-10-14): the design pore pressure drawn through
// the shale points as the running median of their overpressure, gated on the
// Ekene kit's designed prognosis (ekene-demo-v4 05-pressure) through the
// shipped path: the WDM LAS reader, prep, the NCT panel's auto picks and fit,
// and computePrognosis around the vendored engine. Shale indicator: GR, as on
// a well loaded from the kit LAS alone (picks at GR 60 API or more, one per
// 100 ft in the normal section; pressures at GR 82 API or more).
import fs from 'fs';
import path from 'path';
import { parseLas } from '../../WellDataManager/engine/lasParse';
import { normalizePpCurves, buildProfileInput } from '../services/prep';
import { autoShalePicks, fitSegments } from '../services/shalePicks';
import { computePrognosis, interpretedLine, interpolateFromShale, prognosisModeText } from '../services/shalePressure';
import { preparePublishLogs } from '../services/publish';
import { fracPressure, fracCoefficient } from '../engine/fracgrad';
import { DEFAULT_PARAMS } from '../components/PPWorkstation';

const FIX = path.join(__dirname, 'fixtures');
const PSI = 6894.757293168;
const ppg = (pa, tvdM) => pa / PSI / (0.052 * (tvdM / 0.3048));

function ekene1() {
  const p = parseLas(fs.readFileSync(path.join(FIX, 'ekene-1-pp.las'), 'utf8'));
  const c = Object.fromEntries(p.curves.map((x) => [x.mnemonic.toUpperCase(), x]));
  const norm = normalizePpCurves({
    depth: c.DEPT.data, dt: c.DT.data, rho: c.RHOB.data,
    dtLog: { mnemonic: 'DT', unit: c.DT.unit }, rhoLog: { mnemonic: 'RHOB', unit: c.RHOB.unit },
  });
  const input = { ...buildProfileInput({ depth: norm.depth, dt: norm.dt, rho: norm.rho, shale: Array.from(c.GR.data) }, norm.units, { mudlineMdM: 60 }), shaleKind: 'gr' };
  const picks = autoShalePicks(input, { trend: 'dt', cutoff: 60, fromM: 100, toM: 1230, everyM: 30.48 });
  const fit = fitSegments(picks, { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, []);
  const params = {
    waterDepthM: 35, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 60,
    nct: fit.nct, method: 'eaton', eatonN: 3, nu: 0.3, ppFromShale: true, shaleCutoff: 82, shaleCutoffKind: 'gr',
  };
  const truth = fs.readFileSync(path.join(FIX, 'ekene-1-designed-prognosis.csv'), 'utf8').trim().split('\n').slice(1)
    .map((l) => l.split(',').map(Number)).map((r) => ({ md: r[0], ppPpg: r[8] }));
  const at = (md) => { let b = 0; for (let i = 1; i < input.mdM.length; i++) if (Math.abs(input.mdM[i] - md) < Math.abs(input.mdM[b] - md)) b = i; return b; };
  return { input, params, truth, at };
}

function score(E, pp) {
  const errs = E.truth.map((t) => { const i = E.at(t.md); return { md: t.md, e: ppg(pp[i], E.input.mdM[i]) - t.ppPpg }; });
  const over = errs.filter((x) => x.md >= 1300);
  return {
    rms: Math.sqrt(errs.reduce((a, x) => a + x.e * x.e, 0) / errs.length),
    maxOver: Math.max(...over.map((x) => Math.abs(x.e))),
    at: (md) => ppg(pp[E.at(md)], E.input.mdM[E.at(md)]),
  };
}

describe('The interpreted line on Ekene-1 against the designed prognosis', () => {
  const E = ekene1();
  const raw = computePrognosis(E.input, E.params);
  const line = computePrognosis(E.input, { ...E.params, ppLineM: 30.48 });

  test('negative control: without the line the shale samples carry their spikes (the 2,000 m sand reads 1.9 ppg low)', () => {
    const s = score(E, raw.porePressurePa);
    expect(raw.shalePpPa).toBeUndefined();
    expect(raw.shaleMode.lineM).toBeUndefined();
    expect(s.rms).toBeGreaterThan(0.6);
    expect(s.maxOver).toBeGreaterThan(1.9);
    expect(13.66 - s.at(2000)).toBeGreaterThan(1.9);
  });

  test('the 100 ft line follows the designed prognosis closer: RMS 0.52 ppg, within 1.65 ppg through the overpressure', () => {
    const s0 = score(E, raw.porePressurePa);
    const s = score(E, line.porePressurePa);
    expect(s.rms).toBeLessThan(0.53);
    expect(s.rms).toBeLessThan(s0.rms - 0.09);
    expect(s.maxOver).toBeLessThan(1.65);
    expect(Math.abs(s.at(1560) - 12.02)).toBeLessThan(0.45); // the Ekene Sand, 3,200 psia at the contact
    expect(s.at(2000)).toBeGreaterThan(12.4);
  });

  test('a median over every sample (sands included) is worse: the shale-only window is what the line is for', () => {
    const isShale = E.input.shale.map(() => true);
    const smeared = interpretedLine(E.input.zBmlM, computePrognosis(E.input, { ...E.params, ppFromShale: false }).porePressurePa, raw.hydrostaticPa, isShale, 30.48);
    expect(score(E, smeared).rms).toBeGreaterThan(score(E, line.porePressurePa).rms + 1);
  });

  test('the line keeps overburden and hydrostatic, the fracture pressure follows it, the shale points stay on the result', () => {
    expect(line.overburdenPa).toEqual(raw.overburdenPa);
    expect(line.hydrostaticPa).toEqual(raw.hydrostaticPa);
    const K = fracCoefficient(E.params);
    line.porePressurePa.forEach((v, i) => expect(line.fracPressurePa[i]).toBe(fracPressure(line.overburdenPa[i], v, K)));
    const nPts = line.shalePpPa.filter((v) => v != null).length;
    expect(nPts).toBe(line.shaleMode.nShale);
    expect(line.shaleMode.lineM).toBe(30.48);
  });

  test('provenance, notes and the new-project default say it', () => {
    const logs = preparePublishLogs(E.input, line, { ...E.params, ppLineM: 30.48 }, { projectId: 'p1', inputLogIds: [] });
    expect(logs[0].provenance.pp_line_m).toBe(30.48);
    expect(prognosisModeText(line, E.params, { fmtZ: (m) => `${Math.round(m / 0.3048)} ft` })).toMatch(/interpreted line through them: the median over 100 ft/);
    expect(DEFAULT_PARAMS.ppLineM).toBeCloseTo(30.48, 9);
  });
});

describe('interpretedLine helpers', () => {
  const z = Array.from({ length: 41 }, (_, i) => i * 10);
  const ph = z.map((d) => 10000 * d);
  test('a constant overpressure comes back exactly, whatever the window', () => {
    const pp = ph.map((v) => v + 5e5);
    const shale = z.map((_, i) => i % 3 === 0);
    for (const w of [5, 30, 100]) {
      const out = interpretedLine(z, pp, ph, shale, w);
      out.forEach((v, i) => expect(v - ph[i]).toBeCloseTo(5e5, 6));
    }
  });
  test('a window shorter than the shale spacing is the plain carried pressure', () => {
    const pp = ph.map((v, i) => v + (i % 7) * 1e5);
    const shale = z.map((_, i) => i % 4 === 0);
    expect(interpretedLine(z, pp, ph, shale, 5)).toEqual(interpolateFromShale(z, pp, ph, shale));
  });
  test('one spiked shale sample among steady ones is removed', () => {
    const pp = ph.map((v) => v + 1e6);
    pp[20] = ph[20] - 3e6; // a sand read as shale
    const shale = z.map(() => true);
    const out = interpretedLine(z, pp, ph, shale, 50);
    expect(out[20] - ph[20]).toBeCloseTo(1e6, 6);
  });
  test('no shale sample, no line', () => {
    expect(interpretedLine(z, ph, ph, z.map(() => false), 30)).toBeNull();
  });
});
