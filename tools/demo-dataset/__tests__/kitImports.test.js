/**
 * The generated kit through the applications' OWN importers.
 *
 * demoDataset.test.js proves the numbers; this proves the files: each kit
 * file an episode note tells a presenter to load is parsed by the parser the
 * app itself uses, and gives the answer the note promises. It reads the
 * generated kit, so run the generator first:
 *
 *   npx tsx tools/demo-dataset/generate.mjs && npx jest tools/demo-dataset
 *
 * Material Balance Studio's importer lives inside its React component and
 * is not importable here; its answer (12,139,208 stb) is the material
 * balance gate in demoDataset.test.js, on the same tank history.
 */
import fs from 'fs';
import path from 'path';
import {
  parseCSV, detectColumns, mapColumns, validateData,
} from '../../../src/utils/declineCurve/csvParser';
import { parseVrrWellCSV } from '../../../src/utils/vrr/csvImport';
import { analyzeLedger } from '../../../packages/engines/engines/waterflood/vrrLedger';
import { parseWaterfloodCSV } from '../../../src/utils/waterfloodCalculations';
import { analyzeWaterflood } from '../../../packages/engines/engines/waterflood/waterflood';
import {
  parseKrCsv, parsePcCsv, fitCoreyToKrTable, computeJTable,
} from '../../../packages/engines/engines/scal/scal';

const KIT = path.join(__dirname, '..', '..', '..', 'dist-demo', 'ekene-demo-v1');
const read = (rel) => {
  const p = path.join(KIT, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`${rel} is missing: run npx tsx tools/demo-dataset/generate.mjs first.`);
  }
  return fs.readFileSync(p, 'utf8');
};
const DYN = path.join(__dirname, '..', '..', '..', 'packages', 'engines', 'test-data', 'ekene-dynamic');
const WF = JSON.parse(fs.readFileSync(path.join(DYN, 'waterflood.json'), 'utf8'));
const FIELD_FVF = { Bo: WF.fvf.Bo, Bw: WF.fvf.Bw, Bg: WF.fvf.Bg, Rs: WF.fvf.Rs };

describe('Episode 11: Decline Curve Analysis takes each producer file as it stands', () => {
  test.each([['Ekene-1', 72], ['Ekene-3', 70], ['Ekene-5', 67], ['Ekene-6', 64]])('%s: all three streams, %i months, no errors', async (well, n) => {
    const { headers, rows, errors } = await parseCSV(read(`08-production/decline/${well}.csv`));
    expect(errors).toHaveLength(0);
    const map = detectColumns(headers);
    const data = mapColumns(rows, map);
    const v = validateData(data);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    expect(data).toHaveLength(n);
    const detected = JSON.stringify(map);
    for (const col of ['oil_rate_bopd', 'water_rate_bwpd', 'gas_rate_mscfd']) expect(detected).toContain(col);
  });
});

describe('Episode 13: the VRR Monitor, with the field formation volume factors', () => {
  const { rows } = parseVrrWellCSV(read('08-production/ekene-vrr-ledger.csv'));

  test('36 months; 0.85 in the first month, 1.05 at the end, cumulative 1.035 (the fixture)', () => {
    expect(rows).toHaveLength(36);
    const { series } = analyzeLedger(rows, FIELD_FVF);
    expect(series[0].instantaneousVRR).toBeCloseTo(0.85, 6);
    expect(series.find((s) => s.label === '2023-06').instantaneousVRR).toBeCloseTo(1.05, 6);
    expect(series.at(-1).instantaneousVRR).toBeCloseTo(1.05, 6);
    expect(series.at(-1).cumulativeVRR).toBeCloseTo(WF.expected.cumulative_vrr, 6);
  });

  test('negative control: the app defaults (a different oil) read 0.827 in the first month', () => {
    const { series } = analyzeLedger(rows, { Bo: 1.25, Bw: 1.02, Bg: 0.9, Rs: 550 });
    expect(series[0].instantaneousVRR).toBeCloseTo(0.827, 3);
  });
});

