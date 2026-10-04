// VRR-U1 import doors (PL2, RL10) on the shared typed reader. Every hostile
// file of e2e/fixtures/vrr/hostile reads to the monthly field periods of its
// clean twin, or is refused with a reason; the importer as it stood before
// (legacyCsvImport.js, verbatim) is the negative control: each file it
// misreads is a finding of the upgrade doc.
import fs from 'fs';
import path from 'path';
import { parseVrrWellCSV, parsePressureCSV, parsePeriodGridCSV, matchLedgerColumns, rowPeriods, pressureToPsia, vrrTemplateCSV } from '../csvImport';
import * as legacy from './legacyCsvImport';
import { buildFieldPeriods, computeVRRSeries } from '@/utils/vrrCalculations';

const DIR = path.resolve(__dirname, '../../../../e2e/fixtures/vrr/hostile');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const FVF = { Bo: 1.25, Bw: 1.02, Bg: 0.9, Rs: 550 };
const periods = (rows) => buildFieldPeriods(rows);
const cumVrr = (rows) => { const s = computeVRRSeries(periods(rows), FVF); return s[s.length - 1].cumulativeVRR; };

const twin = parseVrrWellCSV(read('twin-ledger.csv'));
const expectSamePeriods = (rows) => {
  const a = periods(rows);
  const b = periods(twin.rows);
  expect(a.map((p) => p.label)).toEqual(b.map((p) => p.label));
  a.forEach((p, i) => {
    for (const k of ['Np', 'Wp', 'Gp', 'Wi', 'Gi']) expect(p[k]).toBeCloseTo(b[i][k], 4);
  });
};

