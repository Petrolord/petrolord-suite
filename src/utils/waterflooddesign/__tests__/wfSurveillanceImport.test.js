// WF-U1 Surveillance import door (PL2, RL10) on the shared typed reader.
// The hostile set (e2e/fixtures/waterflood/hostile, generate.mjs) holds the
// same 20 days in every file; each must read to the engine rows of
// base-iso.csv. Negative control: the old door on the same files.
import fs from 'fs';
import path from 'path';
import { readSurveillanceTable, readBackLines } from '@/utils/waterflooddesign/surveillanceImport';
import { parseWaterfloodCSVDetailed, analyzeWaterflood } from '@/utils/waterfloodCalculations';

const DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'waterflood', 'hostile');
const file = (n) => fs.readFileSync(path.join(DIR, n), 'utf8');
const key = (r) => `${r.date}|${r.well}`;
const base = readSurveillanceTable(file('base-iso.csv'));

function expectSameRows(got, tol = 1e-6) {
  expect(got.ok).toBe(true);
  expect(got.rows).toHaveLength(base.rows.length);
  const want = new Map(base.rows.map((r) => [key(r), r]));
  for (const r of got.rows) {
    const w = want.get(key(r));
    expect(w).toBeDefined();
    for (const c of ['oil_bbl', 'water_bbl', 'gas_mcf', 'inj_bbl', 'whp_psi']) {
      if (w[c] === '') expect(r[c]).toBe('');
      else expect(Math.abs(r[c] - w[c])).toBeLessThan(tol * Math.max(1, Math.abs(w[c])));
    }
  }
}

describe('the hostile file set', () => {
  it('base: 80 rows, every column found, units chosen at the door', () => {
    expect(base.ok).toBe(true);
    expect(base.rows).toHaveLength(80);
    expect(base.rows[0]).toEqual({ date: '2025-01-01', well: 'INJ-1', oil_bbl: '', water_bbl: '', gas_mcf: '', inj_bbl: 1000.5, whp_psi: 2000.25 });
    expect(base.readBack.columns.find((c) => c.as === 'whp_psi')).toMatchObject({ unit: 'psi', unitFrom: 'header' }); // whp_psi names its unit
    expect(base.readBack.columns.find((c) => c.as === 'inj_bbl')).toMatchObject({ unit: 'bbl/d', unitFrom: 'door' });
  });

  it('day-first dates, semicolons and decimal commas read to the same rows', () => {
    const r = readSurveillanceTable(file('dayfirst-semicolon-comma.csv'));
    expectSameRows(r);
    expect(r.readBack.dateOrder.order).toBe('dmy');
    expect(r.readBack.decimal.mark).toBe(',');
    expect(r.readBack.columns.find((c) => c.as === 'oil_bbl')).toMatchObject({ unit: 'STB/d', unitFrom: 'header' });
  });

  it('SI headers (sm3/d, m3/d, kPa) convert to the same oilfield rows; one known value pinned', () => {
    const r = readSurveillanceTable(file('si-units.csv'));
    expectSameRows(r, 1e-5);
    // 2000.25 psi = 13791.24 kPa in the file, back to 2000.25 psi
    expect(r.rows[0].whp_psi).toBeCloseTo(2000.25, 3);
    expect(r.readBack.columns.find((c) => c.as === 'whp_psi')).toMatchObject({ unit: 'kPa', unitFrom: 'header' });
  });

  it('columns in another order, extra columns, a quoted comma, month-first dates', () => {
    const r = readSurveillanceTable(file('reordered-extra-monthfirst.csv'));
    expectSameRows(r);
    expect(r.readBack.dateOrder.order).toBe('mdy');
    expect(r.readBack.ignored).toEqual(expect.arrayContaining(['Comment', 'Choke (64ths)']));
  });

  it('dates that cannot settle the order are asked, never guessed; the answer reads them', () => {
    const q = readSurveillanceTable(file('ambiguous-dates.csv'));
    expect(q.ok).toBe(false);
    expect(q.needsAnswer).toBe(true);
    expect(q.questions[0].text).toMatch(/day first or month first/);
    const a = readSurveillanceTable(file('ambiguous-dates.csv'), { dateOrder: 'dmy' });
    expect(a.ok).toBe(true);
    expect(a.rows[0].date).toBe('2025-01-01');
    expect(a.rows[a.rows.length - 1].date).toBe('2025-01-12');
  });

  it('volumes and cumulatives are refused by name; no header is refused; totals, comments and blanks are reported', () => {
    expect(readSurveillanceTable(file('volumes-only.csv')).errors[0]).toMatch(/volumes or cumulatives.*cum_oil/);
    expect(readSurveillanceTable(file('no-header.csv')).errors[0]).toMatch(/no header row/);
    const t = readSurveillanceTable(file('totals-comments-blanks.csv'));
    expectSameRows(t);
    expect(t.readBack.left.map((l) => l.reason)).toEqual(expect.arrayContaining(['comment line', 'totals row']));
    expect(readBackLines(t.readBack)[0]).toMatch(/80 of \d+ rows read/);
  });

  it('a rate chosen at the door in SI converts: 158.987 m3/d is 1,000 bbl/d', () => {
    const r = readSurveillanceTable('date,well,inj_bbl\n2025-01-01,I,158.987294928\n2025-01-02,I,158.987294928\n', { rateSystem: 'si' });
    expect(r.rows[0].inj_bbl).toBeCloseTo(1000, 6);
  });
});

describe('NEGATIVE CONTROL: the old door', () => {
  it('reads decimal commas as integers and loses day-first dates', () => {
    const old = parseWaterfloodCSVDetailed(file('dayfirst-semicolon-comma.csv'));
    expect(old.rows[0].inj_bbl).toBe('1000,5');
    const oldResult = analyzeWaterflood(old.rows, {});
    // days 13 to 20 are not dates to new Date(): 32 of 80 rows dropped
    expect(oldResult.data_quality.rows_out).toBe(48);
    // and a quoted decimal comma became an integer: "1,5" read as 1
    const one = parseWaterfloodCSVDetailed('date,well,inj_bbl\n2025-01-01,I,"1,5"\n');
    expect(analyzeWaterflood(one.rows, {}).kpis.total_injected_bbl).toBe(1);
  });
});
