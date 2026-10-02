// One typed reader for pasted or imported tables (Reservoir round, Step 0a).
//
// This is the pure text half of the shared tabular reader. Its sibling
// src/lib/tabularFile.js (2026-09-03) classifies files, reads Excel
// workbooks and splits delimited text into string cells for the Geoscience
// and Data AI import doors; it re-exports the typed API below, so
// `@/lib/tabularFile` stays the one door. A door that only needs text and
// no workbook imports this module directly and keeps SheetJS out of its
// bundle. Two names differ from that file on purpose: `detectTableDelimiter`
// here returns the character (' ' for white space) and weighs every line,
// where its `detectDelimiter` counts the first line and returns
// 'whitespace'; `DELIMITER_NAMES` here is a map, its `DELIMITERS` a list
// for a picker.
//
// Every Reservoir importer had its own CSV reading, and four of them read a
// comma decimal as a thousands separator (gap matrix H12) or guessed a date
// order. This module is the one place that decides how a table is read:
//
//   delimiter      comma, semicolon, tab, pipe or runs of white space, found from
//                  the file (a semicolon file whose numbers carry decimal
//                  commas is a semicolon file)
//   header         the row whose text sits above columns of numbers or dates;
//                  a unit in brackets is split from the name; a units row
//                  under the header is read as units
//   decimal mark   one per file, from the numbers themselves. "3000,25" can
//                  only be a decimal comma; "1,234,567" only thousands;
//                  "1,234" alone could be either, and the result says so
//   dates          ISO dates and date-times, month names, and numeric
//                  day/month/year in either order. When no value in a column
//                  settles the order the column is NOT read: the result
//                  carries a question for the UI to put to the user
//   blanks         empty cells and the usual null words read as null
//   rows           a report of every row left out and why (text before the
//                  table, a repeated header, a totals row, a row with too
//                  many fields) and every short row that was padded
//
// Pure: text in, a plain object out. No file, network or DOM access.
//
// Limits, stated: a white-space file cannot hold a date and a time in one
// column (they are two fields); a time of day alone is text; Excel serial
// dates are numbers here (the caller knows whether a column is a date);
// percent signs and currency symbols are not stripped.

export const DELIMITER_NAMES = Object.freeze({ ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe', ' ': 'white space' });

/** Words that mean "no value", compared in lower case after trimming. */
export const NULL_TOKENS = Object.freeze([
  '', 'na', 'n/a', 'n.a.', 'nan', 'null', 'none', 'nil', '-', '--', '---', '.', '?',
  '#n/a', '#na', '#value!', '#div/0!', '#ref!', '#num!', '#null!', 'missing',
]);
const NULL_SET = new Set(NULL_TOKENS);

/** True for a blank cell or a null word. */
export function isNullToken(value, extra = null) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim().toLowerCase();
  return NULL_SET.has(s) || (extra ? extra.has(s) : false);
}

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/**
 * Split text into rows of fields. Quoted fields may hold the delimiter, a
 * doubled quote and line breaks. CRLF, LF and lone CR all end a row. For the
 * white-space delimiter a run of spaces or tabs is one separator.
 * @returns {{line: number, cells: string[], text: string}[]} every row, blank ones included (cells [])
 */
export function splitRows(text, delimiter = ',') {
  const src = stripBom(String(text ?? ''));
  const out = [];
  if (delimiter === ' ') {
    const lines = src.split(/\r\n|\n|\r/);
    lines.forEach((raw, i) => {
      const cells = [];
      const re = /"((?:[^"]|"")*)"|(\S+)/g;
      let m;
      while ((m = re.exec(raw)) !== null) cells.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]);
      out.push({ line: i + 1, cells, text: raw });
    });
    if (out.length && out[out.length - 1].text === '') out.pop();
    return out;
  }
  let line = 1; let rowLine = 1; let rowStart = 0;
  let cells = []; let field = ''; let quoted = false; let wasQuoted = false;
  const endField = () => { cells.push(wasQuoted ? field : field.trim()); field = ''; wasQuoted = false; };
  const endRow = (end) => {
    endField();
    const raw = src.slice(rowStart, end);
    out.push({ line: rowLine, cells: raw.trim() === '' ? [] : cells, text: raw });
    cells = [];
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      quoted = true; wasQuoted = true; field = '';
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      endRow(i);
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      line += 1; rowLine = line; rowStart = i + 1;
    } else if (!wasQuoted || ch.trim() !== '') {
      field += ch;
    }
  }
  if (rowStart < src.length) endRow(src.length);
  return out;
}

