/**
 * FLUID-U2-001: laboratory PVT tables at the door (RL10, PL2).
 *
 * The files are the tables of one published study (Good Oil Co. Well No. 4,
 * Core Laboratories RFL 88001) in several shapes; see
 * e2e/fixtures/fluid-systems/lab/README.md. The adjustment of differential
 * data to the separator basis is gated on Ahmed, Reservoir Engineering
 * Handbook, Example 3-5.
 */
import fs from 'fs';
import path from 'path';
import { parseWorkbook } from '@/lib/tabularFile';
import {
  readLabTable, sheetText, labTableOf, labDataOf, emptyLabData, labSaturationPressure, adjustDlToSeparator,
  labComparison, modelRelativeVolume, modelAt, labMisfit, labFingerprint, hasLabData,
} from '@/utils/fluidstudio/labData';

const DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'fluid-systems', 'lab');
const file = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
const ATM = 14.696;

const twin = () => readLabTable(file('good-oil-dl-twin.csv'));

describe('the plain differential liberation table', () => {
  it('reads twelve rows, finds every column by its header, and brings gauge pressure to absolute', () => {
    const r = twin();
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('dl');
    expect(r.rows).toHaveLength(12);
    expect(r.columns.map((c) => c.key)).toEqual(['pressure', 'Rs', 'Bo', 'Bt', 'density', 'Z', 'Bg', 'gasGravity']);
    expect(r.rows[0].pressure).toBeCloseTo(2620 + ATM, 9);
    expect(r.rows[0]).toMatchObject({ Rs: 854, Bo: 1.6, Bt: 1.6 });
    expect(r.rows[11].pressure).toBeCloseTo(ATM, 9);
    expect(r.rows[11].Rs).toBe(0);
    expect(r.summary).toMatch(/Differential liberation: 12 rows read/);
    expect(r.summary).toMatch(/Pressure in psig \(read from the header\), brought to absolute with 14\.696 psi/);
  });

  it('pins one known value per unit conversion', () => {
    const r = twin();
    const row = r.rows.find((x) => Math.abs(x.pressure - (2350 + ATM)) < 1e-6);
    // Bg 0.00685 ft3/scf is 0.00685 / 5.614583 RB/scf (a barrel is 5.614583 cubic feet)
    expect(row.Bg).toBeCloseTo(0.00685 / 5.614583, 9);
    // 0.6655 g/cm3 is 0.6655 x 62.42796 lb/ft3
    expect(row.density).toBeCloseTo(0.6655 * 62.42796, 4);
    expect(row.Z).toBe(0.846);
    expect(row.gasGravity).toBe(0.831);
    // a value that was not measured is absent, never zero
    expect(r.rows[0].Z).toBeUndefined();
    expect(r.rows[0].Bg).toBeUndefined();
  });

  it('negative control: read as psia and RB/scf, the same file is 14.7 psi low and Bg 5.6 times high', () => {
    const wrong = readLabTable(file('good-oil-dl-twin.csv').replace('(psig)', '').replace('(ft3/scf)', ''), { units: { pressure: 'psia', fvfGas: 'RB/scf' } });
    expect(wrong.ok).toBe(true);
    expect(wrong.rows[0].pressure).toBe(2620);
    expect(wrong.rows[1].Bg / twin().rows[1].Bg).toBeCloseTo(5.614583, 5);
    expect(wrong.summary).toMatch(/Pressure in psia \(as chosen\)/);
  });
});

