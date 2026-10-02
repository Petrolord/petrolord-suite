// Mudlogging data import (upgrade U2-003, PL2 and PL3; closes the file half
// of WS-U1-020). A mudlogging unit exports its depth or time database as
// CSV, as a delimited text file or as LAS: any column order, units in the
// header or on a second line or nowhere, comma decimals, day-first dates,
// vendor nulls, field or metric units, sometimes no header at all.
//
// This is the door. parseMudlogFile reads the text and GUESSES what each
// column is and its unit from the header; convertMudlog turns the rows into
// the canonical frame with the quantity and the unit of every column
// DECLARED by the user (a guess only pre-fills the choice; a column with no
// declared unit is refused, never assumed). Every row not read is returned
// with its line and reason, every value dropped is counted per column, and
// a column that loses most of its values to the range check stops the
// import with "the declared unit looks wrong".
//
// Canonical frame: depth m MD below KB; time UTC ms; ROP m/hr; WOB kN;
// rotary rev/min; torque kN.m; standpipe pressure kPa; flow m3/min; pump
// strokes/min; mud weight and ECD kg/m3; total gas percent (or uncalibrated
// chromatograph units, kept apart); C1 to C5 ppm; bit size m.
//
// The rows are stored as ws_records observations so they work offline,
// queue, share and travel in a .pld like every other record: one
// 'mudlog_import' header (what was read, from which file, with which
// declarations) and 'mudlog_data' chunks of up to 500 rows citing it.
// Withdrawing an import is a correction of its header; the data is then
// ignored by every reader. Pure, no I/O.

import { parseLas } from '../../../../../packages/engines/engines/welldata/lasParse.js';
import { parseWitsml, logTableFromWitsml } from './witsml';

export const IMPORT_SUBTYPE = 'mudlog_import';
export const DATA_SUBTYPE = 'mudlog_data';
export const CHUNK_ROWS = 500;
const FT = 0.3048;
const IN = 0.0254;
const KN_PER_LBF = 4.4482216152605e-3;
const NULLS = new Set([-999, -999.25, -9999, -9999.25, -99999]);

/** Unit spellings to one canonical spelling. */
const UNIT_SYNONYMS = {
  ft: ['ft', 'feet', 'f', 'foot'], m: ['m', 'metre', 'meter', 'metres', 'meters', 'mtr'],
  'ft/hr': ['ft/hr', 'ft/h', 'fph', 'f/hr', 'f/h', 'feet/hr', 'ft/hour'], 'm/hr': ['m/hr', 'm/h', 'm/hour', 'mtr/hr'],
  'min/ft': ['min/ft', 'mn/ft'], 'min/m': ['min/m', 'mn/m'],
  klbf: ['klbf', 'klb', 'klbs', 'kip', 'kips', 'k-lbs', '1000lbf', '1000lb'], lbf: ['lbf', 'lb', 'lbs'], kN: ['kn'], t: ['t', 'ton', 'tonne', 'tonnes', 'mt', 'tf'], kdaN: ['kdan'], daN: ['dan'],
  rpm: ['rpm', 'rev/min', 'c/min', 'r/min', '1/min'],
  'kft.lbf': ['kft.lbf', 'kft.lb', 'kft-lb', 'kft-lbf', 'kftlb', 'kftlbf', 'kft.lbs', 'kft-lbs'], 'ft.lbf': ['ft.lbf', 'ft.lb', 'ft-lb', 'ft-lbf', 'ftlb', 'ftlbf', 'ft.lbs', 'ft-lbs'], 'kN.m': ['kn.m', 'knm', 'kn-m'], 'N.m': ['n.m', 'nm', 'n-m'],
  psi: ['psi', 'psig'], kPa: ['kpa'], bar: ['bar', 'barg'], MPa: ['mpa'],
  gpm: ['gpm', 'gal/min', 'usgpm', 'usgal/min', 'galus/min'], 'L/min': ['l/min', 'lpm', 'ltr/min'], 'm3/min': ['m3/min', 'm3/mn'], 'bbl/min': ['bbl/min', 'bpm'],
  spm: ['spm', 'stk/min', 'strokes/min', 'str/min'],
  ppg: ['ppg', 'lb/gal', 'lbm/gal', 'lbs/gal', 'lbm/galus'], sg: ['sg', 's.g.', 's.g'], 'g/cc': ['g/cc', 'g/cm3', 'gm/cc', 'g/c3'], 'kg/m3': ['kg/m3', 'k/m3'], pcf: ['pcf', 'lb/ft3', 'lbm/ft3', 'lb/cf'],
  '%': ['%', 'pct', 'percent', 'perc'], ppm: ['ppm'], units: ['units', 'unit', 'u', 'gu', 'api'],
  in: ['in', 'inch', 'inches', '"'], mm: ['mm'],
};
const UNIT_LOOKUP = new Map();
for (const [canon, list] of Object.entries(UNIT_SYNONYMS)) for (const s of list) UNIT_LOOKUP.set(s, canon);
/** A unit as written to its canonical spelling, or null when it is not one this door knows. */
export function canonUnit(u) {
  const k = String(u || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[()[\]]/g, '');
  return k ? (UNIT_LOOKUP.get(k) || null) : null;
}

