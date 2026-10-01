/**
 * Pore Pressure Studio upgrade U1 (docs/upgrade/PorePressureStudio-UPGRADE.md).
 * Every test calls the shipped functions; the numeric doors were run
 * against the files before the fix first (negative controls in the doc).
 */

import fs from 'fs';
import path from 'path';
import {
  buildProfileInput, normalizePpCurves, wellDepthFrame, DT_US_PER_FT_MEDIAN_MAX,
} from '../services/prep';
import { computeProfile } from '../engine/profile';
import {
  preparePublishLogs, publishBlocker, mdGrid, PIPELINE_VERSION, PIPELINE_MAJOR,
} from '../services/publish';
import { inputNotes, calibrationMisfit, trendDepthM } from '../services/honesty';
import { thinIndices, MAX_ROWS } from '../services/thin';
import { makeInMemoryBackend, MUDLINE_MD_M } from '../services/inMemoryBackend';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure');
const W = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8')).well;
const P = W.params;
const PARAMS = {
  waterDepthM: P.water_depth_m,
  rhoSeawaterKgM3: P.rho_seawater,
  rhoFluidKgM3: P.rho_fluid,
  mudlineMdM: 0,
  nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m },
  method: 'eaton',
  eatonN: P.eaton_n,
  nu: P.nu,
};
const at = (log, md) => log.data[Math.round((md - log.startMdM) / log.stepM)];

describe('PP-U1-001 publish puts every value at its own MD', () => {
  test('a 200 m sonic gap leaves a gap; values below it stay at their depth', () => {
    const depth = W.z_bml_m.slice();
    const dt = W.dt_us_per_m.slice();
    for (let i = 100; i < 120; i++) dt[i] = NaN; // 1000 to 1190 m
    const input = buildProfileInput({ depth, dt, rho: W.rho_kg_m3 }, { DT: 'US/M', RHOB: 'KG/M3' }, {});
    const r = computeProfile({ ...input, params: PARAMS });
    const [pp, fp, obg] = preparePublishLogs(input, r, PARAMS, { projectId: 'p' });
    expect(pp.nSamples).toBe(401);
    expect(pp.nullCount).toBe(20);
    expect(Number.isNaN(at(pp, 1100))).toBe(true);
    for (const md of [500, 2000, 3500, 4000]) {
      const i = input.zBmlM.indexOf(md);
      expect(at(pp, md)).toBeCloseTo(r.porePressurePa[i] / 1e6, 4); // f32
      expect(at(fp, md)).toBeCloseTo(r.fracPressurePa[i] / 1e6, 4);
      expect(at(obg, md)).toBeCloseTo(r.overburdenPa[i] / 1e6, 4);
    }
    // negative control: the old writer placed the 3,700 m value at 3,500 m (2.8 MPa high)
    expect(Math.abs(at(pp, 3500) - W.pore_pressure_pa[370] / 1e6)).toBeGreaterThan(2);
  });

  test('the grid helper keeps a regular log exact and the pipeline is pp-1.1.0', () => {
    const g = mdGrid([130, 140, 150, 170, 180]);
    expect(g.stepM).toBe(10);
    expect(g.index).toEqual([0, 1, 2, -1, 3, 4]);
    expect(PIPELINE_VERSION).toBe('pp-1.1.0');
    expect(PIPELINE_MAJOR.test('pp-1.0.0')).toBe(true);
  });
});