describe('hostile shapes of the same table give the same rows', () => {
  const same = (rows) => {
    const t = twin().rows;
    expect(rows).toHaveLength(t.length);
    rows.forEach((r, i) => {
      for (const k of Object.keys(t[i])) expect(r[k]).toBeCloseTo(t[i][k], k === 'pressure' ? 2 : k === 'density' ? 3 : 5);
      expect(Object.keys(r).sort()).toEqual(Object.keys(t[i]).sort());
    });
  };

  it('semicolons, decimal commas, SI units in square brackets, another column order, a text column', () => {
    const r = readLabTable(file('good-oil-dl-si-semicolon.csv'));
    expect(r.ok).toBe(true);
    expect(r.decimal).toBe(',');
    expect(r.units.pressure).toEqual({ unit: 'kPa', fromHeader: true });
    expect(r.units.Rs).toEqual({ unit: 'm3/m3', fromHeader: true });
    expect(r.units.Bg).toEqual({ unit: 'm3/m3', fromHeader: true });
    expect(r.units.density).toEqual({ unit: 'kg/m3', fromHeader: true });
    expect(r.unmapped).toEqual(['Remarks']);
    expect(r.summary).toMatch(/Decimal commas/);
    // the SI file was written with rounded values: compare at the precision it holds
    const t = twin().rows;
    r.rows.forEach((row, i) => {
      expect(row.pressure).toBeCloseTo(t[i].pressure, 2);
      expect(row.Rs).toBeCloseTo(t[i].Rs, 2);
      expect(row.Bo).toBeCloseTo(t[i].Bo, 9);
      if (t[i].Bg !== undefined) expect(row.Bg / t[i].Bg).toBeCloseTo(1, 2);
      expect(row.density).toBeCloseTo(t[i].density, 2);
    });
  });

  it('tabs, CRLF, a title, the laboratory column names, a units row, thousands separators, text under the table', () => {
    const r = readLabTable(file('good-oil-dl-title-tabs.txt'));
    expect(r.ok).toBe(true);
    same(r.rows);
    expect(r.units.pressure).toEqual({ unit: 'psig', fromHeader: true });
    expect(r.units.Bg).toEqual({ unit: 'rcf/scf', fromHeader: true });
    expect(r.columns.find((c) => c.key === 'Bt').header).toBe('Relative Total Volume');
    expect(r.columns.find((c) => c.key === 'Bo').header).toBe('Relative Oil Volume, Bod');
    const reasons = r.skipped.map((s) => s.reason).join(' | ');
    expect(reasons).toMatch(/Text before the table/);
    expect(reasons).toMatch(/Comment line/);
    expect(r.skipped.some((s) => /60 F/.test(s.text))).toBe(true);
    expect(r.skipped.some((s) => /Residual Oil/.test(s.text))).toBe(true);
  });

  it('an Excel workbook: the table under its title rows, by sheet', () => {
    const wb = parseWorkbook(new Uint8Array(fs.readFileSync(path.join(DIR, 'good-oil-study.xlsx'))));
    expect(wb.sheets.map((s) => s.name)).toEqual(['Differential', 'Viscosity', 'Notes']);
    const dl = readLabTable(sheetText(wb.sheets[0].rows), { delimiter: '\t' });
    expect(dl.ok).toBe(true);
    same(dl.rows);
    const visc = readLabTable(sheetText(wb.sheets[1].rows), { delimiter: '\t' });
    expect(visc.kind).toBe('viscosity');
    expect(visc.rows).toHaveLength(18);
    const notes = readLabTable(sheetText(wb.sheets[2].rows), { delimiter: '\t' });
    expect(notes.ok).toBe(false);
  });
});

describe('the other tables of the study', () => {
  it('constant composition expansion: space separated, a dash for no value', () => {
    const r = readLabTable(file('good-oil-cce-spaces.txt'));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('cce');
    expect(r.rows).toHaveLength(24);
    expect(r.columns.map((c) => c.key)).toEqual(['pressure', 'relVol', 'yFunction', 'density']);
    expect(r.rows[0]).toMatchObject({ relVol: 0.9639 });
    expect(r.rows[0].yFunction).toBeUndefined();
    const last = r.rows[23];
    expect(last.pressure).toBeCloseTo(472 + ATM, 9);
    expect(last.relVol).toBe(3.7226);
    expect(last.yFunction).toBe(1.621);
    expect(last.density).toBeUndefined();
  });

  it('viscosity: quoted headers with a comma; the oil to gas viscosity ratio is not read as a viscosity', () => {
    const r = readLabTable(file('good-oil-viscosity.csv'));
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('viscosity');
    expect(r.columns.map((c) => c.key)).toEqual(['pressure', 'mu_o', 'mu_g']);
    expect(r.unmapped).toEqual(['Oil/Gas Viscosity Ratio']);
    expect(r.rows[0]).toMatchObject({ mu_o: 0.45 });
    expect(r.rows.find((x) => Math.abs(x.pressure - (2350 + ATM)) < 1e-6)).toMatchObject({ mu_o: 0.396, mu_g: 0.0191 });
  });
});

