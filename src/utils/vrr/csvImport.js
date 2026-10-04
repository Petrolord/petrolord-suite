// The import doors of the Voidage Replacement Monitor (VRR-U1, PL2, RL10).
//
// Three tables arrive as text: the per-well production and injection ledger,
// the pressure surveys, and the manual period grid. All three are read with
// the shared typed reader (src/lib/tabularParse.js), which settles the
// delimiter, the header row, the decimal mark and the date order once for
// the Suite, and this module turns what it read into the rows the app holds:
//
//   ledger   { date, well, oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf }
//            liquids in bbl and gas in Mscf, VOLUMES over the row's period
//            (the vrrLedger.js row schema; the engine sums them by month)
//   surveys  { date, p_psia }
//   periods  { label, Np, Wp, Gp, Wi, Gi } as strings (the manual grid)
//
// What the door says, and what it no longer does silently:
//
//   columns  found by name in any order. A header that names injection
//            ("Water Inj (bbl)", "gas_injected", "bwipd") is an injection
//            column; a production column never holds "inj". VRR-U1-001: the
//            old door missed "Water Inj (bbl)" (space, not underscore) and
//            dropped the injection with no word, so VRR read 0. A column the
//            app does not read is listed with the reason.
//   units    from the header ("Oil (sm3)", "gas_mmscf", "BOPD"), else chosen
//            at the door, else assumed in the display units and said so.
//            VRR-U1-002: the old door read "Oil (sm3)" as bbl. A RATE
//            ("bopd", "Mscf/d") is turned into the row's volume by the days
//            of its period: one for daily rows, the calendar month for
//            monthly rows, the gap to the well's next row otherwise.
//            VRR-U1-003 (S1): the old door summed a BOPD column on monthly
//            rows as if it were the month's volume, 31 times low, so a file
//            with production in rates and injection in volumes gave a VRR of
//            31.6 for 1.02.
//   decimals one mark per file; "1.234,5" is 1234.5 (VRR-U1-004: the old
//            door read 1.234). When the file cannot settle it the reader
//            says which reading it took and the door offers the other.
//   dates    ISO, month names ("Jan-2025"), YYYY-MM, Excel serial numbers and
//            day/month/year in either order; when nothing in the file
//            settles day first or month first the door ASKS and the rows
//            wait (the old door assumed day first).
//   rows     every row left out is listed with its line and the reason; a
//            second row for the same well and date that repeats a stream is
//            left out (the old door summed it); negative volumes are zeroed
//            and counted, as before.
//
// Pure: text in, a plain object out.
import { parseTabular, questionText } from '@/lib/tabularParse';
import { convert } from '@/lib/units/registry';