/**
 * The delimiter of a table: the candidate that gives the same number of
 * fields (two or more) on the most lines. When several do, tab wins over
 * semicolon, semicolon over pipe and pipe over comma, because a semicolon,
 * tab or pipe file may carry decimal commas in every cell while the reverse
 * does not happen.
 * White space is the fallback; a single column reads as comma.
 */
export function detectTableDelimiter(text) {
  const src = stripBom(String(text ?? ''));
  const score = (delim) => {
    const rows = splitRows(src, delim).filter((r) => r.cells.length > 0).slice(0, 200);
    if (!rows.length) return { delim, share: 0, fields: 0 };
    const counts = new Map();
    for (const r of rows) counts.set(r.cells.length, (counts.get(r.cells.length) || 0) + 1);
    let fields = 0; let n = 0;
    for (const [k, v] of counts) if (k >= 2 && (v > n || (v === n && k > fields))) { fields = k; n = v; }
    return { delim, share: n / rows.length, fields };
  };
  for (const delim of ['\t', ';', '|', ',']) {
    const s = score(delim);
    if (s.fields >= 2 && s.share >= 0.6) return delim;
  }
  const ws = score(' ');
  if (ws.fields >= 2 && ws.share >= 0.6) return ' ';
  return ',';
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

// spaces, no-break and thin spaces, and apostrophes used as group separators
const GROUP_SPACE = /(\d)[\s\u00a0\u202f\u2009'\u2019](?=\d)/g;
const NUMBER_SHAPE = /^[+\-\u2212]?[\d.,\s\u00a0\u202f\u2009'\u2019]*\d[\d.,]*(?:[eE][+\-]?\d+)?$/;
const DATE_SHAPE = /^(?:\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})|\d{4}[./-]\d{1,2}[./-]\d{1,2})(?:[T\s].*)?$/;
const PLAIN = { '.': /^[+-]?(?:[1-9]\d{0,2}(?:,\d{3})+|\d+)?(?:\.\d*)?(?:[eE][+-]?\d+)?$/, ',': /^[+-]?(?:[1-9]\d{0,2}(?:\.\d{3})+|\d+)?(?:,\d*)?(?:[eE][+-]?\d+)?$/ };

const tidyNumber = (value) => String(value).trim().replace(/\u2212/g, '-').replace(GROUP_SPACE, '$1');

/**
 * Read one number with the file's decimal mark. Returns NaN for a null
 * token and for anything that is not a well-formed number: a group
 * separator in the wrong place ("1,23" with a decimal point) is refused, it
 * is never dropped to make a number.
 * @param {*} value
 * @param {{decimal?: '.'|','}} [opts]
 */
export function parseNumber(value, { decimal = '.' } = {}) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (isNullToken(value)) return NaN;
  const s = tidyNumber(value);
  const mark = decimal === ',' ? ',' : '.';
  if (!/\d/.test(s) || !PLAIN[mark].test(s)) return NaN;
  const plain = mark === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(plain);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * The decimal mark of a file, from its cells.
 *   certain   the numbers settle it ("3000,25", "0,5", "1.234,5", "1,234.5",
 *             "1,234,567", "0.85")
 *   uncertain every marked number looks like "1,234": a thousands group or
 *             three decimals. The mark returned is then the usual reading for
 *             the delimiter (decimal comma in a semicolon file, thousands
 *             elsewhere) and `certain` is false so the caller can ask.
 * @param {Iterable<*>} cells
 * @param {{delimiter?: string}} [opts]
 * @returns {{mark: '.'|',', certain: boolean, reason: string, examples: string[]}}
 */
export function detectDecimalMark(cells, { delimiter = ',' } = {}) {
  let comma = 0; let dot = 0; let open = 0;
  const examples = { comma: [], dot: [], open: [] };
  const note = (k, s) => { if (examples[k].length < 3) examples[k].push(s); };
  for (const cell of cells || []) {
    if (cell === null || cell === undefined || typeof cell === 'number') continue;
    const s = tidyNumber(cell);
    if (!s || !NUMBER_SHAPE.test(s) || DATE_SHAPE.test(s)) continue;
    const body = s.replace(/[eE][+-]?\d+$/, '').replace(/^[+-]/, '');
    const commas = (body.match(/,/g) || []).length; const dots = (body.match(/\./g) || []).length;
    if (!commas && !dots) continue;
    if (commas && dots) {
      if (body.lastIndexOf(',') > body.lastIndexOf('.')) { comma += 1; note('comma', s); } else { dot += 1; note('dot', s); }
    } else if (commas) {
      if (commas > 1) { dot += 1; note('dot', s); }                     // 1,234,567: groups
      else if (/^[1-9]\d{0,2},\d{3}$/.test(body)) { open += 1; note('open', s); }
      else { comma += 1; note('comma', s); }                             // 3000,25 or 0,5
    } else if (dots > 1) { comma += 1; note('comma', s); }               // 1.234.567: groups
    else { dot += 1; note('dot', s); }                                   // 0.85, 1.234
  }
  if (comma && !dot) return { mark: ',', certain: true, reason: 'numbers with a decimal comma', examples: examples.comma };
  if (dot && !comma) return { mark: '.', certain: true, reason: open ? 'numbers with a decimal point; commas group thousands' : 'numbers with a decimal point', examples: examples.dot };
  if (comma && dot) {
    return { mark: comma > dot ? ',' : '.', certain: false, reason: 'the file mixes decimal commas and decimal points', examples: [...examples.comma, ...examples.dot].slice(0, 4) };
  }
  if (open) {
    const mark = delimiter === ';' ? ',' : '.';
    return { mark, certain: false, reason: 'every number with a comma could be thousands or three decimals', examples: examples.open };
  }
  return { mark: '.', certain: true, reason: 'no decimal marks in the file', examples: [] };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n, w = 2) => String(n).padStart(w, '0');
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?\s*(am|pm)?\s*(z|[+-]\d{2}:?\d{2})?$/i;

function readTime(text) {
  if (!text) return { h: 0, mi: 0, s: 0, ms: 0, has: false, offset: null };
  const m = TIME.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]); const mi = Number(m[2]); const s = m[3] ? Number(m[3]) : 0;
  const ms = m[4] ? Math.round(Number(`0.${m[4]}`) * 1000) : 0;
  if (m[5]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[5].toLowerCase() === 'pm' ? 12 : 0); }
  if (h > 23 || mi > 59 || s > 59) return null;
  let offset = null;
  if (m[6]) {
    if (m[6].toLowerCase() === 'z') offset = 0;
    else { const o = m[6].replace(':', ''); offset = (o[0] === '-' ? -1 : 1) * (Number(o.slice(1, 3)) * 60 + Number(o.slice(3, 5))); }
  }
  return { h, mi, s, ms, has: true, offset };
}

