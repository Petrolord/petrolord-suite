// Import-door file reading: explicit delimiters, workbook sheets, header
// detection shared with the text path, and unsupported types refused by
// name. The workbook fixture is written with SheetJS in the test so the
// bytes are real xlsx, not a hand-made stub.

import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  classifyFile, unsupportedFileMessage, detectDelimiter, splitDelimited, parseDelimitedText,
  parseWorkbook, tableFromRows, tidySheetRows, DELIMITERS,
} from '../tabularFile';
import { parseDelimited } from '../wellImport';

test('classifyFile by extension; unsupported names get an actionable message', () => {
  expect(classifyFile('run1.CSV')).toBe('delimited');
  expect(classifyFile('run1.tsv')).toBe('delimited');
  expect(classifyFile('run1.xlsx')).toBe('workbook');
  expect(classifyFile('run1.xls')).toBe('workbook');
  expect(classifyFile('run1.pdf')).toBe('unsupported');
  expect(classifyFile('noext')).toBe('unsupported');
  expect(unsupportedFileMessage('run1.pdf')).toMatch(/\.pdf files are not supported/);
  expect(unsupportedFileMessage('run1.pdf')).toMatch(/\.xlsx/);
});

test('explicit delimiters split as asked; auto matches the old detector', () => {
  const csv = 'MD,Inc,Azi\n0,0,0\n100,1.5,45';
  expect(splitDelimited(csv, ',').rows[1]).toEqual(['0', '0', '0']);
  // forcing semicolon on a comma file yields one column per row (visible in the preview)
  expect(splitDelimited(csv, ';').rows[1]).toEqual(['0,0,0']);
  expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
  expect(detectDelimiter('0  0  0\n100 1 45')).toBe('whitespace');
  expect(parseDelimitedText(csv).delimiter).toBe(',');
  expect(parseDelimitedText(csv, { delimiter: 'auto' }).header).toEqual(['MD', 'Inc', 'Azi']);
  expect(parseDelimitedText('0 0 0\n100 1 45', { delimiter: 'whitespace' })).toEqual({
    header: null, rows: [['0', '0', '0'], ['100', '1', '45']], delimiter: 'whitespace',
  });
  expect(DELIMITERS.map((d) => d.id)).toEqual(['auto', ',', '\t', ';', 'whitespace']);
});

test('wellImport.parseDelimited keeps its shape and accepts a delimiter option', () => {
  expect(parseDelimited('NAME,MD\nTopA,100')).toEqual({ header: ['NAME', 'MD'], rows: [['TopA', '100']], delimiter: ',' });
  expect(parseDelimited('TopA,100')).toEqual({ header: null, rows: [['TopA', '100']], delimiter: ',' });
  expect(parseDelimited('')).toEqual({ header: null, rows: [], delimiter: 'whitespace' });
  expect(parseDelimited('0;1;2', { delimiter: ';' }).rows).toEqual([['0', '1', '2']]);
});

test('parseWorkbook reads every sheet to string cells and tableFromRows detects the header', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Survey run 1', '', ''], ['MD', 'Inc', 'Azi'], [0, 0, 0], [100, 1.5, 45.25], [200, 3, 46], ['', '', ''],
  ]), 'MWD');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x', 'y'], [1, 2]]), 'Other');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const { sheets } = parseWorkbook(new Uint8Array(bytes));
  expect(sheets.map((s) => s.name)).toEqual(['MWD', 'Other']);
  expect(sheets[0].rows[0]).toEqual(['Survey run 1', '', '']);
  expect(sheets[0].rows[3]).toEqual(['100', '1.5', '45.25']);
  expect(sheets[0].rows).toHaveLength(5); // trailing blank row dropped
  // a title row above the header is data to the detector; the user drops it by mapping
  const t = tableFromRows(sheets[0].rows.slice(1));
  expect(t.header).toEqual(['MD', 'Inc', 'Azi']);
  expect(t.rows).toEqual([['0', '0', '0'], ['100', '1.5', '45.25'], ['200', '3', '46']]);
  expect(tidySheetRows([[1, '', null], ['', '', '']])).toEqual([['1']]);
});

