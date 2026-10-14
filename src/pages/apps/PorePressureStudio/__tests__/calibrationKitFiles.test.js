// The calibration door reads the Ekene kit's own pressure files
// (ekene-demo-v4 05-pressure, copied to fixtures/calibration-kit) with no
// choices left to make (2026-10-14): snake_case headers with the unit as the
// last word, a file that names two wells, mud weights held over intervals
// with an outcome column, and the mud weights checked against the prognosis.
import fs from 'fs';
import path from 'path';
import {
  parseCalibrationTable, convertCalibration, missingChoices, guessWell, headerWords, unitFromHeader,
  mudWeightOutcome, outcomeDepth, comparesTo, sheetToText,
} from '../services/calibrationImport';
import { mudWeightEvidence } from '../services/mudWeightEvidence';
import { previewText } from '../components/CalibrationImport';
import { parseLas } from '../../WellDataManager/engine/lasParse';
import { normalizePpCurves, buildProfileInput } from '../services/prep';
import { autoShalePicks, fitSegments } from '../services/shalePicks';
import { computePrognosis } from '../services/shalePressure';

const KIT = path.join(__dirname, 'fixtures', 'calibration-kit');
const read = (f) => parseCalibrationTable(fs.readFileSync(path.join(KIT, f), 'utf8'));
// Ekene-1: vertical, KB 25 m above sea level, mudline 60 m MD, 35 m of water
const CTX = { frame: null, kbM: 25, mudlineMdM: 60, waterDepthM: 35, wellName: 'PPS demo: Ekene-1' };
const PSI = 6894.757293168;

function importKit(f) {
  const t = read(f);
  const mapping = { ...t.guess, well: t.guess.wellCol != null ? guessWell(t.wells, CTX.wellName) : null };
  return { t, mapping, missing: missingChoices(mapping, CTX), ...convertCalibration(t, mapping, { ...CTX, source: f }) };
}

describe('header words: snake_case and a trailing unit', () => {
  test('the kit headers', () => {
    expect(headerWords('md_m')).toEqual({ name: 'md', unit: 'm' });
    expect(headerWords('shoe_md_m')).toEqual({ name: 'shoe md', unit: 'm' });
    expect(headerWords('pressure_psia')).toEqual({ name: 'pressure', unit: 'psia' });
    expect(headerWords('mud_weight_ppg')).toEqual({ name: 'mud weight', unit: 'ppg' });
    expect(headerWords('gradient_psi_per_ft')).toEqual({ name: 'gradient', unit: 'psi/ft' });
    expect(headerWords('test_type')).toEqual({ name: 'test type', unit: null });
    expect(unitFromHeader('Formation pressure (psi)')).toBe('psi');
    expect(unitFromHeader('emw_ppg')).toBe('ppg');
  });

  test('negative control: the header pattern before this change finds no depth in md_m or shoe_md_m', () => {
    const OLD = /^(depth|dept|md|tvd|tvdss|tvd ?ss|z|measured depth|true vertical depth)\b/i;
    expect(OLD.test('md_m')).toBe(false);
    expect(OLD.test('shoe_md_m')).toBe(false);
    expect(OLD.test('from_md_m')).toBe(false);
  });
});

describe('ekene-mdt-pressures.csv: two wells, MD in m, psia', () => {
  const r = importKit('ekene-mdt-pressures.csv');
  test('every choice is guessed, the rows of the open well are chosen', () => {
    expect(r.t.wells).toEqual(['Ekene-1', 'Ekene-3']);
    expect(r.mapping).toMatchObject({ depthRef: 'md', depthUnit: 'm', valueUnit: 'psia', kind: 'rft', well: 'Ekene-1' });
    expect(r.t.columns[r.mapping.depthCol]).toBe('md_m');
    expect(r.t.columns[r.mapping.valueCol]).toBe('pressure_psia');
    expect(r.t.columns[r.mapping.kindCol]).toBe('test_type');
    expect(r.missing).toEqual([]);
  });
  test('eight Ekene-1 pretests read; the four Ekene-3 rows are skipped with the reason', () => {
    expect(r.points).toHaveLength(8);
    expect(r.points.every((p) => p.kind === 'rft' && comparesTo(p) === 'pp')).toBe(true);
    expect(r.points[0].z).toBeCloseTo(1549 - 60, 9);
    expect(r.points[0].pMpa).toBeCloseTo((3187.9 - 14.695948775513449) * PSI / 1e6, 9); // psia to gauge
    expect(r.skipped.map((s) => s.reason)).toEqual(Array(4).fill('another well (Ekene-3)'));
  });
  test('a file naming several wells asks whose rows when the open well is none of them', () => {
    const t = read('ekene-mdt-pressures.csv');
    expect(guessWell(t.wells, 'Ekene-8')).toBeNull();
    expect(missingChoices({ ...t.guess, well: null }, CTX)).toContain('choose whose rows to import (the file names more than one well)');
    // every well in the file, on request
    expect(convertCalibration(t, { ...t.guess, well: '*' }, CTX).points).toHaveLength(12);
  });
  test('the longest whole-name match: Ekene-10 never takes Ekene-1, Ekene-12 never takes Ekene-1', () => {
    expect(guessWell(['Ekene-1', 'Ekene-10'], 'PPS demo: Ekene-10')).toBe('Ekene-10');
    expect(guessWell(['Ekene-1', 'Ekene-3'], 'Ekene-12')).toBeNull();
    expect(guessWell(['Ekene-1', 'Ekene-3'], 'ekene-1')).toBe('Ekene-1');
  });
});

