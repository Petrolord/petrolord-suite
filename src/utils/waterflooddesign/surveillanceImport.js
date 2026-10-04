/**
 * The Surveillance import door (WF-U1, PL2 and RL10), on the shared typed
 * reader src/lib/tabularParse.js (Reservoir round Step 0a).
 *
 * What the old door did (parseWaterfloodCSVDetailed with papaparse and the
 * engine's `new Date()` and `parseFloat`): "1,5" read as 1, a thousands
 * group "1,500" quoted read as 1, day-first dates read month-first or
 * dropped as invalid with only a count, no unit at the door (a file in m3/d
 * or kPa was read as bbl/d and psi), no read-back beyond a toast.
 *
 * This door: columns found by header in any order (aliases below); the
 * decimal mark and the date order from the file, or asked when the file
 * cannot settle them (never guessed); the unit of each rate and pressure
 * column from its header when it carries one, otherwise the unit chosen at
 * the door; rows the engine reads in oilfield units (STB/d, bbl/d, Mscf/d,
 * psi); and a read-back record: which column became what, in which unit,
 * rows read and every row left out with its reason.
 *
 * Volumes and cumulatives are refused by name: the engine reads daily
 * rates, and a monthly volume read as a rate is 30 times high.
 *
 * Pure.
 */
import { parseTabular, questionText } from '@/lib/tabularParse';
import { convert } from '@/lib/units/registry';

const norm = (h) => String(h || '').trim().toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export const SURVEILLANCE_COLUMNS = Object.freeze({
  date: { label: 'date', aliases: ['date', 'prod_date', 'production_date', 'day', 'report_date'] },
  well: { label: 'well', aliases: ['well', 'well_name', 'wellname', 'well_id', 'uwi'] },
  oil_bbl: { label: 'oil rate', kind: 'oilRate', aliases: ['oil_bbl', 'oil_rate', 'oil_rate_bopd', 'oil_bopd', 'bopd', 'qo', 'oil_rate_stb_d', 'oil'] },
  water_bbl: { label: 'water rate', kind: 'waterRate', aliases: ['water_bbl', 'water_rate', 'water_rate_bwpd', 'water_bwpd', 'bwpd', 'qw', 'water'] },
  gas_mcf: { label: 'gas rate', kind: 'gasRate', aliases: ['gas_mcf', 'gas_rate', 'gas_rate_mscfd', 'gas_mscfd', 'mscfd', 'qg', 'gas'] },
  inj_bbl: { label: 'water injection rate', kind: 'waterRate', aliases: ['inj_bbl', 'injection_rate', 'injection_rate_bwpd', 'inj_rate', 'inj_bwpd', 'water_inj_rate', 'qinj', 'injection', 'water_injection'] },
  whp_psi: { label: 'injection pressure', kind: 'pressure', aliases: ['whp_psi', 'whp', 'injection_pressure', 'injection_pressure_psi', 'thp_psi', 'bhp_psi', 'bhp', 'thp', 'pressure', 'inj_pressure'] },
});
const ALIAS = new Map(Object.entries(SURVEILLANCE_COLUMNS).flatMap(([col, d]) => d.aliases.map((a) => [a, col])));
const VOLUME_WORDS = /(^|_)(cum|cumulative|vol|volume|total|monthly|month)(_|$)/;

