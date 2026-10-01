/**
 * PP-U1-005 / 009: the Pore Pressure -> Well Design handoff. The mud window
 * reads every PPFG curve by its declared unit (MPa, kPa, psi, or a mud
 * weight / gradient converted at the trajectory TVD below the rotary
 * table), and a prognosis published by Pore Pressure Studio reads back in
 * Well Design at the pressure and EMW Pore Pressure itself shows.
 */
import fs from 'fs';
import path from 'path';
import {
  pickPpfgLogs, readyCurve, buildMudWindow, sampleCurve,
} from '../services/ppfg';
import { ppfgUnit } from '@/lib/ppfgUnits';
import { buildProfileInput } from '../../PorePressureStudio/services/prep';
import { computeProfile } from '../../PorePressureStudio/engine/profile';
import { preparePublishLogs } from '../../PorePressureStudio/services/publish';
import { emwPpg, emwReferenceDepthM, PPG_PER_SG } from '../../PorePressureStudio/services/units';

const G = 9.80665;
const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure', 'goldens.json'), 'utf8')).well;
const P = W.params;
const MUDLINE = 130; // air gap 30 + water 100
const PARAMS = {
  waterDepthM: P.water_depth_m, rhoSeawaterKgM3: P.rho_seawater, rhoFluidKgM3: P.rho_fluid, mudlineMdM: MUDLINE,
  nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m }, method: 'eaton', eatonN: P.eaton_n, nu: P.nu,
};
const VERTICAL = [{ md: 0, inc: 0, azi: 0 }, { md: 2000, inc: 0, azi: 0 }, { md: 4200, inc: 0, azi: 0 }];

// the publish rows as the registry stores them (geo_wells_logs shape)
function published() {
  const md = W.z_bml_m.map((z) => z + MUDLINE);
  const input = buildProfileInput({ depth: md, dt: W.dt_us_per_m, rho: W.rho_kg_m3 }, { DT: 'US/M', RHOB: 'KG/M3' }, { mudlineMdM: MUDLINE });
  const r = computeProfile({ ...input, params: PARAMS });
  const logs = preparePublishLogs(input, r, PARAMS, { projectId: 'p' }).map((l) => ({
    log: { mnemonic: l.mnemonic, unit: l.unit, start_md_m: l.startMdM, step_m: l.stepM, n_samples: l.nSamples, provenance: l.provenance }, data: l.data,
  }));
  return { input, r, logs };
}

test('a Pore Pressure Studio publish reads back in Well Design at the same pressure and EMW', () => {
  const { input, r, logs } = published();
  const curves = Object.fromEntries(logs.map(({ log, data }) => [log.mnemonic, readyCurve(log, data)]));
  const rows = buildMudWindow(curves, VERTICAL, { kbElevM: 30, stepM: 10 });
  const row = rows.find((x) => x.md === 3500 + MUDLINE);
  const i = input.zBmlM.indexOf(3500);
  const pa = r.porePressurePa[i];
  expect(row.ppMpa).toBeCloseTo(pa / 1e6, 4);
  // Well Design's EMW is P / (g TVD below KB); Pore Pressure's reference depth is the same depth
  const ref = emwReferenceDepthM(3500, PARAMS);
  expect(row.tvd).toBeCloseTo(ref, 9);
  expect(row.ppEmw).toBeCloseTo(pa / (G * ref) / 1000, 4);
  // and the two apps' ppg agree within the 0.052 rule of thumb Pore Pressure prints (0.1%)
  expect(Math.abs(row.ppPpg / emwPpg(pa, ref) - 1)).toBeLessThan(0.002);
  expect(Math.abs(row.ppEmw / (emwPpg(pa, ref) / PPG_PER_SG) - 1)).toBeLessThan(0.002);
});

test('a ppg EMW curve (a Drillworks LAS) gives the same window as its MPa twin', () => {
  const { logs } = published();
  const mpa = Object.fromEntries(logs.map(({ log, data }) => [log.mnemonic, readyCurve(log, data)]));
  // the same prognosis expressed as EMW ppg against MD below RKB (vertical: TVD = MD)
  const ppgLogs = logs.map(({ log, data }) => {
    const md = (k) => log.start_md_m + k * log.step_m;
    return { log: { ...log, unit: 'PPG', provenance: {} }, data: Float32Array.from(data, (v, k) => (v * 1e6) / (G * md(k)) / 119.82642731689663) };
  });
  const skipped = [];
  const picked = pickPpfgLogs(ppgLogs.map((x) => x.log), skipped);
  expect(Object.keys(picked).sort()).toEqual(['FP', 'OBG', 'PP']); // negative control: the old reader kept only MPA
  expect(skipped).toEqual([]);
  const emw = Object.fromEntries(ppgLogs.map(({ log, data }) => [log.mnemonic, readyCurve(log, data)]));
  const a = buildMudWindow(mpa, VERTICAL, { kbElevM: 30, stepM: 50 });
  const b = buildMudWindow(emw, VERTICAL, { kbElevM: 30, stepM: 50 });
  expect(b.length).toBe(a.length);
  a.forEach((row, k) => {
    expect(b[k].ppMpa).toBeCloseTo(row.ppMpa, 3);
    expect(b[k].fpPpg).toBeCloseTo(row.fpPpg, 3);
  });
});

test('units: pressures, mud weights and gradients convert; others are refused', () => {
  expect(ppfgUnit('psi').toMpa(1000)).toBeCloseTo(6.894757, 6);
  expect(ppfgUnit('kPa').toMpa(30000)).toBeCloseTo(30, 9);
  expect(ppfgUnit('bar').toMpa(300)).toBeCloseTo(30, 9);
  expect(ppfgUnit('SG').toMpa(1.2, 3000)).toBeCloseTo((1200 * G * 3000) / 1e6, 9);
  expect(ppfgUnit('psi/ft').toMpa(0.465, 3048)).toBeCloseTo((0.465 * 10000 * 6894.757293168361) / 1e6, 6);
  expect(ppfgUnit('API')).toBeNull();
  expect(ppfgUnit('')).toBeNull();
  expect(ppfgUnit('MPA').needsTvd).toBe(false);
  expect(sampleCurve([0, 10], [1, NaN], 5)).toBeNull();
});
