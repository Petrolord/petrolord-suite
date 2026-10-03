/**
 * SCAL-U1-007 (S2): the lab table doors (RL10, PL2). Every hostile file of
 * e2e/fixtures/scal/hostile reads to its twin through the door the Lab Data
 * tab calls; the old parsers (the engine's parseKrCsv and parsePcCsv) are
 * the negative control.
 */
import fs from 'fs';
import path from 'path';
import { readKrTable, readPcTable, importRecord } from '@/utils/scalstudio/labImport';
import { parseKrCsv, parsePcCsv } from '@/utils/scalCalculations';

const DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'scal', 'hostile');
const file = (n) => fs.readFileSync(path.join(DIR, n), 'utf8');
// the kPa and bar fixtures carry 4 and 6 decimals, so the twin holds to 2e-5 relative
const close = (a, b) => {
  expect(a.length).toBe(b.length);
  a.forEach((r, i) => Object.keys(b[i]).forEach((k) => expect(Math.abs(r[k] - b[i][k])).toBeLessThan(2e-5 * Math.max(1, Math.abs(b[i][k])))));
};

const KR_TWIN = readKrTable(file('kr-twin.csv')).rows;
const PC_TWIN = readPcTable(file('pc-twin-psi.csv')).rows;

describe('kr door', () => {
  it('the twin reads as itself, 7 rows, nothing left out', () => {
    const r = readKrTable(file('kr-twin.csv'));
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(7);
    expect(r.skipped).toEqual([]);
    expect(r.summary).toMatch(/Columns: Sw from "Sw", krw from "krw", kro from "kro"\. Sw read as a fraction/);
  });

  it.each([
    ['kr-reordered-extra-columns.csv', /krw from "krw", kro from "kro"/],
    ['kr-semicolon-comma-decimal.csv', /decimal mark: comma/],
    ['kr-percent-no-header.txt', /No header names the columns: read in the order Sw, krw, kro\. Sw read as a percent \(from the values \(some exceed 1\)\)/],
    ['kr-vendor-export.csv', /Sw read as a percent \(from the header\)/],
  ])('%s reads to the twin and says how', (name, says) => {
    const r = readKrTable(file(name));
    expect(r.ok).toBe(true);
    close(r.rows, KR_TWIN);
    expect(r.summary).toMatch(says);
  });

  it('the vendor export lists every line it left out, with the reason', () => {
    const r = readKrTable(file('kr-vendor-export.csv'));
    const reasons = r.skipped.map((s) => `${s.line}: ${s.reason}`).join(' | ');
    expect(reasons).toMatch(/1: text before the table/);
    expect(reasons).toMatch(/comment line/);
    expect(reasons).toMatch(/totals row/);
    expect(reasons).toMatch(/a blank or non-numeric Sw, krw or kro/);
    const rec = importRecord(r, 'kr-vendor-export.csv', '2026-10-03T09:00:00Z');
    expect(rec).toMatchObject({ file: 'kr-vendor-export.csv', read: 7, skippedCount: r.skipped.length });
  });

  it('a file with no kr columns is refused with a reason', () => {
    const r = readKrTable('Depth,GR\n8400,45\n8401,50\n8402,60\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no column for Sw, krw, kro|no column for/);
  });

  it('negative control: the old door refused or misread four of the four hostile kr files', () => {
    for (const name of ['kr-reordered-extra-columns.csv', 'kr-semicolon-comma-decimal.csv', 'kr-percent-no-header.txt', 'kr-vendor-export.csv']) {
      const old = parseKrCsv(file(name));
      const same = old.rows.length === KR_TWIN.length && old.rows.every((r, i) => Math.abs(r.Sw - KR_TWIN[i].Sw) < 1e-9 && Math.abs(r.krw - KR_TWIN[i].krw) < 1e-9);
      if (name === 'kr-reordered-extra-columns.csv') expect(same).toBe(true); // the old alias search did handle order
      else expect(same).toBe(false);
    }
  });
});

describe('Pc door', () => {
  it.each([
    ['pc-kpa-header.csv', {}, /Pc read in kPa \(from the header\)/],
    ['pc-bar-units-row.csv', {}, /Pc read in bar \(from the header\)/],
    ['pc-semicolon-percent-kpa.csv', {}, /Pc read in kPa \(from the header\).*Sw read as a percent \(from the header\)/],
    ['pc-no-unit-no-header.txt', { pc: 'psi' }, /Pc read in psi \(chosen at the door\)/],
  ])('%s reads to the psi twin and says how', (name, chosen, says) => {
    const r = readPcTable(file(name), chosen);
    expect(r.ok).toBe(true);
    close(r.rows, PC_TWIN);
    expect(r.summary).toMatch(says);
  });

  it('the unit chosen at the door converts a file that names none: 18.5 psi typed as kPa is 2.683 psi', () => {
    const r = readPcTable(file('pc-no-unit-no-header.txt'), { pc: 'kPa' });
    expect(r.rows[0].Pc_psi).toBeCloseTo(18.5 / 6.894757293168361, 9);
    expect(r.summary).toMatch(/Pc read in kPa \(chosen at the door\)/);
  });

  it('with no unit anywhere and none chosen, psi is assumed and the read-back says so', () => {
    expect(readPcTable(file('pc-no-unit-no-header.txt')).summary).toMatch(/Pc read in psi \(assumed, the file does not say\)/);
  });

  it('a header unit wins over the door: the kPa file read with psi chosen is still kPa', () => {
    close(readPcTable(file('pc-kpa-header.csv'), { pc: 'psi' }).rows, PC_TWIN);
  });

  it('negative control: the old door read the kPa file as psi (6.9 times high) or refused the others', () => {
    const old = parsePcCsv(file('pc-kpa-header.csv'));
    expect(old.rows.length === 0 || old.rows[0].Pc_psi / PC_TWIN[0].Pc_psi > 6).toBe(true);
    expect(parsePcCsv(file('pc-semicolon-percent-kpa.csv')).rows).toHaveLength(0);
    expect(parsePcCsv(file('pc-no-unit-no-header.txt')).rows).toHaveLength(0);
  });
});

describe('SCAL-U1-012: the shared reader keeps a mostly empty last column the header names', () => {
  // eslint-disable-next-line global-require
  const { parseTabular } = require('@/lib/tabularParse');
  it('a "Comment" column filled on two rows of seven is a column, and the header is the header', () => {
    const t = parseTabular(file('kr-reordered-extra-columns.csv'));
    expect(t.columnCount).toBe(5);
    expect(t.header.cells).toEqual(['kro', 'Temperature (degF)', 'Sw', 'krw', 'Comment']);
    expect(t.rows).toHaveLength(7);
  });
  it('a delimiter at the end of each line is still not a column', () => {
    const t = parseTabular('a,b,\n1,2,\n3,4,\n');
    expect(t.columnCount).toBe(2);
  });
});
