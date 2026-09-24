// Production Forecasting ML Workbench (Data & AI D4): the series table.
//
// A table is one production series per well, oldest first, one value per
// time step:
//
//   { label, source: 'upload' | 'spine', unit, step, wells: [{ name, labels, values }], notes }
//
// labels are the period of each value as the source names it (a date, a
// month, a row number); values are finite numbers. The engine
// (engines/dataai/forecast.js) takes each well's values as y. It treats
// every value as one step, so the table must hold one value per step with no
// step left out; a shut-in step is a real 0 and stays 0 (the engine reports
// MAPE as null with the reason when an actual is 0, and the Arps fit drops
// zero rates). A missing value is never filled silently: the table is
// refused with the rows named, unless the user chooses to read missing
// values as 0 (shut in), and the notes then count them.
//
// Two sources:
//   upload  a CSV, TSV, TXT or Excel table read in the browser (tabularFile.js,
//           RFC 4180 quoting), one row per well and step, rows in file
//           order within each well;
//   spine   the Production data spine (src/lib/productionSpine.js,
//           po_daily_production), one well's stored rows either as stored or
//           as calendar-month totals.
import { readCell } from '@/utils/dataAi/qcDatasets';

export const MAX_WELLS = 1000;
export const MAX_STEPS = 100000; // the engine's own series cap (DEFAULTS.MAX_POINTS)
export const MAX_SAVED_UPLOAD_VALUES = 200000;
export const MISSING_RULES = [
  { value: 'refuse', label: 'Refuse the table and name the rows' },
  { value: 'zero', label: 'Read as 0 (shut in)' },
];
export const SPINE_PHASES = [
  { value: 'oil_stb', label: 'Oil', unit: 'stb' },
  { value: 'gas_mscf', label: 'Gas', unit: 'Mscf' },
  { value: 'water_stb', label: 'Water', unit: 'stb' },
];
export const SPINE_STEPS = [
  { value: 'month', label: 'Calendar months (sum of the rows stored in each month)' },
  { value: 'row', label: 'Each stored row is one step' },
];

const listSome = (items, max = 5) => (items.length <= max
  ? items.join('; ')
  : `${items.slice(0, max).join('; ')}; and ${items.length - max} more`);

/** Refuses or zero-fills the missing values of one table; returns the notes. */
const resolveMissing = (missingAt, missing, noun) => {
  if (!missingAt.length) return [];
  if (missing === 'zero') {
    return [`${missingAt.length} missing ${noun}${missingAt.length === 1 ? ' is' : 's are'} read as 0 (shut in), as chosen: ${listSome(missingAt)}.`];
  }
  throw new Error(`${missingAt.length} ${noun}${missingAt.length === 1 ? ' has' : 's have'} no value: ${listSome(missingAt)}. `
    + 'The engine needs one value per step. Fill them in the file, or choose to read missing values as 0 (shut in).');
};

/**
 * A parsed table ({ header, rows }) to a series table.
 *
 * @param {{ header: string[], rows: string[][] }} parsed
 * @param {{ label: string, wellColumn: number|null, periodColumn: number|null, valueColumn: number,
 *           unit?: string, missing?: 'refuse'|'zero', nullValues?: string[] }} opts
 */
export function forecastTableFromUpload(parsed, {
  label, wellColumn = null, periodColumn = null, valueColumn, unit = '', missing = 'refuse', nullValues = [],
}) {
  if (!parsed || !Array.isArray(parsed.rows) || !parsed.rows.length) throw new Error('The file has no data rows.');
  if (!Number.isInteger(valueColumn)) throw new Error('Choose the column that holds the production values.');
  const header = parsed.header || [];
  const colName = (c) => header[c] || `Column ${c + 1}`;
  const byWell = new Map();
  const missingAt = [];
  const unreadable = [];
  const blankWell = [];
  parsed.rows.forEach((row, r) => {
    const line = r + 1;
    const well = wellColumn === null ? 'Series' : String(row[wellColumn] ?? '').trim();
    if (!well) { blankWell.push(`data row ${line}`); return; }
    const period = periodColumn === null ? null : String(row[periodColumn] ?? '').trim();
    const cell = readCell(row[valueColumn], nullValues);
    if (!byWell.has(well)) byWell.set(well, { name: well, labels: [], values: [] });
    const w = byWell.get(well);
    w.labels.push(period === null || period === '' ? String(w.values.length) : period);
    if (cell.unreadable) unreadable.push(`${well} data row ${line} ("${String(row[valueColumn]).trim()}")`);
    if (cell.value === null && !cell.unreadable) missingAt.push(`${well} data row ${line}${period ? ` (${period})` : ''}`);
    w.values.push(cell.value === null ? 0 : cell.value);
  });
  if (blankWell.length) throw new Error(`${blankWell.length} row${blankWell.length === 1 ? ' has' : 's have'} no well name in ${colName(wellColumn)}: ${listSome(blankWell)}.`);
  if (unreadable.length) throw new Error(`${unreadable.length} value${unreadable.length === 1 ? '' : 's'} in ${colName(valueColumn)} ${unreadable.length === 1 ? 'is' : 'are'} not a number: ${listSome(unreadable)}.`);
  const notes = resolveMissing(missingAt, missing, 'value');
  const wells = [...byWell.values()];
  if (wells.length > MAX_WELLS) throw new Error(`The file has ${wells.length} wells; the workbench takes at most ${MAX_WELLS}.`);
  const long = wells.find((w) => w.values.length > MAX_STEPS);
  if (long) throw new Error(`${long.name} has ${long.values.length} steps; the engine takes at most ${MAX_STEPS}.`);
  wells.forEach((w) => {
    const seen = new Set();
    const dup = w.labels.find((l) => { if (seen.has(l)) return true; seen.add(l); return false; });
    if (periodColumn !== null && dup !== undefined) notes.push(`${w.name} names the period ${dup} more than once. Each row is still one step, in file order.`);
    const zeros = w.values.filter((v) => v === 0).length;
    if (zeros) notes.push(`${w.name} has ${zeros} step${zeros === 1 ? '' : 's'} at 0.`);
  });
  notes.unshift(`Rows are taken in file order within each well, oldest first, one row per step${periodColumn === null ? '' : `; ${colName(periodColumn)} labels the steps`}.`);
  return {
    label,
    source: 'upload',
    unit: unit.trim(),
    step: periodColumn === null ? 'row' : colName(periodColumn),
    valueName: colName(valueColumn),
    wells,
    notes,
  };
}

