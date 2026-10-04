// WTA-U1-009 (Reservoir gap matrix, Well Test RL10): date/time stamps in a
// gauge file were read by Date.parse, which reads 03/09/2026 as 9 March
// and gives up on 13/09/2026. A gauge exported day first lost every reading
// with a day above 12 and read the rest a month out. The column is now read
// through the shared reader (src/lib/tabularParse.js): the order is settled
// by the file itself, never guessed, and an undecided file asks.
import { importGaugeCsv, convertGaugeRows, readGaugeTable, detectGaugeMapping } from '../gaugeImport';

const dayFirst = 'Date Time,Pressure (psia)\n12/09/2026 23:00,4500\n13/09/2026 00:00,4510\n13/09/2026 01:30,4520\n';

describe('gauge import: day-first date stamps', () => {
  test('a day-first file is read day first, from its own values', () => {
    const out = importGaugeCsv(dayFirst);
    expect(out.mapping.timeUnit).toBe('datetime');
    expect(out.mapping.dateOrder).toBe('dmy');
    expect(out.skipped).toBe(0);
    expect(out.rows.map((r) => r.t)).toEqual([0, 1, 2.5]);
  });

  test('a month-first file is read month first', () => {
    const out = importGaugeCsv('Date Time,P (psia)\n09/12/2026 23:00,4500\n09/13/2026 00:00,4510\n');
    expect(out.mapping.dateOrder).toBe('mdy');
    expect(out.rows.map((r) => r.t)).toEqual([0, 1]);
  });

  test('a file no value settles is not guessed: it asks, and reads once told', () => {
    const text = 'Date Time,P (psia)\n03/09/2026 06:00,4500\n03/09/2026 07:00,4510\n04/09/2026 07:00,4520\n';
    const out = importGaugeCsv(text);
    expect(out.mapping.dateOrder).toBeNull();
    expect(out.rows).toEqual([]);
    expect(out.dateQuestion).toMatchObject({ ambiguous: true });
    const dmy = convertGaugeRows(readGaugeTable(text), { ...detectGaugeMapping(readGaugeTable(text)), dateOrder: 'dmy' });
    expect(dmy.rows.map((r) => r.t)).toEqual([0, 1, 25]); // 3 Sept to 4 Sept
    const mdy = convertGaugeRows(readGaugeTable(text), { ...detectGaugeMapping(readGaugeTable(text)), dateOrder: 'mdy' });
    expect(mdy.rows.map((r) => r.t)).toEqual([0, 1, 24 * 31 + 1]); // 9 March to 9 April (31 days)
  });

  test('ISO stamps need no order', () => {
    const out = importGaugeCsv('Date Time,P (psia)\n2026-09-01 06:00:00,2880\n2026-09-01 07:30:00,2950\n');
    expect(out.rows.map((r) => r.t)).toEqual([0, 1.5]);
  });
});