describe('the clean twin', () => {
  it('reads 12 rows, four wells, three months, every stream', () => {
    expect(twin.ok).toBe(true);
    expect(twin.rows).toHaveLength(12);
    expect(twin.report.wells).toBe(4);
    expect(periods(twin.rows).map((p) => p.label)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(periods(twin.rows)[0]).toMatchObject({ Np: 46500, Wp: 9300, Gp: 26350, Wi: 55800, Gi: 9300 });
  });
});

describe('hostile ledger files read to the twin', () => {
  it('VRR-U1-004: semicolons, decimal commas with dot thousands, day-first dates settled by the 31st', () => {
    const r = parseVrrWellCSV(read('h01-semicolon-decimal-comma.csv'));
    expect(r.ok).toBe(true);
    expect(r.report.decimal.mark).toBe(',');
    expectSamePeriods(r.rows);
    // control: the old door read "31.000,00" as 31
    const old = legacy.parseVrrWellCSV(read('h01-semicolon-decimal-comma.csv'));
    expect(periods(old.rows)[0].Np).toBeLessThan(100);
  });

  it('ambiguous day/month dates are asked, not guessed; the answer reads the twin', () => {
    const asked = parseVrrWellCSV(read('h02-ambiguous-dates.csv'));
    expect(asked.ok).toBe(false);
    expect(asked.rows).toEqual([]);
    expect(asked.questions.map((q) => q.kind)).toContain('dateOrder');
    const answered = parseVrrWellCSV(read('h02-ambiguous-dates.csv'), { dateOrder: 'dmy' });
    expectSamePeriods(answered.rows);
    // control: the old door assumed day first with a warning (right here by luck; month first silently reads Jan 2, Jan 3)
    expect(legacy.parseVrrWellCSV(read('h02-ambiguous-dates.csv')).report.warnings.join(' ')).toMatch(/assumed/);
  });

  it('VRR-U1-003 (S1): daily-rate columns on monthly rows become the month volume by its calendar days', () => {
    const r = parseVrrWellCSV(read('h03-rates-on-monthly-rows.csv'));
    expect(r.ok).toBe(true);
    expect(r.units).toMatchObject({ oil_stb: 'bbl/d', water_stb: 'bbl/d', gas_mscf: 'Mscf/d', winj_stb: 'bbl', ginj_mscf: 'Mscf' });
    expect(r.report.rateRows).toBeGreaterThan(0);
    expect(r.report.warnings.join(' ')).toMatch(/calendar days of the month/);
    expectSamePeriods(r.rows);
    expect(cumVrr(r.rows)).toBeCloseTo(cumVrr(twin.rows), 10);
    // control: the old door summed the rates as volumes, VRR about 30 times high
    // (its own injection spelling, since it also missed "Water Inj (bbl)", VRR-U1-001)
    const old = legacy.parseVrrWellCSV(read('h03-rates-on-monthly-rows.csv').replace('Water Inj (bbl),Gas Inj (Mscf)', 'water_inj_bbl,gas_inj_mscf'));
    expect(cumVrr(old.rows) / cumVrr(twin.rows)).toBeGreaterThan(25);
  });

  it('VRR-U1-002: metric volumes are converted (sm3 to bbl, 10^3 sm3 to Mscf)', () => {
    const r = parseVrrWellCSV(read('h04-metric-volumes.csv'));
    expect(r.ok).toBe(true);
    expect(r.units).toMatchObject({ oil_stb: 'm3', gas_mscf: '10^3 m3', winj_stb: 'm3', ginj_mscf: '10^3 m3' });
    expectSamePeriods(r.rows);
    // one known value: 1 sm3 is 6.28981 bbl
    const one = parseVrrWellCSV('date,well,Oil (sm3)\n2025-01-01,P,1\n');
    expect(one.rows[0].oil_stb).toBeCloseTo(6.289811, 5);
    // control: the old door read sm3 as bbl and the injection column as water produced
    const old = legacy.parseVrrWellCSV(read('h04-metric-volumes.csv'));
    expect(periods(old.rows)[0].Np).toBeCloseTo(46500 * 0.158987294928, 0);
  });

  it('VRR-U1-001 (S1): "Water Injected (bbl)", shuffled columns, a preamble, a totals row and a comment', () => {
    const r = parseVrrWellCSV(read('h05-preamble-shuffled-totals.csv'));
    expect(r.ok).toBe(true);
    expectSamePeriods(r.rows);
    expect(r.report.notUsed.map((n) => n.column)).toEqual(['Cum Oil (STB)']);
    expect(r.report.skipped.map((s) => s.reason).join(' | ')).toMatch(/totals row/);
    // the space spelling the old door missed
    const spaced = parseVrrWellCSV('Date,Well,Oil (bbl),Water (bbl),Water Inj (bbl)\n2025-01-01,P1,1000,100,0\n2025-01-01,I1,0,0,1200\n');
    expect(spaced.mapping.winj_stb).toBe(4);
    expect(cumVrr(spaced.rows)).toBeCloseTo((1200 * 1.02) / (1000 * 1.25 + 100 * 1.02), 10);
    // control: the old door dropped "Water Inj (bbl)" with no word, VRR 0
    const old = legacy.parseVrrWellCSV('Date,Well,Oil (bbl),Water (bbl),Water Inj (bbl)\n2025-01-01,P1,1000,100,0\n2025-01-01,I1,0,0,1200\n');
    expect(cumVrr(old.rows)).toBe(0);
    expect(old.report.warnings).toEqual([]);
  });

  it('tab-separated, a units row, month names and Excel serial dates', () => {
    const r = parseVrrWellCSV(read('h06-tab-month-names-serials.txt'));
    expect(r.ok).toBe(true);
    expectSamePeriods(r.rows);
    expect(legacy.parseVrrWellCSV(read('h06-tab-month-names-serials.txt')).rows.length).toBe(0);
  });

  it('daily rows aggregate to the same months', () => {
    const r = parseVrrWellCSV(read('h07-daily-rows.csv'));
    expect(r.ok).toBe(true);
    expect(r.report.spacing['P-1']).toBe('daily');
    expectSamePeriods(r.rows);
  });

  it('split rows of one well and date merge; a repeated stream is left out and listed; a negative is zeroed', () => {
    const r = parseVrrWellCSV(read('h08-split-and-duplicate-rows.csv'));
    const reasons = r.report.skipped.map((s) => s.reason).join(' | ');
    expect(reasons).toMatch(/A second row for P-2 on 2025-03-01 repeats oil produced/);
    expect(r.report.negativesZeroed).toBe(1);
    expectSamePeriods(r.rows.filter((x) => x.date < '2025-04'));
    // control: the old door summed the duplicate
    const old = legacy.parseVrrWellCSV(read('h08-split-and-duplicate-rows.csv'));
    expect(periods(old.rows)[2].Np).toBe(periods(twin.rows)[2].Np + 999);
  });

  it('a column with no unit is read in the display system and said so; the user can choose', () => {
    const r = parseVrrWellCSV('date,well,oil,water_inj\n2025-01-01,P,100,0\n2025-01-01,I,0,100\n', { system: 'si' });
    expect(r.units.oil_stb).toBe('m3');
    expect(r.unitFrom.oil_stb).toBe('assumed');
    expect(r.report.warnings.join(' ')).toMatch(/names no unit/);
    const chosen = parseVrrWellCSV('date,well,oil,water_inj\n2025-01-01,P,100,0\n2025-01-01,I,0,100\n', { units: { oil_stb: 'bbl', winj_stb: 'bbl' } });
    expect(chosen.rows.find((x) => x.well === 'P').oil_stb).toBe(100);
  });

  it('the template still reproduces the engine fixture', () => {
    const r = parseVrrWellCSV(vrrTemplateCSV());
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(12);
    expect(r.report.warnings).toEqual([]);
  });

  it('column placement: injection never lands on a production twin', () => {
    const cols = ['date', 'well', 'Water Inj (bbl)', 'Water (bbl)', 'Gas Injected (Mscf)', 'Gas (Mscf)', 'BOPD', 'bwipd'].map((h, index) => ({ index, header: h, name: h }));
    const m = matchLedgerColumns(cols);
    expect(m).toMatchObject({ winj_stb: 2, water_stb: 3, ginj_mscf: 4, gas_mscf: 5, oil_stb: 6 });
  });

  it('row periods per well: daily, monthly, irregular', () => {
    const raw = [
      { well: 'A', date: '2025-01-01' }, { well: 'A', date: '2025-01-02' },
      { well: 'B', date: '2025-01-01' }, { well: 'B', date: '2025-02-01' },
      { well: 'C', date: '2025-01-01' }, { well: 'C', date: '2025-01-08' }, { well: 'C', date: '2025-01-22' },
    ];
    const { days, spacing } = rowPeriods(raw);
    expect(spacing).toEqual({ A: 'daily', B: 'monthly', C: 'irregular' });
    expect(days).toEqual([1, 1, 31, 28, 7, 14, 14]);
  });
});

describe('pressure surveys', () => {
  const twinP = parsePressureCSV(read('twin-pressure.csv'));
  it('reads psia', () => {
    expect(twinP.surveys).toEqual([{ date: '2025-01-15', p_psia: 3000 }, { date: '2025-03-15', p_psia: 2900 }]);
  });
  it.each([['p01-kpa.csv', 'kPa'], ['p03-bar-gauge.csv', 'barg']])('VRR-U1-006: %s is converted to psia', (file, unit) => {
    const r = parsePressureCSV(read(file));
    expect(r.unit).toBe(unit);
    r.surveys.forEach((s, i) => expect(s.p_psia).toBeCloseTo(twinP.surveys[i].p_psia, 3));
    // control: the old door read the number as psia
    // control: the old door read the number as psia, or found no pressure column at all
    const old = legacy.parsePressureCSV(read(file)).surveys;
    expect(old.length === 0 || Math.abs(old[0].p_psia - 3000) > 1).toBe(true);
  });
  it('psig with day-first dates and a decimal comma: the atmosphere is added and stated', () => {
    const r = parsePressureCSV(read('p02-psig-dayfirst.csv'));
    expect(r.unit).toBe('psig');
    expect(r.report.warnings.join(' ')).toMatch(/14\.696/);
    r.surveys.forEach((s, i) => expect(s.p_psia).toBeCloseTo(twinP.surveys[i].p_psia, 3));
  });
  it('one known value per conversion: 20,684.27 kPa and 206.84 bara are 3,000 psia', () => {
    expect(pressureToPsia(20684.271879505, 'kPa')).toBeCloseTo(3000, 6);
    expect(pressureToPsia(206.84271879505, 'bar')).toBeCloseTo(3000, 6);
    expect(pressureToPsia(2985.304, 'psig')).toBeCloseTo(3000, 6);
  });
});

describe('the period grid file', () => {
  it('VRR-U1-005: any separator and decimal mark, columns in any order', () => {
    const r = parsePeriodGridCSV('Wi;label;Np;Wp;Gp;Gi\n40000;2024-01;62000,5;8000;40000;0\n');
    expect(r.periods[0]).toEqual({ label: '2024-01', Np: '62000.5', Wp: '8000', Gp: '40000', Wi: '40000', Gi: '0' });
  });
});
