// Tabular file reading shared by the import doors (Well Design survey
// runs first, 2026-09-03). Two kinds of file: delimited text (CSV, TSV,
// TXT, DAT, PRN) split on an explicit or detected delimiter, and Excel
// workbooks (XLSX, XLSM, XLS) read sheet by sheet with SheetJS. Anything
// else is refused by name before a byte is parsed, so a PDF or an image
// never lands in a column picker as "%PDF" or "PK".
//
// Both kinds end in the same table shape {header|null, rows} through
// detectHeader, so column mapping downstream is identical.

import * as XLSX from 'xlsx';

export const DELIMITERS = [
  { id: 'auto', label: 'Auto-detect' },
  { id: ',', label: 'Comma' },
  { id: '\t', label: 'Tab' },
  { id: ';', label: 'Semicolon' },
  { id: 'whitespace', label: 'Whitespace' },
];

export const DELIMITED_EXTENSIONS = ['csv', 'tsv', 'txt', 'dat', 'prn', 'asc'];
export const WORKBOOK_EXTENSIONS = ['xlsx', 'xlsm', 'xls'];

export function fileExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/** 'delimited' | 'workbook' | 'unsupported' from the file name alone. */
export function classifyFile(name) {
  const ext = fileExtension(name);
  if (DELIMITED_EXTENSIONS.includes(ext)) return 'delimited';
  if (WORKBOOK_EXTENSIONS.includes(ext)) return 'workbook';
  return 'unsupported';
}

export function unsupportedFileMessage(name) {
  const ext = fileExtension(name);
  return `${ext ? `.${ext} files are` : 'This file type is'} not supported. Choose a delimited text file (${DELIMITED_EXTENSIONS.map((e) => `.${e}`).join(', ')}) or an Excel workbook (${WORKBOOK_EXTENSIONS.map((e) => `.${e}`).join(', ')}).`;
}

const cleanLines = (text) => String(text || '').split(/\r\n|\r|\n/)
  .map((l) => l.trim())
  .filter((l) => l.length && !l.startsWith('#') && !l.startsWith('//'));

/** Most frequent of comma, semicolon, tab on the first line; else whitespace. */
export function detectDelimiter(text) {
  const lines = cleanLines(text);
  if (!lines.length) return 'whitespace';
  const counts = {
    ',': (lines[0].match(/,/g) || []).length,
    ';': (lines[0].match(/;/g) || []).length,
    '\t': (lines[0].match(/\t/g) || []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'whitespace';
}

/** Split text into string cells on one delimiter (comment and blank lines dropped). */
export function splitDelimited(text, delimiter) {
  const d = delimiter === 'auto' || !delimiter ? detectDelimiter(text) : delimiter;
  const split = (l) => (d === 'whitespace' ? l.split(/\s+/) : l.split(d).map((c) => c.trim()));
  return { rows: cleanLines(text).map(split), delimiter: d };
}

const isNum = (c) => c === '' || Number.isFinite(Number(c));
const isNumericRow = (r) => r.every(isNum);

/**
 * Header detection: the first row is a header only when it is
 * non-numeric AND its per-column numeric pattern differs from the second
 * row's. That keeps text-bearing DATA rows (a name column in every row,
 * trailing comment columns) from being eaten as headers: a single-row
 * tops file is data, and 'NAME,MD' over 'TopA,100' is a header.
 */
export function detectHeader(rows) {
  let header = null;
  if (rows.length && !isNumericRow(rows[0])) {
    if (rows.length > 1) {
      const n = Math.max(rows[0].length, rows[1].length);
      for (let c = 0; c < n; c++) {
        if (isNum(rows[0][c] ?? '') !== isNum(rows[1][c] ?? '')) {
          header = rows[0];
          break;
        }
      }
    }
  }
  return { header, rows: header ? rows.slice(1) : rows };
}

/** Delimited text -> {header, rows, delimiter}. */
export function parseDelimitedText(text, { delimiter = 'auto' } = {}) {
  const { rows, delimiter: used } = splitDelimited(text, delimiter);
  if (!rows.length) return { header: null, rows: [], delimiter: used };
  return { ...detectHeader(rows), delimiter: used };
}

const cellToString = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
};

/** Drop trailing empty columns and empty rows from a raw sheet matrix. */
export function tidySheetRows(matrix) {
  const rows = (matrix || []).map((r) => (Array.isArray(r) ? r.map(cellToString) : []));
  const width = rows.reduce((w, r) => {
    let last = -1;
    r.forEach((c, i) => { if (c !== '') last = i; });
    return Math.max(w, last + 1);
  }, 0);
  return rows
    .map((r) => { const out = r.slice(0, width); while (out.length < width) out.push(''); return out; })
    .filter((r) => r.some((c) => c !== ''));
}

/**
 * Excel workbook bytes -> sheets of string cells.
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {{sheets: Array<{name:string, rows:string[][]}>}}
 */
export function parseWorkbook(data) {
  const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? 'array' : 'array', cellDates: false });
  const sheets = (wb.SheetNames || []).map((name) => {
    const ws = wb.Sheets[name];
    const matrix = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false }) : [];
    return { name, rows: tidySheetRows(matrix) };
  });
  if (!sheets.length) throw new Error('The workbook has no sheets.');
  return { sheets };
}

/** One sheet's string matrix -> {header, rows} like the text path. */
export function tableFromRows(rows) {
  const clean = tidySheetRows(rows).filter((r) => !String(r[0]).startsWith('#'));
  if (!clean.length) return { header: null, rows: [] };
  return detectHeader(clean);
}

/** Read a browser File either way: {kind:'delimited', text} or {kind:'workbook', sheets}. */
export async function readTabularFile(file) {
  const kind = classifyFile(file?.name);
  if (kind === 'unsupported') throw new Error(unsupportedFileMessage(file?.name));
  if (kind === 'workbook') {
    const buf = await file.arrayBuffer();
    return { kind, ...parseWorkbook(new Uint8Array(buf)) };
  }
  return { kind, text: await file.text() };
}
