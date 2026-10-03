// The production import door of Decline Curve Analysis (DCA-U1, PL2, RL10).
//
// A production table arrives as text (CSV, semicolon or tab file, a paste,
// a workbook sheet turned into text). This module reads it with the shared
// typed reader (src/lib/tabularParse.js) and turns it into the rows the app
// holds: { date (YYYY-MM-DD), oilRate, gasRate, waterRate, rate } with oil
// and water in bbl/d and gas in Mscf/d, daily rates at stock-tank conditions.
// It says what it did:
//
//   columns   found from the header by name in any order; one a file holds
//             but the app does not use (a cumulative, a pressure) is listed
//             as not used
//   units     read from the header where it names one ("Oil (bbl/d)",
//             "gas_mscfd", "oil_m3"), offered at the door where it does not.
//             A VOLUME per row (bbl in the month) is not a rate: it is turned
//             into a calendar-day rate by the days in the row's month, or by
//             the gap to the next row for a file that is not monthly, and the
//             read-back says so. The old door read a "volume" column as a
//             daily rate, 30 times high for monthly volumes (DCA-U1-004)
//   dates     never guessed: when no value settles day first or month first
//             the reader asks and the rows wait for the answer
//   decimals  one mark per file; when the file cannot settle it the reader
//             says which reading it took and offers the other
//   rows      every row left out is listed with its line and the reason;
//             negative rates are kept and counted (the fit leaves them out)
//
// Pure: text in, a plain object out.
import { parseTabular, questionText } from '@/lib/tabularParse';
import { convert } from '@/lib/units/registry';

/** The units a stream column may arrive in. The first is the state's own. */
export const DOOR_UNITS = Object.freeze({
  liquid: [
    { key: 'bbl/d', label: 'bbl/d (daily rate)', basis: 'rate', family: 'liquidRate', unit: 'bbl/d' },
    { key: 'm3/d', label: 'sm3/d (daily rate)', basis: 'rate', family: 'liquidRate', unit: 'm3/d' },
    { key: 'bbl/month', label: 'bbl in the month (volume)', basis: 'volume', family: 'liquidVolume', unit: 'bbl' },
    { key: 'Mbbl/month', label: 'Mbbl in the month (volume)', basis: 'volume', family: 'liquidVolume', unit: '10^3 bbl' },
    { key: 'm3/month', label: 'sm3 in the month (volume)', basis: 'volume', family: 'liquidVolume', unit: 'm3' },
  ],
  gas: [
    { key: 'Mscf/d', label: 'Mscf/d (daily rate)', basis: 'rate', family: 'gasRate', unit: 'Mscf/d' },
    { key: 'MMscf/d', label: 'MMscf/d (daily rate)', basis: 'rate', family: 'gasRate', unit: 'MMscf/d' },
    { key: '10^3 m3/d', label: '10^3 sm3/d (daily rate)', basis: 'rate', family: 'gasRate', unit: '10^3 m3/d' },
    { key: 'm3/d', label: 'sm3/d (daily rate)', basis: 'rate', family: 'gasRate', unit: 'm3/d' },
    { key: 'Mscf/month', label: 'Mscf in the month (volume)', basis: 'volume', family: 'gasVolume', unit: 'Mscf' },
    { key: 'MMscf/month', label: 'MMscf in the month (volume)', basis: 'volume', family: 'gasVolume', unit: 'MMscf' },
    { key: '10^3 m3/month', label: '10^3 sm3 in the month (volume)', basis: 'volume', family: 'gasVolume', unit: '10^3 m3' },
  ],
});
const ENGINE = Object.freeze({ liquid: { family: 'liquidRate', unit: 'bbl/d' }, gas: { family: 'gasRate', unit: 'Mscf/d' } });

/** The columns the door fills; names are lower case with punctuation as spaces. */
export const IMPORT_COLUMNS = Object.freeze([
  { key: 'date', label: 'Date', kind: 'date', names: ['production date', 'prod date', 'report date', 'date', 'month', 'period', 'time', 'timestamp'] },
  { key: 'well', label: 'Well', kind: 'text', names: ['well name', 'wellname', 'well', 'uwi', 'api'] },
  { key: 'oilRate', label: 'Oil', kind: 'number', units: 'liquid', names: ['oil rate', 'oil production', 'oil prod', 'oil volume', 'oil vol', 'bopd', 'qo', 'oil'] },
  { key: 'gasRate', label: 'Gas', kind: 'number', units: 'gas', names: ['gas rate', 'gas production', 'gas prod', 'gas volume', 'gas vol', 'mscfd', 'mcfd', 'qg', 'gas'] },
  { key: 'waterRate', label: 'Water', kind: 'number', units: 'liquid', names: ['water rate', 'water production', 'water prod', 'water volume', 'water vol', 'bwpd', 'qw', 'water'] },
  { key: 'rate', label: 'Rate (one stream)', kind: 'number', units: 'liquid', names: ['rate', 'production rate', 'production', 'volume', 'q'] },
]);
const COLUMN_BY_KEY = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c]));