function build(y, mo, d, time, text) {
  let year = y;
  if (year < 100) year += year < 50 ? 2000 : 1900;
  if (!(year >= 1800 && year <= 2200) || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31) || !time) return null;
  const utc = Date.UTC(year, mo - 1, d, time.h, time.mi, time.s, time.ms);
  const back = new Date(utc);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;   // 31/02
  const iso = `${year}-${pad(mo)}-${pad(d)}`;
  return {
    iso,
    time: time.has ? `${pad(time.h)}:${pad(time.mi)}:${pad(time.s)}` : null,
    // wall-clock milliseconds: the stamp read as UTC unless it names an offset
    ms: utc - (time.offset === null ? 0 : time.offset * 60000),
    hasTime: time.has,
    text,
  };
}

/**
 * The shape of a date cell without deciding a day and month order.
 * @returns {null | {kind: 'fixed', value: object} | {kind: 'numeric', a: number, b: number, y: number, time: object}}
 */
function dateShape(value) {
  const s = String(value ?? '').trim();
  if (!s || !/\d/.test(s)) return null;
  let m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[T\s]+(.+))?$/.exec(s);
  if (m) { const v = build(+m[1], +m[2], +m[3], readTime(m[4]), s); return v ? { kind: 'fixed', value: v } : null; }
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:[T\s]+(.+))?$/.exec(s);
  if (m) {
    const time = readTime(m[4]);
    if (!time) return null;
    const a = +m[1]; const b = +m[2];
    if (a < 1 || b < 1 || a > 31 || b > 31 || (a > 12 && b > 12)) return null;
    return { kind: 'numeric', a, b, y: +m[3], time, text: s };
  }
  // 31-May-2024, 31 May 2024 10:30, May 31, 2024, May-2024, 2024-May-31
  m = /^(\d{1,2})[\s./-]+([A-Za-z]{3,9})\.?[\s./,-]+(\d{4}|\d{2})(?:[T\s]+(.+))?$/.exec(s);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    const v = build(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1], readTime(m[4]), s); return v ? { kind: 'fixed', value: v } : null;
  }
  m = /^([A-Za-z]{3,9})\.?[\s./-]+(\d{1,2}),?[\s./-]+(\d{4})(?:[T\s]+(.+))?$/.exec(s);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    const v = build(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], readTime(m[4]), s); return v ? { kind: 'fixed', value: v } : null;
  }
  m = /^([A-Za-z]{3,9})\.?[\s./-]+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    const v = build(+m[2], MONTHS[m[1].slice(0, 3).toLowerCase()], 1, readTime(null), s); return v ? { kind: 'fixed', value: v } : null;
  }
  return null;
}

