// The shared table reader against a hostile file set (Reservoir round,
// Step 0a; gap matrix H12). Each file is the kind a customer sends: a
// European export, a pasted spreadsheet, a report with a title and a totals
// row. Negative controls show the old reading (strip every comma) is wrong
// on them, so the tests cannot pass by accident.
import {
  parseTabular, detectTableDelimiter, detectDecimalMark, parseNumber, parseDate, detectDateOrder,
  headerUnit, splitRows, isNullToken, columnValues, questionText, looksLikeDate,
} from '../tabularParse';
import * as door from '../tabularFile';

const oldNum = (v) => Number(String(v).trim().replace(/,/g, ''));   // what the importers did before

const HOSTILE = {
  // 1. semicolon file with decimal commas (German or French Excel)
  semicolonCommaDecimal: 'Zeit (h);Druck (bar);Temp (degC)\r\n0,0;250,75;85,5\r\n0,5;248,10;85,4\r\n1,25;1.245,5;85,4\r\n',
  // 2. tab file with thousands separators (pasted from a spreadsheet)
  tabThousands: 'Date\tCum Oil (STB)\tPressure (psia)\n2024-01-31\t1,234,567\t3,250.5\n2024-02-29\t1,301,220\t3,198.0\n2024-03-31\t1,377,015\t3,141.25\n',
  // 3. mixed blanks and null words
  mixedBlanks: 'time,pressure,rate\n0,3000,\n1,NaN,250\n2,2950,n/a\n3,,-\n4,2900,#N/A\n5,null,240\n',
  // 4. day-first dates (some day above 12 settles it)
  dayFirst: 'Date,Np\n31/01/2024,0\n29/02/2024,1200\n05/03/2024,2400\n',
  // 5. dates no value settles
  ambiguousDates: 'Date,Np\n01/02/2024,0\n01/03/2024,1200\n01/04/2024,2400\n',
  // 6. a header with units in brackets, three bracket styles
  bracketUnits: 'Elapsed Time [hr],BHP (psia),Rate {STB/D},Remark\n0,3000,500,start\n1,2950,500,\n2,2910,480,choke change\n',
  // 7. a totals row and a title above the table
  totalsRow: 'Field Alpha monthly production\nExported 2024-04-01\n\nMonth,Oil (bbl),Gas (Mscf)\n2024-01,1000,500\n2024-02,1100,520\n2024-03,1050,515\nTotal,3150,1535\n',
  // 8. BOM, CRLF, quoted fields with the delimiter, a doubled quote and a line break inside
  quoted: '﻿"Well","Comment","Rate"\r\n"A-1","flowing, stable",500\r\n"A-2","5"" liner\r\nsecond line",420\r\n',
  // 9. white-space columns
  whitespace: '  t(hr)    p(psia)\n  0.0     3000.0\n  0.5     2987.5\n  1.0     2975.25\n',
  // 10. ragged: a short row, a long row, a repeated header, a comment
  ragged: 'time,pressure,rate\n0,3000,500\n1,2950\n2,2900,480,extra,cells\ntime,pressure,rate\n# gauge changed\n3,2850,470\n,,\n',
  // 11. comma file with quoted decimal commas
  quotedCommaDecimal: 'time,pressure\n"0,5","3000,25"\n"1,0","2990,75"\n',
  // 12. numbers that could be thousands or three decimals
  openCommas: 'a;b\n1,234;2,500\n3,100;4,750\n',
  // 13. ISO date-times with an offset, and a units row under the header
  isoTimes: 'Timestamp,Pressure\n-,kPa\n2024-05-01T08:00:00Z,20000\n2024-05-01T09:30:00+01:00,19950\n2024-05-01 10:00:00,19900\n',
  // 14. spaces and apostrophes as thousands separators
  swiss: "Datum;Menge\n31.12.2023;1'234'567.5\n31.01.2024;1 301 220,25\n",
};