/**
 * The quantities a column can be declared as. `units` maps each accepted
 * unit to the conversion into the canonical unit; `range` is the physical
 * range in canonical units outside which a value is dropped and counted.
 */
export const QUANTITIES = Object.freeze([
  { key: 'md', label: 'Hole depth (MD)', canonical: 'm', names: /^(dept|depth|md|dmea|holedepth|holedep|measureddepth|depthmd|mdepth|totaldepth|depthhole)$/, units: { m: (v) => v, ft: (v) => v * FT }, range: [0, 15000] },
  { key: 'bit_md', label: 'Bit depth (MD)', canonical: 'm', names: /^(bitdepth|dbtm|bitdep|depthbit|bitmd|bitposition)$/, units: { m: (v) => v, ft: (v) => v * FT }, range: [0, 15000] },
  { key: 'time', label: 'Date and time', canonical: 'UTC', names: /^(time|datetime|timestamp|datetimeutc|rigtime|dateandtime|clock)$/, units: null },
  { key: 'date', label: 'Date (with a separate time column)', canonical: 'UTC', names: /^(date|day)$/, units: null },
  { key: 'rop', label: 'Rate of penetration', canonical: 'm/hr', names: /^(rop|ropa|ropavg|rateofpenetration|ropi|roph|drillrate|penetrationrate)$/, units: { 'm/hr': (v) => v, 'ft/hr': (v) => v * FT, 'min/m': (v) => (v > 0 ? 60 / v : NaN), 'min/ft': (v) => (v > 0 ? (60 / v) * FT : NaN) }, range: [0, 600] },
  { key: 'wob', label: 'Weight on bit', canonical: 'kN', names: /^(wob|woba|weightonbit|wobavg|bitweight)$/, units: { kN: (v) => v, klbf: (v) => v * 1000 * KN_PER_LBF, lbf: (v) => v * KN_PER_LBF, t: (v) => v * 9.80665, kdaN: (v) => v * 10, daN: (v) => v * 0.01 }, range: [0, 1000] },
  { key: 'rpm', label: 'Rotary speed', canonical: 'rpm', names: /^(rpm|rpma|rotaryspeed|rotary|rpmavg|surfacerpm|rotaryrpm)$/, units: { rpm: (v) => v }, range: [0, 500] },
  { key: 'torque', label: 'Torque', canonical: 'kN.m', names: /^(tq|tqa|torq|torque|torquea|tor|rotarytorque)$/, units: { 'kN.m': (v) => v, 'N.m': (v) => v / 1000, 'kft.lbf': (v) => v * 1.3558179483314, 'ft.lbf': (v) => v * 1.3558179483314e-3 }, range: [0, 150] },
  { key: 'spp', label: 'Standpipe pressure', canonical: 'kPa', names: /^(spp|sppa|standpipepressure|pumppressure|standpipe|pumppress)$/, units: { kPa: (v) => v, psi: (v) => v * 6.894757293168361, bar: (v) => v * 100, MPa: (v) => v * 1000 }, range: [0, 70000] },
  { key: 'flow', label: 'Flow in', canonical: 'm3/min', names: /^(flow|flowin|mfia|flowrate|flowratein|pumpflow|totalflow|mudflowin|gpm)$/, units: { 'm3/min': (v) => v, 'L/min': (v) => v / 1000, gpm: (v) => v * 0.003785411784, 'bbl/min': (v) => v * 0.158987294928 }, range: [0, 12] },
  { key: 'spm', label: 'Pump strokes per minute', canonical: 'spm', names: /^(spm|totalspm|spmtotal|pumpstrokes|pumprate|strokerate)$/, units: { spm: (v) => v }, range: [0, 400] },
  { key: 'mw', label: 'Mud weight in', canonical: 'kg/m3', names: /^(mw|mwin|mdia|mudweight|mudweightin|mudwt|mudwtin|densityin|muddensity|muddensityin)$/, units: { 'kg/m3': (v) => v, sg: (v) => v * 1000, 'g/cc': (v) => v * 1000, ppg: (v) => v * 119.82642731689663, pcf: (v) => v * 16.01846337396 }, range: [500, 3000] },
  { key: 'ecd', label: 'ECD at the bit', canonical: 'kg/m3', names: /^(ecd|ecdbit|ecdatbit|ecdbtm)$/, units: { 'kg/m3': (v) => v, sg: (v) => v * 1000, 'g/cc': (v) => v * 1000, ppg: (v) => v * 119.82642731689663, pcf: (v) => v * 16.01846337396 }, range: [500, 3000] },
  { key: 'total_gas', label: 'Total gas', canonical: '%', names: /^(tg|gas|tgas|totalgas|totgas|gastotal|thc|gastot)$/, units: { '%': (v) => v, ppm: (v) => v / 10000, units: (v) => v }, range: [0, 100], rangeUnits: [0, 1e6] },
  ...[['c1', 'C1 methane', /^(c1|meth|methane)$/], ['c2', 'C2 ethane', /^(c2|eth|ethane)$/], ['c3', 'C3 propane', /^(c3|prop|propane)$/], ['ic4', 'iC4 iso-butane', /^(ic4|ibut|isobutane|ic4h10)$/], ['nc4', 'nC4 normal butane', /^(nc4|nbut|normalbutane|butane)$/], ['ic5', 'iC5 iso-pentane', /^(ic5|ipent|isopentane)$/], ['nc5', 'nC5 normal pentane', /^(nc5|npent|normalpentane|pentane)$/]]
    .map(([key, label, names]) => ({ key, label, canonical: 'ppm', names, units: { ppm: (v) => v, '%': (v) => v * 10000 }, range: [0, 1e6] })),
  { key: 'bit_size', label: 'Bit size', canonical: 'm', names: /^(bs|bitsize|holesize|bitdiameter)$/, units: { in: (v) => v * IN, mm: (v) => v / 1000 }, range: [0.05, 1.2] },
]);
export const quantity = (key) => QUANTITIES.find((q) => q.key === key) || null;
/** The curve keys a data chunk can carry (everything but the index columns). */
export const CURVE_KEYS = Object.freeze(QUANTITIES.map((q) => q.key).filter((k) => !['md', 'time', 'date'].includes(k)));

