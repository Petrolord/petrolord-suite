/**
 * The lab table doors of SCAL Studio (SCAL-U1, RL10 and PL2): a kr table
 * (Sw, krw, kro) and a capillary pressure table (Sw, Pc) per core sample.
 *
 * Before this module the doors split each line on commas, needed a header
 * whose names matched an alias list, read Pc as psi whatever the file said
 * and Sw as a fraction: a semicolon or tab file was refused, a header such
 * as "Pc (kPa)" was not recognised at all, a percent saturation was
 * refused row by row, and "0,25" was two cells.
 *
 * Now the table is read by the shared typed reader (src/lib/tabularParse.js,
 * Reservoir Step 0a: any separator, comma decimals, a header in any order
 * with units in brackets or a units row, text before the table, comment
 * lines). This module adds what is particular to the door: which column is
 * which, the unit of Pc (from the header, else chosen at the door), percent
 * or fraction saturations (from the header, else from the values, and said
 * so), and the words of the read-back, kept with the sample for the report
 * (RL5: rows read, rows used, rows left out and why).
 *
 * Pure.
 */
import { convert } from '@/lib/units/registry';
import { parseTabular, questionText } from '@/lib/tabularParse';

/** Pc units a file can hold, to the registry key. */
export const PC_FILE_UNITS = Object.freeze({
  psi: { label: 'psi', registry: 'psi' },
  kPa: { label: 'kPa', registry: 'kPa' },
  bar: { label: 'bar', registry: 'bar' },
  MPa: { label: 'MPa', registry: 'MPa' },
  atm: { label: 'atm', factorPsi: 14.6959488 },
});
export const SATURATION_FILE_UNITS = Object.freeze({ auto: 'From the file', fraction: 'Fraction', percent: 'Percent' });

const pcUnitFromText = (t) => {
  const s = String(t || '').toLowerCase();
  if (/kpa/.test(s)) return 'kPa';
  if (/mpa/.test(s)) return 'MPa';
  if (/\bbar/.test(s)) return 'bar';
  if (/\batm/.test(s)) return 'atm';
  if (/psi/.test(s)) return 'psi';
  return null;
};
const satUnitFromText = (t) => {
  const s = String(t || '').toLowerCase();
  if (/%|percent|pct|\bpu\b/.test(s)) return 'percent';
  if (/frac|v\/v|\bdec\b/.test(s)) return 'fraction';
  return null;
};

const toPsi = (v, unit) => {
  const u = PC_FILE_UNITS[unit];
  if (!u) return NaN;
  if (u.factorPsi) return v * u.factorPsi;
  return convert('pressure', v, u.registry, 'psi'); // linear: a Pc is a difference, no atmosphere is added
};

const ROLE_TESTS = {
  Sw: (n) => /^s\s*[_-]?\s*w\b|^sw|water\s*sat|^s\s*w\s*$/i.test(n),
  krw: (n) => /^kr\s*[_-]?\s*w|^krw|water\s*rel/i.test(n),
  kro: (n) => /^kr\s*[_-]?\s*o|^kro|oil\s*rel/i.test(n),
  Pc: (n) => /^p\s*[_-]?\s*c\b|^pc|capillary/i.test(n),
};

function findColumns(table, roles) {
  const out = {};
  const numeric = table.columns.filter((c) => c.kind === 'number');
  if (table.header) {
    for (const role of roles) {
      const col = table.columns.find((c) => c.kind !== 'text' && ROLE_TESTS[role](c.name || '') && !Object.values(out).includes(c.index));
      if (col) out[role] = col.index;
    }
  }
  const missing = roles.filter((r) => out[r] === undefined);
  if (!missing.length) return { cols: out, byOrder: false };
  if (table.header && missing.length < roles.length) return { cols: out, missing, byOrder: false };
  // no header (or none of the names known): the first numeric columns in the stated order
  if (numeric.length < roles.length) return { cols: null, missing: roles, byOrder: true };
  return { cols: Object.fromEntries(roles.map((r, i) => [r, numeric[i].index])), byOrder: true };
}