describe('PP-U1-002 a deviated well is computed at TVD', () => {
  // vertical to 1000 m, built to 45 degrees by 1500 m, held to TD
  const well = {
    kb_m: 30,
    deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 1500, inc: 45, azi: 90 }, { md: 6000, inc: 45, azi: 90 }],
  };
  const frame = wellDepthFrame(well);
  const md = []; for (let m = 0; m <= 5500; m += 10) md.push(m);
  const tvd = md.map((m) => frame.mdToPosition(m).tvd);
  const zmax = W.z_bml_m[W.z_bml_m.length - 1];
  const lerp = (xs, ys, x) => { const k = Math.min(xs.length - 2, Math.floor(x / 10)); const f = (x - xs[k]) / (xs[k + 1] - xs[k]); return ys[k] + f * (ys[k + 1] - ys[k]); };
  const dtAt = (z) => lerp(W.z_bml_m, W.dt_us_per_m, Math.min(z, zmax));

  test('PP at an MD equals the vertical twin at that TVD', () => {
    const dev = buildProfileInput({ depth: md, dt: tvd.map(dtAt), rho: null }, { DT: 'US/M' }, { frame });
    expect(dev.tvdFrom).toBe('survey');
    const twin = buildProfileInput({ depth: tvd, dt: tvd.map(dtAt), rho: null }, { DT: 'US/M' }, {});
    const rd = computeProfile({ ...dev, params: PARAMS });
    const rt = computeProfile({ ...twin, params: PARAMS });
    const k = dev.mdM.indexOf(5000);
    expect(dev.zBmlM[k]).toBeCloseTo(tvd[500], 9);
    expect(rd.porePressurePa[k]).toBeCloseTo(rt.porePressurePa[k], 3);
    // negative control: computing at MD (the old door) is far off at 5,000 m MD
    const asMd = computeProfile({ ...buildProfileInput({ depth: md, dt: tvd.map(dtAt), rho: null }, { DT: 'US/M' }, {}), params: PARAMS });
    expect(asMd.porePressurePa[k] / rd.porePressurePa[k]).toBeGreaterThan(1.2);
  });

  test('no survey means vertical; a hole turning up is dropped and counted', () => {
    expect(wellDepthFrame({ deviation: [] })).toBeNull();
    const up = buildProfileInput({ depth: [0, 10, 20, 30], dt: [600, 590, 580, 570] }, { DT: 'US/M' },
      { frame: { isVertical: false, mdToPosition: (m) => ({ tvd: m === 30 ? 15 : m }) } });
    expect(up.zBmlM).toEqual([0, 10, 20]);
    expect(up.dropped.upturn).toBe(1);
  });
});

describe('PP-U1-003 the mudline datum gates publish', () => {
  test('an offshore well with the mudline MD unset is refused with the reason', () => {
    expect(publishBlocker({ waterDepthM: 100, mudlineMdM: 0 })).toMatch(/Set the mudline MD/);
    expect(publishBlocker({ waterDepthM: 100, mudlineMdM: 130 })).toBeNull();
    expect(publishBlocker({ waterDepthM: 0, mudlineMdM: 0 })).toBeNull();
    expect(publishBlocker({ waterDepthM: 100, mudlineMdM: 130 }, { source: 'seismic' })).toMatch(/velocity trend/);
  });

  test('the harness well is MD below RKB and publishes at its true MD', async () => {
    const backend = makeInMemoryBackend();
    const project = await backend.loadProject();
    expect(project.params.mudlineMdM).toBe(MUDLINE_MD_M);
    const [well] = await backend.listWells();
    const logs = await backend.listLogs(well.id);
    const get = async (m) => Array.from(await backend.downloadCurve(logs.find((l) => l.mnemonic === m)));
    const input = buildProfileInput({ depth: await get('DEPT'), dt: await get('DT'), rho: await get('RHOB') },
      { DT: 'US/M', RHOB: 'G/C3' }, { mudlineMdM: project.params.mudlineMdM });
    const r = computeProfile({ ...input, params: project.params });
    const [pp] = preparePublishLogs(input, r, project.params, { projectId: 'p' });
    expect(pp.startMdM).toBe(MUDLINE_MD_M);
    expect(at(pp, 3500 + MUDLINE_MD_M)).toBeCloseTo(W.pore_pressure_pa[350] / 1e6, 4);
  });
});

