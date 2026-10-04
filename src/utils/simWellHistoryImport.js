// Per-well production-history import (S5): rate CSVs measured PER WELL
// -> the deck builder's history periods, with no field allocation at all
// (the S4 MBAL path splits one field signal by fractions; this path uses
// each well's own metered rates). Pure shaping with explicit unit seams:
// oil/water are STB/d, gas is Mscf/d by default with an scf/d option
// (÷1000 seam). Producers become WCONHIST rows; injector wells feed
// WCONINJH from their phase column.
//
// Eclipse semantics the periods rely on: a schedule keyword persists
// until re-declared, so a well absent from a period simply keeps its
// previous observed rate, and a well whose first row is mid-history
// stays undeclared (shut) until that date.

import { parseTabular, isNullToken } from '@/lib/tabularParse';
import { convert } from '@/lib/units/registry';

const addDays = (iso, days) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
};

const dayDiff = (a, b) => Math.round(
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
);

const round3 = (v) => Math.round(v * 1000) / 1000;

const COLUMN_ALIASES = {
  date: ['date', 'day', 'obs_date', 'observation_date', 'report_date'],
  well: ['well', 'well_name', 'wellname', 'name'],
  oil: ['oil', 'oil_rate', 'orat', 'oil_stb', 'oil_stbd', 'qo'],
  water: ['water', 'water_rate', 'wrat', 'water_stb', 'water_stbd', 'qw'],
  gas: ['gas', 'gas_rate', 'grat', 'gas_mscf', 'gas_scf', 'qg'],
};

// SIM-U1-011 (PL2, RL10): the door reads through the shared tabular reader
// (src/lib/tabularParse.js): any delimiter, comma decimals, day-first and
// month-first dates (asked when the file does not settle it, never
// guessed), a units row or units in the headers, comment lines; then it
// says what it read. Units at the door: oil and water in STB/d, bbl/d or
// m3/d; gas in Mscf/d, scf/d, MMscf/d or m3/d (10^3 m3/d); converted to
// the deck's STB/d and Mscf/d with the Suite registry. A rate column with no
// unit takes the form's choice (gas unit select). Before, only ISO dates
// and dot decimals were read, and units in a header were ignored.