function sharedRead(text, roles, chosen) {
  const table = parseTabular(text, chosen?.decimal ? { decimal: chosen.decimal } : {});
  const empty = (error) => ({ ok: false, error, rows: [], read: 0, skipped: [], columns: null, units: null, questions: table.questions || [], summary: error });
  if (!table.rows.length) return { table, fail: empty('No table was found in the file.') };
  const found = findColumns(table, roles);
  if (!found.cols) {
    return { table, fail: empty(`The file has no column for ${found.missing.join(', ')}. Name the columns (for example ${roles.join(', ')}) or put them in that order.`) };
  }
  return { table, cols: found.cols, byOrder: found.byOrder };
}

const nameOf = (table, idx) => table.columns[idx]?.header || `column ${idx + 1}`;

function satScale(table, col, chosen) {
  const head = table.columns[col];
  const fromHeader = satUnitFromText(`${head?.unit || ''} ${head?.header || ''}`);
  if (chosen?.saturation === 'fraction' || chosen?.saturation === 'percent') return { unit: chosen.saturation, how: 'chosen at the door' };
  if (fromHeader) return { unit: fromHeader, how: 'from the header' };
  const vals = table.rows.map((r) => r.values[col]).filter(Number.isFinite);
  if (vals.some((v) => v > 1.0001)) return { unit: 'percent', how: 'from the values (some exceed 1)' };
  return { unit: 'fraction', how: 'from the values (none exceed 1)' };
}

function skippedOf(table) {
  return [
    ...table.report.skipped.map((s) => ({ line: s.line, reason: s.reason })),
    ...table.report.unreadable.map((u) => ({ line: u.line, reason: `${u.reason}: "${u.text}"` })),
  ];
}

/**
 * Read a lab kr table.
 * @param {string} text
 * @param {{saturation?: 'auto'|'fraction'|'percent', decimal?: '.'|','}} [chosen]
 * @returns {{ok: boolean, error?: string, rows: Array<{Sw: number, krw: number, kro: number}>, read: number,
 *   skipped: Array<{line: number, reason: string}>, columns: ?object, units: ?object, questions: object[], summary: string}}
 */
export function readKrTable(text, chosen = {}) {
  const { table, fail, cols, byOrder } = sharedRead(text, ['Sw', 'krw', 'kro'], chosen);
  if (fail) return fail;
  const sat = satScale(table, cols.Sw, chosen);
  const f = sat.unit === 'percent' ? 0.01 : 1;
  const rows = [];
  const skipped = skippedOf(table);
  for (const r of table.rows) {
    const Sw = r.values[cols.Sw]; const krw = r.values[cols.krw]; const kro = r.values[cols.kro];
    if (![Sw, krw, kro].every(Number.isFinite)) { skipped.push({ line: r.line, reason: 'a blank or non-numeric Sw, krw or kro' }); continue; }
    const row = { Sw: Number((Sw * f).toPrecision(12)), krw, kro };
    if (row.Sw < 0 || row.Sw > 1) { skipped.push({ line: r.line, reason: `Sw ${Sw} is outside 0 to 1 after reading it as a ${sat.unit}` }); continue; }
    if (krw < 0 || krw > 1 || kro < 0 || kro > 1) { skipped.push({ line: r.line, reason: 'kr outside 0 to 1' }); continue; }
    rows.push(row);
  }
  rows.sort((a, b) => a.Sw - b.Sw);
  skipped.sort((a, b) => a.line - b.line);
  const columns = { Sw: nameOf(table, cols.Sw), krw: nameOf(table, cols.krw), kro: nameOf(table, cols.kro), byOrder };
  const summary = [
    `${rows.length} row${rows.length === 1 ? '' : 's'} read, ${skipped.length} left out.`,
    byOrder ? 'No header names the columns: read in the order Sw, krw, kro.' : `Columns: Sw from "${columns.Sw}", krw from "${columns.krw}", kro from "${columns.kro}".`,
    `Sw read as a ${sat.unit} (${sat.how}).`,
    `Separator: ${table.delimiterName}; decimal mark: ${table.decimal.mark === ',' ? 'comma' : 'point'}.`,
    ...table.questions.map(questionText),
  ].join(' ');
  return { ok: rows.length >= 3, error: rows.length >= 3 ? undefined : 'Fewer than 3 usable rows.', rows, read: rows.length, skipped, columns, units: { saturation: sat.unit, saturationHow: sat.how }, decimal: table.decimal.mark, questions: table.questions, summary };
}