const norm = (s) => String(s ?? '').toLowerCase().replace(/\^/g, '^').replace(/[^a-z0-9^]+/g, ' ').trim();
const pad2 = (n) => String(n).padStart(2, '0');
const headerBase = (h) => String(h ?? '').replace(/\s*[([{].*$/, '');
const DAY = 86400000;

// ---------------------------------------------------------------------------
// Units at the door
// ---------------------------------------------------------------------------

/**
 * The units a stream column may arrive in. `basis` volume: the volume over
 * the row's period; rate: a calendar-day average, turned into the row's
 * volume by the days of its period. The state holds bbl and Mscf volumes.
 */
export const DOOR_UNITS = Object.freeze({
  liquid: [
    { key: 'bbl', label: 'bbl in the row\'s period (volume)', basis: 'volume', family: 'liquidVolume', unit: 'bbl' },
    { key: 'Mbbl', label: 'Mbbl in the row\'s period (volume)', basis: 'volume', family: 'liquidVolume', unit: '10^3 bbl' },
    { key: 'MMbbl', label: 'MMbbl in the row\'s period (volume)', basis: 'volume', family: 'liquidVolume', unit: 'MMbbl' },
    { key: 'm3', label: 'sm3 in the row\'s period (volume)', basis: 'volume', family: 'liquidVolume', unit: 'm3' },
    { key: '10^3 m3', label: '10^3 sm3 in the row\'s period (volume)', basis: 'volume', family: 'liquidVolume', unit: '10^3 m3' },
    { key: 'bbl/d', label: 'bbl/d (daily rate)', basis: 'rate', family: 'liquidVolume', unit: 'bbl' },
    { key: 'm3/d', label: 'sm3/d (daily rate)', basis: 'rate', family: 'liquidVolume', unit: 'm3' },
  ],
  gas: [
    { key: 'Mscf', label: 'Mscf in the row\'s period (volume)', basis: 'volume', family: 'gasVolume', unit: 'Mscf' },
    { key: 'MMscf', label: 'MMscf in the row\'s period (volume)', basis: 'volume', family: 'gasVolume', unit: 'MMscf' },
    { key: 'Bscf', label: 'Bscf in the row\'s period (volume)', basis: 'volume', family: 'gasVolume', unit: 'Bscf' },
    { key: 'scf', label: 'scf in the row\'s period (volume)', basis: 'volume', family: 'gasVolume', unit: 'scf' },
    { key: 'm3', label: 'sm3 in the row\'s period (volume)', basis: 'volume', family: 'gasVolume', unit: 'm3' },
    { key: '10^3 m3', label: '10^3 sm3 in the row\'s period (volume)', basis: 'volume', family: 'gasVolume', unit: '10^3 m3' },
    { key: '10^6 m3', label: '10^6 sm3 in the row\'s period (volume)', basis: 'volume', family: 'gasVolume', unit: '10^6 m3' },
    { key: 'Mscf/d', label: 'Mscf/d (daily rate)', basis: 'rate', family: 'gasVolume', unit: 'Mscf' },
    { key: 'MMscf/d', label: 'MMscf/d (daily rate)', basis: 'rate', family: 'gasVolume', unit: 'MMscf' },
    { key: 'm3/d', label: 'sm3/d (daily rate)', basis: 'rate', family: 'gasVolume', unit: 'm3' },
    { key: '10^3 m3/d', label: '10^3 sm3/d (daily rate)', basis: 'rate', family: 'gasVolume', unit: '10^3 m3' },
  ],
});
const STATE_UNIT = Object.freeze({ liquid: 'bbl', gas: 'Mscf' });
/** The unit a column with no unit in its header is read in, per display system. */
export const ASSUMED_UNIT = Object.freeze({ oilfield: { liquid: 'bbl', gas: 'Mscf' }, si: { liquid: 'm3', gas: '10^3 m3' } });

// how a unit is written in a header; a time ("bopd", "per day", "/d") makes a rate.
// Order matters: the longer multiple first.
const SPELLINGS = Object.freeze({
  liquid: [
    [/\b(mmbbl|mmstb)\b/, 'MMbbl'],
    [/\b(mbbl|mstb)\b/, 'Mbbl'],
    [/\b10 ?\^? ?3 ?s?m3\b|\be3m3\b|\bk ?s?m3\b/, '10^3 m3'],
    [/\bs?m3 ?(per ?)?(d|day)\b|\bs?m3d\b/, 'm3/d'],
    [/\b(bopd|bwpd|bpd|bwipd|bipd|stbd|bbld)\b|\b(bbl|stb) ?(per ?)?(d|day)\b/, 'bbl/d'],
    [/\bs?m3\b/, 'm3'],
    [/\b(bbl|stb|bbls|barrels?)\b/, 'bbl'],
  ],
  gas: [
    [/\b(bscf|bcf)\b/, 'Bscf'],
    [/\b(mmscf|mmcf) ?(per ?)?(d|day)\b|\b(mmscfd|mmcfd)\b/, 'MMscf/d'],
    [/\b(mmscf|mmcf)\b/, 'MMscf'],
    [/\b(mscf|mcf) ?(per ?)?(d|day)\b|\b(mscfd|mcfd)\b/, 'Mscf/d'],
    [/\b(mscf|mcf)\b/, 'Mscf'],
    [/\b10 ?\^? ?6 ?s?m3\b|\be6m3\b/, '10^6 m3'],
    [/\b10 ?\^? ?3 ?s?m3 ?(per ?)?(d|day)\b|\be3m3d\b/, '10^3 m3/d'],
    [/\b10 ?\^? ?3 ?s?m3\b|\be3m3\b|\bk ?s?m3\b/, '10^3 m3'],
    [/\bs?m3 ?(per ?)?(d|day)\b|\bs?m3d\b/, 'm3/d'],
    [/\bs?m3\b/, 'm3'],
    [/\bscf\b/, 'scf'],
  ],
});

/** The door unit a header names for a stream column, or null. */
export function unitFromHeader(stream, header, bracketUnit) {
  for (const text of [norm(bracketUnit), norm(header)].filter(Boolean)) {
    for (const [re, key] of SPELLINGS[stream] || []) if (re.test(text)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Columns by name
// ---------------------------------------------------------------------------

/** The ledger columns the door fills. */
export const LEDGER_COLUMNS = Object.freeze([
  { key: 'date', label: 'Date', kind: 'date' },
  { key: 'well', label: 'Well', kind: 'text' },
  { key: 'oil_stb', label: 'Oil produced', kind: 'number', stream: 'liquid' },
  { key: 'water_stb', label: 'Water produced', kind: 'number', stream: 'liquid' },
  { key: 'gas_mscf', label: 'Gas produced', kind: 'number', stream: 'gas' },
  { key: 'winj_stb', label: 'Water injected', kind: 'number', stream: 'liquid' },
  { key: 'ginj_mscf', label: 'Gas injected', kind: 'number', stream: 'gas' },
]);
const COLUMN_BY_KEY = Object.fromEntries(LEDGER_COLUMNS.map((c) => [c.key, c]));
export const VOLUME_KEYS = Object.freeze(['oil_stb', 'water_stb', 'gas_mscf', 'winj_stb', 'ginj_mscf']);

const DATE_NAMES = ['production date', 'prod date', 'report date', 'survey date', 'date', 'month', 'period', 'timestamp', 'time'];
const WELL_NAMES = ['well name', 'wellname', 'well id', 'well', 'uwi', 'completion', 'api'];
const INJ = /\b(inj|injection|injected|injector|winj|ginj|wi|gi|bwipd|bipd|iwr)\b|inj/;
const WATER = /\b(water|wtr|wat|bwpd|bwipd|winj|wi|qw|wp)\b/;
const GAS = /\b(gas|mscf|mcf|mmscf|mmcf|ginj|gi|qg|gp|scf|mscfd|mcfd)\b/;
const OIL = /\b(oil|bopd|qo|np|crude|condensate)\b/;
const CUM = /\bcum|cumulative/;
// a column named for something other than a stream volume (tested on the name, before any bracketed unit)
const NOT_A_STREAM = /pressure|\bpsi|\bkpa\b|\bbar\b|\bbhp\b|\bthp\b|\bwhp\b|^days?\b|\bdays on\b|producing days|\bprod days\b|on stream|hours|\bhrs\b|uptime|choke|\bgor\b|\bcut\b|\bbsw\b|ratio|\btemp/;

/**
 * Place the file's columns by header name: injection first (a header that
 * names injection is never a production column), each column used once.
 * @param {Array<{index: number, header: ?string, name: string}>} columns parseTabular columns
 * @returns {Object<string, number>} ledger key -> column index
 */
export function matchLedgerColumns(columns) {
  const map = {};
  const used = new Set();
  const place = (key, index) => { if (map[key] === undefined && !used.has(index)) { map[key] = index; used.add(index); } };
  const named = columns.filter((c) => c.header);
  const n = (c) => norm(c.header);
  // date and well by name, exact first
  for (const [key, names] of [['date', DATE_NAMES], ['well', WELL_NAMES]]) {
    for (const name of names) {
      const hit = named.find((c) => !used.has(c.index) && (n(c) === name || ` ${n(c)} `.includes(` ${name} `)));
      if (hit) { place(key, hit.index); break; }
    }
  }
  // a date column the reader typed as dates, when none is named
  if (map.date === undefined) {
    const d = columns.find((c) => !used.has(c.index) && c.kind === 'date');
    if (d) place('date', d.index);
  }
  for (const c of named) {
    if (used.has(c.index)) continue;
    const t = n(c);
    const base = norm(headerBase(c.header));
    if (CUM.test(t) || NOT_A_STREAM.test(base)) continue;
    if (INJ.test(t)) {
      if (GAS.test(t) && !WATER.test(t.replace(/\bwi\b/, ''))) place('ginj_mscf', c.index);
      else if (WATER.test(t) || /\b(bwipd|bipd|iwr)\b/.test(t) || !GAS.test(t)) place('winj_stb', c.index);
      continue;
    }
    if (OIL.test(t)) place('oil_stb', c.index);
    else if (WATER.test(t)) place('water_stb', c.index);
    else if (GAS.test(t)) place('gas_mscf', c.index);
  }
  return map;
}

// why a column was not used, in words
const NOT_USED = Object.freeze([
  [/\bcum|cumulative/, 'a cumulative: the app sums the volumes itself'],
  [/pressure|psi|kpa|\bbar\b|\bbhp\b|\bthp\b|\bwhp\b/, 'a pressure: import pressure surveys on the Pressure tab'],
  [/days?|hours|\bhrs\b|uptime|on stream/, 'producing time: rates are read as calendar-day averages'],
  [/choke|gor|cut|bsw|ratio/, 'a ratio or a setting'],
]);

// ---------------------------------------------------------------------------
// Dates and periods
// ---------------------------------------------------------------------------

/** A reader value as 'YYYY-MM-DD' or 'YYYY-MM', or null. */
export function dateOf(v) {
  if (v && typeof v === 'object' && v.iso) return String(v.iso).slice(0, 10);
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 20000 && v <= 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY).toISOString().slice(0, 10);
    return null;
  }
  const s = String(v ?? '').trim();
  const m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${pad2(m[2])}`;
  // an Excel serial day number in a column of dates (1954 to 2119)
  if (/^\d{5}$/.test(s)) return dateOf(Number(s));
  return null;
}

const msOf = (date) => Date.parse(date.length === 7 ? `${date}-01T00:00:00Z` : `${date}T00:00:00Z`);
export const daysInMonth = (date) => {
  const y = Number(date.slice(0, 4)); const m = Number(date.slice(5, 7));
  return (Date.UTC(y, m, 1) - Date.UTC(y, m - 1, 1)) / DAY;
};

/**
 * The days of each row's period, per well: 1 for daily rows, the calendar
 * month for monthly rows (or a 'YYYY-MM' date), else the gap to the well's
 * next row (the last row takes the gap before it).
 * @returns {{days: number[], spacing: Object<string, 'daily'|'monthly'|'irregular'|'single'>}}
 */
export function rowPeriods(raw) {
  const byWell = new Map();
  raw.forEach((r, i) => { if (!byWell.has(r.well)) byWell.set(r.well, []); byWell.get(r.well).push(i); });
  const days = new Array(raw.length).fill(1);
  const spacing = {};
  for (const [well, idx] of byWell) {
    const dates = [...new Set(idx.map((i) => raw[i].date))].sort();
    const ms = dates.map(msOf);
    const gaps = ms.slice(1).map((t, k) => (t - ms[k]) / DAY);
    const monthly = dates.every((d) => d.length === 7)
      || (dates.length > 1 && dates.every((d) => d.slice(8, 10) === dates[0].slice(8, 10)) && gaps.every((g) => g >= 28 && g <= 31));
    const daily = !monthly && gaps.length > 0 && gaps.every((g) => g === 1);
    spacing[well] = monthly ? 'monthly' : daily ? 'daily' : dates.length === 1 ? 'single' : 'irregular';
    const dayOf = new Map(dates.map((d, k) => {
      if (monthly || dates.length === 1) return [d, daysInMonth(d)];
      if (daily) return [d, 1];
      return [d, k < gaps.length ? gaps[k] : gaps[gaps.length - 1]];
    }));
    for (const i of idx) days[i] = dayOf.get(raw[i].date);
  }
  return { days, spacing };
}

// ---------------------------------------------------------------------------
// The ledger door
// ---------------------------------------------------------------------------

/**
 * Read a per-well production and injection table.
 * @param {string} text the file or the paste
 * @param {{mapping?: Object<string, ?number>, units?: Object<string, string>, dateOrder?: 'dmy'|'mdy',
 *   decimal?: '.'|',', system?: 'oilfield'|'si'}} [choices] what the user chose at the door; `system` the
 *   display system a column with no unit is assumed to be in
 * @returns {{ok: boolean, refusal: ?string, rows: object[], report: object, questions: object[], columns: object[],
 *   mapping: object, units: object, unitFrom: object}}
 */
export function parseVrrWellCSV(text, choices = {}) {
  const system = choices.system === 'si' ? 'si' : 'oilfield';
  const parsed = parseTabular(text, { decimal: choices.decimal, dateOrder: choices.dateOrder });
  const report = {
    totalRows: parsed.rows.length,
    imported: 0,
    skipped: [],          // [{row, reason}] row = the line in the file
    warnings: [],
    negativesZeroed: 0,
    colMap: {},           // ledger key -> header text
    unitScales: {},       // kept for old readers: key -> factor to the state unit (volume basis only)
    delimiter: parsed.delimiterName,
    decimal: parsed.decimal,
    readBack: [],         // [{key, label, column, unit, from, values}]
    notUsed: [],          // [{column, reason}]
    rateRows: 0,
    spacing: {},
    firstDate: null,
    lastDate: null,
    wells: 0,
  };
  const out = { ok: false, refusal: null, rows: [], report, questions: [], columns: parsed.columns, mapping: {}, units: {}, unitFrom: {} };
  if (!parsed.columnCount || !parsed.rows.length) {
    report.warnings.push('No data rows found in the file.');
    return { ...out, refusal: 'The file holds no table: it needs a date column, at least one volume column and one row.' };
  }

  const mapping = { ...matchLedgerColumns(parsed.columns) };
  for (const [key, index] of Object.entries(choices.mapping || {})) {
    if (!COLUMN_BY_KEY[key]) continue;
    for (const k of Object.keys(mapping)) if (mapping[k] === Number(index) && k !== key) delete mapping[k];
    if (index === null || index === undefined || index === '') delete mapping[key];
    else mapping[key] = Number(index);
  }
  out.mapping = mapping;
  for (const [key, index] of Object.entries(mapping)) report.colMap[key] = parsed.columns[index]?.header || parsed.columns[index]?.name;

  // units: the user's choice, else the header's, else assumed in the display system and said so
  const units = {};
  const unitFrom = {};
  for (const key of VOLUME_KEYS) {
    if (mapping[key] === undefined) continue;
    const { stream } = COLUMN_BY_KEY[key];
    const col = parsed.columns[mapping[key]];
    const chosen = choices.units?.[key];
    const header = unitFromHeader(stream, col.header, col.unit);
    if (chosen && DOOR_UNITS[stream].some((u) => u.key === chosen)) { units[key] = chosen; unitFrom[key] = 'chosen'; }
    else if (header) { units[key] = header; unitFrom[key] = 'header'; }
    else { units[key] = ASSUMED_UNIT[system][stream]; unitFrom[key] = 'assumed'; }
    const def = DOOR_UNITS[stream].find((u) => u.key === units[key]);
    if (def.basis === 'volume') report.unitScales[key] = convert(def.family, 1, def.unit, STATE_UNIT[stream]);
  }
  out.units = units;
  out.unitFrom = unitFrom;

  const questions = parsed.questions.map((q) => ({ ...q, text: questionText(q) }));
  out.questions = questions;
  const dateCol = mapping.date !== undefined ? parsed.columns[mapping.date] : null;
  const dateWaits = Boolean(dateCol?.dateOrder?.asked);

  if (mapping.date === undefined) {
    report.warnings.push('No date column recognized. Expected a header like "date", "month" or "period".');
    return { ...out, refusal: 'No date column was found by name. Choose which column holds the dates.' };
  }
  if (!VOLUME_KEYS.some((k) => mapping[k] !== undefined)) {
    report.warnings.push('No production or injection volume columns recognized.');
    return { ...out, refusal: 'No production or injection column was found by name. Choose which column holds each stream.' };
  }
  if (dateWaits) {
    return { ...out, refusal: 'The dates could be day first or month first and nothing in the file settles it. Choose one below; the rows are not read until you do.' };
  }
  if (mapping.well === undefined) report.warnings.push('No well column recognized; all rows imported as one field-level well "FIELD".');

  // first pass: dates, wells, raw numbers
  const raw = [];
  for (const r of parsed.rows) {
    const cell = String(r.cells[mapping.date] ?? '').trim();
    const date = dateOf(r.values[mapping.date]) ?? dateOf(cell);
    if (!date) { report.skipped.push({ row: r.line, reason: cell ? `Unparseable date "${cell}"` : 'No date on this row' }); continue; }
    const well = mapping.well !== undefined ? String(r.values[mapping.well] ?? '').trim() : 'FIELD';
    if (!well) { report.skipped.push({ row: r.line, reason: 'Blank well name' }); continue; }
    const v = {};
    for (const key of VOLUME_KEYS) {
      if (mapping[key] === undefined) continue;
      const x = r.values[mapping[key]];
      v[key] = typeof x === 'number' && Number.isFinite(x) ? x : null;
    }
    raw.push({ line: r.line, date, well, v });
  }
  for (const u of parsed.report.unreadable) {
    // the date column: read above (a serial number, a YYYY-MM month) or the row is listed as skipped
    if (u.column === mapping.date) continue;
    report.skipped.push({ row: u.line, reason: `"${u.text}" in column ${u.column + 1} is ${u.reason}; the cell was read as empty`, cell: true });
  }
  for (const s of parsed.report.skipped) report.skipped.push({ row: s.line, reason: s.reason });

  // second pass: the days of each row's period, units to the state's, rates to volumes
  const { days, spacing } = rowPeriods(raw);
  report.spacing = spacing;
  const seen = new Map();
  const rows = [];
  raw.forEach((r, i) => {
    const key = `${r.well}\u0001${r.date}`;
    const row = { date: r.date, well: r.well, oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 0, ginj_mscf: 0 };
    const filled = [];
    for (const k of VOLUME_KEYS) {
      const x = r.v[k];
      if (x == null) continue;
      if (x < 0) { report.negativesZeroed += 1; continue; }
      const { stream } = COLUMN_BY_KEY[k];
      const def = DOOR_UNITS[stream].find((u) => u.key === units[k]);
      let vol = convert(def.family, x, def.unit, STATE_UNIT[stream]);
      if (def.basis === 'rate') { vol *= days[i]; report.rateRows += 1; }
      row[k] = Number(vol.toPrecision(12));
      if (x !== 0) filled.push(k);
    }
    const prev = seen.get(key);
    if (prev) {
      // one row for a well and a date: a second row that only adds streams the first left empty is merged
      const clash = filled.filter((k) => prev[k] !== 0);
      if (clash.length) {
        report.skipped.push({ row: r.line, reason: `A second row for ${r.well} on ${r.date} repeats ${clash.map((k) => COLUMN_BY_KEY[k].label.toLowerCase()).join(', ')}; the first row was kept` });
        return;
      }
      for (const k of filled) prev[k] = row[k];
      return;
    }
    seen.set(key, row);
    rows.push(row);
  });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.well < b.well ? -1 : a.well > b.well ? 1 : 0));

  report.imported = rows.length;
  report.wells = new Set(rows.map((r) => r.well)).size;
  report.firstDate = rows.length ? rows[0].date : null;
  report.lastDate = rows.length ? rows[rows.length - 1].date : null;
  report.readBack = LEDGER_COLUMNS.filter((c) => mapping[c.key] !== undefined).map((c) => {
    const col = parsed.columns[mapping[c.key]];
    const def = c.stream ? DOOR_UNITS[c.stream].find((u) => u.key === units[c.key]) : null;
    return {
      key: c.key,
      label: c.label,
      column: col.header || col.name,
      unit: c.kind === 'date' ? (col.dateOrder?.order === 'dmy' ? 'day first' : col.dateOrder?.order === 'mdy' ? 'month first' : 'unambiguous') : (def?.label ?? ''),
      from: c.kind === 'date' ? (col.dateOrder?.from || 'file') : (unitFrom[c.key] || ''),
      values: c.stream ? rows.filter((row) => row[c.key] > 0).length : rows.length,
    };
  });
  const placed = new Set(Object.values(mapping));
  report.notUsed = parsed.columns.filter((c) => !placed.has(c.index)).map((c) => {
    const t = norm(c.header || c.name);
    return { column: c.header || c.name, reason: (NOT_USED.find(([re]) => re.test(t)) || [null, 'not a column this app reads'])[1] };
  });

  for (const [k, from] of Object.entries(unitFrom)) {
    if (from === 'assumed') {
      const def = DOOR_UNITS[COLUMN_BY_KEY[k].stream].find((u) => u.key === units[k]);
      report.warnings.push(`${report.colMap[k]}: the header names no unit. It was read as ${def.label}. Choose the unit below if that is wrong.`);
    } else if (from === 'header' && report.unitScales[k] && report.unitScales[k] !== 1) {
      report.warnings.push(`${report.colMap[k]}: read as ${DOOR_UNITS[COLUMN_BY_KEY[k].stream].find((u) => u.key === units[k]).label} and converted to ${STATE_UNIT[COLUMN_BY_KEY[k].stream]}.`);
    }
  }
  if (report.rateRows) {
    const kinds = [...new Set(Object.values(spacing))];
    report.warnings.push(`Daily rates were turned into each row's volume by the days of its period (${kinds.map((s) => ({ daily: 'one day for daily rows', monthly: 'the calendar days of the month for monthly rows', irregular: 'the days to the well\'s next row', single: 'the calendar days of the month for a well with one row' }[s])).join('; ')}). Rates are read as calendar-day averages.`);
  }
  if (report.negativesZeroed > 0) {
    report.warnings.push(`${report.negativesZeroed} negative volume value${report.negativesZeroed === 1 ? '' : 's'} zeroed.`);
  }
  if (!parsed.decimal.certain) report.warnings.push(questionText({ kind: 'decimalMark', examples: parsed.decimal.examples, assumed: parsed.decimal.mark }));
  if (!rows.length) return { ...out, rows: [], report, refusal: 'No row carries a date, a well and a volume.' };
  return { ...out, ok: true, rows, report };
}

// ---------------------------------------------------------------------------
// Pressure surveys
// ---------------------------------------------------------------------------

/** Atmospheric pressure used to turn a gauge reading into an absolute one. */
export const ATM_PSI = 14.696;
export const PRESSURE_UNITS = Object.freeze([
  { key: 'psia', label: 'psia', unit: 'psi', gauge: false },
  { key: 'psig', label: 'psig (gauge; 14.696 psi added)', unit: 'psi', gauge: true },
  { key: 'kPa', label: 'kPa absolute', unit: 'kPa', gauge: false },
  { key: 'kPag', label: 'kPa gauge (101.325 kPa added)', unit: 'kPa', gauge: true },
  { key: 'bar', label: 'bar absolute', unit: 'bar', gauge: false },
  { key: 'barg', label: 'bar gauge (1.01325 bar added)', unit: 'bar', gauge: true },
  { key: 'MPa', label: 'MPa absolute', unit: 'MPa', gauge: false },
]);
const PRESSURE_SPELLINGS = [
  [/\bpsig\b/, 'psig'], [/\bpsia\b/, 'psia'], [/\bpsi\b/, 'psia'],
  [/\bkpag\b|\bkpa ?g\b/, 'kPag'], [/\bkpa\b/, 'kPa'], [/\bmpa\b/, 'MPa'], [/\bbarg\b|\bbar ?g\b/, 'barg'], [/\bbara?\b/, 'bar'],
];

/** A pressure in a door unit as psia. */
export function pressureToPsia(value, unitKey) {
  const def = PRESSURE_UNITS.find((u) => u.key === unitKey) || PRESSURE_UNITS[0];
  const psi = convert('pressure', value, def.unit, 'psi');
  return def.gauge ? psi + ATM_PSI : psi;
}

/**
 * Read a table of average reservoir pressure surveys.
 * @param {string} text
 * @param {{mapping?: {date?: number, p?: number}, unit?: string, dateOrder?: 'dmy'|'mdy', decimal?: '.'|',', system?: string}} [choices]
 * @returns {{surveys: {date: string, p_psia: number}[], report: object, questions: object[], refusal: ?string, unit: string, unitFrom: string}}
 */
export function parsePressureCSV(text, choices = {}) {
  const parsed = parseTabular(text, { decimal: choices.decimal, dateOrder: choices.dateOrder });
  const report = { totalRows: parsed.rows.length, imported: 0, skipped: [], warnings: [], colMap: {}, unit: null, unitFrom: null };
  const none = (refusal) => ({ surveys: [], report, questions: parsed.questions.map((q) => ({ ...q, text: questionText(q) })), refusal, unit: report.unit, unitFrom: report.unitFrom, columns: parsed.columns });
  const named = parsed.columns.filter((c) => c.header);
  let di = choices.mapping?.date;
  let pi = choices.mapping?.p;
  if (di === undefined) {
    for (const name of DATE_NAMES) {
      const hit = named.find((c) => ` ${norm(c.header)} `.includes(` ${name} `));
      if (hit) { di = hit.index; break; }
    }
    if (di === undefined) di = parsed.columns.find((c) => c.kind === 'date')?.index;
  }
  if (pi === undefined) {
    const hit = named.find((c) => c.index !== di && /pressure|\bpres\b|\bpress\b|\bpr\b|\bp\b|psi|kpa|\bbar|mpa|\bbhp\b|\bsbhp\b|\bpavg\b/.test(norm(c.header)));
    pi = hit?.index;
  }
  if (di === undefined || pi === undefined) {
    report.warnings.push('Need a date column and a pressure column.');
    return none('The file needs a date column and a pressure column. Choose which is which.');
  }
  report.colMap = { date: parsed.columns[di].header || parsed.columns[di].name, p_psia: parsed.columns[pi].header || parsed.columns[pi].name };
  const pc = parsed.columns[pi];
  const fromHeader = (() => { for (const t of [norm(pc.unit), norm(pc.header)].filter(Boolean)) for (const [re, k] of PRESSURE_SPELLINGS) if (re.test(t)) return k; return null; })();
  let unit; let unitFrom;
  if (choices.unit && PRESSURE_UNITS.some((u) => u.key === choices.unit)) { unit = choices.unit; unitFrom = 'chosen'; }
  else if (fromHeader) { unit = fromHeader; unitFrom = 'header'; }
  else { unit = choices.system === 'si' ? 'kPa' : 'psia'; unitFrom = 'assumed'; }
  report.unit = unit;
  report.unitFrom = unitFrom;
  if (unitFrom === 'assumed') report.warnings.push(`${report.colMap.p_psia}: the header names no unit. It was read as ${PRESSURE_UNITS.find((u) => u.key === unit).label}. Choose the unit below if that is wrong.`);
  if (PRESSURE_UNITS.find((u) => u.key === unit).gauge) report.warnings.push(`${report.colMap.p_psia}: gauge pressures; the atmosphere (14.696 psi) was added to make them absolute.`);
  if (parsed.columns[di].dateOrder?.asked) return none('The dates could be day first or month first and nothing in the file settles it. Choose one below.');

  const surveys = [];
  for (const r of parsed.rows) {
    const cell = String(r.cells[di] ?? '').trim();
    const date = dateOf(r.values[di]) ?? dateOf(cell);
    const p = r.values[pi];
    if (!date) { report.skipped.push({ row: r.line, reason: `Unparseable date "${cell}"` }); continue; }
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) { report.skipped.push({ row: r.line, reason: `Unusable pressure "${r.cells[pi] ?? ''}"` }); continue; }
    surveys.push({ date, p_psia: Number(pressureToPsia(p, unit).toPrecision(10)) });
  }
  for (const s of parsed.report.skipped) report.skipped.push({ row: s.line, reason: s.reason });
  surveys.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  report.imported = surveys.length;
  if (!surveys.length) return none('No row carries a date and a usable pressure.');
  return { surveys, report, questions: [], refusal: null, unit, unitFrom, columns: parsed.columns };
}

// ---------------------------------------------------------------------------
// The manual period grid
// ---------------------------------------------------------------------------

const GRID_NAMES = Object.freeze({
  label: ['label', 'period', 'month', 'date'],
  Np: ['np', 'oil'], Wp: ['wp', 'water'], Gp: ['gp', 'gas'], Wi: ['wi', 'water inj', 'winj'], Gi: ['gi', 'gas inj', 'ginj'],
});

/**
 * Read the period grid's own CSV (label, Np, Wp, Gp, Wi, Gi), any separator
 * and decimal mark, columns in any order. Values are stored as the grid
 * holds them (strings, oilfield units). VRR-U1-005: the old reader split on
 * commas and matched exact headers only.
 */
export function parsePeriodGridCSV(text, choices = {}) {
  const parsed = parseTabular(text, { decimal: choices.decimal, header: true });
  const map = {};
  const used = new Set();
  for (const [key, names] of Object.entries(GRID_NAMES)) {
    for (const name of names) {
      const hit = parsed.columns.find((c) => c.header && !used.has(c.index) && norm(headerBase(c.header)) === name);
      if (hit) { map[key] = hit.index; used.add(hit.index); break; }
    }
  }
  if (map.label === undefined && !['Np', 'Wp', 'Gp', 'Wi', 'Gi'].some((k) => map[k] !== undefined)) {
    return { periods: [], refusal: 'Expected the columns label, Np, Wp, Gp, Wi and Gi (the Export button writes them).', skipped: [] };
  }
  const periods = parsed.rows.map((r) => {
    const p = { label: '', Np: '', Wp: '', Gp: '', Wi: '', Gi: '' };
    if (map.label !== undefined) p.label = String(r.cells[map.label] ?? '').trim();
    for (const k of ['Np', 'Wp', 'Gp', 'Wi', 'Gi']) {
      if (map[k] === undefined) continue;
      const v = r.values[map[k]];
      p[k] = typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
    }
    return p;
  });
  return { periods, refusal: periods.length ? null : 'The file holds no rows.', skipped: parsed.report.skipped };
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

// Template CSV in the canonical schema. The sample volumes ARE the engine
// fixture (test-data/waterflood/vrr-ledger-fixture.json), so loading the
// template reproduces the jest-pinned oracle numbers end to end.
export function vrrTemplateCSV() {
  const header = 'date,well,oil_stb,water_stb,gas_mscf,winj_stb,ginj_mscf';
  const rows = [
    '2025-01-01,P-1,10000,2000,6000,0,0',
    '2025-01-01,P-2,5000,1000,2000,0,0',
    '2025-01-01,I-1,0,0,0,15000,0',
    '2025-01-01,I-2,0,0,0,0,3000',
    '2025-02-01,P-1,9000,2500,5000,0,0',
    '2025-02-01,P-2,4500,1500,1800,0,0',
    '2025-02-01,I-1,0,0,0,18000,0',
    '2025-02-01,I-2,0,0,0,0,2000',
    '2025-03-01,P-1,8000,3000,4200,0,0',
    '2025-03-01,P-2,4000,2000,1500,0,0',
    '2025-03-01,I-1,0,0,0,20000,0',
    '2025-03-01,I-2,0,0,0,0,1000',
  ];
  return [header, ...rows].join('\n');
}

export { COLUMN_BY_KEY as LEDGER_COLUMN_BY_KEY };
