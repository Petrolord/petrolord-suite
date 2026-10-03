/**
 * DCA-U1-004 and DCA-U1-009: the production import door on the shared
 * typed reader, against the hostile file set (e2e/fixtures/dca/hostile).
 * Every file is Ekene-1's primary decline in another shape; read through
 * the door, each gives the twin's rates or says why it cannot.
 */
import fs from 'fs';
import path from 'path';
import { readProductionTable, unitFromHeader, ambiguousUnit, matchColumns } from '@/utils/declineCurve/productionImport';
import { detectColumns, mapColumns } from '@/utils/declineCurve/csvParser';

const DIR = path.resolve(__dirname, '../../../../e2e/fixtures/dca/hostile');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const RATES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../packages/engines/test-data/ekene-dynamic/rates.json'), 'utf8'));
const TWIN = RATES.wells[0].monthly.filter((m) => m.date < '2023-01-01');

const expectTwin = (rows, { stream = 'oilRate', factor = 1, tol = 1e-6 } = {}) => {
  expect(rows).toHaveLength(36);
  rows.forEach((r, i) => {
    expect(r.date).toBe(TWIN[i].date);
    expect(Math.abs(r[stream] - TWIN[i].oil_bpd * factor) / (TWIN[i].oil_bpd * factor)).toBeLessThan(tol);
  });
};

describe('the hostile file set reads to the twin', () => {
  it('01 the clean twin', () => {
    const r = readProductionTable(read('01-clean.csv'));
    expect(r.ok).toBe(true);
    expectTwin(r.rows);
    expectTwin(r.rows, { stream: 'gasRate', factor: 0.4 });
    expect(r.unitFrom).toEqual({ oilRate: 'header', gasRate: 'header', waterRate: 'header' });
  });

  it('02 semicolons, decimal commas, columns in another order, units in brackets', () => {
    const r = readProductionTable(read('02-semicolon-decimal-comma.csv'));
    expect(r.ok).toBe(true);
    expect(r.readBack.decimal.mark).toBe(',');
    expectTwin(r.rows, { tol: 1e-5 });
    expectTwin(r.rows, { stream: 'gasRate', factor: 0.4, tol: 1e-5 });
  });

  it('03 day-first dates on the 1st are asked, never guessed; the answer reads the twin', () => {
    const r = readProductionTable(read('03-day-first-unsettled.csv'));
    expect(r.ok).toBe(false);
    expect(r.rows).toHaveLength(0);
    expect(r.questions.map((q) => q.kind)).toContain('dateOrder');
    expect(r.refusal).toMatch(/day first or month first/);
    const answered = readProductionTable(read('03-day-first-unsettled.csv'), { dateOrder: 'dmy' });
    expect(answered.ok).toBe(true);
    expectTwin(answered.rows, { tol: 1e-5 });
  });

  it('04 day-first dates on the 15th settle themselves', () => {
    const r = readProductionTable(read('04-day-first-settled.csv'));
    expect(r.ok).toBe(true);
    expect(r.rows[1].date).toBe('2020-02-15');
    expect(r.readBack.columns.find((c) => c.key === 'date').unit).toBe('day first');
  });

  it('05 monthly volumes become calendar-day rates', () => {
    const r = readProductionTable(read('05-monthly-volumes.csv'));
    expect(r.ok).toBe(true);
    expect(r.units.oilRate).toBe('bbl/month');
    expectTwin(r.rows, { tol: 1e-5 });
    expectTwin(r.rows, { stream: 'gasRate', factor: 0.4, tol: 1e-5 });
    expect(r.warnings.join(' ')).toMatch(/calendar-day rates/);
  });

  it('06 a volume unit with no time is asked; either answer is read as chosen', () => {
    const r = readProductionTable(read('06-bare-volume-unit.csv'));
    expect(r.ok).toBe(false);
    expect(r.questions.find((q) => q.kind === 'rateOrVolume').options).toEqual(['bbl/d', 'bbl/month']);
    const asVolume = readProductionTable(read('06-bare-volume-unit.csv'), { units: { oilRate: 'bbl/month' } });
    expect(asVolume.ok).toBe(true);
    expectTwin(asVolume.rows, { tol: 1e-5 });
    const asRate = readProductionTable(read('06-bare-volume-unit.csv'), { units: { oilRate: 'bbl/d' } });
    expect(asRate.rows[0].oilRate).toBeCloseTo(120 * 31, 3);
  });

  it('07 SI rates are converted at the door with the registry factors', () => {
    const r = readProductionTable(read('07-metric-rates.csv'));
    expect(r.ok).toBe(true);
    expect(r.units).toEqual({ oilRate: 'm3/d', gasRate: '10^3 m3/d' });
    expectTwin(r.rows, { tol: 1e-6 });
    expectTwin(r.rows, { stream: 'gasRate', factor: 0.4, tol: 1e-6 });
  });

  it('08 a title above and a totals row below are left out and listed', () => {
    const r = readProductionTable(read('08-title-and-totals.csv'));
    expect(r.ok).toBe(true);
    expectTwin(r.rows, { tol: 1e-5 });
    const reasons = r.readBack.skipped.map((s) => s.reason);
    expect(reasons).toContain('totals row');
    expect(reasons.filter((x) => x === 'text before the table').length).toBe(2);
  });

  it('09 two wells in one file are refused with their names', () => {
    const r = readProductionTable(read('09-two-wells.csv'));
    expect(r.ok).toBe(false);
    expect(r.refusal).toMatch(/2 wells \(Ekene-1, Ekene-3\)/);
  });

  it('10 zero, negative, blank and n/a: kept, counted, never dropped silently', () => {
    const r = readProductionTable(read('10-zero-negative-blank.csv'));
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(34); // the blank and the n/a rows carry no rate
    expect(r.rows.find((x) => x.date === TWIN[5].date).oilRate).toBe(0);
    expect(r.rows.find((x) => x.date === TWIN[9].date).oilRate).toBe(-5);
    expect(r.readBack.negative).toBe(1);
    expect(r.readBack.skipped.filter((s) => s.reason === 'no rate on this row')).toHaveLength(2);
  });

  it('11 tab columns, month names, and a cumulative listed as not used', () => {
    const r = readProductionTable(read('11-tab-month-names.txt'));
    expect(r.ok).toBe(true);
    expectTwin(r.rows, { tol: 1e-5 });
    expect(r.readBack.notUsed.map((c) => c.reason).join(' ')).toMatch(/cumulative/);
  });
});