const LIQUID_UNITS = { 'stb/d': 'STB/d', 'bbl/d': 'bbl/d', 'stb/day': 'STB/d', 'bbl/day': 'bbl/d', bopd: 'STB/d', bwpd: 'STB/d', 'm3/d': 'm3/d', 'sm3/d': 'm3/d', 'm3/day': 'm3/d', 'sm3/day': 'm3/d' };
const GAS_UNITS = { 'mscf/d': 'Mscf/d', mscfd: 'Mscf/d', 'mscf/day': 'Mscf/d', 'scf/d': 'scf/d', scfd: 'scf/d', 'scf/day': 'scf/d', 'mmscf/d': 'MMscf/d', mmscfd: 'MMscf/d', 'm3/d': 'm3/d', 'sm3/d': 'm3/d', '10^3 m3/d': '10^3 m3/d', 'e3m3/d': '10^3 m3/d', 'km3/d': '10^3 m3/d' };
const unitKey = (u) => String(u || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Per-well rate file text -> { rows, columns, errors, questions, readBack }.
 * The header must name a date column and a well column plus at least one
 * rate column (aliases above, case-insensitive). Blank rate cells are null
 * (column absent for that row); unreadable cells are per-line errors.
 * @param {string} text
 * @param {{dateOrder?: ?('dmy'|'mdy'), decimal?: ?('.'|','), gasUnit?: 'mscf'|'scf'}} [opts]
 */
export function parseWellRateCsv(text, { dateOrder = null, decimal = null, gasUnit = 'mscf' } = {}) {
  const src = String(text || '').split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n');
  if (!src.trim()) return { rows: [], columns: [], errors: ['The CSV is empty.'], questions: [], readBack: [] };
  const t = parseTabular(src, { ...(dateOrder ? { dateOrder } : {}), ...(decimal ? { decimal } : {}) });
  const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const colOf = (key) => t.columns.findIndex((c) => COLUMN_ALIASES[key].includes(norm(c.name)));
  const idx = { date: colOf('date'), well: colOf('well'), oil: colOf('oil'), water: colOf('water'), gas: colOf('gas') };
  if (!t.header || idx.date < 0 || idx.well < 0) {
    return { rows: [], columns: [], errors: ['The header line must name a date column and a well column (e.g. "date, well, oil, water, gas").'], questions: [], readBack: [] };
  }
  if (idx.oil < 0 && idx.water < 0 && idx.gas < 0) {
    return { rows: [], columns: [], errors: ['The header line needs at least one rate column: oil, water or gas.'], questions: [], readBack: [] };
  }
  const questions = t.questions.filter((q) => q.kind === 'decimalMark' || q.column === idx.date);
  if (questions.length && t.needsAnswer) return { rows: [], columns: [], errors: [], questions, readBack: [] };

  const errors = [];
  const readBack = [`Read ${t.rows.length} rows, ${t.delimiterName} separated, decimal mark "${t.decimal.mark}".`];
  const conv = {};
  for (const key of ['oil', 'water', 'gas']) {
    if (idx[key] < 0) continue;
    const unit = t.columns[idx[key]].unit;
    const table = key === 'gas' ? GAS_UNITS : LIQUID_UNITS;
    let from = unit ? table[unitKey(unit)] : null;
    if (unit && !from) { errors.push(`The ${key} column is headed "${unit}", a unit this door does not read (${key === 'gas' ? 'Mscf/d, scf/d, MMscf/d or m3/d' : 'STB/d, bbl/d or m3/d'}).`); continue; }
    if (!from) from = key === 'gas' ? (gasUnit === 'scf' ? 'scf/d' : 'Mscf/d') : 'STB/d';
    const family = key === 'gas' ? 'gasRate' : 'liquidRate';
    const to = key === 'gas' ? 'Mscf/d' : 'STB/d';
    conv[key] = (v) => (from === to ? v : convert(family, v, from, to));
    readBack.push(`${key}: column "${t.columns[idx[key]].header}" read as ${from}${unit ? ' (from the header)' : ' (no unit in the file: the form\'s choice)'}${from !== to ? `, converted to ${to}` : ''}.`);
  }
  const rows = [];
  for (const r of t.rows) {
    const d = r.values[idx.date];
    const date = d && d.iso ? d.iso.slice(0, 10) : null;
    const well = String(r.values[idx.well] ?? '').trim().toUpperCase();
    if (!date || !well) {
      errors.push(`Line ${r.line}: needs a date and a well name (read "${r.cells[idx.date] ?? ''}", "${r.cells[idx.well] ?? ''}").`);
      continue;
    }
    const num = (key) => {
      if (idx[key] < 0 || !conv[key]) return null;
      const v = r.values[idx[key]];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        const raw = String(r.cells[idx[key]] ?? '').trim();
        if (raw !== '' && !isNullToken(raw)) errors.push(`Line ${r.line}: ${key} value '${raw}' is not a number.`);
        return null;
      }
      return conv[key](v);
    };
    rows.push({ date, well, oil: num('oil'), water: num('water'), gas: num('gas') });
  }
  if (t.report.skipped.length) readBack.push(`Skipped ${t.report.skipped.length} line(s): ${t.report.skipped.slice(0, 3).map((x) => `line ${x.line} (${x.reason})`).join(', ')}.`);
  const columns = ['date', 'well', ...['oil', 'water', 'gas'].filter((k) => idx[k] >= 0)];
  return { rows, columns, errors, questions: [], readBack };
}

/**
 * Parsed per-well rows -> spec.schedule.history periods.
 *
 * modelWells: [{name, type}] from the builder form (types producer /
 * water_injector / gas_injector). Every CSV well must be in the model.
 *
 * opts:
 *   mode:    'rates'   — values are daily rates already (STB/d, gas unit below)
 *            'volumes' — values are interval volumes booked AT the row's
 *                        date, spread over the days to the next date
 *   gasUnit: 'mscf' (default) | 'scf' (÷1000 seam)
 *
 * The last date has no successor, so its period lasts the median interval
 * (warned). Returns { startDate, endDate, periods, wellSummary, warnings }
 * or throws with an actionable message.
 */