const isNumberish = (c) => /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/.test(String(c).trim());
const nameKey = (h) => String(h || '').replace(/[([{].*$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** A unit found in a header: "ROP (ft/hr)", "WOB [klb]", "Depth ft". */
export function unitFromHeader(h) {
  const s = String(h || '');
  const m = s.match(/[([{]\s*([^)\]}]+?)\s*[)\]}]/);
  if (m) return m[1].trim();
  const tail = s.trim().split(/[\s_]+/).pop();
  return tail && tail !== s.trim() && canonUnit(tail) ? tail : null;
}

function splitLine(line, delim) {
  if (delim === 'ws') return line.trim().split(/\s+/);
  const out = [];
  let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted; } else if (ch === delim && !quoted) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function guessColumns(columns, units) {
  const used = new Set();
  return columns.map((c, i) => {
    const k = nameKey(c);
    const q = QUANTITIES.find((x) => x.names.test(k) && !used.has(x.key));
    if (!q) return { quantity: null, unit: null };
    used.add(q.key);
    const cu = canonUnit(units[i]);
    // a header spelled "GPM" names both the quantity and its unit
    const implied = q.key === 'flow' && k === 'gpm' ? 'gpm' : (q.key === 'spm' || q.key === 'rpm' ? q.key : null);
    return { quantity: q.key, unit: q.units ? (cu && q.units[cu] ? cu : (implied && q.units[implied] ? implied : null)) : null };
  });
}

/**
 * Read a mudlog export.
 * @returns {{ format: 'las'|'text', delim, columns: string[], units: (string|null)[], rows: {line, cells}[], commaDecimal, headerLines,
 *   nullValue: ?number, guess: {quantity: ?string, unit: ?string}[], notes: string[] }}
 */
export function parseMudlogFile(text, { fileName = '' } = {}) {
  const raw = String(text || '').replace(/^﻿/, '');
  if (!raw.trim()) throw new Error('The file is empty.');
  if (raw.trimStart().startsWith('<')) {
    // U2-011: a WITSML log arrives through the same door, its units those the file declares
    const w = parseWitsml(raw);
    if (w.kind !== 'log') throw new Error(w.kind === 'trajectory' ? 'This is a WITSML trajectory: load it on the Surveys view.' : 'This is a WITSML mudLog: it holds lithology intervals, read below as cuttings descriptions.');
    const t = logTableFromWitsml(w);
    return { ...t, guess: guessColumns(t.columns, t.units), lasRows: true };
  }
  if (/^\s*~V/im.test(raw) || /\.las$/i.test(fileName)) return parseLasMudlog(raw);
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map((l, i) => ({ text: l, line: i + 1 })).filter((l) => l.text.trim() && !/^\s*(#|\/\/)/.test(l.text));
  if (!lines.length) throw new Error('The file is empty.');
  const sample = lines.slice(0, 12).map((l) => l.text);
  const count = (re) => sample.reduce((a, l) => a + (l.match(re) || []).length, 0);
  const delim = count(/\t/g) >= sample.length ? '\t' : count(/;/g) >= sample.length ? ';' : count(/,/g) >= sample.length ? ',' : 'ws';
  const commaDecimal = delim !== ',' && sample.some((l) => /\d,\d/.test(l));
  const first = splitLine(lines[0].text, delim);
  const numeric = (cells) => cells.filter((c) => isNumberish(c)).length;
  const second = lines[1] ? splitLine(lines[1].text, delim) : null;
  const hasHeader = numeric(first) === 0 || (second ? numeric(first) < numeric(second) && numeric(first) < first.length / 2 : false);
  let columns = hasHeader ? first : first.map((_, i) => `Column ${i + 1}`);
  let units = columns.map(unitFromHeader);
  let headerLines = hasHeader ? 1 : 0;
  const notes = [];
  if (hasHeader && second && numeric(second) === 0 && second.some((c) => canonUnit(c))) {
    units = columns.map((_, i) => (second[i] ? second[i].replace(/[()[\]]/g, '').trim() || null : null));
    headerLines = 2;
    notes.push('The second line was read as the units of the columns.');
  }
  if (!hasHeader) notes.push('The file has no header line: choose what each column is.');
  columns = columns.map((c) => String(c).trim());
  const rows = lines.slice(headerLines).map((l) => ({ line: l.line, cells: splitLine(l.text, delim) }));
  return {
    format: 'text', delim: delim === '\t' ? 'tab' : delim === 'ws' ? 'spaces' : delim, columns, units, rows, commaDecimal, headerLines, nullValue: null,
    guess: hasHeader ? guessColumns(columns, units) : columns.map(() => ({ quantity: null, unit: null })), notes,
  };
}

function parseLasMudlog(raw) {
  let las;
  try { las = parseLas(raw); } catch (e) { throw new Error(`This LAS file could not be read: ${e.message}`); }
  const curves = las.curves || [];
  if (!curves.length) throw new Error('The LAS file has no numeric curves.');
  const n = curves[0].nSamples;
  const columns = curves.map((c) => c.mnemonic);
  const units = curves.map((c) => c.unit || null);
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push({ line: i + 1, cells: curves.map((c) => (Number.isFinite(c.data[i]) ? c.data[i] : null)) });
  const notes = [`LAS file read: ${curves.length} numeric curve(s), ${n} row(s); the file's null value is treated as not read.`];
  for (const s of las.skippedCurves || []) notes.push(`Column ${s.mnemonic} is text and was not read.`);
  if ((las.ignoredSections || []).length) notes.push(`Sections not read: ${las.ignoredSections.join(', ')}.`);
  const guess = guessColumns(columns, units);
  // the LAS index curve is the depth unless it is a time
  if (!guess.some((g) => g.quantity === 'md') && guess[0] && !guess[0].quantity && canonUnit(units[0]) && ['m', 'ft'].includes(canonUnit(units[0]))) guess[0] = { quantity: 'md', unit: canonUnit(units[0]) };
  return { format: 'las', delim: 'las', columns, units, rows, commaDecimal: false, headerLines: 0, nullValue: null, guess, notes, lasRows: true };
}

const toNumber = (c, commaDecimal) => {
  if (typeof c === 'number') return c;
  if (c == null) return NaN;
  let s = String(c).trim();
  if (!s || /^(nan|null|n\/a|na|-)$/i.test(s)) return NaN;
  if (commaDecimal) s = s.replace(',', '.');
  if (!isNumberish(s)) return NaN;
  if (s.includes(',')) return NaN;
  return Number(s);
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/**
 * A date-time cell to UTC ms. order: 'iso' | 'dmy' | 'mdy'; zone: 'utc' | 'rig'
 * (rig local time at offsetMin). A stamp carrying its own zone keeps it.
 */
export function parseStamp(text, { order, zone, offsetMin = 0 }) {
  const s = String(text || '').trim();
  if (!s) return NaN;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  const tz = (base, zoneText) => {
    if (zoneText) {
      if (/^z$/i.test(zoneText)) return base;
      const m = zoneText.match(/^([+-])(\d{2}):?(\d{2})$/);
      return base - (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
    }
    return zone === 'rig' ? base - offsetMin * 60000 : base;
  };
  if (iso) return tz(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] || 0)), iso[7]);
  const dm = s.match(/^(\d{1,2})[/.-](\d{1,2}|[A-Za-z]{3})[/.-](\d{2,4})[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!dm) return NaN;
  let a = Number(dm[1]);
  let b = /^[A-Za-z]/.test(dm[2]) ? MONTHS[dm[2].toLowerCase()] : Number(dm[2]);
  if (!b) return NaN;
  const named = /^[A-Za-z]/.test(dm[2]);
  let y = Number(dm[3]); if (y < 100) y += 2000;
  let day; let mon;
  if (named || order === 'dmy') { day = a; mon = b; } else if (order === 'mdy') { mon = a; day = b; } else return NaN;
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return NaN;
  let h = Number(dm[4]);
  if (dm[7]) { const pm = /pm/i.test(dm[7]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return tz(Date.UTC(y, mon - 1, day, h, Number(dm[5]), Number(dm[6] || 0)), null);
}

/** What the date column looks like: 'iso', 'dmy', 'mdy', or 'ambiguous' (the user must say). */
export function guessDateOrder(cells) {
  let dmy = false; let mdy = false; let any = false;
  for (const c of cells.slice(0, 500)) {
    const s = String(c || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'iso';
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2}|[A-Za-z]{3})[/.-]\d{2,4}/);
    if (!m) continue;
    any = true;
    if (/^[A-Za-z]/.test(m[2])) return 'dmy';
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  return any ? 'ambiguous' : null;
}

/** The starting mapping from a parsed file: the guesses, for the user to confirm or change. */
export function initialMapping(table) {
  const cols = table.guess.map((g) => ({ quantity: g.quantity, unit: g.unit }));
  const timeIdx = cols.findIndex((c) => c.quantity === 'time' || c.quantity === 'date');
  const order = timeIdx >= 0 && !table.lasRows ? guessDateOrder(table.rows.map((r) => r.cells[timeIdx])) : null;
  return { columns: cols, dateOrder: order === 'ambiguous' ? null : order, timeZone: null, depthDatum: null };
}

/** The declarations still missing, as sentences (empty when the import can run). */
export function missingChoices(table, mapping) {
  const out = [];
  const cols = mapping.columns || [];
  const has = (k) => cols.some((c) => c.quantity === k);
  const dup = QUANTITIES.filter((q) => cols.filter((c) => c.quantity === q.key).length > 1).map((q) => q.label);
  if (dup.length) out.push(`${dup.join(', ')} is chosen for more than one column`);
  if (!has('md') && !has('bit_md')) out.push('choose the depth column (hole depth or bit depth, MD)');
  if (!['KB', 'RT', 'GL', 'MSL'].includes(mapping.depthDatum)) out.push('declare the datum the depths are measured from (KB, RT, GL or MSL)');
  cols.forEach((c, i) => {
    const q = quantity(c.quantity);
    if (q && q.units && !q.units[c.unit]) out.push(`declare the unit of ${table.columns[i]} (${q.label}): ${Object.keys(q.units).join(', ')}`);
  });
  if (has('time') || has('date')) {
    if (!['iso', 'dmy', 'mdy'].includes(mapping.dateOrder)) out.push('declare the date order (day first or month first)');
    if (!['utc', 'rig'].includes(mapping.timeZone)) out.push('declare whether the times are rig time or UTC');
  }
  if (has('date') && !has('time')) out.push('a date column needs its time column');
  if (!cols.some((c) => c.quantity && !['md', 'bit_md', 'time', 'date'].includes(c.quantity))) out.push('choose at least one data column (ROP, weight on bit, gas and so on)');
  return out;
}

/**
 * Rows to the canonical frame.
 * @returns {{ rows: {line, mdM, tUtcMs, values}[], skipped: {line, text, reason}[], dropped: Object<string,{count, example}>,
 *   kept: Object<string, number>, index: 'depth'|'time', mdRange: [number, number], timeRange: ?[number, number], curves: string[] }}
 */
export function convertMudlog(table, mapping, { offsetMin = 0, datumShiftM = 0 } = {}) {
  const missing = missingChoices(table, mapping);
  if (missing.length) throw new Error(`Before import: ${missing.join('; ')}.`);
  const cols = mapping.columns;
  const idx = (k) => cols.findIndex((c) => c.quantity === k);
  const mdCol = idx('md') >= 0 ? idx('md') : idx('bit_md');
  const mdQ = quantity(cols[mdCol].quantity);
  const mdConv = mdQ.units[cols[mdCol].unit];
  const timeCol = idx('time'); const dateCol = idx('date');
  const dataCols = cols.map((c, i) => ({ ...c, i, q: quantity(c.quantity) })).filter((c) => c.q && c.q.units && c.i !== mdCol);
  const rows = []; const skipped = []; const dropped = {}; const kept = {}; const seen = {};
  const rawText = (r) => r.cells.map((c) => (c == null ? '' : c)).join(table.delim === 'tab' ? '\t' : ' ').slice(0, 120);
  for (const r of table.rows) {
    if (r.cells.length < cols.length && !table.lasRows) { skipped.push({ line: r.line, text: rawText(r), reason: `${r.cells.length} column(s) where ${cols.length} are expected` }); continue; }
    const mdRaw = toNumber(r.cells[mdCol], table.commaDecimal);
    if (!Number.isFinite(mdRaw) || NULLS.has(mdRaw)) { skipped.push({ line: r.line, text: rawText(r), reason: 'the depth is not a number' }); continue; }
    const mdM = mdConv(mdRaw) + datumShiftM;
    if (!(mdM >= mdQ.range[0] && mdM <= mdQ.range[1])) { skipped.push({ line: r.line, text: rawText(r), reason: `a depth of ${mdRaw} ${cols[mdCol].unit} is outside 0 to 15,000 m` }); continue; }
    let tUtcMs = null;
    if (timeCol >= 0) {
      const stamp = dateCol >= 0 ? `${r.cells[dateCol]} ${r.cells[timeCol]}` : r.cells[timeCol];
      tUtcMs = parseStamp(stamp, { order: mapping.dateOrder, zone: mapping.timeZone, offsetMin });
      if (!Number.isFinite(tUtcMs)) { skipped.push({ line: r.line, text: rawText(r), reason: `the date and time "${String(stamp).trim()}" could not be read as ${mapping.dateOrder === 'dmy' ? 'day first' : mapping.dateOrder === 'mdy' ? 'month first' : 'ISO'}` }); continue; }
    }
    const values = {};
    for (const c of dataCols) {
      const v = toNumber(r.cells[c.i], table.commaDecimal);
      if (!Number.isFinite(v) || NULLS.has(v)) continue;
      seen[c.q.key] = (seen[c.q.key] || 0) + 1;
      const out = c.q.units[c.unit](v) + (c.q.key === 'bit_md' ? datumShiftM : 0);
      const range = c.q.key === 'total_gas' && c.unit === 'units' ? c.q.rangeUnits : c.q.range;
      if (!Number.isFinite(out) || out < range[0] || out > range[1]) {
        if (!dropped[c.q.key]) dropped[c.q.key] = { count: 0, example: `${v} ${c.unit} on line ${r.line}` };
        dropped[c.q.key].count += 1;
        continue;
      }
      values[c.q.key === 'total_gas' && c.unit === 'units' ? 'total_gas_units' : c.q.key] = out;
      kept[c.q.key] = (kept[c.q.key] || 0) + 1;
    }
    rows.push({ line: r.line, mdM, tUtcMs, values });
  }
  if (!rows.length) throw new Error(`No row could be read${skipped.length ? `: ${skipped[0].reason} (line ${skipped[0].line})` : ''}.`);
  // a column that loses most of its values to the range check was declared in the wrong unit
  for (const c of dataCols) {
    const d = dropped[c.q.key];
    if (d && d.count > (seen[c.q.key] || 0) / 2) {
      throw new Error(`${d.count} of ${seen[c.q.key]} values of ${table.columns[c.i]} (${c.q.label}) are outside the possible range in ${c.unit} (for example ${d.example}). The declared unit looks wrong: choose the unit the file was written in.`);
    }
  }
  const mds = rows.map((x) => x.mdM);
  const times = rows.map((x) => x.tUtcMs).filter(Number.isFinite);
  const curves = [...new Set(rows.flatMap((x) => Object.keys(x.values)))];
  return {
    rows, skipped, dropped, kept, index: timeCol >= 0 ? 'time' : 'depth', curves,
    mdRange: [Math.min(...mds), Math.max(...mds)], timeRange: times.length ? [Math.min(...times), Math.max(...times)] : null,
  };
}

const round = (v, dp) => (Number.isFinite(v) ? Number(v.toFixed(dp)) : null);
const DP = { rop: 3, wob: 3, rpm: 2, torque: 4, spp: 2, flow: 5, spm: 2, mw: 2, ecd: 2, total_gas: 5, total_gas_units: 3, c1: 2, c2: 2, c3: 2, ic4: 2, nc4: 2, ic5: 2, nc5: 2, bit_size: 5, bit_md: 3 };

/**
 * The records of an import: one header and the data chunks citing it.
 * @param {Object} conv convertMudlog output
 * @param {Object} p { importId, fileName, table, mapping, declaredBy }
 */
export function mudlogRecords(conv, { importId, fileName = 'pasted table', table, mapping }) {
  if (!importId) throw new Error('An import needs an id.');
  const declared = mapping.columns.map((c, i) => (c.quantity ? { column: table.columns[i], quantity: c.quantity, unit: c.unit || null, header_unit: table.units[i] || null } : null)).filter(Boolean);
  const names = conv.curves.map((k) => (quantity(k === 'total_gas_units' ? 'total_gas' : k) || { label: k }).label);
  const depth = (md) => ({ value: round(md, 4), unit: 'm', reference: 'MD', datum: 'KB', kind: 'logged' });
  const text = `Mudlog import ${fileName}: ${conv.rows.length} row(s), ${conv.mdRange[0].toFixed(1)} to ${conv.mdRange[1].toFixed(1)} m MD, ${names.join(', ')}${conv.skipped.length ? `; ${conv.skipped.length} row(s) not read` : ''}.`;
  const header = {
    id: importId, kind: 'observation', subtype: IMPORT_SUBTYPE, depth: depth(conv.mdRange[0]), depth2: depth(conv.mdRange[1]),
    payload: {
      text, source: 'external', file_name: fileName, format: table.format, delimiter: table.delim, index: conv.index, rows: conv.rows.length, rows_skipped: conv.skipped.length,
      skipped: conv.skipped.slice(0, 50), dropped: conv.dropped, kept: conv.kept, curves: conv.curves, declared, depth_datum: mapping.depthDatum,
      date_order: mapping.dateOrder || null, time_zone: mapping.timeZone || null, md_from_m: conv.mdRange[0], md_to_m: conv.mdRange[1],
      t_from_utc: conv.timeRange ? new Date(conv.timeRange[0]).toISOString() : null, t_to_utc: conv.timeRange ? new Date(conv.timeRange[1]).toISOString() : null,
      chunks: Math.ceil(conv.rows.length / CHUNK_ROWS),
    },
  };
  const chunks = [];
  for (let i = 0, seq = 0; i < conv.rows.length; i += CHUNK_ROWS, seq += 1) {
    const part = conv.rows.slice(i, i + CHUNK_ROWS);
    const mds = part.map((r) => r.mdM);
    const curves = {};
    for (const k of conv.curves) curves[k] = part.map((r) => round(r.values[k], DP[k] ?? 4));
    chunks.push({
      kind: 'observation', subtype: DATA_SUBTYPE, depth: depth(Math.min(...mds)), depth2: depth(Math.max(...mds)),
      payload: { import_id: importId, seq, source: 'external', n: part.length, md_m: mds.map((v) => round(v, 4)), t_utc_ms: conv.index === 'time' ? part.map((r) => r.tUtcMs) : null, curves },
    });
  }
  return { header, chunks };
}

/** A single typed row of drilling parameters, stored as a one-row chunk (source manual). */
export function typedRowParams({ depthEntry, values }) {
  const clean = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (!Number.isFinite(v)) continue;
    const q = quantity(k === 'total_gas_units' ? 'total_gas' : k);
    if (!q) throw new Error(`Unknown quantity ${k}.`);
    const range = k === 'total_gas_units' ? q.rangeUnits : q.range;
    if (v < range[0] || v > range[1]) throw new Error(`${q.label} is outside its possible range; check the value and its unit.`);
    clean[k] = [round(v, DP[k] ?? 4)];
  }
  if (!Object.keys(clean).length) throw new Error('Enter at least one drilling parameter.');
  if (!depthEntry || !Number.isFinite(depthEntry.value)) throw new Error('Drilling parameters need the depth they were read at.');
  return { kind: 'observation', subtype: DATA_SUBTYPE, depth: { ...depthEntry, kind: 'bit_depth' }, payload: { import_id: null, seq: 0, source: 'manual', n: 1, md_m: null, t_utc_ms: null, curves: clean } };
}

/**
 * Bit depth and pump rate records for the lag from a time-indexed import:
 * one bit depth each time the bit is 1 m deeper (never more than `maxBit`),
 * one pump rate on each change of 2 strokes per minute or more.
 */
export function lagRecordsFromRows(rows, { maxBit = 1500, minStepM = 1, minSpmChange = 2 } = {}) {
  const timed = rows.filter((r) => Number.isFinite(r.tUtcMs)).sort((a, b) => a.tUtcMs - b.tUtcMs);
  const bit = []; const pumps = [];
  let lastMd = -Infinity; let lastSpm = null;
  for (const r of timed) {
    const md = Number.isFinite(r.values.bit_md) ? r.values.bit_md : r.mdM;
    if (md - lastMd >= minStepM) { bit.push({ tUtcMs: r.tUtcMs, mdM: md }); lastMd = md; }
    const spm = r.values.spm;
    if (Number.isFinite(spm) && (lastSpm == null || Math.abs(spm - lastSpm) >= minSpmChange)) { pumps.push({ tUtcMs: r.tUtcMs, spm: Math.round(spm * 10) / 10 }); lastSpm = spm; }
  }
  let step = 1;
  let thinned = bit;
  if (bit.length > maxBit) { step = Math.ceil(bit.length / maxBit); thinned = bit.filter((_, i) => i % step === 0 || i === bit.length - 1); }
  const iso = (ms) => new Date(ms).toISOString();
  return {
    bitDepths: thinned.map((b) => ({ kind: 'observation', subtype: 'bit_depth', occurredAt: iso(b.tUtcMs), depth: { value: round(b.mdM, 3), unit: 'm', reference: 'MD', datum: 'KB', kind: 'bit_depth' }, payload: { source: 'external' } })),
    pumpRates: pumps.map((p) => ({ kind: 'observation', subtype: 'pump_rate', occurredAt: iso(p.tUtcMs), payload: { spm: p.spm, boosterSpm: 0, note: null, source: 'external' } })),
    bitTotal: bit.length, bitKept: thinned.length,
  };
}

/** Imports on record (current headers), newest first, with whether each was withdrawn. */
export function importsOf(records) {
  const heads = (records || []).filter((r) => r.subtype === IMPORT_SUBTYPE);
  const superseded = new Set(heads.map((r) => r.supersedes_id).filter(Boolean));
  // a withdrawal supersedes the header; the ids of every withdrawn import (the original and its correction) are dead
  const dead = new Set();
  for (const h of heads) if (h.payload && h.payload.withdrawn) { dead.add(h.id); dead.add(h.payload.import_id || h.supersedes_id); }
  const current = heads.filter((r) => !superseded.has(r.id));
  return { current: current.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)), dead };
}

/** The correction that withdraws an import (its data chunks are then ignored by every reader). */
export function withdrawParams(header, { reason, person }) {
  if (!(reason && reason.trim())) throw new Error('Say why the import is withdrawn.');
  return { payload: { ...header.payload, withdrawn: true, import_id: header.payload.import_id || header.id, withdrawn_reason: reason.trim(), withdrawn_by: person || null, text: `${header.payload.text} Withdrawn: ${reason.trim()}.` } };
}

/**
 * Every active data row (imported and typed) as depth-sorted points.
 * @returns {{ points: {mdM, tUtcMs, source, values}[], curves: string[], imports: number, typed: number }}
 */
export function mudlogSeries(records) {
  const { dead } = importsOf(records);
  const superseded = new Set((records || []).map((r) => r.supersedes_id).filter(Boolean));
  const points = []; const curves = new Set(); const liveImports = new Set(); let typed = 0;
  for (const r of records || []) {
    if (r.subtype !== DATA_SUBTYPE || superseded.has(r.id)) continue;
    const p = r.payload || {};
    if (p.import_id && dead.has(p.import_id)) continue;
    if (p.import_id) liveImports.add(p.import_id); else typed += 1;
    const n = p.n || 0;
    for (let i = 0; i < n; i += 1) {
      const mdM = p.md_m ? p.md_m[i] : r.md_calc_m;
      if (!Number.isFinite(mdM)) continue;
      const values = {};
      for (const [k, arr] of Object.entries(p.curves || {})) { const v = arr[i]; if (Number.isFinite(v)) { values[k] = v; curves.add(k); } }
      points.push({ mdM, tUtcMs: p.t_utc_ms ? p.t_utc_ms[i] : Date.parse(r.occurred_at), source: p.source || 'external', values });
    }
  }
  points.sort((a, b) => a.mdM - b.mdM || (a.tUtcMs || 0) - (b.tUtcMs || 0));
  return { points, curves: [...curves], imports: liveImports.size, typed };
}

/** Display units of the curves for a depth unit system: [unit label, from canonical]. */
export function displayUnit(key, depthUnit = 'm', pressureUnit = null) {
  const field = depthUnit === 'ft';
  const P = { kPa: 1, psi: 6.894757293168361, bar: 100, MPa: 1000 };
  if (key === 'spp' && pressureUnit && P[pressureUnit]) return [pressureUnit, (v) => v / P[pressureUnit]];
  const map = {
    rop: field ? ['ft/hr', (v) => v / FT] : ['m/hr', (v) => v],
    wob: field ? ['klbf', (v) => v / (1000 * KN_PER_LBF)] : ['kN', (v) => v],
    rpm: ['rpm', (v) => v], spm: ['spm', (v) => v],
    torque: field ? ['kft.lbf', (v) => v / 1.3558179483314] : ['kN.m', (v) => v],
    spp: field ? ['psi', (v) => v / 6.894757293168361] : ['kPa', (v) => v],
    flow: field ? ['gpm', (v) => v / 0.003785411784] : ['L/min', (v) => v * 1000],
    mw: field ? ['ppg', (v) => v / 119.82642731689663] : ['sg', (v) => v / 1000],
    ecd: field ? ['ppg', (v) => v / 119.82642731689663] : ['sg', (v) => v / 1000],
    total_gas: ['%', (v) => v], total_gas_units: ['units', (v) => v],
    bit_size: ['in', (v) => v / IN], bit_md: field ? ['ft', (v) => v / FT] : ['m', (v) => v],
  };
  return map[key] || ['ppm', (v) => v];
}