/**
 * Whether the numeric dates of a column are day first or month first.
 *   order 'dmy' | 'mdy'  some value settles it (a day above 12) and none disagrees
 *   order null           no value settles it (`ambiguous`), or values disagree (`conflict`)
 * Never a guess: with order null the column is not read until the caller
 * supplies the order.
 */
export function detectDateOrder(values) {
  let dayFirst = 0; let monthFirst = 0; let open = 0; let fixed = 0;
  const examples = [];
  for (const v of values || []) {
    const sh = dateShape(v);
    if (!sh) continue;
    if (sh.kind === 'fixed') { fixed += 1; continue; }
    if (sh.a > 12) dayFirst += 1;
    else if (sh.b > 12) monthFirst += 1;
    else { open += 1; if (examples.length < 3) examples.push(sh.text); }
  }
  const numeric = dayFirst + monthFirst + open;
  if (!numeric) return { order: null, certain: true, ambiguous: false, conflict: false, numeric: 0, fixed, examples: [] };
  if (dayFirst && monthFirst) return { order: null, certain: false, ambiguous: false, conflict: true, numeric, fixed, examples };
  if (dayFirst) return { order: 'dmy', certain: true, ambiguous: false, conflict: false, numeric, fixed, examples: [] };
  if (monthFirst) return { order: 'mdy', certain: true, ambiguous: false, conflict: false, numeric, fixed, examples: [] };
  return { order: null, certain: false, ambiguous: true, conflict: false, numeric, fixed, examples };
}

/**
 * Read one date or date-time. ISO, year-first and month-name forms need no
 * order. A numeric day/month/year needs `order` unless its own numbers
 * settle it; without one the result is null.
 * @param {*} value
 * @param {{order?: 'dmy'|'mdy'|null}} [opts]
 * @returns {null | {iso: string, time: ?string, ms: number, hasTime: boolean, text: string}}
 */
export function parseDate(value, { order = null } = {}) {
  const sh = dateShape(value);
  if (!sh) return null;
  if (sh.kind === 'fixed') return sh.value;
  const own = sh.a > 12 ? 'dmy' : sh.b > 12 ? 'mdy' : null;
  if (own && order && own !== order) return null;          // 25/03 under month first
  const use = own || order;
  if (!use) return null;
  return use === 'dmy' ? build(sh.y, sh.b, sh.a, sh.time, sh.text) : build(sh.y, sh.a, sh.b, sh.time, sh.text);
}