describe('ekene-lot-fit.csv: shoe MD, the type column, EMW in ppg', () => {
  const r = importKit('ekene-lot-fit.csv');
  test('guessed and read: one FIT, two LOTs, MD before TVD', () => {
    expect(r.t.columns[r.mapping.depthCol]).toBe('shoe_md_m');
    expect(r.t.columns[r.mapping.valueCol]).toBe('emw_ppg');
    expect(r.mapping).toMatchObject({ depthRef: 'md', depthUnit: 'm', valueUnit: 'ppg' });
    expect(r.missing).toEqual([]);
    expect(r.points.map((p) => p.kind)).toEqual(['fit', 'lot', 'lot']);
    // 13.74 ppg at 1,450 m below RKB
    expect(r.points[1].pMpa).toBeCloseTo((13.74 * 0.052 * (1450 / 0.3048) * 6894.757293168) / 1e6, 9); // the studio's 0.052 rule
    expect(previewText(r.points)).toBe('2 LOTs, 1 FIT read');
  });
});

describe('ekene-mud-weights.csv: intervals and an outcome column', () => {
  const r = importKit('ekene-mud-weights.csv');
  test('from/to is an interval; the outcome makes the failed attempt an influx at the depth it names', () => {
    expect(r.t.columns[r.mapping.depthCol]).toBe('from_md_m');
    expect(r.t.columns[r.mapping.baseCol]).toBe('to_md_m');
    expect(r.t.columns[r.mapping.outcomeCol]).toBe('outcome');
    expect(r.mapping).toMatchObject({ kind: 'mw', depthRef: 'md', depthUnit: 'm', valueUnit: 'ppg' });
    expect(r.missing).toEqual([]);
    const held = r.points.filter((p) => p.kind === 'mw');
    expect(held).toHaveLength(10); // five intervals, top and base each
    expect(new Set(held.map((p) => p.interval)).size).toBe(5);
    const second = held.filter((p) => p.interval === held[2].interval);
    expect(second.map((p) => [p.end, +p.z.toFixed(6)])).toEqual([['top', 540], ['base', 1240]]);
    const kick = r.points.filter((p) => p.kind === 'mwkick');
    expect(kick).toHaveLength(1);
    expect(kick[0].z).toBeCloseTo(1418 - 60, 9); // "influx at 1418 m", not the interval base 1420 m
    expect(kick[0].pMpa).toBeCloseTo((9.8 * 0.052 * (1418 / 0.3048) * 6894.757293168) / 1e6, 9);
    expect(kick[0].emwPpg).toBe(9.8);
    expect(previewText(r.points)).toBe('5 mud weights held over intervals, 1 mud weight that took an influx read');
  });
  test('outcome words', () => {
    expect(mudWeightOutcome('held')).toBe('mw');
    expect(mudWeightOutcome('no losses, no influx')).toBe('mw');
    expect(mudWeightOutcome('FAILED: influx at 1418 m (pore 10.09 ppg)')).toBe('mwkick');
    expect(mudWeightOutcome('partial losses at 5,200 ft')).toBe('mwloss');
    expect(outcomeDepth('FAILED: influx at 1418 m (pore 10.09 ppg)')).toEqual({ value: 1418, unit: 'm' });
    expect(outcomeDepth('losses at 5,200 ft')).toEqual({ value: 5200, unit: 'ft' });
    expect(outcomeDepth('held')).toBeNull();
  });
});