export function historyFromWellRows(rows, modelWells, { mode = 'rates', gasUnit = 'mscf' } = {}) {
  const warnings = [];
  const wells = (modelWells || []).map((w) => ({ name: String(w.name || '').trim().toUpperCase(), type: w.type }));
  const typeOf = new Map(wells.map((w) => [w.name, w.type]));
  if (!wells.length) throw new Error('Add the model wells first — history rows attach to them by name.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('No usable data rows in the CSV.');

  const unknown = [...new Set(rows.map((r) => r.well).filter((w) => !typeOf.has(w)))];
  if (unknown.length) {
    throw new Error(`The CSV names wells not in the model: ${unknown.join(', ')} (model wells: ${wells.map((w) => w.name).join(', ')}).`);
  }

  const seen = new Set();
  rows.forEach((r) => {
    const key = `${r.date}|${r.well}`;
    if (seen.has(key)) throw new Error(`Duplicate row for ${r.well} on ${r.date} — one row per well per date.`);
    seen.add(key);
  });

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  if (dates.length < 2) throw new Error('Per-well history needs rows on at least two dates.');
  const intervals = dates.slice(1).map((d, i) => dayDiff(dates[i], d));
  const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
  const endDate = addDays(dates[dates.length - 1], median);
  warnings.push(`The last period (${dates[dates.length - 1]}) has no closing date — it runs ${median} days, the median interval.`);

  const byDate = new Map(dates.map((d) => [d, []]));
  rows.forEach((r) => byDate.get(r.date).push(r));

  let clampedNeg = 0;
  const gasScale = gasUnit === 'scf' ? 1 / 1000 : 1;
  const rate = (v, days, scale = 1) => {
    if (v == null) return 0;
    const r = (mode === 'volumes' ? v / days : v) * scale;
    if (r < 0) { clampedNeg += 1; return 0; }
    return round3(r);
  };

  const stats = new Map(wells.map((w) => [w.name, { n: 0, oil: 0, water: 0, gas: 0 }]));
  const everSeen = new Set();
  let carried = 0;
  const periods = dates.map((date, i) => {
    const next = i + 1 < dates.length ? dates[i + 1] : endDate;
    const days = dayDiff(date, next);
    const prod = [];
    const inj = [];
    const present = new Set();
    byDate.get(date).forEach((r) => {
      present.add(r.well);
      everSeen.add(r.well);
      const type = typeOf.get(r.well);
      const s = stats.get(r.well);
      s.n += 1;
      if (type === 'producer') {
        const entry = {
          name: r.well,
          orat: rate(r.oil, days),
          wrat: rate(r.water, days),
          grat: rate(r.gas, days, gasScale),
        };
        s.oil += entry.orat; s.water += entry.wrat; s.gas += entry.grat;
        prod.push(entry);
      } else {
        const phase = type === 'gas_injector' ? 'GAS' : 'WATER';
        const v = phase === 'GAS' ? rate(r.gas, days, gasScale) : rate(r.water, days);
        s.oil += 0; s.water += phase === 'WATER' ? v : 0; s.gas += phase === 'GAS' ? v : 0;
        if (v > 0) inj.push({ name: r.well, phase, rate: v });
      }
    });
    everSeen.forEach((w) => { if (!present.has(w)) carried += 1; });
    return { date, prod, inj };
  });

  if (clampedNeg > 0) warnings.push(`${clampedNeg} negative rate(s) were clamped to zero.`);
  if (carried > 0) {
    warnings.push(`${carried} well-period(s) have no row — those wells keep their previous declared rate (schedule keywords persist until changed).`);
  }
  const silent = wells.filter((w) => !everSeen.has(w.name)).map((w) => w.name);
  if (silent.length) {
    warnings.push(`No history rows for ${silent.join(', ')} — they stay shut through the history phase.`);
  }
  if (!periods.some((p) => p.prod.length)) {
    throw new Error('No producer rows found — per-well history needs at least one producing well with rates.');
  }

  const wellSummary = wells
    .filter((w) => everSeen.has(w.name))
    .map((w) => {
      const s = stats.get(w.name);
      return {
        name: w.name,
        type: w.type,
        periods: s.n,
        avgOil: round3(s.oil / s.n),
        avgWater: round3(s.water / s.n),
        avgGas: round3(s.gas / s.n),
      };
    });

  return { startDate: dates[0], endDate, periods, wellSummary, warnings };
}
