/**
 * SCAL-U2-011: lab xlsx at the doors. The kr, gas-oil and Pc doors take an
 * Excel workbook through the shared reader (src/lib/tabularFile.js
 * parseWorkbook, SheetJS): the first sheet that holds the door's table is
 * read with the same typed reader as a text file, and the read-back names
 * the sheet. Workbooks are built here with SheetJS itself.
 */
import * as XLSX from 'xlsx';
import { parseWorkbook, classifyFile } from '@/lib/tabularFile';
import { readLabFile, readKrTable } from '@/utils/scalstudio/labImport';

const book = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const loadedOf = (bytes) => ({ kind: 'workbook', ...parseWorkbook(bytes) });

const KR = [['Sw', 'krw', 'kro'], [0.2, 0, 0.9], [0.35, 0.015, 0.52], [0.5, 0.07, 0.24], [0.65, 0.18, 0.07], [0.75, 0.32, 0]];

describe('the lab doors read a workbook', () => {
  it('kr: the first sheet holding the table is read (a cover sheet is passed over) and named', () => {
    const bytes = book([['Cover', [['Core Lab Lagos'], ['Report SCAL-2026-0117']]], ['USS kr', KR]]);
    const res = readLabFile(loadedOf(bytes), 'kr');
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual(readKrTable('Sw,krw,kro\n0.2,0,0.9\n0.35,0.015,0.52\n0.5,0.07,0.24\n0.65,0.18,0.07\n0.75,0.32,0').rows);
    expect(res.sheet).toBe('USS kr');
    expect(res.summary).toMatch(/^Sheet "USS kr" of a workbook of 2 sheets\. 5 rows read, 0 left out\./);
  });

  it('Pc: a kPa header in a sheet is read in kPa and stored in psi (18.5 kPa = 2.6832 psi)', () => {
    const bytes = book([['Pc', [['Sw (frac)', 'Pc (kPa)'], [0.2, 18.5], [0.3, 9.6], [0.45, 4.8]]]]);
    const res = readLabFile(loadedOf(bytes), 'pc');
    expect(res.ok).toBe(true);
    expect(res.rows[0].Pc_psi).toBeCloseTo(2.6832, 4);
    expect(res.units.pc).toBe('kPa');
  });

  it('gas-oil: the gas-oil sheet is found among an oil-water one', () => {
    const bytes = book([['OW', KR], ['GO', [['Sg', 'krg', 'krog'], [0.05, 0, 0.85], [0.3, 0.1, 0.4], [0.65, 0.6, 0]]]]);
    const res = readLabFile(loadedOf(bytes), 'go');
    expect(res.ok).toBe(true);
    expect(res.sheet).toBe('GO');
    expect(res.rows[2]).toEqual({ Sg: 0.65, krg: 0.6, krog: 0 });
  });

  it('a workbook with no such table says which sheets were looked at', () => {
    const res = readLabFile(loadedOf(book([['Notes', [['nothing here']]]])), 'kr');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No sheet of the workbook holds a kr table \(looked at: Notes\)/);
  });

  it('NEGATIVE CONTROL: the text door on the workbook bytes reads no table (the U1 state)', () => {
    const bytes = book([['USS kr', KR]]);
    const asText = Buffer.from(bytes).toString('latin1');
    expect(readKrTable(asText).ok).toBe(false);
    expect(classifyFile('lab.xlsx')).toBe('workbook');
  });

  it('a delimited file goes through unchanged', () => {
    const res = readLabFile({ kind: 'delimited', text: 'Sw,krw,kro\n0.2,0,0.9\n0.5,0.07,0.24\n0.75,0.32,0\n' }, 'kr');
    expect(res.ok).toBe(true);
    expect(res.sheet).toBeUndefined();
  });
});

describe('the sheet travels to the report', () => {
  it('the imports table names the sheet', () => {
    // eslint-disable-next-line global-require
    const { reportOf, openingInputs } = require('./scalTestKit');
    const { importRecord } = require('@/utils/scalstudio/labImport');
    const res = readLabFile(loadedOf(book([['Cover', [['x']]], ['USS kr', KR]])), 'kr');
    const inputs = openingInputs();
    inputs.samples = [{ id: 's', name: 'Plug 3', k_md: '100', phi: '0.2', sigma_dyncm: '72', thetaDeg: '0', krRows: res.rows, pcRows: [], krImport: { ...importRecord(res, 'lab.xlsx'), sheet: res.sheet } }];
    const { model } = reportOf(inputs);
    expect(model.samples.imports.rows[0][1]).toMatch(/^lab\.xlsx \(sheet "USS kr"\): 5 read, 0 left out/);
  });
});
