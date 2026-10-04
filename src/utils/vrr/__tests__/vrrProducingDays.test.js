// VRR-U2-003: a producing-days column at the ledger door. Allocation reports
// quote rates per producing day; the door turns such a rate into the row's
// volume by the producing days of the row, and says so. Without the column
// (or when the user chooses calendar days) the U1 rule stands: a rate is a
// calendar-day average over the days of the row's period.
//
// e2e/fixtures/vrr/hostile/h09-rates-per-producing-day.csv holds the twin's
// volumes as rates per producing day (P-1 on 25 days in January at 1,240
// BOPD = 31,000 bbl; P-2 on 20 days in February at 700 BOPD = 14,000 bbl).
import fs from 'fs';
import path from 'path';
import { parseVrrWellCSV, matchLedgerColumns } from '../csvImport';
import { buildFieldPeriods } from '@/utils/vrrCalculations';
import { parseTabular } from '@/lib/tabularParse';
import { pdfOf, sampleWells } from './vrrTestKit';
import { importInfoOf } from '@/components/vrrmonitor/ImportPanel';
import { readPdf, flat } from '@/lib/reportKit/testKit';

const DIR = path.resolve(__dirname, '../../../../e2e/fixtures/vrr/hostile');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const twin = parseVrrWellCSV(read('twin-ledger.csv'));
const H09 = read('h09-rates-per-producing-day.csv');

const expectTwin = (rows) => {
  const a = buildFieldPeriods(rows);
  const b = buildFieldPeriods(twin.rows);
  a.forEach((p, i) => { for (const k of ['Np', 'Wp', 'Gp', 'Wi', 'Gi']) expect(p[k]).toBeCloseTo(b[i][k], 6); });
};

describe('VRR-U2-003: rates per producing day', () => {
  it('the column is found by name and is never a stream', () => {
    const cols = parseTabular(H09).columns;
    const m = matchLedgerColumns(cols);
    expect(cols[m.days_on].header).toBe('Days On');
    expect(Object.entries(m).filter(([k]) => k !== 'days_on').map(([, i]) => i)).not.toContain(m.days_on);
  });
  it('a rate becomes the volume by the producing days of its row, and the door says so', () => {
    const r = parseVrrWellCSV(H09);
    expect(r.ok).toBe(true);
    expect(r.rateBasis).toBe('producing');
    expect(r.rows.find((x) => x.well === 'P-1' && x.date === '2025-01-01').oil_stb).toBeCloseTo(31000, 6);
    expect(r.rows.find((x) => x.well === 'P-2' && x.date === '2025-02-01').oil_stb).toBeCloseTo(14000, 6);
    expectTwin(r.rows);
    expect(r.report.warnings.join(' ')).toMatch(/Rates were read per producing day: each rate times the producing days of its row \(column "Days On", days\)/);
    expect(r.report.readBack.find((x) => x.key === 'days_on')).toMatchObject({ column: 'Days On', unit: 'days on production (rates per producing day)' });
    // a volume column is a volume: the injection keeps its numbers
    expect(r.rows.find((x) => x.well === 'I-1' && x.date === '2025-02-01').winj_stb).toBe(50400);
  });
  it('NEGATIVE CONTROL: read as calendar-day averages the same file is wrong by the producing fraction', () => {
    const c = parseVrrWellCSV(H09, { rateBasis: 'calendar' });
    expect(c.rateBasis).toBe('calendar');
    expect(c.rows.find((x) => x.well === 'P-1' && x.date === '2025-01-01').oil_stb).toBeCloseTo(1240 * 31, 6);
    expect(c.report.warnings.join(' ')).toMatch(/column "Days On" was not used: rates were read as calendar-day averages \(chosen\)/);
  });
  it('hours on production: 600 hours is 25 days', () => {
    const hrs = H09.replace('Days On', 'Hours On').split('\n')
      .map((l, i) => (i === 0 || !l ? l : l.split(',').map((c, j) => (j === 2 ? String(Number(c) * 24) : c)).join(','))).join('\n');
    expect(hrs).toMatch(/2025-01-01,P-1,600,/);
    const r = parseVrrWellCSV(hrs);
    expect(r.rows.find((x) => x.well === 'P-1' && x.date === '2025-01-01').oil_stb).toBeCloseTo(31000, 6);
    expectTwin(r.rows);
    expect(r.report.readBack.find((x) => x.key === 'days_on').unit).toMatch(/hours on production/);
  });
  it('more producing days than the period holds: capped at the period and listed; a blank uses the calendar days and says so', () => {
    const r = parseVrrWellCSV(H09.replace('2025-02-01,P-1,28,', '2025-02-01,P-1,30,').replace('2025-03-01,P-2,31,', '2025-03-01,P-2,,'));
    expect(r.rows.find((x) => x.well === 'P-1' && x.date === '2025-02-01').oil_stb).toBeCloseTo(28000, 6);
    expect(r.rows.find((x) => x.well === 'P-2' && x.date === '2025-03-01').oil_stb).toBeCloseTo(15500, 6);
    const w = r.report.warnings.join(' ');
    expect(w).toMatch(/1 row gave more producing days than its period holds and was capped at the period/);
    expect(w).toMatch(/1 row with a rate had no producing days; the calendar days of its period were used/);
  });
  it('the template and a file with no rates: the column is listed as not needed', () => {
    const r = parseVrrWellCSV(read('twin-ledger.csv').replace('date,well,', 'date,well,days on,').replace(/^(2025-\d\d-\d\d,[A-Z]-\d),/gm, '$1,30,'));
    expect(r.rows).toEqual(twin.rows);
    expect(r.report.warnings.join(' ')).toMatch(/column "days on" was not needed: the stream columns are volumes/);
  });
  it('RL5: the report prints what the door read, the producing-days column included', () => {
    const res = parseVrrWellCSV(H09);
    const inputs = { ...sampleWells(), wellRows: res.rows, importInfo: { kind: 'ledger', file: 'h09-rates-per-producing-day.csv', ...importInfoOf(res) } };
    const { built } = pdfOf(inputs);
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Producing days Days On days on production \(rates per producing day\) the header 12/);
    expect(t).toMatch(/Rates were read per producing day/);
    pdf.close?.();
  });
});