// header unit text -> registry family unit, per kind
const UNIT_WORDS = {
  oilRate: [[/^(stb|bbl|bo)\/?d(ay)?$|^bopd$|^stb\/d$/i, 'STB/d'], [/^s?m3\/d(ay)?$|^sm3\/d$/i, 'm3/d']],
  waterRate: [[/^(stb|bbl|bw)\/?d(ay)?$|^bwpd$|^bpd$/i, 'bbl/d'], [/^s?m3\/d(ay)?$/i, 'm3/d']],
  gasRate: [[/^m(s)?cf\/?d(ay)?$|^mscfd$|^mcfd$/i, 'Mscf/d'], [/^mmscf\/?d$/i, 'MMscf/d'], [/^s?m3\/d(ay)?$/i, 'm3/d'], [/^(e3|10\^3)\s?s?m3\/d$/i, '10^3 m3/d']],
  pressure: [[/^psi[ag]?$/i, 'psi'], [/^kpa[ag]?$/i, 'kPa'], [/^bar[ag]?$/i, 'bar'], [/^mpa[ag]?$/i, 'MPa']],
};
const FAMILY = { oilRate: 'liquidRate', waterRate: 'liquidRate', gasRate: 'gasRate', pressure: 'pressure' };
const CANON = { oilRate: 'STB/d', waterRate: 'bbl/d', gasRate: 'Mscf/d', pressure: 'psi' };
/** The door's choices when a header carries no unit. */
export const DOOR_UNITS = Object.freeze({
  oilfield: { oilRate: 'STB/d', waterRate: 'bbl/d', gasRate: 'Mscf/d' },
  si: { oilRate: 'm3/d', waterRate: 'm3/d', gasRate: 'm3/d' },
});
export const DOOR_PRESSURE_UNITS = Object.freeze(['psi', 'kPa', 'bar', 'MPa']);

function unitFromHeader(kind, unitText, headerText) {
  const candidates = [unitText, ...(String(headerText || '').toLowerCase().match(/(bopd|bwpd|mscfd|mcfd|psi[ag]?|kpa|bar|m3\/d|sm3\/d|stb\/d|bbl\/d)/g) || [])];
  for (const t of candidates) {
    if (!t) continue;
    for (const [re, unit] of UNIT_WORDS[kind] || []) if (re.test(String(t).trim())) return unit;
  }
  return null;
}

/**
 * @param {string} text
 * @param {{fileName?: string, dateOrder?: 'dmy'|'mdy', decimal?: '.'|',', rateSystem?: 'oilfield'|'si', pressureUnit?: string}} [opts]
 * @returns {{ok: boolean, needsAnswer: boolean, questions: object[], errors: string[], rows: object[], readBack: ?object}}
 */