describe('a workbook sheet reads like the text', () => {
  test('sheet rows to tab-separated text', () => {
    const rows = [['md_m', 'pressure_psia'], ['1549', '3187.9']];
    const t = parseCalibrationTable(sheetToText(rows));
    expect(t.guess).toMatchObject({ depthRef: 'md', depthUnit: 'm', valueUnit: 'psia' });
    expect(convertCalibration(t, t.guess, CTX).points).toHaveLength(1);
  });
});

// Ekene-1 prognosis through the shipped path (fixture of the shale-pressure
// gate: GR on the kit's 18/125 lines, picks above the ramp, Eaton n 3)
function ekene1Prognosis() {
  const p = parseLas(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-1-pp.las'), 'utf8'));
  const c = Object.fromEntries(p.curves.map((x) => [x.mnemonic.toUpperCase(), x]));
  const norm = normalizePpCurves({
    depth: c.DEPT.data, dt: c.DT.data, rho: c.RHOB.data,
    dtLog: { mnemonic: 'DT', unit: c.DT.unit }, rhoLog: { mnemonic: 'RHOB', unit: c.RHOB.unit },
  });
  const vsh = Array.from(c.GR.data, (g) => (Number.isFinite(g) ? Math.min(1, Math.max(0, (g - 18) / (125 - 18))) : NaN));
  const input = { ...buildProfileInput({ depth: norm.depth, dt: norm.dt, rho: norm.rho, shale: vsh }, norm.units, { mudlineMdM: 60 }), shaleKind: 'vsh' };
  const picks = autoShalePicks(input, { trend: 'dt', cutoff: 0.6, fromM: 100, toM: 1230, everyM: 50 });
  const fit = fitSegments(picks, { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, []);
  const params = {
    waterDepthM: 35, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 60, nct: fit.nct, method: 'eaton', eatonN: 3, nu: 0.3, ppFromShale: true,
  };
  return { input, params, result: computePrognosis(input, params) };
}

describe('mud weights as evidence against the prognosis', () => {
  const E = ekene1Prognosis();
  const cal = importKit('ekene-mud-weights.csv').points;
  const fmtZ = (z) => `${Math.round((z + 60) / 0.3048)} ft MD`;
  test('the failed 9.80 ppg attempt is explained: the prognosis puts the pore pressure above it at 1,418 m', () => {
    const ev = mudWeightEvidence({ calibration: cal, zBmlM: E.input.zBmlM, result: E.result, params: E.params, fmtZ });
    expect(ev.influx).toHaveLength(1);
    expect(ev.influx[0].consistent).toBe(true);
    expect(ev.influx[0].p).toBeGreaterThan(9.8);
    expect(ev.lines.find((l) => /took an influx/.test(l))).toMatch(/^9\.80 ppg took an influx at 4652 ft MD where the prognosis puts the pore pressure at \d+\.\d\d ppg: consistent\.$/);
    expect(ev.held).toHaveLength(5);
    expect(ev.lines.join(' ')).not.toMatch(/—/);
  });
  test('negative control: a hydrostatic prognosis does not explain the influx, and the line says so', () => {
    const hydro = { ...E.result, porePressurePa: E.result.hydrostaticPa };
    const ev = mudWeightEvidence({ calibration: cal, zBmlM: E.input.zBmlM, result: hydro, params: E.params, fmtZ });
    expect(ev.influx[0].consistent).toBe(false);
    expect(ev.tone).toBe('warn');
    expect(ev.lines.find((l) => /took an influx/.test(l))).toMatch(/the prognosis does not explain it\.$/);
  });
  test('a held weight below the prognosis pore pressure is named (the prognosis may read high)', () => {
    const high = { ...E.result, porePressurePa: E.result.porePressurePa.map((v) => v * 1.4) };
    const ev = mudWeightEvidence({ calibration: cal, zBmlM: E.input.zBmlM, result: high, params: E.params, fmtZ });
    expect(ev.held.some((h) => h.under)).toBe(true);
    expect(ev.lines[0]).toMatch(/^Mud weights that held: 5; \d sit below the prognosis pore pressure \(.*\), so the prognosis may read high there\.$/);
  });
  test('no mud weights, no line', () => {
    expect(mudWeightEvidence({ calibration: [], zBmlM: E.input.zBmlM, result: E.result, params: E.params })).toBeNull();
  });
});