// columns a production file often holds that this app does not read
const NOT_USED = Object.freeze([
  [/\bcum|\bnp\b|\bgp\b|\bwp\b|cumulative/, 'a cumulative: the app builds its own from the rates'],
  [/pressure|\bwhp\b|\bthp\b|\bbhp\b|\bpsi/, 'a pressure: decline analysis reads rates only'],
  [/days?\s*on|hours|uptime|producing days/, 'producing time: rates are read as calendar-day averages'],
  [/inj/, 'an injection column'],
  [/choke|gor|wc\b|water cut|bsw/, 'a ratio or a setting'],
]);

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9^]+/g, ' ').trim();

// what a unit looks like when it is written in a header. A unit with a time
// ("bbl/d", "bopd", "Mscf per month") settles rate against volume; a bare
// volume unit ("bbl", "Mscf", "m3") does not, and the door asks.
const UNIT_SPELLINGS = Object.freeze({
  liquid: [
    [/\bmbbl\s*(per\s*)?(month|mo|mth)\b/, 'Mbbl/month'],
    [/\bs?m3\s*(per\s*)?(d|day)\b|\bs?m3d\b/, 'm3/d'],
    [/\bs?m3\s*(per\s*)?(month|mo|mth)\b/, 'm3/month'],
    [/\bbopd\b|\bbwpd\b|\bbpd\b|\bbbl\s*(per\s*)?(d|day)\b|\bstb\s*(per\s*)?(d|day)\b|\bbbld\b|\bstbd\b/, 'bbl/d'],
    [/\bbbl\s*(per\s*)?(month|mo|mth)\b|\bstb\s*(per\s*)?(month|mo|mth)\b/, 'bbl/month'],
  ],
  gas: [
    [/\bmmscf\s*(per\s*)?(d|day)\b|\bmmscfd\b|\bmmcfd\b/, 'MMscf/d'],
    [/\bmscf\s*(per\s*)?(d|day)\b|\bmscfd\b|\bmcfd\b|\bmcf\s*d\b/, 'Mscf/d'],
    [/10\s*\^?\s*3\s*s?m3\s*(per\s*)?(d|day)\b|\bk\s*s?m3\s*d\b|\be3m3\s*d\b/, '10^3 m3/d'],
    [/\bs?m3\s*(per\s*)?(d|day)\b|\bs?m3d\b/, 'm3/d'],
    [/\bmmscf\s*(per\s*)?(month|mo|mth)\b|\bmmcf\s*(month|mo|mth)\b/, 'MMscf/month'],
    [/10\s*\^?\s*3\s*s?m3\s*(per\s*)?(month|mo|mth)\b|\be3m3\s*(month|mo|mth)\b/, '10^3 m3/month'],
    [/\bmscf\s*(per\s*)?(month|mo|mth)\b|\bmcf\s*(month|mo|mth)\b/, 'Mscf/month'],
  ],
});
// a bare volume unit: the two readings the door offers
const AMBIGUOUS = Object.freeze({
  liquid: [
    [/\bmbbl\b/, ['Mbbl/month']],
    [/\bs?m3\b/, ['m3/d', 'm3/month']],
    [/\bbbl\b|\bstb\b/, ['bbl/d', 'bbl/month']],
  ],
  gas: [
    [/\bmmscf\b|\bmmcf\b/, ['MMscf/d', 'MMscf/month']],
    [/10\s*\^?\s*3\s*s?m3|\be3m3\b/, ['10^3 m3/d', '10^3 m3/month']],
    [/\bmscf\b|\bmcf\b/, ['Mscf/d', 'Mscf/month']],
    [/\bs?m3\b/, ['m3/d']],
  ],
});

/** The unit a header names for a stream column, or null. */
export function unitFromHeader(kind, headerText, bracketUnit) {
  const tries = [norm(bracketUnit), norm(headerText)].filter(Boolean);
  for (const text of tries) {
    for (const [re, key] of UNIT_SPELLINGS[kind] ?? []) if (re.test(text)) return key;
  }
  return null;
}

