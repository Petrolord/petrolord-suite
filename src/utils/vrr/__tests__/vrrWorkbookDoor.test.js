// VRR-U2-006: Excel workbooks at the ledger door, through the shared reader
// (src/lib/tabularFile.js readTabularFile / parseWorkbook). The fixture
// e2e/fixtures/vrr/twin-ledger.xlsx holds the twin ledger on its second
// sheet ("Allocation", under a title line and a blank row, dates as Excel
// date cells) after a notes sheet; it must read to the twin.
import fs from 'fs';
import path from 'path';
import { parseWorkbook } from '@/lib/tabularFile';
import { parseVrrWellCSV, readLedgerFile, readPressureFile } from '../csvImport';
import { buildFieldPeriods } from '@/utils/vrrCalculations';

const FIX = path.resolve(__dirname, '../../../../e2e/fixtures/vrr');
const twin = parseVrrWellCSV(fs.readFileSync(path.join(FIX, 'hostile/twin-ledger.csv'), 'utf8'));
const bytes = new Uint8Array(fs.readFileSync(path.join(FIX, 'twin-ledger.xlsx')));

describe('VRR-U2-006: the workbook door', () => {
  it('reads the ledger sheet of a workbook to the twin and names the sheet', () => {
    const r = readLedgerFile({ kind: 'workbook', ...parseWorkbook(bytes) });
    expect(r.ok).toBe(true);
    expect(r.sheet).toBe('Allocation');
    expect(r.report.sheet).toBe('Allocation');
    expect(r.report.sheetNote).toBe('Sheet "Allocation" of a workbook of 2 sheets.');
    const a = buildFieldPeriods(r.rows);
    const b = buildFieldPeriods(twin.rows);
    expect(a.map((p) => p.label)).toEqual(b.map((p) => p.label));
    a.forEach((p, i) => { for (const k of ['Np', 'Wp', 'Gp', 'Wi', 'Gi']) expect(p[k]).toBeCloseTo(b[i][k], 6); });
    expect(r.rows.map((x) => x.date)).toEqual(twin.rows.map((x) => x.date));
  });
  it('NEGATIVE CONTROL: the workbook read as text (the door before) holds no table', () => {
    const asText = Buffer.from(bytes).toString('latin1');
    expect(parseVrrWellCSV(asText).ok).toBe(false);
  });
  it('a delimited file passes straight through to the text door', () => {
    const text = fs.readFileSync(path.join(FIX, 'hostile/h03-rates-on-monthly-rows.csv'), 'utf8');
    expect(readLedgerFile({ kind: 'delimited', text }).rows).toEqual(parseVrrWellCSV(text).rows);
  });
  it('a workbook with no ledger sheet is refused, naming the sheets it looked at', () => {
    const notes = parseWorkbook(bytes).sheets.filter((s) => s.name === 'Notes');
    const r = readLedgerFile({ kind: 'workbook', sheets: notes });
    expect(r.ok).toBe(false);
    expect(r.refusal).toMatch(/No sheet of the workbook holds a per-well ledger \(looked at: Notes\)/);
  });
  it('the pressure door reads a workbook sheet too', () => {
    const sheets = [{ name: 'Surveys', rows: [['Survey date', 'Pressure (psia)'], ['2025-01-15', '3000'], ['2025-03-15', '2800']] }];
    const r = readPressureFile({ kind: 'workbook', sheets });
    expect(r.surveys.map((s) => s.p_psia)).toEqual([3000, 2800]);
    expect(r.sheet).toBe('Surveys');
  });
});