/** True when the cell has the shape of a date this module reads (order aside). */
export const looksLikeDate = (value) => dateShape(value) !== null;

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/** "Pressure (psia)" -> { name: 'Pressure', unit: 'psia' }; no brackets -> unit null. */
export function headerUnit(header) {
  const s = String(header ?? '').trim();
  const m = /^(.*?)[\s_]*[([{]\s*([^()[\]{}]*?)\s*[)\]}]\s*$/.exec(s);
  if (m && m[1].trim() !== '') return { name: m[1].trim(), unit: m[2] || null };
  if (m && m[1].trim() === '') return { name: s, unit: m[2] || null };
  return { name: s, unit: null };
}

const TOTALS = /^(?:grand\s+|sub-?\s*)?totals?\s*:?$|^sum\s*:?$|^averages?\s*:?$|^avg\.?\s*:?$|^mean\s*:?$|^cumulative\s+total\s*:?$/i;
const isDataShape = (cell) => {
  const s = String(cell ?? '').trim();
  return NUMBER_SHAPE.test(tidyNumber(s)) || dateShape(s) !== null;
};

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/**
 * Read a table.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {','|';'|'\t'|' '} [options.delimiter]   force it; found from the text otherwise
 * @param {'.'|','} [options.decimal]              force it (the answer to a decimalMark question)
 * @param {'dmy'|'mdy'|Object<number,'dmy'|'mdy'>} [options.dateOrder]  the answer to a dateOrder question, for every column or per column index
 * @param {boolean} [options.header]               force a header row (true) or none (false)
 * @param {string[]} [options.nullTokens]          more null words, for example '-999.25'
 *
 * @returns {{
 *   delimiter: string, delimiterName: string, bom: boolean,
 *   header: ?{line: number, cells: string[]}, unitsRow: ?{line: number, cells: string[]},
 *   columnCount: number,
 *   columns: {index: number, header: ?string, name: string, unit: ?string, kind: 'number'|'date'|'text'|'empty',
 *             values: number, nulls: number, unreadable: number, dateOrder: ?object}[],
 *   decimal: {mark: string, certain: boolean, reason: string, examples: string[]},
 *   rows: {line: number, cells: string[], values: Array}[],
 *   report: {skipped: {line: number, reason: string, text: string}[],
 *            padded: {line: number, fields: number, expected: number}[],
 *            unreadable: {line: number, column: number, text: string, reason: string}[]},
 *   questions: {kind: 'dateOrder'|'decimalMark', column?: number, header?: ?string, examples: string[], assumed?: string, conflict?: boolean}[],
 *   needsAnswer: boolean
 * }}
 *   rows[i].values holds, per column: a number or null (number column), a
 *   date object or null (date column), the trimmed text or null (text
 *   column). A date column with an open dateOrder question holds null for
 *   every numeric date until the question is answered.
 */