/** The readings a header's bare volume unit allows ("oil_bbl": a daily rate or a monthly volume), or null. */
export function ambiguousUnit(kind, headerText, bracketUnit) {
  const tries = [norm(bracketUnit), norm(headerText)].filter(Boolean);
  for (const text of tries) {
    for (const [re, keys] of AMBIGUOUS[kind] ?? []) if (re.test(text)) return keys;
  }
  return null;
}

/** Place the file's columns by header name; each column is used once, the longest name wins. */
export function matchColumns(columns) {
  const candidates = [];
  for (const col of columns) {
    if (!col.header) continue;
    const full = ` ${norm(col.header)} `;
    const bare = ` ${norm(col.name)} `;
    // a cumulative or an injection column is never a stream rate
    if (/\bcum|cumulative|\binj/.test(full)) continue;
    for (const target of IMPORT_COLUMNS) {
      for (const name of target.names) {
        const needle = ` ${name} `;
        if (bare === needle || full === needle) candidates.push({ key: target.key, index: col.index, score: 1000 + name.length });
        else if (bare.includes(needle) || full.includes(needle) || (name.length >= 4 && full.replace(/ /g, '').includes(name.replace(/ /g, '')))) candidates.push({ key: target.key, index: col.index, score: name.length });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const map = {};
  const used = new Set();
  for (const c of candidates) {
    if (map[c.key] !== undefined || used.has(c.index)) continue;
    map[c.key] = c.index;
    used.add(c.index);
  }
  // a generic rate column is the oil stream only when the file has no oil column
  if (map.rate !== undefined && map.oilRate === undefined) { map.oilRate = map.rate; delete map.rate; }
  else if (map.rate !== undefined) delete map.rate;
  return map;
}

const DAY = 86400000;
const daysInMonth = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).getTime() / DAY - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY;
};

/** A day-first or month-first date the reader returned, or a year or Excel serial number. */
const dateOf = (v) => {
  if (v && typeof v === 'object' && v.iso) return String(v.iso).slice(0, 10);
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isInteger(v) && v >= 1900 && v <= 2100) return `${v}-01-01`;
    if (v >= 20000 && v <= 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY).toISOString().slice(0, 10);
  }
  return null;
};

/**
 * Read a production table.
 * @param {string} text the file or the paste
 * @param {{mapping?: Object<string, ?number>, units?: Object<string, string>, dateOrder?: 'dmy'|'mdy',
 *   decimal?: '.'|',', header?: boolean}} [choices] what the user chose at the door
 * @returns {{ok: boolean, refusal: ?string, rows: object[], mapping: object, units: object, unitFrom: object,
 *   columns: object[], questions: object[], warnings: string[], readBack: object, wells: string[]}}
 */