describe('what the door refuses, and says why', () => {
  it('a table with no header row', () => {
    const r = readLabTable(file('good-oil-dl-no-header.csv'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no header row/);
    expect(r.rows).toEqual([]);
  });
  it('a table that is not a laboratory table', () => {
    const r = readLabTable(file('not-a-lab-table.csv'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/No pressure column/);
  });
  it('a pressure column with nothing the door knows beside it', () => {
    const r = readLabTable('Pressure (psia),Water cut\n3000,0.1\n2000,0.2\n');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/No laboratory property column/);
  });
  it('empty text', () => {
    expect(readLabTable('').ok).toBe(false);
    expect(readLabTable(null).ok).toBe(false);
  });
  it('numbers that could be thousands or decimals raise the reader\'s question', () => {
    const r = readLabTable('Pressure (psia);Rsd\n2,620;854\n2,350;763\n2,100;684\n');
    expect(r.needsAnswer).toBe(true);
    expect(r.questions[0]).toMatch(/decimal/i);
    const answered = readLabTable('Pressure (psia);Rsd\n2,620;854\n2,350;763\n2,100;684\n', { decimal: '.' });
    expect(answered.needsAnswer).toBe(false);
    expect(answered.rows[0].pressure).toBe(2620);
  });
});

describe('the stored lab data', () => {
  const stored = () => ({
    ...emptyLabData(),
    dl: labTableOf(twin(), { name: 'good-oil-dl-twin.csv', tempF: 220, at: new Date('2026-10-02T09:00:00Z') }),
    cce: labTableOf(readLabTable(file('good-oil-cce-spaces.txt')), { name: 'cce', tempF: 220 }),
    viscosity: labTableOf(readLabTable(file('good-oil-viscosity.csv')), { name: 'visc', tempF: 220 }),
  });

  it('keeps the rows, the temperature, the file and the read-back', () => {
    const d = stored();
    expect(d.dl.rows).toHaveLength(12);
    expect(d.dl.tempF).toBe(220);
    expect(d.dl.source.name).toBe('good-oil-dl-twin.csv');
    expect(d.dl.source.importedAt).toBe('2026-10-02T09:00:00.000Z');
    expect(d.dl.source.summary).toMatch(/12 rows read/);
    expect(hasLabData({ labData: d })).toBe(true);
    expect(hasLabData({})).toBe(false);
    // survives the project payload (JSON)
    expect(labDataOf({ labData: JSON.parse(JSON.stringify(d)) }).dl.rows).toEqual(d.dl.rows);
    // a project saved before the door existed
    expect(labDataOf({})).toEqual(emptyLabData());
    expect(labTableOf({ ok: false })).toBeNull();
  });

  it('the saturation pressure is the CCE row with relative volume 1, else the top of the DL', () => {
    const d = stored();
    expect(labSaturationPressure(d)).toEqual({ pressure: 2620 + ATM, from: 'cce' });
    expect(labSaturationPressure({ ...d, cce: null })).toEqual({ pressure: 2620 + ATM, from: 'dl' });
    expect(labSaturationPressure(emptyLabData())).toBeNull();
  });

  it('GATE: differential data adjusted to the separator basis reproduce Ahmed, Example 3-5', () => {
    // Big Butte: Bodb 1.730, Rsdb 933, Bofb 1.527, Rsfb 646; at 1,100 psi Bod 1.563 and Rsd 622
    const rows = [{ pressure: 1936, Bo: 1.730, Rs: 933, Bt: 1.730 }, { pressure: 1100, Bo: 1.563, Rs: 622 }, { pressure: 1300, Bt: 2.171 }];
    const adj = adjustDlToSeparator(rows, { bofb: 1.527, rsfb: 646 });
    expect(adj[1].Bo).toBeCloseTo(1.379, 2); // printed 1.379 bbl/STB
    expect(Math.round(adj[1].Rs)).toBe(371); // printed 371 scf/STB
    expect(adj[2].Bt).toBeCloseTo(1.916, 3); // printed 1.916 bbl/STB (Equation 3-19)
    expect(adj[0].Bo).toBeCloseTo(1.527, 12);
    expect(adj[0].Rs).toBeCloseTo(646, 12);
    // negative control: the ratio upside down misses the printed values
    const flipped = adjustDlToSeparator(rows, { bofb: 1.730 * 1.730 / 1.527, rsfb: 646 });
    expect(Math.abs(flipped[1].Bo - 1.379)).toBeGreaterThan(0.2);
    expect(adjustDlToSeparator(rows, { bofb: null, rsfb: 646 })).toBeNull();
  });

  it('the Good Oil rows on the separator basis: Bo 1.396 and Rs 611 at 2,100 psig', () => {
    const d = { ...stored(), separatorTest: { bofb: 1.474, rsfb: 768 } };
    const c = labComparison(d);
    expect(c.basis.oil).toBe('adjusted');
    expect(c.comparable).toEqual({ bo: true, rs: true });
    const at = (list, psig) => list.find((p) => Math.abs(p.pressure - (psig + ATM)) < 1e-6).value;
    expect(at(c.points.bo, 2100)).toBeCloseTo(1.515 * 1.474 / 1.6, 12);
    expect(at(c.points.bo, 2100)).toBeCloseTo(1.396, 3);
    expect(at(c.points.rs, 2100)).toBeCloseTo(611.4, 1);
    // above the bubble point Bo is the CCE relative volume times Bofb
    expect(at(c.points.bo, 5000)).toBeCloseTo(0.9639 * 1.474, 12);
    expect(c.notes.join(' ')).toMatch(/relative volume of the constant composition expansion times the separator test Bofb/);
    // viscosity comes from the viscosity table when there is one
    expect(c.points.muo).toHaveLength(18);
    expect(c.points.relvol).toHaveLength(24);
    expect(c.points.z).toHaveLength(10);
    expect(c.points.bg).toHaveLength(10);
  });

  it('without the separator test the differential rows are drawn as differential and are not comparable', () => {
    const c = labComparison(stored());
    expect(c.basis.oil).toBe('differential');
    expect(c.comparable).toEqual({ bo: false, rs: false });
    expect(c.points.bo).toHaveLength(12); // no Bo above Pb without Bofb
    expect(c.basis.text).toMatch(/per barrel of residual oil/);
    const sep = labComparison({ ...stored(), dlBasis: 'separator' });
    expect(sep.basis.oil).toBe('separator');
    expect(sep.comparable.bo).toBe(true);
  });

  it('the fingerprint moves with a row, the basis or the separator test, and with nothing else', () => {
    const a = stored();
    const b = stored();
    b.dl.source.name = 'renamed.csv';
    expect(labFingerprint(a)).toBe(labFingerprint(b));
    b.dl.rows[3].Bo = 1.48;
    expect(labFingerprint(a)).not.toBe(labFingerprint(b));
    expect(labFingerprint(a)).not.toBe(labFingerprint({ ...stored(), separatorTest: { bofb: 1.474, rsfb: 768 } }));
    expect(labFingerprint(a)).not.toBe(labFingerprint({ ...stored(), dlBasis: 'separator' }));
  });
});

describe('the model set against the laboratory values', () => {
  // a small model table with a kink at Pb = 2000
  const rows = [
    { pressure: 3000, Rs: 500, Bo: 1.28, Bg: 0.0009, mu_o: 0.62 },
    { pressure: 2000, Rs: 500, Bo: 1.30, Bg: 0.0013, mu_o: 0.50 },
    { pressure: 1000, Rs: 250, Bo: 1.15, Bg: 0.0028, mu_o: 0.80 },
  ];
  it('interpolation never crosses the saturation pressure', () => {
    expect(modelAt(rows, 2000, 'Bo', 2500)).toBeCloseTo(1.29, 12);
    expect(modelAt(rows, 2000, 'Bo', 1500)).toBeCloseTo(1.225, 12);
    expect(modelAt(rows, 2000, 'Rs', 2500)).toBe(500);
    expect(modelAt(rows, 2000, 'Bo', 3500)).toBeNull();
    expect(modelAt(rows, 2000, 'Bo', 500)).toBeNull();
  });
  it('the model relative volume is Bo / Bob above Pb and the two-phase volume below', () => {
    const rel = modelRelativeVolume(rows, 2000);
    expect(rel.find((r) => r.pressure === 3000).Vrel).toBeCloseTo(1.28 / 1.30, 12);
    expect(rel.find((r) => r.pressure === 2000).Vrel).toBe(1);
    expect(rel.find((r) => r.pressure === 1000).Vrel).toBeCloseTo((1.15 + 250 * 0.0028) / 1.30, 12);
  });
  it('misfit per property: mean, bias, the largest and where; points outside the table counted', () => {
    const labData = {
      ...emptyLabData(), dlBasis: 'separator',
      dl: { kind: 'dl', rows: [{ pressure: 2000, Bo: 1.25, Rs: 500 }, { pressure: 1000, Bo: 1.15, Rs: 240 }, { pressure: 200, Bo: 1.05, Rs: 60 }] },
    };
    const m = labMisfit({ labData, rows, pb: 2000 });
    const bo = m.find((x) => x.id === 'bo');
    expect(bo.n).toBe(2);
    expect(bo.outside).toBe(1);
    expect(bo.points[0]).toMatchObject({ pressure: 1000, lab: 1.15, model: 1.15 });
    expect(bo.maxAbsPct).toBeCloseTo(4, 10); // 1.30 against 1.25
    expect(bo.maxAt).toBe(2000);
    expect(bo.meanAbsPct).toBeCloseTo(2, 10);
    expect(bo.biasPct).toBeCloseTo(2, 10);
    const rs = m.find((x) => x.id === 'rs');
    expect(rs.biasPct).toBeCloseTo((0 + (100 * 10) / 240) / 2, 10);
    expect(m.map((x) => x.id)).toEqual(['bo', 'rs']);
  });
});