export function parseTabular(text, options = {}) {
  const src = String(text ?? '');
  const bom = src.charCodeAt(0) === 0xfeff;
  const delimiter = options.delimiter || detectTableDelimiter(src);
  const extraNulls = options.nullTokens ? new Set(options.nullTokens.map((t) => String(t).trim().toLowerCase())) : null;
  const isNull = (c) => isNullToken(c, extraNulls);
  const report = { skipped: [], padded: [], unreadable: [] };
  const empty = {
    delimiter, delimiterName: DELIMITER_NAMES[delimiter] || delimiter, bom, header: null, unitsRow: null, columnCount: 0, columns: [],
    decimal: { mark: '.', certain: true, reason: 'no decimal marks in the file', examples: [] }, rows: [], report, questions: [], needsAnswer: false,
  };

  let all = splitRows(src, delimiter).filter((r) => r.cells.length > 0);
  // comment lines
  all = all.filter((r) => {
    if (/^\s*(#|\/\/)/.test(r.text) && !/^\s*#(n\/a|na|value|div|ref|num|null)/i.test(r.text)) { report.skipped.push({ line: r.line, reason: 'comment line', text: r.text }); return false; }
    return true;
  });
  if (!all.length) return empty;

  // trailing empty fields (a delimiter at the end of each line) are not columns
  const width = (cells) => { let n = cells.length; while (n > 0 && String(cells[n - 1]).trim() === '') n -= 1; return n; };
  const counts = new Map();
  for (const r of all) { const w = width(r.cells); if (w > 0) counts.set(w, (counts.get(w) || 0) + 1); }
  let columnCount = 0; let best = 0;
  for (const [k, v] of counts) if (v > best || (v === best && k > columnCount)) { columnCount = k; best = v; }
  if (!columnCount) return empty;

  // the table starts at the first row as wide as the table; text above it is reported
  let start = all.findIndex((r) => width(r.cells) === columnCount);
  if (start < 0) start = 0;
  for (const r of all.slice(0, start)) report.skipped.push({ line: r.line, reason: 'text before the table', text: r.text });
  const body = all.slice(start);

  // header: text above a column whose later rows are mostly numbers or dates
  const dataShare = (col, from) => {
    let n = 0; let d = 0;
    for (const r of body.slice(from, from + 200)) {
      const c = r.cells[col];
      if (c === undefined || isNull(c)) continue;
      n += 1; if (isDataShape(c)) d += 1;
    }
    return n ? d / n : 0;
  };
  const first = body[0];
  const textOverData = (row, from) => row.cells.slice(0, columnCount).some((c, i) => !isNull(c) && !isDataShape(c) && dataShare(i, from) >= 0.5);
  const allText = (row) => row.cells.slice(0, columnCount).every((c) => String(c).trim() === '' || !isDataShape(c));
  let hasHeader;
  if (options.header === true || options.header === false) hasHeader = options.header;
  else hasHeader = body.length > 1 && textOverData(first, 1);
  let header = null; let unitsRow = null; let dataFrom = 0;
  if (hasHeader) {
    header = { line: first.line, cells: Array.from({ length: columnCount }, (_, i) => String(first.cells[i] ?? '').trim()) };
    dataFrom = 1;
    const second = body[1];
    if (second && body.length > 2 && allText(second) && second.cells.some((c) => String(c).trim() !== '') && textOverData(second, 2)
        && second.cells.slice(0, columnCount).every((c) => String(c).trim().length <= 24)) {
      unitsRow = { line: second.line, cells: Array.from({ length: columnCount }, (_, i) => String(second.cells[i] ?? '').trim()) };
      dataFrom = 2;
    }
  }

  // rows: leave out what is not data, pad what is short, and say so
  const kept = [];
  const headerKey = header ? header.cells.join('\u0001').toLowerCase() : null;
  for (const r of body.slice(dataFrom)) {
    const w = width(r.cells);
    const cells = Array.from({ length: columnCount }, (_, i) => String(r.cells[i] ?? '').trim());
    if (cells.every((c) => c === '')) { report.skipped.push({ line: r.line, reason: 'empty row', text: r.text }); continue; }
    if (headerKey && cells.join('\u0001').toLowerCase() === headerKey) { report.skipped.push({ line: r.line, reason: 'repeated header', text: r.text }); continue; }
    if (cells.some((c) => TOTALS.test(c))) { report.skipped.push({ line: r.line, reason: 'totals row', text: r.text }); continue; }
    if (w > columnCount) { report.skipped.push({ line: r.line, reason: `${w} fields where ${columnCount} were expected`, text: r.text }); continue; }
    if (w < columnCount && r.cells.length < columnCount) report.padded.push({ line: r.line, fields: r.cells.length, expected: columnCount });
    kept.push({ line: r.line, cells });
  }

  // decimal mark: one for the file
  const found = detectDecimalMark((function* cellsOf() { for (const r of kept) yield* r.cells; }()), { delimiter });
  const decimal = options.decimal === ',' || options.decimal === '.'
    ? { mark: options.decimal, certain: true, reason: 'chosen by the user', examples: found.examples }
    : found;
  const questions = [];
  if (!decimal.certain) questions.push({ kind: 'decimalMark', examples: decimal.examples, assumed: decimal.mark });

  // columns
  const orderFor = (i) => (typeof options.dateOrder === 'string' ? options.dateOrder : options.dateOrder?.[i]) || null;
  const columns = [];
  for (let i = 0; i < columnCount; i += 1) {
    let nums = 0; let dates = 0; let texts = 0; let nulls = 0;
    for (const r of kept) {
      const c = r.cells[i];
      if (isNull(c)) nulls += 1;
      else if (Number.isFinite(parseNumber(c, { decimal: decimal.mark }))) nums += 1;
      else if (dateShape(c)) dates += 1;
      else texts += 1;
    }
    const filled = nums + dates + texts;
    const kind = !filled ? 'empty' : nums >= filled / 2 ? 'number' : dates >= filled / 2 ? 'date' : 'text';
    const raw = header ? header.cells[i] : null;
    const hu = headerUnit(raw || '');
    const unit = hu.unit || (unitsRow && unitsRow.cells[i] ? (headerUnit(unitsRow.cells[i]).unit || unitsRow.cells[i]) : null);
    const col = { index: i, header: raw, name: (raw && hu.name) || `Column ${i + 1}`, unit, kind, values: 0, nulls, unreadable: 0, dateOrder: null };
    if (kind === 'date') {
      const det = detectDateOrder(kept.map((r) => r.cells[i]));
      const answer = orderFor(i);
      col.dateOrder = { ...det, order: det.conflict ? answer : (det.order || answer), asked: !answer && (det.ambiguous || det.conflict), from: det.order ? 'file' : answer ? 'user' : null };
      if (col.dateOrder.asked) questions.push({ kind: 'dateOrder', column: i, header: raw, examples: det.examples, conflict: det.conflict });
    }
    columns.push(col);
  }

  // values
  const rows = kept.map((r) => {
    const values = r.cells.map((c, i) => {
      const col = columns[i];
      if (isNull(c)) return null;
      if (col.kind === 'number') {
        const n = parseNumber(c, { decimal: decimal.mark });
        if (Number.isFinite(n)) { col.values += 1; return n; }
        col.unreadable += 1; report.unreadable.push({ line: r.line, column: i, text: c, reason: 'not a number' });
        return null;
      }
      if (col.kind === 'date') {
        const d = parseDate(c, { order: col.dateOrder.order });
        if (d) { col.values += 1; return d; }
        const sh = dateShape(c);
        if (sh && col.dateOrder.asked) return null;              // waits for the answer; not an error
        col.unreadable += 1;
        report.unreadable.push({ line: r.line, column: i, text: c, reason: sh ? 'not a date in the order chosen for this column' : 'not a date' });
        return null;
      }
      col.values += 1;
      return c;
    });
    return { line: r.line, cells: r.cells, values };
  });

  return {
    delimiter, delimiterName: DELIMITER_NAMES[delimiter] || delimiter, bom, header, unitsRow, columnCount, columns, decimal, rows, report, questions,
    needsAnswer: questions.length > 0,
  };
}

/** One column's typed values, in row order. */
export const columnValues = (table, index) => (table?.rows || []).map((r) => r.values[index] ?? null);

/** Plain words for a question, for the import door to show (no em dashes, owner copy rule). */
export function questionText(q) {
  if (q?.kind === 'dateOrder') {
    const eg = q.examples?.length ? ` such as ${q.examples[0]}` : '';
    return q.conflict
      ? `The dates in ${q.header || `column ${q.column + 1}`} do not agree on an order. Choose day first or month first.`
      : `Dates${eg} in ${q.header || `column ${q.column + 1}`} could be day first or month first. Choose one.`;
  }
  if (q?.kind === 'decimalMark') {
    const eg = q.examples?.length ? ` such as ${q.examples[0]}` : '';
    return `Numbers${eg} could use the comma for thousands or for decimals. They were read with a decimal ${q.assumed === ',' ? 'comma' : 'point'}. Check the first rows, or choose the other reading.`;
  }
  return '';
}
