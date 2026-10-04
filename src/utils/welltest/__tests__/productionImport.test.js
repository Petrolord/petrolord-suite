// WTA-U1-010: the RTA production door on the shared reader. Each file is a
// member of the hostile set (PL2) read to the same oilfield rows; the old
// reader (parseFloat by position) is kept here verbatim as the negative
// control of each finding. Known values: 1 m3 = 6.289810770 bbl,
// 1 bar = 14.503773773 psi, 1 10^3 m3 = 35.314666721 Mscf.
import Papa from 'papaparse';
import { importProductionCsv, rateUnitFromHeader } from '../productionImport';
import { ATM_PSI } from '../gaugeImport';

// the door as it stood at origin/main f32577679 (RtaPanel parseProductionCsv), oilfield display
function legacy(text) {
  const { data } = Papa.parse(text.trim(), { skipEmptyLines: true });
  const rows = [];
  for (const raw of data) {
    if (!Array.isArray(raw) || raw.length < 3) continue;
    const t = parseFloat(raw[0]); const q = parseFloat(raw[1]); const pwf = parseFloat(raw[2]);
    if (Number.isFinite(t) && Number.isFinite(q) && Number.isFinite(pwf) && t > 0) rows.push({ t, q, pwf });
  }
  return rows;
}

const TWIN = [{ t: 1, q: 1000, pwf: 3000 }, { t: 2, q: 950, pwf: 2950 }, { t: 3, q: 910, pwf: 2905.5 }];
const close = (rows) => {
  expect(rows).toHaveLength(TWIN.length);
  rows.forEach((r, i) => {
    expect(r.t).toBeCloseTo(TWIN[i].t, 9);
    expect(r.q).toBeCloseTo(TWIN[i].q, 6);
    expect(r.pwf).toBeCloseTo(TWIN[i].pwf, 6);
  });
};

describe('RTA production door', () => {
  test('the historical headerless layout still reads, and says it assumed its units', () => {
    const out = importProductionCsv('1,1000,3000\n2,950,2950\n3,910,2905.5\n');
    close(out.rows);
    expect(out.read.byHeader).toBe(false);
    expect(out.read.text).toMatch(/Assumed, as the file does not say: time in days, rate in STB\/D, pressure in psia/);
  });

  test('columns in another order are found by header (the old door swapped rate and pressure)', () => {
    const text = 'pwf (psia),Oil rate (STB/D),Time (days)\n3000,1000,1\n2950,950,2\n2905.5,910,3\n';
    close(importProductionCsv(text).rows);
    expect(legacy(text)[0]).toEqual({ t: 3000, q: 1000, pwf: 1 });
  });

  test('semicolons and decimal commas (the old door read 2905,5 as 2905)', () => {
    const text = 'Zeit (d);Öl (STB/D);Druck (psia)\n1;1000;3000\n2;950;2950\n3;910;2905,5\n';
    close(importProductionCsv(text).rows);
    expect(legacy(text)[2].pwf).toBe(2905); // the decimal part dropped
  });

  test('metric units at the door: m3/d and bar(g)', () => {
    const text = 'Day,Oil rate (m3/d),FBHP (barg)\n'
      + `1,${1000 * 0.158987294928},${(3000 - ATM_PSI) / 14.503773773}\n`
      + `2,${950 * 0.158987294928},${(2950 - ATM_PSI) / 14.503773773}\n`
      + `3,${910 * 0.158987294928},${(2905.5 - ATM_PSI) / 14.503773773}\n`;
    const out = importProductionCsv(text);
    close(out.rows);
    expect(out.read.assumed).toEqual([]);
    expect(legacy(text)[0].q).toBeCloseTo(158.987, 2); // m3/d taken as STB/D
  });

  test('day-first dates count days from the first date as day 1; ambiguous dates ask', () => {
    const text = 'Date,Oil (bbl/d),BHP (psia)\n12/09/2026,1000,3000\n13/09/2026,950,2950\n14/09/2026,910,2905.5\n';
    const out = importProductionCsv(text);
    close(out.rows);
    expect(out.read.dateOrder).toBe('dmy');
    expect(legacy(text).map((r) => r.t)).toEqual([12, 13, 14]); // the day of the month read as elapsed days
    const amb = importProductionCsv('Date,Oil (bbl/d),BHP (psia)\n01/09/2026,1000,3000\n02/09/2026,950,2950\n03/09/2026,910,2905.5\n');
    expect(amb.rows).toEqual([]);
    expect(amb.dateQuestion).toMatchObject({ ambiguous: true });
    const told = importProductionCsv('Date,Oil (bbl/d),BHP (psia)\n01/09/2026,1000,3000\n02/09/2026,950,2950\n03/09/2026,910,2905.5\n', { mapping: { dateOrder: 'dmy' } });
    close(told.rows);
  });

  test('gas: 10^3 m3/d to Mscf/D; a gas unit on an oil test is refused', () => {
    const text = 'Time (days),Gas rate (10^3 m3/d),Pwf (psia)\n1,28.316846592,3000\n2,26.9010042624,2950\n3,25.76833039872,2905.5\n';
    const out = importProductionCsv(text, { fluid: 'gas' });
    close(out.rows);
    const refused = importProductionCsv(text, { fluid: 'oil' });
    expect(refused.rows).toEqual([]);
    expect(refused.error).toMatch(/a gas rate, and this test is oil/);
  });

  test('rate unit words', () => {
    expect(rateUnitFromHeader('Qg (MMscf/d)')).toBe('MMscf/D');
    expect(rateUnitFromHeader('Oil (Sm3/d)')).toBe('m3/d');
    expect(rateUnitFromHeader('Gas (sm3/d)')).toBe('sm3/d');
    expect(rateUnitFromHeader('BOPD')).toBe('STB/D');
    expect(rateUnitFromHeader('rate')).toBeNull();
  });

  test('the e2e hostile file: barg first, a German date column, decimal commas, m3/d last', () => {
    const fs = require('fs');
    const path = require('path');
    const text = fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/welltest/hostile/rta-metric-dayfirst-semicolon.csv'), 'utf8');
    const out = importProductionCsv(text);
    expect(out.rows).toHaveLength(40);
    expect(out.read.columns).toEqual({ time: 'Datum', rate: 'Ölrate (m3/d)', pressure: 'FBHP (barg)' });
    expect(out.read.dateOrder).toBe('dmy');
    expect(out.rows[0].t).toBe(1);
    expect(out.rows[39].t).toBe(40);
    expect(out.rows[0].q).toBeCloseTo(1000 * Math.exp(-1 / 120), 2);
    expect(out.rows[0].pwf).toBeCloseTo(1500 + 1500 * Math.exp(-1 / 60), 1);
  });
});