export function readProductionTable(text, choices = {}) {
  const parsed = parseTabular(text, {
    decimal: choices.decimal, dateOrder: choices.dateOrder, header: typeof choices.header === 'boolean' ? choices.header : undefined,
  });
  const base = {
    ok: false, refusal: null, rows: [], mapping: {}, units: {}, unitFrom: {}, columns: parsed.columns, questions: [], warnings: [], wells: [],
    readBack: { delimiter: parsed.delimiterName, header: Boolean(parsed.header), decimal: parsed.decimal, rowsInFile: 0, rowsRead: 0, skipped: [], columns: [], notUsed: [], negative: 0, volumeRows: 0 },
  };
  if (!parsed.columnCount || !parsed.rows.length) {
    return { ...base, refusal: 'The file holds no table. It needs a date column, at least one rate column and two or more rows.' };
  }

  const mapping = { ...matchColumns(parsed.columns) };
  for (const [key, index] of Object.entries(choices.mapping ?? {})) {
    if (!COLUMN_BY_KEY[key]) continue;
    if (index === null || index === undefined || index === '') delete mapping[key];
    else {
      for (const k of Object.keys(mapping)) if (mapping[k] === Number(index) && k !== key) delete mapping[k];
      mapping[key] = Number(index);
    }
  }

  // units: the user's choice, else the header's, else the daily rate assumed with a warning
  const units = {};
  const unitFrom = {};
  const unitAsks = [];
  for (const target of IMPORT_COLUMNS) {
    const index = mapping[target.key];
    if (index === undefined || target.kind !== 'number') continue;
    const col = parsed.columns[index];
    const options = DOOR_UNITS[target.units === 'gas' || target.key === 'gasRate' ? 'gas' : 'liquid'];
    const kind = target.key === 'gasRate' ? 'gas' : 'liquid';
    const chosen = choices.units?.[target.key];
    const fromHeader = unitFromHeader(kind, col.header, col.unit);
    const either = fromHeader ? null : ambiguousUnit(kind, col.header, col.unit);
    if (chosen && options.some((u) => u.key === chosen)) { units[target.key] = chosen; unitFrom[target.key] = 'chosen'; }
    else if (fromHeader) { units[target.key] = fromHeader; unitFrom[target.key] = 'header'; }
    else if (either && either.length === 1) { units[target.key] = either[0]; unitFrom[target.key] = 'header'; }
    else if (either) { units[target.key] = either[0]; unitFrom[target.key] = 'ask'; unitAsks.push({ key: target.key, column: col.header || col.name, options: either }); }
    else { units[target.key] = options[0].key; unitFrom[target.key] = 'assumed'; }
  }

  const questions = [
    ...parsed.questions.map((q) => ({ ...q, text: questionText(q) })),
    ...unitAsks.map((a) => ({
      kind: 'rateOrVolume', key: a.key, options: a.options,
      text: `${COLUMN_BY_KEY[a.key].label} ("${a.column}") names a volume unit with no time. Are these daily rates or the volume of each month? Choose one; the column is not read until you do.`,
    })),
  ];
  const warnings = [];
  const skipped = parsed.report.skipped.map((s) => ({ line: s.line, reason: s.reason }));
  const dateIndex = mapping.date;
  const dateCol = dateIndex !== undefined ? parsed.columns[dateIndex] : null;
  const dateWaits = Boolean(dateCol?.dateOrder?.asked);

  // first pass: dates and raw numbers
  const raw = [];
  for (const r of parsed.rows) {
    const date = dateIndex !== undefined ? dateOf(r.values[dateIndex]) : null;
    if (!date) {
      if (!dateWaits) skipped.push({ line: r.line, reason: String(r.cells[dateIndex] ?? '').trim() ? `"${String(r.cells[dateIndex]).trim()}" is not a date` : 'no date on this row' });
      continue;
    }
    const v = {};
    for (const key of ['oilRate', 'gasRate', 'waterRate']) {
      const index = mapping[key];
      if (index === undefined) continue;
      const n = r.values[index];
      v[key] = typeof n === 'number' && Number.isFinite(n) ? n : null;
    }
    const well = mapping.well !== undefined ? r.values[mapping.well] : null;
    raw.push({ line: r.line, date, well: well == null ? null : String(well), v });
  }
  raw.sort((a, b) => a.date.localeCompare(b.date));

  // second pass: units to the state's, volumes to calendar-day rates
  const out = [];
  let negative = 0;
  let volumeRows = 0;
  const seen = new Set();
  const monthly = raw.length > 1 && raw.every((r) => r.date.slice(8, 10) === raw[0].date.slice(8, 10));
  for (let i = 0; i < raw.length; i += 1) {
    const r = raw[i];
    if (seen.has(r.date)) { skipped.push({ line: r.line, reason: `a second row for ${r.date}; the first was kept` }); continue; }
    seen.add(r.date);
    const row = { date: r.date, oilRate: null, gasRate: null, waterRate: null };
    for (const key of ['oilRate', 'gasRate', 'waterRate']) {
      if (r.v[key] == null) continue;
      const kind = key === 'gasRate' ? 'gas' : 'liquid';
      const def = DOOR_UNITS[kind].find((u) => u.key === units[key]) || DOOR_UNITS[kind][0];
      let q;
      if (def.basis === 'rate') {
        q = def.unit === ENGINE[kind].unit ? r.v[key] : convert(def.family, r.v[key], def.unit, ENGINE[kind].unit);
      } else {
        // a volume over the row's period: the calendar month for a monthly
        // file, else the days to the next row (the last row takes the gap before it)
        const next = raw[i + 1];
        const prev = raw[i - 1];
        const days = monthly ? daysInMonth(r.date)
          : next ? (Date.parse(next.date) - Date.parse(r.date)) / DAY
            : prev ? (Date.parse(r.date) - Date.parse(prev.date)) / DAY : 30.4375;
        const volEngine = convert(def.family, r.v[key], def.unit, kind === 'gas' ? 'Mscf' : 'bbl');
        q = volEngine / days;
        volumeRows += 1;
      }
      row[key] = Number(q.toPrecision(12));
      if (row[key] < 0) negative += 1;
    }
    row.rate = row.oilRate ?? row.gasRate ?? row.waterRate;
    if (row.oilRate == null && row.gasRate == null && row.waterRate == null) {
      skipped.push({ line: r.line, reason: 'no rate on this row' });
      continue;
    }
    if (r.well) row.well = r.well;
    out.push(row);
  }

  for (const u of parsed.report.unreadable) skipped.push({ line: u.line, reason: `"${u.text}" in column ${u.column + 1} is ${u.reason}; the cell was left empty`, cell: true });
  if (!parsed.header) warnings.push('The file has no row of column names. Choose below which column is which.');
  for (const [key, from] of Object.entries(unitFrom)) {
    if (from === 'assumed') {
      const kind = key === 'gasRate' ? 'gas' : 'liquid';
      warnings.push(`${COLUMN_BY_KEY[key].label}: the file names no unit. It was read as ${DOOR_UNITS[kind][0].label}. If the column holds the volume of each month, choose that below.`);
    }
  }
  if (volumeRows) warnings.push(`Volumes were turned into calendar-day rates: each row's volume over the days in its ${monthly ? 'month' : 'period (to the next row)'}.`);
  if (negative) warnings.push(`${negative} negative rate value(s) were kept. The fit leaves rates at or below zero out and counts them.`);
  // every well the file names, before any duplicate date is set aside
  const wells = [...new Set(raw.map((r) => r.well).filter(Boolean))];

  const readBackColumns = IMPORT_COLUMNS.filter((t) => mapping[t.key] !== undefined).map((t) => {
    const col = parsed.columns[mapping[t.key]];
    const kind = t.key === 'gasRate' ? 'gas' : 'liquid';
    const def = t.kind === 'number' ? DOOR_UNITS[kind].find((x) => x.key === units[t.key]) : null;
    return {
      key: t.key, label: t.label, fileColumn: col.header || col.name, index: col.index,
      unit: t.kind === 'date' ? (col.dateOrder?.order === 'dmy' ? 'day first' : col.dateOrder?.order === 'mdy' ? 'month first' : 'unambiguous') : (def?.label ?? ''),
      unitFrom: t.kind === 'date' ? (col.dateOrder?.from ?? 'file') : (unitFrom[t.key] ?? ''),
      values: t.kind === 'number' ? out.filter((row) => row[t.key] != null).length : out.length,
    };
  });
  const placed = new Set(Object.values(mapping));
  const notUsed = parsed.columns.filter((c) => !placed.has(c.index)).map((c) => {
    const n = norm(c.header || c.name);
    const why = (NOT_USED.find(([re]) => re.test(n)) || [null, 'not a column this app reads'])[1];
    return { index: c.index, name: c.header || c.name, reason: why };
  });

  const result = {
    ...base, mapping, units, unitFrom, questions, warnings, rows: out, wells,
    readBack: { ...base.readBack, rowsInFile: parsed.rows.length, rowsRead: out.length, skipped, columns: readBackColumns, notUsed, negative, volumeRows },
  };
  if (mapping.date === undefined) {
    return { ...result, rows: [], refusal: parsed.header ? 'No date column was found by name. Choose which column holds the dates.' : 'The file has no row of column names. Choose which column holds the dates and which the rates.' };
  }
  if (mapping.oilRate === undefined && mapping.gasRate === undefined && mapping.waterRate === undefined) {
    return { ...result, rows: [], refusal: 'No oil, gas or water rate column was found by name. Choose which column holds each stream.' };
  }
  if (dateWaits) {
    return { ...result, rows: [], refusal: 'The dates could be day first or month first and nothing in the file settles it. Choose one below; the dates are not read until you do.' };
  }
  if (unitAsks.length) {
    return { ...result, rows: [], refusal: 'A rate column names a volume unit with no time. Choose daily rate or monthly volume below; the rates are not read until you do.' };
  }
  if (wells.length > 1) {
    const shown = wells.slice(0, 4).join(', ') + (wells.length > 4 ? ` and ${wells.length - 4} more` : '');
    return { ...result, rows: [], refusal: `This file holds ${wells.length} wells (${shown}). Import one well's rows at a time: split the file by well, or filter it first.` };
  }
  if (out.length < 3) return { ...result, refusal: `Only ${out.length} row(s) carry a date and a rate. A decline fit needs at least three, and five inside the fit window.` };
  return { ...result, ok: true };
}