describe('header units', () => {
  it('reads a time where it is written, and asks where it is not', () => {
    expect(unitFromHeader('liquid', 'oil_rate_bopd')).toBe('bbl/d');
    expect(unitFromHeader('liquid', 'Oil', 'bbl/d')).toBe('bbl/d');
    expect(unitFromHeader('liquid', 'Oil', 'm3/d')).toBe('m3/d');
    expect(unitFromHeader('gas', 'Gas', 'Mcf/d')).toBe('Mscf/d');
    expect(unitFromHeader('gas', 'gas_mmscfd')).toBe('MMscf/d');
    expect(unitFromHeader('liquid', 'oil_bbl')).toBeNull();
    expect(ambiguousUnit('liquid', 'oil_bbl')).toEqual(['bbl/d', 'bbl/month']);
  });

  it('a cumulative column is never taken for a rate', () => {
    const map = matchColumns([
      { index: 0, header: 'date', name: 'date' }, { index: 1, header: 'cum oil', name: 'cum oil' }, { index: 2, header: 'oil', name: 'oil' },
    ]);
    expect(map.oilRate).toBe(2);
  });
});

describe('negative controls: the old door', () => {
  it('read day-first dates month first, silently', () => {
    const text = read('04-day-first-settled.csv');
    const lines = text.trim().split('\n');
    const rows = lines.slice(1).map((l) => { const [Date_, oil] = l.split(','); return { Date: Date_, 'Oil rate (bopd)': Number(oil) }; });
    const mapped = mapColumns(rows, detectColumns(['Date', 'Oil rate (bopd)']));
    // "15/02/2020" through new Date(): not a date at all in the old path
    expect(Number.isNaN(new Date(mapped[1].date).getTime())).toBe(true);
  });

  it('read a monthly "volume" column as a daily rate, about 30 times high', () => {
    const mapping = detectColumns(['date', 'volume']);
    expect(mapping.rate).toBe('volume');
    const mapped = mapColumns([{ date: '2020-01-01', volume: 3720 }], mapping);
    expect(mapped[0].rate).toBe(3720); // a rate of 3,720 bbl/d for a month that averaged 120
    const now = readProductionTable('date,volume (bbl/month)\n2020-01-01,3720\n2020-02-01,3353\n2020-03-01,3462\n');
    expect(now.rows[0].oilRate).toBeCloseTo(120, 6);
  });
});