describe('Episode 14: Waterflood Design Studio Surveillance', () => {
  const rows = parseWaterfloodCSV(read('08-production/ekene-waterflood-surveillance.csv'));
  const field = { bo: FIELD_FVF.Bo, bw: FIELD_FVF.Bw, bg: FIELD_FVF.Bg, rs: FIELD_FVF.Rs };

  test('two injectors and four producers; with the field FVFs VRR averages 1.035 and water cut 3.53 percent', () => {
    const r = analyzeWaterflood(rows, field);
    expect(r.wells.injectors).toEqual(['Ekene-2', 'Ekene-4']);
    expect(r.wells.producers).toEqual(['Ekene-1', 'Ekene-3', 'Ekene-5', 'Ekene-6']);
    // the kit writes rates to 6 decimals, so agreement is to that precision
    expect(r.kpis.vrr_avg).toBeCloseTo(WF.expected.surveillance.cumulative_vrr_rows_as_days, 6);
    expect(r.kpis.avg_water_cut_pct).toBeCloseTo(WF.expected.surveillance.kpis.avg_water_cut_pct, 6);
    expect(r.data_quality.issues).toHaveLength(0);
    // wellhead pressure on both injectors, so the Hall plot has something to draw
    expect(r.hall_plots.map((h) => h.injector).sort()).toEqual(['Ekene-2', 'Ekene-4']);
  });

  test('the tab defaults (Bo 1.25, Bw 1.02, Bg 0.9, Rs 500) read a different VRR, which the note warns about', () => {
    const d = analyzeWaterflood(rows, { bo: 1.25, bw: 1.02, bg: 0.9, rs: 500 });
    console.log(`surveillance VRR with the tab defaults: ${d.kpis.vrr_avg.toFixed(3)}`);
    expect(Math.abs(d.kpis.vrr_avg - WF.expected.surveillance.cumulative_vrr_rows_as_days)).toBeGreaterThan(0.01);
  });

  test('negative control: the monthly production file is not in the tab\'s format and reads as nothing', () => {
    const r = analyzeWaterflood(parseWaterfloodCSV(read('08-production/ekene-production-monthly.csv')), field);
    expect(r.wells.injectors).toHaveLength(0);
    expect(r.wells.producers).toHaveLength(0);
  });
});

describe('Episode 15: SCAL Studio', () => {
  test('the relative permeability table fits back to the locked Corey set', () => {
    const kr = parseKrCsv(read('09-reservoir/ekene-relative-permeability.csv'));
    expect(kr.errors ?? []).toHaveLength(0);
    expect(kr.rows).toHaveLength(41);
    const fit = fitCoreyToKrTable(kr.rows);
    expect(fit.ok).toBe(true);
    expect(fit.params.Swc).toBeCloseTo(0.35, 6);
    expect(fit.params.Sor).toBeCloseTo(0.25, 6);
    expect(fit.params.nw).toBeCloseTo(2.5, 4);
    expect(fit.params.no).toBeCloseTo(2.0, 4);
  });

  const props = Object.fromEntries(read('09-reservoir/capillary/plug-properties.csv').trim().split('\n').slice(1)
    .map((l) => l.split(',')).map(([plug, , , k, phi, sigma, theta]) => [plug, {
      k_md: Number(k), phi: Number(phi), sigma_dyncm: Number(sigma), thetaDeg: Number(theta),
    }]));

  test('with the plug properties from the kit, all three plugs fall on one J curve', () => {
    const js = ['EK1-P', 'EK3-P', 'EK5-P'].map((p) => {
      const pc = parsePcCsv(read(`09-reservoir/capillary/${p}.csv`));
      expect(pc.rows).toHaveLength(15);
      return computeJTable(pc.rows, props[p]).rows.map((r) => r.J);
    });
    for (let i = 0; i < js[0].length; i++) {
      expect(js[1][i]).toBeCloseTo(js[0][i], 6);
      expect(js[2][i]).toBeCloseTo(js[0][i], 6);
    }
  });

  test('negative control: EK5 on the oil-brine preset (30 dyn/cm) does not collapse', () => {
    const pc = parsePcCsv(read('09-reservoir/capillary/EK5-P.csv'));
    const right = computeJTable(pc.rows, props['EK5-P']).rows[0].J;
    const preset = computeJTable(pc.rows, { ...props['EK5-P'], sigma_dyncm: 30 }).rows[0].J;
    expect(preset / right).toBeCloseTo(48 / 30, 6);
  });
});