describe('delimiter', () => {
  test.each([
    ['semicolonCommaDecimal', ';'], ['tabThousands', '\t'], ['mixedBlanks', ','], ['bracketUnits', ','],
    ['totalsRow', ','], ['quoted', ','], ['whitespace', ' '], ['openCommas', ';'], ['swiss', ';'],
  ])('%s', (name, want) => { expect(detectTableDelimiter(HOSTILE[name])).toBe(want); });
  test('a semicolon file with a decimal comma in every cell is not a comma file', () => {
    // split on commas every data row has a steady four fields: the trap a
    // field-count guess falls into
    const byComma = splitRows(HOSTILE.semicolonCommaDecimal, ',').slice(1).map((r) => r.cells.length);
    expect(byComma).toEqual([4, 4, 4]);
    expect(detectTableDelimiter(HOSTILE.semicolonCommaDecimal)).toBe(';');
  });
  test('a single column and an empty text read as comma', () => {
    expect(detectTableDelimiter('value\n1\n2\n')).toBe(',');
    expect(detectTableDelimiter('')).toBe(',');
  });
});

describe('decimal mark', () => {
  test('semicolon file with decimal commas (H12)', () => {
    const t = parseTabular(HOSTILE.semicolonCommaDecimal);
    expect(t.decimal).toMatchObject({ mark: ',', certain: true });
    expect(columnValues(t, 0)).toEqual([0, 0.5, 1.25]);
    expect(columnValues(t, 1)).toEqual([250.75, 248.1, 1245.5]);      // 1.245,5: the point groups thousands
    expect(columnValues(t, 2)).toEqual([85.5, 85.4, 85.4]);
    expect(t.needsAnswer).toBe(false);
    // negative control: the old reading turns 250,75 bar into 25075
    expect(oldNum('250,75')).toBe(25075);
    expect(oldNum('0,5')).toBe(5);
  });
  test('tab file with thousands separators', () => {
    const t = parseTabular(HOSTILE.tabThousands);
    expect(t.decimal).toMatchObject({ mark: '.', certain: true });
    expect(columnValues(t, 1)).toEqual([1234567, 1301220, 1377015]);
    expect(columnValues(t, 2)).toEqual([3250.5, 3198, 3141.25]);
  });
  test('quoted decimal commas in a comma file', () => {
    const t = parseTabular(HOSTILE.quotedCommaDecimal);
    expect(t.delimiter).toBe(',');
    expect(t.decimal).toMatchObject({ mark: ',', certain: true });
    expect(columnValues(t, 0)).toEqual([0.5, 1]);
    expect(columnValues(t, 1)).toEqual([3000.25, 2990.75]);
  });
  test('1,234 alone is an open question, returned to the caller and never settled silently', () => {
    const t = parseTabular(HOSTILE.openCommas);
    expect(t.decimal.certain).toBe(false);
    expect(t.decimal.mark).toBe(',');                 // the usual reading of a semicolon file, flagged
    expect(t.needsAnswer).toBe(true);
    expect(t.questions).toEqual([expect.objectContaining({ kind: 'decimalMark', assumed: ',' })]);
    expect(questionText(t.questions[0])).toMatch(/thousands or for decimals/);
    expect(columnValues(t, 0)).toEqual([1.234, 3.1]);
    // the user's answer is taken
    const asThousands = parseTabular(HOSTILE.openCommas, { decimal: '.' });
    expect(asThousands.needsAnswer).toBe(false);
    expect(columnValues(asThousands, 0)).toEqual([1234, 3100]);
    // in a comma or tab file the same shape is read as thousands, also flagged
    expect(detectDecimalMark(['1,234', '2,500'], { delimiter: '\t' })).toMatchObject({ mark: '.', certain: false });
  });
  test('the evidence rules', () => {
    expect(detectDecimalMark(['3000,25'])).toMatchObject({ mark: ',', certain: true });
    expect(detectDecimalMark(['0,250'])).toMatchObject({ mark: ',', certain: true });        // a group never starts with 0
    expect(detectDecimalMark(['1,234,567'])).toMatchObject({ mark: '.', certain: true });
    expect(detectDecimalMark(['1.234.567'])).toMatchObject({ mark: ',', certain: true });
    expect(detectDecimalMark(['1,234.5'])).toMatchObject({ mark: '.', certain: true });
    expect(detectDecimalMark(['1.234,5'])).toMatchObject({ mark: ',', certain: true });
    expect(detectDecimalMark(['1,234', '0.85'])).toMatchObject({ mark: '.', certain: true });
    expect(detectDecimalMark(['12', '300'])).toMatchObject({ mark: '.', certain: true });
    expect(detectDecimalMark(['1,5', '2.5'])).toMatchObject({ certain: false });               // a mixed file is flagged
    expect(detectDecimalMark(['31.12.2023', '01.02.2024', '5'])).toMatchObject({ mark: '.', certain: true });   // dates are not numbers
  });
  test('spaces and apostrophes group thousands', () => {
    const t = parseTabular(HOSTILE.swiss);
    expect(t.columns[0].kind).toBe('date');
    expect(columnValues(t, 0).map((d) => d.iso)).toEqual(['2023-12-31', '2024-01-31']);
    expect(t.decimal.certain).toBe(false);            // one row uses a point, the other a comma: flagged
    expect(parseNumber("1'234'567.5")).toBe(1234567.5);
    expect(parseNumber('1 301 220,25', { decimal: ',' })).toBe(1301220.25);
    expect(parseNumber('1 301 220,25', { decimal: ',' })).toBe(1301220.25);
  });
});