/**
 * Read a lab capillary pressure table. Pc is stored in psi.
 * @param {string} text
 * @param {{pc?: string, saturation?: 'auto'|'fraction'|'percent', decimal?: '.'|','}} [chosen]
 *   `pc` is the unit used when the file does not say one
 */
export function readPcTable(text, chosen = {}) {
  const { table, fail, cols, byOrder } = sharedRead(text, ['Sw', 'Pc'], chosen);
  if (fail) return fail;
  const sat = satScale(table, cols.Sw, chosen);
  const head = table.columns[cols.Pc];
  const fromHeader = pcUnitFromText(`${head?.unit || ''} ${head?.header || ''}`);
  const pcUnit = fromHeader || (PC_FILE_UNITS[chosen.pc] ? chosen.pc : 'psi');
  const pcHow = fromHeader ? 'from the header' : PC_FILE_UNITS[chosen.pc] ? 'chosen at the door' : 'assumed, the file does not say';
  const f = sat.unit === 'percent' ? 0.01 : 1;
  const rows = [];
  const skipped = skippedOf(table);
  for (const r of table.rows) {
    const Sw = r.values[cols.Sw]; const pc = r.values[cols.Pc];
    if (![Sw, pc].every(Number.isFinite)) { skipped.push({ line: r.line, reason: 'a blank or non-numeric Sw or Pc' }); continue; }
    const row = { Sw: Number((Sw * f).toPrecision(12)), Pc_psi: Number(toPsi(pc, pcUnit).toPrecision(12)) };
    if (row.Sw <= 0 || row.Sw > 1) { skipped.push({ line: r.line, reason: `Sw ${Sw} is outside 0 to 1 after reading it as a ${sat.unit}` }); continue; }
    if (row.Pc_psi < 0) { skipped.push({ line: r.line, reason: 'a negative Pc (an imbibition branch belongs in its own table)' }); continue; }
    rows.push(row);
  }
  rows.sort((a, b) => a.Sw - b.Sw);
  skipped.sort((a, b) => a.line - b.line);
  const columns = { Sw: nameOf(table, cols.Sw), Pc: nameOf(table, cols.Pc), byOrder };
  const summary = [
    `${rows.length} row${rows.length === 1 ? '' : 's'} read, ${skipped.length} left out.`,
    byOrder ? 'No header names the columns: read in the order Sw, Pc.' : `Columns: Sw from "${columns.Sw}", Pc from "${columns.Pc}".`,
    `Pc read in ${PC_FILE_UNITS[pcUnit].label} (${pcHow}) and stored in psi. Sw read as a ${sat.unit} (${sat.how}).`,
    `Separator: ${table.delimiterName}; decimal mark: ${table.decimal.mark === ',' ? 'comma' : 'point'}.`,
    ...table.questions.map(questionText),
  ].join(' ');
  return { ok: rows.length >= 3, error: rows.length >= 3 ? undefined : 'Fewer than 3 usable rows.', rows, read: rows.length, skipped, columns, units: { saturation: sat.unit, saturationHow: sat.how, pc: pcUnit, pcHow }, decimal: table.decimal.mark, questions: table.questions, summary };
}

/** The record kept with the sample (RL5), without the rows. */
export const importRecord = (res, fileName, at = new Date().toISOString()) => ({
  file: fileName || null,
  at,
  read: res.read,
  skipped: res.skipped.slice(0, 50),
  skippedCount: res.skipped.length,
  columns: res.columns,
  units: res.units,
  summary: res.summary,
});
