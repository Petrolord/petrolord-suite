// H12 (Reservoir gap matrix): the gauge import read a decimal comma as a
// thousands separator. A European export (semicolon columns, decimal
// commas) gave 25075 bar for 250,75 bar. The number reading now comes from
// the shared table reader (src/lib/tabularFile.js).
import { importGaugeCsv, readGaugeTable, detectGaugeMapping, convertGaugeRows, ATM_PSI } from '../gaugeImport';

const PSI_PER_BAR = 100 / 6.894757293168361;

describe('gauge import: decimal commas (H12)', () => {
  test('semicolon columns with decimal commas', () => {
    const text = 'Zeit (hr);Druck (bara);Temperatur (degC)\r\n0,0;250,75;85,5\r\n0,5;248,10;85,4\r\n1,25;245,5;85,4\r\n';
    const out = importGaugeCsv(text);
    expect(out.table.headers).toEqual(['Zeit (hr)', 'Druck (bara)', 'Temperatur (degC)']);
    expect(out.table.decimal).toMatchObject({ mark: ',', certain: true });
    expect(out.skipped).toBe(0);
    expect(out.rows.map((r) => r.t)).toEqual([0, 0.5, 1.25]);
    expect(out.rows[0].p).toBeCloseTo(250.75 * PSI_PER_BAR, 9);
    expect(out.rows[1].p).toBeCloseTo(248.1 * PSI_PER_BAR, 9);
    expect(out.rows[0].T).toBeCloseTo(85.5 * 1.8 + 32, 9);
    // the defect: 250,75 read as 25075
    expect(out.rows[0].p).toBeLessThan(5000);
  });
  test('tab columns with decimal commas and no header', () => {
    const out = importGaugeCsv('0,0\t3000,25\n0,5\t2990,75\n1,0\t2981,5\n');
    expect(out.rows).toEqual([{ t: 0, p: 3000.25 }, { t: 0.5, p: 2990.75 }, { t: 1, p: 2981.5 }]);
  });
  test('quoted decimal commas in a comma file', () => {
    const out = importGaugeCsv('time (hr),pressure (psig)\n"0,5","3000,25"\n"1,0","2990,75"\n');
    expect(out.rows[0].t).toBe(0.5);
    expect(out.rows[0].p).toBeCloseTo(3000.25 + ATM_PSI, 9);
  });
  test('thousands separators still read as thousands', () => {
    const out = importGaugeCsv('t (hr)\tp (psia)\n0\t3,250.5\n1\t3,198.0\n2\t13,141.25\n');
    expect(out.table.decimal).toMatchObject({ mark: '.', certain: true });
    expect(out.rows.map((r) => r.p)).toEqual([3250.5, 3198, 13141.25]);
    const quoted = importGaugeCsv('t,p\n0,"1,234,567"\n1,"1,200,000"\n');
    expect(quoted.rows.map((r) => r.p)).toEqual([1234567, 1200000]);
  });
  test('a file that cannot settle the mark says so and keeps the historical reading', () => {
    const table = readGaugeTable('t,p\n0,"3,250"\n1,"3,198"\n');
    expect(table.decimal).toMatchObject({ mark: '.', certain: false });
    const mapping = detectGaugeMapping(table);
    expect(convertGaugeRows(table, mapping).rows.map((r) => r.p)).toEqual([3250, 3198]);
  });
  test('the public shape is unchanged for a caller that builds its own table', () => {
    // { headers, rows } with no decimal field: the mark is found from the rows
    const table = { headers: ['t', 'p'], rows: [['0,5', '3000,25'], ['1,0', '2990,75']] };
    const mapping = detectGaugeMapping(table);
    expect(mapping).toMatchObject({ timeCol: 0, pressureCol: 1 });
    expect(convertGaugeRows(table, mapping).rows).toEqual([{ t: 0.5, p: 3000.25 }, { t: 1, p: 2990.75 }]);
  });
});