describe('RFC 4180 quoting on the delimited path', () => {
  const rows = (text, d = ',') => splitDelimited(text, d).rows;

  test('a quoted cell keeps its delimiter', () => {
    expect(rows('Well,Field,MD\n"Ekene-1, sidetrack",Ekene,1500')).toEqual([
      ['Well', 'Field', 'MD'], ['Ekene-1, sidetrack', 'Ekene', '1500'],
    ]);
    expect(rows('a;b\n"1;2";3', ';')).toEqual([['a', 'b'], ['1;2', '3']]);
    expect(rows('a\tb\n"1\t2"\t3', '\t')).toEqual([['a', 'b'], ['1\t2', '3']]);
  });

  test('a doubled quote is one quote; an empty quoted cell is empty', () => {
    expect(rows('name,note\n"9 5/8"" casing","said ""hold"""\n"",x')).toEqual([
      ['name', 'note'], ['9 5/8" casing', 'said "hold"'], ['', 'x'],
    ]);
  });

  test('CRLF, CR and LF all end a record', () => {
    expect(rows('a,b\r\n1,2\r\n3,4\r\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
    expect(rows('a,b\r1,2\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  test('a line break inside quotes is part of the cell (LF and CRLF)', () => {
    expect(rows('id,remark\n1,"line one\nline two"\n2,"a\r\nb",\n3,plain')).toEqual([
      ['id', 'remark'], ['1', 'line one\nline two'], ['2', 'a\r\nb', ''], ['3', 'plain'],
    ]);
    // a # or blank line inside a quoted cell is data, not a comment
    expect(rows('id,remark\n1,"first\n# not a comment\n\nlast"')).toEqual([
      ['id', 'remark'], ['1', 'first\n# not a comment\n\nlast'],
    ]);
  });

  test('unquoted cells trim, quoted content is kept exactly, a stray quote is data', () => {
    expect(rows(' a , "  b  " ,c ')).toEqual([['a', '  b  ', 'c']]);
    expect(rows('size,od\n9 5/8",244.5')).toEqual([['size', 'od'], ['9 5/8"', '244.5']]);
    // unterminated: the rest of the text is the cell
    expect(rows('a,"open\nstill open')).toEqual([['a', 'open\nstill open']]);
  });

  test('comment and blank lines are still dropped; empty cells are kept', () => {
    expect(rows('# header comment\n// another\n\nMD,GR\n\n100,,\n  \n200,45,')).toEqual([
      ['MD', 'GR'], ['100', '', ''], ['200', '45', ''],
    ]);
    // tab files: leading and trailing tabs trimmed as before
    expect(rows('\tMD\tGR\t\n\t100\t45\t\t', '\t')).toEqual([['MD', 'GR'], ['100', '45']]);
  });

  test('auto-detect counts delimiters outside quotes only', () => {
    expect(detectDelimiter('"a;b;c;d",e\n1,2')).toBe(',');
    expect(detectDelimiter('"x,y,z";w\n1;2')).toBe(';');
    expect(detectDelimiter('size 9 5/8",od\n1,2')).toBe(',');
    const t = parseDelimitedText('Well,MD\n"Ekene-1, ST1",1500\n"Ekene-2",1620');
    expect(t).toEqual({ header: ['Well', 'MD'], rows: [['Ekene-1, ST1', '1500'], ['Ekene-2', '1620']], delimiter: ',' });
  });

  test('agrees with papaparse and SheetJS on an RFC 4180 file', () => {
    // A file written by the RFC rules, read by two independent readers.
    const cells = [
      ['Well', 'Remark', 'Rate'],
      ['Ekene-1', 'choke 32/64, stable', '1250.5'],
      ['Ekene-2', 'said "shut in"', '0'],
      ['Ekene-3', 'two\nlines', '15'],
      ['Ekene-4', 'crlf\r\ninside', ''],
      ['Ekene-5', '', '7'],
    ];
    const enc = (c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
    const text = cells.map((r) => r.map(enc).join(',')).join('\r\n');
    const ours = rows(text);
    expect(ours).toEqual(cells);
    const pp = Papa.parse(text, { delimiter: ',', newline: '\r\n' }).data;
    expect(ours).toEqual(pp);
    const wb = XLSX.read(text, { type: 'string', raw: true });
    const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    expect(ours.map((r) => r.map((c) => c.replace(/\r\n/g, '\n')))).toEqual(sheet.map((r) => r.map((c) => String(c).replace(/\r\n/g, '\n'))));
  });
});