describe('parseNumber', () => {
  test('well-formed numbers', () => {
    expect(parseNumber('3000.25')).toBe(3000.25);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('1.234,5', { decimal: ',' })).toBe(1234.5);
    expect(parseNumber('0,5', { decimal: ',' })).toBe(0.5);
    expect(parseNumber(' -1.5e-3 ')).toBe(-0.0015);
    expect(parseNumber('1,5E3', { decimal: ',' })).toBe(1500);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('5.')).toBe(5);
    expect(parseNumber('+7')).toBe(7);
    expect(parseNumber('−3.5')).toBe(-3.5);       // a typographic minus
    expect(parseNumber(42)).toBe(42);
  });
  test('a misplaced group separator is refused, never dropped', () => {
    expect(Number.isNaN(parseNumber('1,23'))).toBe(true);
    expect(Number.isNaN(parseNumber('3000,25'))).toBe(true);      // with a decimal point this is not a number
    expect(Number.isNaN(parseNumber('12,34,567'))).toBe(true);
    expect(Number.isNaN(parseNumber('1.23.4', { decimal: ',' }))).toBe(true);
  });
  test('null words, text and non-finite values give NaN', () => {
    for (const v of ['', '  ', 'NaN', 'n/a', 'NULL', '-', '--', '#N/A', '#DIV/0!', null, undefined, 'abc', '12abc', 'Infinity', '1e', '.', ',', Infinity]) {
      expect(Number.isNaN(parseNumber(v))).toBe(true);
    }
    expect(isNullToken('N/A')).toBe(true);
    expect(isNullToken('0')).toBe(false);
  });
});