export function readSurveillanceTable(text, opts = {}) {
  const { fileName = null, dateOrder, decimal, rateSystem = 'oilfield', pressureUnit = 'psi' } = opts;
  const table = parseTabular(text, { dateOrder, decimal });
  const fail = (e) => ({ ok: false, needsAnswer: false, questions: [], errors: [e], rows: [], readBack: null });
  if (!table.columnCount) return fail('The file holds no table.');
  if (!table.header) return fail('The file has no header row. The Surveillance tab needs named columns: date, well and at least one daily rate (oil, water or injection).');

  const mapped = []; const ignored = []; const seen = new Map(); const refused = [];
  table.columns.forEach((c) => {
    const key = norm(c.header);
    const col = ALIAS.get(key) || ALIAS.get(norm(c.name));
    if (!col) {
      if (VOLUME_WORDS.test(key)) refused.push(c.header);
      else ignored.push(c.header);
      return;
    }
    if (seen.has(col)) { ignored.push(`${c.header} (a second ${SURVEILLANCE_COLUMNS[col].label} column)`); return; }
    seen.set(col, c);
  });
  const missing = ['date', 'well'].filter((k) => !seen.has(k));
  const rates = ['oil_bbl', 'water_bbl', 'inj_bbl'].filter((k) => seen.has(k));
  if (missing.length || !rates.length) {
    const why = missing.length ? `no ${missing.join(' or ')} column` : 'no daily rate column';
    return fail(`This file has ${why}. The Surveillance tab reads date, well and daily rates (oil, water, gas, injection, optional injection pressure).${refused.length ? ` Left out as volumes or cumulatives, which the engine cannot read as rates: ${refused.join(', ')}.` : ''} Not recognised: ${ignored.join(', ') || 'none'}.`);
  }
  if (table.needsAnswer) {
    return { ok: false, needsAnswer: true, questions: table.questions.map((q) => ({ ...q, text: questionText(q) })), errors: [], rows: [], readBack: null };
  }

  // the unit of each mapped measurement column
  const units = {};
  for (const [col, c] of seen) {
    const kind = SURVEILLANCE_COLUMNS[col].kind;
    if (!kind) continue;
    const fromHeader = unitFromHeader(kind, c.unit, c.header);
    const chosen = kind === 'pressure' ? pressureUnit : DOOR_UNITS[rateSystem === 'si' ? 'si' : 'oilfield'][kind];
    units[col] = { unit: fromHeader || chosen, from: fromHeader ? 'header' : 'door', kind };
  }
  const toEngine = (col, v) => {
    if (v == null || !Number.isFinite(v)) return '';
    const u = units[col];
    if (!u) return v;
    return u.unit === CANON[u.kind] ? v : convert(FAMILY[u.kind], v, u.unit, CANON[u.kind]);
  };

  const rows = [];
  const left = table.report.skipped.map((s) => ({ line: s.line, reason: s.reason }));
  const dateCol = seen.get('date');
  const wellCol = seen.get('well');
  for (const r of table.rows) {
    const d = r.values[dateCol.index];
    const well = r.values[wellCol.index];
    if (!d || typeof d !== 'object' || !d.iso) { left.push({ line: r.line, reason: dateCol.kind === 'date' ? 'no readable date' : 'the date column holds no dates' }); continue; }
    if (well == null || String(well).trim() === '') { left.push({ line: r.line, reason: 'no well name' }); continue; }
    const row = { date: d.iso.slice(0, 10), well: String(well).trim() };
    for (const col of ['oil_bbl', 'water_bbl', 'gas_mcf', 'inj_bbl', 'whp_psi']) {
      const c = seen.get(col);
      row[col] = c ? toEngine(col, r.values[c.index]) : '';
    }
    rows.push(row);
  }
  for (const u of table.report.unreadable) left.push({ line: u.line, reason: `${table.columns[u.column]?.header || `column ${u.column + 1}`}: "${u.text}" ${u.reason}` });

  const readBack = {
    fileName,
    readAt: null,
    delimiter: table.delimiterName,
    decimal: { mark: table.decimal.mark, certain: table.decimal.certain, reason: table.decimal.reason },
    dateOrder: dateCol.dateOrder ? { order: dateCol.dateOrder.order, from: dateCol.dateOrder.from } : null,
    columns: [...seen].map(([col, c]) => ({ header: c.header, as: col, unit: units[col]?.unit || null, unitFrom: units[col]?.from || null })),
    ignored,
    refused,
    rowsInFile: table.rows.length + table.report.skipped.length,
    rowsRead: rows.length,
    left: left.slice(0, 50),
    leftCount: left.length,
  };
  return { ok: rows.length > 0, needsAnswer: false, questions: [], errors: rows.length ? [] : ['No row of the file could be read.'], rows, readBack };
}

/** The read-back as lines for the panel and the report. */
export function readBackLines(rb) {
  if (!rb) return [];
  const lines = [
    `${rb.fileName || 'File'}: ${rb.rowsRead} of ${rb.rowsInFile} rows read; ${rb.leftCount} left out.`,
    `Delimiter ${rb.delimiter}; decimal mark "${rb.decimal.mark}" (${rb.decimal.reason}); dates ${rb.dateOrder?.order ? (rb.dateOrder.order === 'dmy' ? 'day first' : 'month first') : 'year first or with month names'}${rb.dateOrder?.from === 'user' ? ', as chosen' : ''}.`,
    `Columns: ${rb.columns.map((c) => `${c.header} as ${c.as}${c.unit ? ` in ${c.unit} (${c.unitFrom === 'header' ? 'from the header' : 'chosen at the door'})` : ''}`).join('; ')}.`,
  ];
  if (rb.ignored?.length) lines.push(`Not used: ${rb.ignored.join(', ')}.`);
  if (rb.refused?.length) lines.push(`Left out as volumes or cumulatives: ${rb.refused.join(', ')}.`);
  for (const l of (rb.left || []).slice(0, 5)) lines.push(`Line ${l.line}: ${l.reason}.`);
  return lines;
}
