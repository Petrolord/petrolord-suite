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

/**
 * Occurrences of ch on one line outside quoted fields, where a quote only
 * opens a field at its start (so 9 5/8" in a header is data).
 */
const countOutsideQuotes = (line, ch) => {
  let n = 0;
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') i += 1;
      else if (c === '"') quoted = false;
    } else if (c === ch) { n += 1; atStart = true; }
    else if (atStart && c === '"') { quoted = true; atStart = false; }
    else if (!(atStart && (c === ' ' || c === '\t'))) atStart = false;
  }
  return n;
};

/** Most frequent of comma, semicolon, tab on the first line (outside quotes); else whitespace. */
export function detectDelimiter(text) {
  const lines = cleanLines(text);
  if (!lines.length) return 'whitespace';
  const counts = {
    ',': countOutsideQuotes(lines[0], ','),
    ';': countOutsideQuotes(lines[0], ';'),
    '\t': countOutsideQuotes(lines[0], '\t'),
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'whitespace';
}

const isLineBreak = (c) => c === '\n' || c === '\r';
const isBlank = (c) => c === ' ' || c === '\t';

/**
 * RFC 4180 records on one delimiter character. A field that opens with a
 * double quote (after any spaces or tabs) runs to its closing quote: the
 * delimiter and CR, LF or CRLF inside it are data, and a doubled quote is
 * one quote. Unquoted cells are trimmed, quoted content is kept exactly.
 * Line handling matches the plain reader: a physical line that is blank or
 * starts with # or // (after trimming) is skipped, and spaces and tabs at
 * the start and end of a record are trimmed away before it is split. A
 * quote inside an unquoted cell (12" casing) is data; an unterminated
 * quote takes the rest of the text as its content.
 */
function splitQuoted(text, d) {
  const s = String(text || '');
  const n = s.length;
  const rows = [];
  let i = 0;
  const lineEnd = (k) => { while (k < n && !isLineBreak(s[k])) k++; return k; };
  const skipBreak = (k) => (s[k] === '\r' && s[k + 1] === '\n' ? k + 2 : k + 1);
  while (i < n) {
    // record start: skip blank and comment physical lines
    const end = lineEnd(i);
    const line = s.slice(i, end).trim();
    if (!line.length || line.startsWith('#') || line.startsWith('//')) { i = end < n ? skipBreak(end) : n; continue; }
    while (i < n && isBlank(s[i])) i++;
    const row = [];
    let done = false;
    while (!done) {
      let j = i;
      while (j < n && isBlank(s[j]) && s[j] !== d) j++;
      let cellText;
      if (s[j] === '"') {
        // quoted field
        let k = j + 1;
        let body = '';
        for (;;) {
          if (k >= n) break;
          if (s[k] === '"') {
            if (s[k + 1] === '"') { body += '"'; k += 2; continue; }
            k += 1;
            break;
          }
          body += s[k];
          k += 1;
        }
        // anything after the closing quote up to the delimiter is kept (lenient)
        let tail = '';
        while (k < n && s[k] !== d && !isLineBreak(s[k])) { tail += s[k]; k += 1; }
        cellText = body + tail.trim();
        i = k;
      } else {
        let k = i;
        while (k < n && s[k] !== d && !isLineBreak(s[k])) k++;
        cellText = s.slice(i, k).trim();
        i = k;
      }
      row.push({ text: cellText, quoted: s[j] === '"' });
      if (i < n && s[i] === d) { i += 1; continue; }
      done = true;
      if (i < n) i = skipBreak(i);
    }
    // a record's trailing spaces and tabs were trimmed by the plain reader,
    // so trailing empty unquoted cells made only of them are dropped when
    // the delimiter itself is blank (tab)
    if (isBlank(d)) {
      while (row.length > 1 && !row[row.length - 1].quoted && row[row.length - 1].text === '') row.pop();
    }
    rows.push(row.map((c) => c.text));
  }
  return rows;
}

/**
 * Split text into string cells on one delimiter (comment and blank lines
 * dropped). Comma, semicolon and tab follow RFC 4180 quoting (see
 * splitQuoted); whitespace splits on runs of spaces and tabs and does not
 * read quotes.
 */
export function splitDelimited(text, delimiter) {
  const d = delimiter === 'auto' || !delimiter ? detectDelimiter(text) : delimiter;
  if (d === 'whitespace') return { rows: cleanLines(text).map((l) => l.split(/\s+/)), delimiter: d };
  return { rows: splitQuoted(text, d), delimiter: d };
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