describe('blank and null tokens', () => {
  test('mixed blanks', () => {
    const t = parseTabular(HOSTILE.mixedBlanks);
    expect(t.rows).toHaveLength(6);
    expect(columnValues(t, 0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(columnValues(t, 1)).toEqual([3000, null, 2950, null, 2900, null]);
    expect(columnValues(t, 2)).toEqual([null, 250, null, null, null, 240]);
    expect(t.columns[1]).toMatchObject({ kind: 'number', values: 3, nulls: 3, unreadable: 0 });
    expect(t.report.unreadable).toEqual([]);
  });
  test('an app can add its own null value', () => {
    const t = parseTabular('d,v\n1,-999.25\n2,5\n', { nullTokens: ['-999.25'] });
    expect(columnValues(t, 1)).toEqual([null, 5]);
  });
  test('text in a number column is reported, with its line', () => {
    const t = parseTabular('t,p\n0,3000\n1,29x0\n2,2900\n');
    expect(columnValues(t, 1)).toEqual([3000, null, 2900]);
    expect(t.report.unreadable).toEqual([{ line: 3, column: 1, text: '29x0', reason: 'not a number' }]);
  });
});

describe('dates', () => {
  test('day-first dates are settled by the file', () => {
    const t = parseTabular(HOSTILE.dayFirst);
    expect(t.columns[0]).toMatchObject({ kind: 'date' });
    expect(t.columns[0].dateOrder).toMatchObject({ order: 'dmy', certain: true, from: 'file' });
    expect(columnValues(t, 0).map((d) => d.iso)).toEqual(['2024-01-31', '2024-02-29', '2024-03-05']);
    expect(t.needsAnswer).toBe(false);
  });
  test('month-first dates are settled by the file', () => {
    const t = parseTabular('Date,Np\n01/31/2024,0\n02/29/2024,1\n03/05/2024,2\n');
    expect(t.columns[0].dateOrder.order).toBe('mdy');
    expect(columnValues(t, 0).map((d) => d.iso)).toEqual(['2024-01-31', '2024-02-29', '2024-03-05']);
  });
  test('an ambiguous column is not read: the question goes back to the caller', () => {
    const t = parseTabular(HOSTILE.ambiguousDates);
    expect(t.columns[0].kind).toBe('date');
    expect(t.columns[0].dateOrder).toMatchObject({ order: null, ambiguous: true, asked: true });
    expect(columnValues(t, 0)).toEqual([null, null, null]);        // no silent guess
    expect(t.needsAnswer).toBe(true);
    expect(t.questions).toEqual([expect.objectContaining({ kind: 'dateOrder', column: 0, header: 'Date' })]);
    expect(questionText(t.questions[0])).toMatch(/day first or month first/);
    expect(t.report.unreadable).toEqual([]);                       // waiting is not an error
    expect(columnValues(t, 1)).toEqual([0, 1200, 2400]);           // the other columns are read
    // the two answers give different dates
    const dmy = parseTabular(HOSTILE.ambiguousDates, { dateOrder: 'dmy' });
    const mdy = parseTabular(HOSTILE.ambiguousDates, { dateOrder: { 0: 'mdy' } });
    expect(columnValues(dmy, 0).map((d) => d.iso)).toEqual(['2024-02-01', '2024-03-01', '2024-04-01']);
    expect(columnValues(mdy, 0).map((d) => d.iso)).toEqual(['2024-01-02', '2024-01-03', '2024-01-04']);
    expect(dmy.needsAnswer).toBe(false);
    expect(dmy.columns[0].dateOrder.from).toBe('user');
  });
  test('a column whose dates disagree is a question too, and the answer flags the rows that do not fit', () => {
    const text = 'Date,v\n25/03/2024,1\n03/25/2024,2\n04/05/2024,3\n';
    const t = parseTabular(text);
    expect(t.questions[0]).toMatchObject({ kind: 'dateOrder', conflict: true });
    const dmy = parseTabular(text, { dateOrder: 'dmy' });
    expect(columnValues(dmy, 0).map((d) => d && d.iso)).toEqual(['2024-03-25', null, '2024-05-04']);
    expect(dmy.report.unreadable).toEqual([expect.objectContaining({ line: 3, column: 0, text: '03/25/2024' })]);
  });
  test('the file beats a wrong answer', () => {
    const t = parseTabular(HOSTILE.dayFirst, { dateOrder: 'mdy' });
    expect(columnValues(t, 0).map((d) => d.iso)).toEqual(['2024-01-31', '2024-02-29', '2024-03-05']);
  });
  test('ISO dates and date-times, with and without an offset, and a units row', () => {
    const t = parseTabular(HOSTILE.isoTimes);
    expect(t.unitsRow).toMatchObject({ line: 2 });
    expect(t.columns[1]).toMatchObject({ name: 'Pressure', unit: 'kPa', kind: 'number' });
    const d = columnValues(t, 0);
    expect(d.map((x) => x.iso)).toEqual(['2024-05-01', '2024-05-01', '2024-05-01']);
    expect(d.map((x) => x.time)).toEqual(['08:00:00', '09:30:00', '10:00:00']);
    expect(d[0].ms).toBe(Date.UTC(2024, 4, 1, 8, 0, 0));
    expect(d[1].ms).toBe(Date.UTC(2024, 4, 1, 8, 30, 0));          // +01:00
    expect(d[2].ms).toBe(Date.UTC(2024, 4, 1, 10, 0, 0));          // no offset: wall clock
    expect(t.needsAnswer).toBe(false);
  });
  test('parseDate forms', () => {
    expect(parseDate('2024-02-29').iso).toBe('2024-02-29');
    expect(parseDate('2024/3/5').iso).toBe('2024-03-05');
    expect(parseDate('31-May-2024').iso).toBe('2024-05-31');
    expect(parseDate('May 31, 2024').iso).toBe('2024-05-31');
    expect(parseDate('Sept 2024').iso).toBe('2024-09-01');
    expect(parseDate('31.12.2023').iso).toBe('2023-12-31');
    expect(parseDate('05/04/24', { order: 'dmy' }).iso).toBe('2024-04-05');
    expect(parseDate('05/04/2024 2:30 PM', { order: 'mdy' })).toMatchObject({ iso: '2024-05-04', time: '14:30:00' });
    expect(parseDate('2024-05-01T08:00:00.250Z').ms).toBe(Date.UTC(2024, 4, 1, 8, 0, 0, 250));
    // refused
    expect(parseDate('05/04/2024')).toBeNull();                     // no order, none in the value
    expect(parseDate('31/02/2024')).toBeNull();                     // no such day
    expect(parseDate('2023-02-29')).toBeNull();
    expect(parseDate('25/03/2024', { order: 'mdy' })).toBeNull();
    expect(parseDate('13/13/2024')).toBeNull();
    expect(parseDate('3000.5')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(looksLikeDate('05/04/2024')).toBe(true);
    expect(looksLikeDate('1.234')).toBe(false);
  });
  test('detectDateOrder', () => {
    expect(detectDateOrder(['01/02/2024', '13/02/2024'])).toMatchObject({ order: 'dmy', certain: true });
    expect(detectDateOrder(['01/02/2024', '02/13/2024'])).toMatchObject({ order: 'mdy', certain: true });
    expect(detectDateOrder(['01/02/2024'])).toMatchObject({ order: null, ambiguous: true });
    expect(detectDateOrder(['2024-01-02', '31-May-2024'])).toMatchObject({ order: null, ambiguous: false, numeric: 0, fixed: 2 });
  });
});

describe('header', () => {
  test('units in brackets', () => {
    const t = parseTabular(HOSTILE.bracketUnits);
    expect(t.header.line).toBe(1);
    expect(t.columns.map((c) => [c.name, c.unit, c.kind])).toEqual([
      ['Elapsed Time', 'hr', 'number'], ['BHP', 'psia', 'number'], ['Rate', 'STB/D', 'number'], ['Remark', null, 'text'],
    ]);
    expect(columnValues(t, 3)).toEqual(['start', null, 'choke change']);
    expect(headerUnit('Pressure (psia)')).toEqual({ name: 'Pressure', unit: 'psia' });
    expect(headerUnit('Bg [rb/Mscf]')).toEqual({ name: 'Bg', unit: 'rb/Mscf' });
    expect(headerUnit('Pressure_psia')).toEqual({ name: 'Pressure_psia', unit: null });
    expect(headerUnit('(psia)')).toEqual({ name: '(psia)', unit: 'psia' });
  });
  test('no header: columns are numbered and the first row is data', () => {
    const t = parseTabular('0,3000\n1,2950\n2,2900\n');
    expect(t.header).toBeNull();
    expect(t.rows).toHaveLength(3);
    expect(t.columns.map((c) => c.name)).toEqual(['Column 1', 'Column 2']);
  });
  test('a text column does not make the first data row a header', () => {
    const t = parseTabular('A-1,2024-01-31,300\nA-2,2024-02-29,310\nA-3,2024-03-31,305\n');
    expect(t.header).toBeNull();
    expect(t.rows).toHaveLength(3);
    expect(t.columns.map((c) => c.kind)).toEqual(['text', 'date', 'number']);
  });
  test('the caller can force a header or none', () => {
    expect(parseTabular('1,2\n3,4\n', { header: true }).header.cells).toEqual(['1', '2']);
    expect(parseTabular('t,p\n0,1\n', { header: false }).rows).toHaveLength(2);
  });
  test('white-space columns', () => {
    const t = parseTabular(HOSTILE.whitespace);
    expect(t.delimiterName).toBe('white space');
    expect(t.columns.map((c) => [c.name, c.unit])).toEqual([['t', 'hr'], ['p', 'psia']]);
    expect(columnValues(t, 1)).toEqual([3000, 2987.5, 2975.25]);
  });
});

describe('BOM, CRLF and quoted fields', () => {
  test('quoted', () => {
    const t = parseTabular(HOSTILE.quoted);
    expect(t.bom).toBe(true);
    expect(t.header.cells).toEqual(['Well', 'Comment', 'Rate']);     // no BOM glued to the first name
    expect(t.rows.map((r) => r.cells)).toEqual([
      ['A-1', 'flowing, stable', '500'],
      ['A-2', '5" liner\r\nsecond line', '420'],
    ]);
    expect(columnValues(t, 2)).toEqual([500, 420]);
    expect(t.rows.map((r) => r.line)).toEqual([2, 3]);
  });
  test('CR alone and LF alone end a row; no row is lost at the end of the file', () => {
    expect(parseTabular('a,b\r1,2\r3,4').rows).toHaveLength(2);
    expect(parseTabular('a,b\n1,2\n3,4').rows).toHaveLength(2);
    expect(parseTabular('a,b\r\n1,2\r\n\r\n3,4\r\n\r\n').rows.map((r) => r.line)).toEqual([2, 4]);
  });
});

describe('row report', () => {
  test('a title above the table and a totals row', () => {
    const t = parseTabular(HOSTILE.totalsRow);
    expect(t.header).toMatchObject({ line: 4, cells: ['Month', 'Oil (bbl)', 'Gas (Mscf)'] });
    expect(t.rows).toHaveLength(3);
    expect(columnValues(t, 1)).toEqual([1000, 1100, 1050]);
    expect(columnValues(t, 1).reduce((a, b) => a + b, 0)).toBe(3150);   // the total is not counted twice
    expect(t.report.skipped).toEqual([
      { line: 1, reason: 'text before the table', text: 'Field Alpha monthly production' },
      { line: 2, reason: 'text before the table', text: 'Exported 2024-04-01' },
      { line: 8, reason: 'totals row', text: 'Total,3150,1535' },
    ]);
  });
  test('ragged rows: which were left out, which were padded, and why', () => {
    const t = parseTabular(HOSTILE.ragged);
    expect(t.rows.map((r) => r.line)).toEqual([2, 3, 7]);
    expect(columnValues(t, 0)).toEqual([0, 1, 3]);
    expect(columnValues(t, 2)).toEqual([500, null, 470]);
    expect(t.report.padded).toEqual([{ line: 3, fields: 2, expected: 3 }]);
    expect(t.report.skipped).toEqual(expect.arrayContaining([
      { line: 4, reason: '5 fields where 3 were expected', text: '2,2900,480,extra,cells' },
      { line: 5, reason: 'repeated header', text: 'time,pressure,rate' },
      { line: 6, reason: 'comment line', text: '# gauge changed' },
      { line: 8, reason: 'empty row', text: ',,' },
    ]));
    expect(t.report.skipped).toHaveLength(4);
  });
  test('a trailing delimiter on every line is not a column', () => {
    const t = parseTabular('t;p;\n0;1;\n1;2;\n');
    expect(t.columnCount).toBe(2);
    expect(t.report.skipped).toEqual([]);
    expect(t.report.padded).toEqual([]);
  });
  test('empty input', () => {
    for (const text of ['', '\n\n', null, undefined]) {
      const t = parseTabular(text);
      expect(t.rows).toEqual([]);
      expect(t.columns).toEqual([]);
      expect(t.needsAnswer).toBe(false);
    }
  });
});

describe('one door', () => {
  test('src/lib/tabularFile.js exports the typed reader beside its own file reading', () => {
    for (const name of ['parseTabular', 'parseNumber', 'detectDecimalMark', 'detectTableDelimiter', 'parseDate', 'detectDateOrder',
      'headerUnit', 'isNullToken', 'columnValues', 'questionText', 'looksLikeDate', 'splitRows']) {
      expect(typeof door[name]).toBe('function');
    }
    expect(door.parseTabular).toBe(parseTabular);
    // and what it exported before is still there, unchanged in kind
    expect(Array.isArray(door.DELIMITERS)).toBe(true);
    for (const name of ['detectDelimiter', 'splitDelimited', 'detectHeader', 'parseDelimitedText', 'parseWorkbook', 'readTabularFile', 'classifyFile']) {
      expect(typeof door[name]).toBe('function');
    }
    expect(door.detectDelimiter('a b\n1 2\n')).toBe('whitespace');
  });
});

describe('pure', () => {
  test('the same text gives the same result and the input is untouched', () => {
    const text = HOSTILE.semicolonCommaDecimal;
    expect(JSON.stringify(parseTabular(text))).toBe(JSON.stringify(parseTabular(text)));
    expect(text).toBe(HOSTILE.semicolonCommaDecimal);
  });
  test('the module reaches for nothing outside itself', () => {
    // eslint-disable-next-line global-require
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tabularParse.js'), 'utf8');
    expect(src).not.toMatch(/^import /m);
    expect(src).not.toMatch(/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|document\.|window\.|require\()/);
  });
});
