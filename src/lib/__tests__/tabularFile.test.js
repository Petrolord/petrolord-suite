// Import-door file reading: explicit delimiters, workbook sheets, header
// detection shared with the text path, and unsupported types refused by
// name. The workbook fixture is written with SheetJS in the test so the
// bytes are real xlsx, not a hand-made stub.

import * as XLSX from 'xlsx';
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