describe('PP-U1-004 hostile curves are read for what they are', () => {
  test('RHOB in kg/m3 with no unit is not multiplied by 1000 again', () => {
    const n = normalizePpCurves({ depth: [0, 10, 20], dt: [600, 590, 580], rho: [2400, 2410, 2420], dtLog: { mnemonic: 'DT', unit: 'US/M' }, rhoLog: { mnemonic: 'RHOB', unit: '' } });
    const input = buildProfileInput(n, n.units, {});
    expect(input.rhoKgM3[0]).toBeCloseTo(2400, 6);
    expect(n.notes.join(' ')).toMatch(/kg\/m3/);
    // negative control: the old door read the raw values as g/cc
    expect(buildProfileInput({ depth: [0], dt: [600], rho: [2400] }, { DT: 'US/M', RHOB: '' }, {}).rhoKgM3[0]).toBe(2400000);
  });

  test('vendor nulls (-999) are gaps, not data that throws the well', () => {
    const dt = W.dt_us_per_m.slice(); dt[50] = -999;
    const rho = W.rho_kg_m3.map((v) => v / 1000); rho[60] = -999.25;
    const n = normalizePpCurves({ depth: W.z_bml_m, dt, rho, dtLog: { mnemonic: 'DT', unit: 'US/M' }, rhoLog: { mnemonic: 'RHOB', unit: 'G/C3' } });
    const input = buildProfileInput(n, n.units, {});
    expect(input.zBmlM.length).toBe(400);
    const r = computeProfile({ ...input, params: PARAMS });
    expect(r.rhoSource.filter((s) => s === 'gardner').length).toBe(1);
    expect(() => computeProfile({ ...buildProfileInput({ depth: W.z_bml_m, dt, rho }, { DT: 'US/M', RHOB: 'G/C3' }, {}), params: PARAMS })).toThrow();
  });

  test('a sonic in us/ft under an unknown spelling converts and says so', () => {
    const usft = W.dt_us_per_m.map((v) => v * 0.3048);
    const n = normalizePpCurves({ depth: W.z_bml_m, dt: usft, dtLog: { mnemonic: 'DT', unit: 'USPF' } });
    expect(n.dt[200]).toBeCloseTo(W.dt_us_per_m[200], 6);
    expect(n.notes.join(' ')).toMatch(/only us\/ft can mean/);
    const asM = normalizePpCurves({ depth: [0, 1], dt: [DT_US_PER_FT_MEDIAN_MAX + 200, DT_US_PER_FT_MEDIAN_MAX + 210], dtLog: { mnemonic: 'DT', unit: '' } });
    expect(asM.dt[0]).toBe(DT_US_PER_FT_MEDIAN_MAX + 200);
    expect(asM.notes.join(' ')).toMatch(/read as us\/m/);
  });
});

describe('PL4 notes say what the prognosis rests on', () => {
  const input = buildProfileInput({ depth: W.z_bml_m, dt: W.dt_us_per_m, rho: W.rho_kg_m3.map((v, i) => (i % 2 ? null : v)) }, { DT: 'US/M', RHOB: 'KG/M3' }, {});
  const result = computeProfile({ ...input, params: PARAMS });

  test('datum, density, NCT and calibration', () => {
    const notes = inputNotes({ input, result, params: PARAMS, nctFitted: false, calibration: [] });
    const keys = notes.map((n) => n.key);
    expect(keys).toEqual(['datum', 'density', 'nct', 'calibration']);
    expect(notes.find((n) => n.key === 'density').text).toMatch(/density log on 50%/);
    expect(notes.find((n) => n.key === 'calibration').text).toMatch(/Not calibrated/);
    const fitted = inputNotes({ input, result, params: { ...PARAMS, mudlineMdM: 130 }, nctFitted: true, calibration: [{ z: 3500, pMpa: result.porePressurePa[350] / 1e6 + 1 }] });
    expect(fitted.map((n) => n.key)).toEqual(['density', 'calibration']);
    expect(fitted[1].text).toMatch(/misfit RMS 1\.00 MPa.*extrapolated beyond the deepest point/);
  });

  test('misfit uses the nearest sample and names points outside', () => {
    const m = calibrationMisfit([{ z: 2000, pMpa: 21 }, { z: 9000, pMpa: 90 }], input.zBmlM, result.porePressurePa);
    expect(m.points[0].inRange).toBe(true);
    expect(m.points[0].residualMpa).toBeCloseTo(21 - result.porePressurePa[200] / 1e6, 9);
    expect(m.points[1].inRange).toBe(false);
  });
});

describe('PL10 long wells', () => {
  test('plots thin to MAX_ROWS rows and keep the last sample', () => {
    const idx = thinIndices(40000);
    expect(idx.length).toBeLessThanOrEqual(MAX_ROWS + 1);
    expect(idx[idx.length - 1]).toBe(39999);
    expect(thinIndices(10)).toHaveLength(10);
  });

  test('a 40,000-sample well computes in well under a second', () => {
    const n = 40000; const depth = []; const dt = [];
    for (let i = 0; i < n; i++) { depth.push(i * 0.1524); dt.push(600 - 0.04 * i * 0.1524 > 250 ? 600 - 0.04 * i * 0.1524 : 250); }
    const t0 = Date.now();
    const input = buildProfileInput({ depth, dt, rho: null }, { DT: 'US/M' }, {});
    computeProfile({ ...input, params: PARAMS });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test('a velocity trend runs to the well TD, not a fixed 4,000 m', () => {
    expect(trendDepthM(5630, { mudlineMdM: 130 })).toBe(5500);
    expect(trendDepthM(null, {})).toBe(6000);
  });
});