const monthOf = (date) => String(date).slice(0, 7);
const nextMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/**
 * Production spine rows (getDailyProduction, one field) to a series table
 * for the chosen wells and phase.
 *
 * step 'month': the value of a calendar month is the sum of the phase over
 * the rows stored for that month (a row with no value for the phase adds
 * nothing); a month between the well's first and last stored month with no
 * stored value is missing. step 'row': each stored row is one step and a
 * row with no value for the phase is missing.
 */
export function forecastTableFromSpine({
  field, wells, rows, phase = 'oil_stb', step = 'month', missing = 'refuse',
}) {
  const ph = SPINE_PHASES.find((p) => p.value === phase);
  if (!ph) throw new Error(`Unknown phase ${phase}.`);
  if (!wells.length) throw new Error('Choose at least one well.');
  const ids = new Set(wells.map((w) => w.id));
  const perWell = new Map(wells.map((w) => [w.id, []]));
  rows.forEach((r) => { if (ids.has(r.well_id)) perWell.get(r.well_id).push(r); });
  const missingAt = [];
  const out = [];
  const notes = [];
  wells.forEach((w) => {
    const rs = perWell.get(w.id).slice().sort((a, b) => String(a.prod_date).localeCompare(String(b.prod_date)));
    if (!rs.length) { notes.push(`${w.name} has no stored rows in ${field.name} and is left out.`); return; }
    const labels = [];
    const values = [];
    if (step === 'row') {
      rs.forEach((r) => {
        const v = r[phase];
        labels.push(String(r.prod_date).slice(0, 10));
        if (v === null || v === undefined || v === '') { missingAt.push(`${w.name} ${String(r.prod_date).slice(0, 10)}`); values.push(0); } else values.push(Number(v));
      });
    } else {
      const sums = new Map();
      rs.forEach((r) => {
        const v = r[phase];
        const k = monthOf(r.prod_date);
        if (v === null || v === undefined || v === '') { if (!sums.has(k)) sums.set(k, null); return; }
        sums.set(k, (sums.get(k) ?? 0) + Number(v));
      });
      const first = monthOf(rs[0].prod_date);
      const last = monthOf(rs[rs.length - 1].prod_date);
      for (let k = first; k <= last; k = nextMonth(k)) {
        labels.push(k);
        const v = sums.has(k) ? sums.get(k) : null;
        if (v === null) { missingAt.push(`${w.name} ${k}`); values.push(0); } else values.push(v);
      }
    }
    out.push({ name: w.name, labels, values });
  });
  if (!out.length) throw new Error(`None of the chosen wells has stored rows in ${field.name}.`);
  notes.unshift(...resolveMissing(missingAt, missing, step === 'row' ? 'stored row' : 'month'));
  out.forEach((w) => {
    const zeros = w.values.filter((v) => v === 0).length;
    if (zeros) notes.push(`${w.name} has ${zeros} step${zeros === 1 ? '' : 's'} at 0.`);
  });
  notes.unshift(step === 'row'
    ? 'Each stored row is one step. The spine stores one row per well per day; a ledger imported from a monthly file holds one row a month.'
    : 'Each step is a calendar month: the sum of the rows stored for that month. A ledger imported from a monthly file holds one row a month, so its month total is that row as imported.');
  return {
    label: `${field.name}: ${ph.label.toLowerCase()} (${ph.value})`,
    source: 'spine',
    unit: step === 'row' ? `${ph.unit} per stored row` : `${ph.unit} per calendar month`,
    step: step === 'row' ? 'stored row' : 'calendar month',
    valueName: ph.value,
    wells: out,
    notes,
  };
}

/** The upload's series, kept in a saved run when small enough to re-run it. */
export function snapshotForecastTable(t) {
  if (!t || t.source !== 'upload') return null;
  const count = t.wells.reduce((s, w) => s + w.values.length, 0);
  if (count > MAX_SAVED_UPLOAD_VALUES) return null;
  return {
    label: t.label, unit: t.unit, step: t.step, valueName: t.valueName, notes: t.notes, wells: t.wells.map((w) => ({ name: w.name, labels: w.labels.slice(), values: w.values.slice() })),
  };
}

/** A snapshot back to a table, or null when it cannot be read. */
export function forecastTableFromSnapshot(s) {
  if (!s || !Array.isArray(s.wells) || !s.wells.length) return null;
  const ok = s.wells.every((w) => typeof w.name === 'string' && Array.isArray(w.values) && w.values.every((v) => typeof v === 'number' && Number.isFinite(v)));
  if (!ok) return null;
  return {
    label: s.label || 'Saved upload',
    source: 'upload',
    unit: s.unit || '',
    step: s.step || 'row',
    valueName: s.valueName || 'value',
    wells: s.wells.map((w) => ({ name: w.name, labels: Array.isArray(w.labels) && w.labels.length === w.values.length ? w.labels.slice() : w.values.map((_, i) => String(i)), values: w.values.slice() })),
    notes: Array.isArray(s.notes) ? s.notes.slice() : [],
  };
}
