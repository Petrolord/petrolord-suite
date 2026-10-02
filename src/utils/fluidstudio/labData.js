/**
 * Laboratory PVT tables in Fluid Systems Studio (FLUID-U2-001; RL10, PL2).
 *
 * The door takes the tables of a PVT report as plain tables, from a CSV or
 * text file, a pasted block or an Excel sheet: the constant composition
 * expansion (pressure-volume relations), the differential liberation and
 * the viscosity table. Columns are found by their header, never by their
 * position; the unit of each column is read from the header or chosen at
 * the door; gauge pressures are brought to absolute with the atmosphere
 * stated; and the door reads back what it read and what it did not.
 *
 * The rows are stored with the project in the engine's units (psia,
 * scf/STB, RB/STB, Bg in RB/scf, cP, lb/ft3) and are set against the model
 * table on every PVT plot and in the report, with the misfit of each
 * property stated.
 *
 * Differential liberation data are per barrel of residual oil. The model
 * table is per stock-tank barrel of the separator train. With the
 * separator test values (Bofb, Rsfb) the differential rows are adjusted to
 * the separator basis by the standard relations (Amyx et al.; as printed in
 * Ahmed, Reservoir Engineering Handbook, Equations 3-15 to 3-17):
 *   Bo = Bod Bofb / Bodb,   Rs = Rsfb - (Rsdb - Rsd) Bofb / Bodb,
 *   Bo above Pb = Vrel Bofb (Vrel from the constant composition expansion).
 * Without them the differential rows are still drawn, named as
 * differential, and are not used to match Bo or Rs.
 *
 * Pure: no React. The table itself is read by the shared typed reader
 * (src/lib/tabularParse.js).
 */
import { convert } from '../../lib/units/registry.js';
import { parseTabular, questionText } from '../../lib/tabularParse.js';
import { ATMOSPHERE_PSI, PT_PRESSURE_UNITS } from './ptProfileImport.js';

export const LAB_KINDS = Object.freeze({
  cce: { label: 'Constant composition expansion', short: 'CCE' },
  dl: { label: 'Differential liberation', short: 'DL' },
  viscosity: { label: 'Viscosity', short: 'Viscosity' },
});

/** The units a column can arrive in, by quantity: key at the door, registry family and unit. */
export const LAB_UNITS = Object.freeze({
  pressure: PT_PRESSURE_UNITS,
  gor: Object.freeze({
    'scf/STB': { label: 'scf/STB', family: 'gor', registry: 'scf/STB' },
    'm3/m3': { label: 'm3/m3', family: 'gor', registry: 'm3/m3' },
  }),
  fvfGas: Object.freeze({
    'rcf/scf': { label: 'ft3/scf (cubic feet per standard cubic foot)', family: 'fvfGas', registry: 'rcf/scf' },
    'RB/scf': { label: 'RB/scf', family: 'fvfGas', registry: 'RB/scf' },
    'RB/Mscf': { label: 'RB/Mscf', family: 'fvfGas', registry: 'RB/Mscf' },
    'm3/m3': { label: 'm3/m3', family: 'fvfGas', registry: 'm3/m3' },
  }),
  density: Object.freeze({
    'g/cc': { label: 'g/cm3', family: 'density', registry: 'g/cc' },
    'kg/m3': { label: 'kg/m3', family: 'density', registry: 'kg/m3' },
    'lb/ft3': { label: 'lb/ft3', family: 'density', registry: 'lb/ft3' },
  }),
});
export const DEFAULT_LAB_UNITS = Object.freeze({ pressure: 'psia', gor: 'scf/STB', fvfGas: 'rcf/scf', density: 'g/cc' });

/**
 * The columns the door knows, in the order their header rules are tried
 * (the first rule that fits a header takes it, so "Relative total volume"
 * is taken by Bt before the plain relative volume can claim it).
 */
export const LAB_COLUMNS = Object.freeze([
  { key: 'pressure', label: 'Pressure', quantity: 'pressure', re: /^p$|^p\s|press/i },
  { key: 'Bt', label: 'Relative total volume Bt', quantity: 'ratio', re: /total\s*(vol|fvf|form)|^bt[d]?$|^bt[d]?\b/i },
  { key: 'Bo', label: 'Oil formation volume factor', quantity: 'ratio', re: /^bo[d]?$|^bo[d]?\b|oil\s*(vol|fvf|form)|relative\s*oil/i },
  { key: 'relVol', label: 'Relative volume V/Vsat', quantity: 'ratio', re: /rel(ative)?\.?\s*vol|v\s*\/\s*v\s*(sat|b)|^vrel|^v\s*rel/i },
  { key: 'Rs', label: 'Solution gas-oil ratio', quantity: 'gor', re: /^rs[d]?$|^rs[d]?\b|solution|gas\s*[/-]?\s*oil\s*ratio|^gor\b/i },
  { key: 'yFunction', label: 'Y function', quantity: 'ratio', re: /^y$|^y[\s_]|y[\s_-]*func/i },
  { key: 'mu_g', label: 'Gas viscosity', quantity: 'viscosity', re: /gas\s*visc|^mu[\s_]*g\b|^ug\b/i, not: /ratio/i },
  { key: 'mu_o', label: 'Oil viscosity', quantity: 'viscosity', re: /visc|^mu[\s_]*o\b|^uo\b/i, not: /ratio/i },
  { key: 'Bg', label: 'Gas formation volume factor', quantity: 'fvfGas', re: /^bg$|^bg\b|gas\s*(form|fvf|vol)/i },
  { key: 'Z', label: 'Gas deviation factor Z', quantity: 'ratio', re: /^z$|^z\s|z[\s-]*fact|deviation/i },
  { key: 'gasGravity', label: 'Gas gravity', quantity: 'ratio', re: /gas\s*grav|grav.*gas|incremental/i },
  { key: 'density', label: 'Oil density', quantity: 'density', re: /dens|^rho/i },
]);
const COLUMN_BY_KEY = Object.fromEntries(LAB_COLUMNS.map((c) => [c.key, c]));

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

const pressureUnitFromText = (t) => {
  const s = String(t || '').toLowerCase();
  if (/psi\s*\(?g\)?|psig/.test(s)) return 'psig';
  if (/bar\s*\(?g\)?|barg/.test(s)) return 'barg';
  if (/psi/.test(s)) return 'psia';
  if (/mpa/.test(s)) return 'MPa';
  if (/kpa/.test(s)) return 'kPa';
  if (/bar/.test(s)) return 'bar';
  return null;
};
const gorUnitFromText = (t) => {
  const s = String(t || '').toLowerCase();
  if (/m3|m\^3|sm3/.test(s)) return 'm3/m3';
  if (/scf|cf|ft3|cu/.test(s)) return 'scf/STB';
  return null;
};
const bgUnitFromText = (t) => {
  const s = String(t || '').toLowerCase().replace(/\s+/g, '');
  if (/mscf/.test(s)) return 'RB/Mscf';
  if (/(rb|bbl)\/scf/.test(s)) return 'RB/scf';
  if (/m3|m\^3/.test(s)) return 'm3/m3';
  if (/cf\/scf|ft3\/scf|cuft|ft3\/ft3|cf\/cf/.test(s)) return 'rcf/scf';
  return null;
};
const densityUnitFromText = (t) => {
  const s = String(t || '').toLowerCase().replace(/\s+/g, '');
  if (/kg/.test(s)) return 'kg/m3';
  if (/lb/.test(s)) return 'lb/ft3';
  if (/g\/c|gm\/c|g\/ml|sg/.test(s)) return 'g/cc';
  return null;
};
const UNIT_FROM_TEXT = { pressure: pressureUnitFromText, gor: gorUnitFromText, fvfGas: bgUnitFromText, density: densityUnitFromText };

/** A sheet of string cells as tab-separated text, for the typed reader. */
export function sheetText(rows) {
  return (rows || []).map((r) => (r || []).map((c) => {
    const s = String(c ?? '');
    return /["\t\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join('\t')).join('\n');
}

/** The lab kind a set of column keys describes, or null. */
export function labKindOf(keys) {
  const has = (k) => keys.includes(k);
  if (!has('pressure')) return null;
  if (has('Rs') || has('Bo')) return 'dl';
  if (has('relVol')) return 'cce';
  if (has('mu_o')) return 'viscosity';
  return null;
}

/**
 * Read one laboratory table.
 * @param {string} text the file text, the pasted block or a sheet as text (sheetText)
 * @param {{units?: {pressure?: string, gor?: string, fvfGas?: string, density?: string},
 *   decimal?: '.'|',', delimiter?: string, kind?: 'cce'|'dl'|'viscosity'}} [opts]
 *   `units` are the units chosen at the door, used for a column whose header names none;
 *   `decimal` answers the reader's decimal mark question; `kind` forces the kind
 * @returns {{ok: boolean, reason: ?string, kind: ?string, rows: object[],
 *   columns: Array<{key: string, label: string, index: number, header: string, unit: ?string, fromHeader: boolean}>,
 *   unmapped: string[], skipped: Array<{line: number, text: string, reason: string}>,
 *   units: object, questions: string[], needsAnswer: boolean, decimal: string, summary: string}}
 *   rows are in engine units, pressure descending
 */
export function readLabTable(text, opts = {}) {
  const chosen = { ...DEFAULT_LAB_UNITS, ...(opts.units || {}) };
  const table = parseTabular(typeof text === 'string' ? text : '', {
    ...(opts.decimal ? { decimal: opts.decimal } : {}),
    ...(opts.delimiter ? { delimiter: opts.delimiter } : {}),
  });
  const skipped = table.report.skipped.map((s) => ({ line: s.line, text: String(s.text || '').trim(), reason: s.reason[0].toUpperCase() + s.reason.slice(1) }));
  const questions = table.questions.map((q) => questionText(q));
  const base = {
    ok: false, reason: null, kind: null, rows: [], columns: [], unmapped: [], skipped, units: {}, questions,
    needsAnswer: table.needsAnswer, decimal: table.decimal?.mark || '.', summary: '',
  };
  const fail = (reason) => ({ ...base, reason, summary: reason });
  if (!table.rows.length) return fail('No table rows were found in the text.');
  if (!table.header) {
    return fail('The table has no header row, so its columns cannot be told apart. Add a first line that names them, for example "Pressure (psig), Rsd (scf/STB), Bod".');
  }

  // columns by header
  const columns = [];
  const unmapped = [];
  const taken = new Set();
  table.columns.forEach((c) => {
    const name = String(c.name || '').trim();
    const full = String(c.header || '').trim();
    const def = LAB_COLUMNS.find((d) => !taken.has(d.key) && (d.re.test(name) || d.re.test(full)) && !(d.not && (d.not.test(name) || d.not.test(full))));
    if (!def || c.kind !== 'number') { if (full) unmapped.push(full); return; }
    taken.add(def.key);
    const fromText = UNIT_FROM_TEXT[def.quantity];
    // the unit is in brackets (the reader splits it off) or written after the name: "Pressure, psig"
    const headerUnit = fromText ? (fromText(c.unit) || fromText(full)) : null;
    const unit = fromText ? (headerUnit || chosen[def.quantity]) : null;
    columns.push({ key: def.key, label: def.label, index: c.index, header: full, unit, fromHeader: !!headerUnit, quantity: def.quantity });
  });
  const keys = columns.map((c) => c.key);
  if (!keys.includes('pressure')) return { ...fail('No pressure column was found: a header has to name it (Pressure, P).'), columns, unmapped };
  const kind = opts.kind && LAB_KINDS[opts.kind] ? opts.kind : labKindOf(keys);
  if (!kind) {
    return { ...fail('No laboratory property column was found beside the pressure. A differential liberation table names Rs (or Rsd) or Bo (or Bod); a constant composition expansion names the relative volume; a viscosity table names the oil viscosity.'), columns, unmapped };
  }

  // rows in engine units
  const toEngine = (col, v) => {
    if (!finite(v)) return null;
    if (col.quantity === 'pressure') {
      const u = PT_PRESSURE_UNITS[col.unit];
      return convert('pressure', v, u.registry, 'psi') + (u.gauge ? ATMOSPHERE_PSI : 0);
    }
    if (col.quantity === 'gor') return convert('gor', v, LAB_UNITS.gor[col.unit].registry, 'scf/STB');
    if (col.quantity === 'fvfGas') return convert('fvfGas', v, LAB_UNITS.fvfGas[col.unit].registry, 'RB/scf');
    if (col.quantity === 'density') return convert('density', v, LAB_UNITS.density[col.unit].registry, 'lb/ft3');
    return v;
  };
  const pCol = columns.find((c) => c.key === 'pressure');
  const rows = [];
  const lineText = (line) => (String(text || '').split(/\r\n|\r|\n/)[line - 1] || '').trim();
  for (const r of table.rows) {
    const p = toEngine(pCol, r.values[pCol.index]);
    const rowText = lineText(r.line) || r.cells.join(', ');
    if (!finite(p)) { skipped.push({ line: r.line, text: rowText, reason: 'No pressure on this row' }); continue; }
    if (!(p > 0)) { skipped.push({ line: r.line, text: rowText, reason: 'Pressure is not above zero absolute' }); continue; }
    const row = { pressure: p };
    let values = 0;
    for (const c of columns) {
      if (c.key === 'pressure') continue;
      const v = toEngine(c, r.values[c.index]);
      if (v !== null) { row[c.key] = v; values += 1; }
    }
    if (!values) { skipped.push({ line: r.line, text: rowText, reason: 'A pressure with no measured value beside it' }); continue; }
    rows.push(row);
  }
  for (const u of table.report.unreadable) skipped.push({ line: u.line, text: String(u.text), reason: `A cell that is not a number in column ${u.column + 1}` });
  skipped.sort((a, b) => a.line - b.line);
  rows.sort((a, b) => b.pressure - a.pressure);
  if (!rows.length) return { ...fail('The table has a header but no row with a pressure and a measured value.'), columns, unmapped, skipped };

  const units = {};
  for (const c of columns) if (c.unit) units[c.key] = { unit: c.unit, fromHeader: c.fromHeader };
  const pu = PT_PRESSURE_UNITS[pCol.unit];
  const unitWords = columns.filter((c) => c.unit && c.key !== 'pressure')
    .map((c) => `${c.label} in ${(LAB_UNITS[c.quantity][c.unit] || {}).label || c.unit} (${c.fromHeader ? 'read from the header' : 'as chosen'})`);
  const decimal = table.decimal?.mark === ',' ? ' Decimal commas.' : (table.decimal && table.decimal.certain === false ? ` Decimal mark taken as a ${table.decimal.mark === ',' ? 'comma' : 'point'}: the numbers do not settle it.` : '');
  const summary = `${LAB_KINDS[kind].label}: ${rows.length} row${rows.length === 1 ? '' : 's'} read`
    + `${skipped.length ? `, ${skipped.length} line${skipped.length === 1 ? '' : 's'} not read` : ''}. `
    + `Columns found by their header: ${columns.map((c) => c.label).join('; ')}. `
    + `Pressure in ${pu.label} (${pCol.fromHeader ? 'read from the header' : 'as chosen'})${pu.gauge ? `, brought to absolute with ${ATMOSPHERE_PSI} psi` : ''}. `
    + `${unitWords.length ? `${unitWords.join('; ')}. ` : ''}`
    + `${unmapped.length ? `Columns not used: ${unmapped.join('; ')}. ` : ''}`
    + `Separator: ${table.delimiterName}.${decimal}`;
  return { ...base, ok: true, kind, rows, columns: columns.map(({ quantity: _q, ...c }) => c), unmapped, skipped, units, summary };
}

/**
 * A table as the project stores it.
 * @param {object} read readLabTable(...) with ok true
 * @param {{name?: string, tempF?: ?number, at?: Date}} [meta]
 */
export function labTableOf(read, { name = '', tempF = null, at = new Date() } = {}) {
  if (!read?.ok) return null;
  return {
    kind: read.kind,
    rows: read.rows.map((r) => ({ ...r })),
    tempF: finite(tempF) ? tempF : null,
    source: {
      name: String(name || ''),
      importedAt: at instanceof Date ? at.toISOString() : String(at),
      summary: read.summary,
      columns: read.columns.map((c) => ({ key: c.key, header: c.header, unit: c.unit, fromHeader: c.fromHeader })),
      skipped: read.skipped.length,
    },
  };
}

export const emptyLabData = () => ({ cce: null, dl: null, viscosity: null, dlBasis: 'differential', separatorTest: { bofb: null, rsfb: null } });

/** The lab data of a project with every key present; an old project has none. */
export function labDataOf(inputs) {
  const d = inputs?.labData;
  const ok = (t, kind) => (t && t.kind === kind && Array.isArray(t.rows) && t.rows.length ? t : null);
  const sep = d?.separatorTest || {};
  const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) || !(Number(v) > 0) ? null : Number(v));
  return {
    cce: ok(d?.cce, 'cce'), dl: ok(d?.dl, 'dl'), viscosity: ok(d?.viscosity, 'viscosity'),
    dlBasis: d?.dlBasis === 'separator' ? 'separator' : 'differential',
    separatorTest: { bofb: n(sep.bofb), rsfb: n(sep.rsfb) },
  };
}

export const hasLabData = (inputs) => { const d = labDataOf(inputs); return !!(d.cce || d.dl || d.viscosity); };

/**
 * The saturation pressure the laboratory tables state: the CCE row whose
 * relative volume is 1, else the highest pressure of the differential
 * liberation (the test starts at the bubble point).
 * @returns {?{pressure: number, from: 'cce'|'dl'}}
 */
export function labSaturationPressure(labData) {
  const cce = labData?.cce?.rows || [];
  const at = cce.find((r) => finite(r.relVol) && Math.abs(r.relVol - 1) < 5e-5);
  if (at) return { pressure: at.pressure, from: 'cce' };
  const dl = labData?.dl?.rows || [];
  if (dl.length) return { pressure: Math.max(...dl.map((r) => r.pressure)), from: 'dl' };
  return null;
}

/**
 * Differential liberation rows on the separator basis.
 * @param {object[]} rows DL rows (Bo is Bod, Rs is Rsd), any order
 * @param {{bofb: number, rsfb: number}} sep the separator test at the bubble point
 * @returns {?object[]} null when the adjustment cannot be made (no Bod or Rsd at the bubble point)
 */
export function adjustDlToSeparator(rows, { bofb, rsfb }) {
  if (!rows?.length || !(bofb > 0) || !(rsfb >= 0)) return null;
  const top = rows.reduce((a, b) => (b.pressure > a.pressure ? b : a));
  const bodb = top.Bo;
  const rsdb = top.Rs;
  return rows.map((r) => {
    const out = { ...r };
    if (finite(r.Bo)) { if (finite(bodb) && bodb > 0) out.Bo = (r.Bo * bofb) / bodb; else delete out.Bo; }
    if (finite(r.Rs)) { if (finite(rsdb) && finite(bodb) && bodb > 0) out.Rs = rsfb - ((rsdb - r.Rs) * bofb) / bodb; else delete out.Rs; }
    if (finite(r.Bt)) { if (finite(bodb) && bodb > 0) out.Bt = (r.Bt * bofb) / bodb; else delete out.Bt; }
    return out;
  });
}

/** The properties the lab tables can be set against, with the plot each belongs to. */
export const LAB_PROPERTIES = Object.freeze([
  { id: 'bo', key: 'Bo', label: 'Oil formation volume factor Bo', kind: 'fvfOil' },
  { id: 'rs', key: 'Rs', label: 'Solution GOR Rs', kind: 'gor' },
  { id: 'muo', key: 'mu_o', label: 'Oil viscosity', kind: 'viscosity' },
  { id: 'z', key: 'Z', label: 'Gas deviation factor Z', kind: 'dimensionless' },
  { id: 'bg', key: 'Bg', label: 'Gas formation volume factor Bg', kind: 'fvfGas' },
  { id: 'relvol', key: 'Vrel', label: 'Relative volume V/Vsat', kind: 'dimensionless' },
]);

/**
 * The laboratory values on the basis they can be compared on.
 * @param {object} labData labDataOf(inputs)
 * @returns {{points: Object<string, Array<{pressure: number, value: number}>>,
 *   basis: {oil: 'separator'|'adjusted'|'differential'|null, text: string}, notes: string[],
 *   comparable: {bo: boolean, rs: boolean}}}
 *   `points` are keyed by plot id (bo, rs, muo, z, bg, relvol), in engine units
 */
export function labComparison(labData) {
  const d = labData || emptyLabData();
  const points = { bo: [], rs: [], muo: [], z: [], bg: [], relvol: [] };
  const notes = [];
  let oil = null;
  let text = '';
  const sep = d.separatorTest || {};
  const haveSep = sep.bofb > 0 && sep.rsfb >= 0 && sep.rsfb !== null;

  if (d.dl) {
    let rows = d.dl.rows;
    if (d.dlBasis === 'separator') {
      oil = 'separator';
      text = 'Differential liberation data entered as already adjusted to the separator basis.';
    } else if (haveSep) {
      const adjusted = adjustDlToSeparator(rows, sep);
      if (adjusted) {
        rows = adjusted;
        oil = 'adjusted';
        text = `Differential liberation data adjusted to the separator basis with the separator test (Bofb ${sep.bofb}, Rsfb ${sep.rsfb} scf/STB): Bo = Bod Bofb / Bodb and Rs = Rsfb - (Rsdb - Rsd) Bofb / Bodb.`;
      }
    }
    if (!oil) {
      oil = 'differential';
      text = 'Differential liberation data as the laboratory reports them, per barrel of residual oil. The model table is per stock-tank barrel of the separator train, so Bo and Rs are drawn for reference and their misfit includes the difference of basis. Enter the separator test Bofb and Rsfb to compare like with like.';
    }
    let negative = 0;
    for (const r of rows) {
      if (finite(r.Bo)) points.bo.push({ pressure: r.pressure, value: r.Bo });
      // the adjustment runs below zero toward atmospheric pressure (Ahmed: the
      // adjusted curve is drawn to Rs = 0 there by hand); such a row is no measurement
      if (finite(r.Rs)) { if (oil === 'adjusted' && r.Rs < 0) negative += 1; else points.rs.push({ pressure: r.pressure, value: r.Rs }); }
      if (finite(r.Z)) points.z.push({ pressure: r.pressure, value: r.Z });
      if (finite(r.Bg)) points.bg.push({ pressure: r.pressure, value: r.Bg });
      if (finite(r.mu_o) && !d.viscosity) points.muo.push({ pressure: r.pressure, value: r.mu_o });
    }
    notes.push(text);
    if (negative) notes.push(`The adjustment gives a negative Rs at ${negative} low pressure${negative === 1 ? '' : 's'}; ${negative === 1 ? 'that row is' : 'those rows are'} left out of the Rs comparison.`);
  }
  if (d.viscosity) for (const r of d.viscosity.rows) if (finite(r.mu_o)) points.muo.push({ pressure: r.pressure, value: r.mu_o });
  if (d.cce) {
    for (const r of d.cce.rows) if (finite(r.relVol)) points.relvol.push({ pressure: r.pressure, value: r.relVol });
    // Bo above the bubble point from the relative volume and the separator Bofb
    const sat = labSaturationPressure(d);
    if (haveSep && sat && oil !== 'differential') {
      const have = new Set(points.bo.map((p) => Math.round(p.pressure)));
      for (const r of d.cce.rows) {
        if (finite(r.relVol) && r.pressure > sat.pressure + 1e-6 && !have.has(Math.round(r.pressure))) points.bo.push({ pressure: r.pressure, value: r.relVol * sep.bofb });
      }
      if (points.bo.some((p) => p.pressure > sat.pressure + 1e-6)) notes.push('Bo above the bubble point is the relative volume of the constant composition expansion times the separator test Bofb.');
    }
  }
  for (const k of Object.keys(points)) points[k].sort((a, b) => a.pressure - b.pressure);
  return { points, basis: { oil, text }, notes, comparable: { bo: oil !== 'differential' && oil !== null, rs: oil !== 'differential' && oil !== null } };
}

/**
 * The relative volume V/Vsat the model table implies at each of its rows:
 * Bo / Bob above the saturation pressure, and the two-phase volume
 * (Bo + (Rsb - Rs) Bg) / Bob below it (Bg in RB/scf).
 */
export function modelRelativeVolume(rows, pb) {
  const sorted = [...(rows || [])].filter((r) => finite(r?.pressure)).sort((a, b) => a.pressure - b.pressure);
  if (!sorted.length || !finite(pb)) return [];
  const pbRow = sorted.reduce((best, r) => (Math.abs(r.pressure - pb) < Math.abs(best.pressure - pb) ? r : best));
  const bob = pbRow.Bo;
  const rsb = pbRow.Rs;
  if (!(bob > 0)) return [];
  return sorted.map((r) => {
    if (!finite(r.Bo)) return { pressure: r.pressure, Vrel: null };
    if (r.pressure >= pbRow.pressure) return { pressure: r.pressure, Vrel: r.Bo / bob };
    if (!finite(r.Rs) || !finite(r.Bg) || !finite(rsb)) return { pressure: r.pressure, Vrel: null };
    return { pressure: r.pressure, Vrel: (r.Bo + Math.max(0, rsb - r.Rs) * r.Bg) / bob };
  });
}

/** Linear interpolation of y at x in points sorted by x; null outside them. */
export function interpolateAt(sorted, x, xKey, yKey) {
  const pts = sorted.filter((r) => finite(r[xKey]) && finite(r[yKey]));
  // half a unit of slack at the ends: the table prints its pressures to the
  // whole psia (its lowest row reads 15 for 14.7), and a laboratory zero
  // gauge reading is 14.696 psia
  const SLACK = 0.5;
  if (!pts.length || x < pts[0][xKey] - SLACK || x > pts[pts.length - 1][xKey] + SLACK) return null;
  if (x <= pts[0][xKey]) return pts[0][yKey];
  for (let i = 1; i < pts.length; i += 1) {
    if (x <= pts[i][xKey] + 1e-9) {
      const a = pts[i - 1];
      const b = pts[i];
      const span = b[xKey] - a[xKey];
      if (!(span > 0)) return b[yKey];
      return a[yKey] + ((b[yKey] - a[yKey]) * (x - a[xKey])) / span;
    }
  }
  return pts[pts.length - 1][yKey];
}

/**
 * The model value of a property at a pressure. The table has a kink at
 * the saturation pressure, so interpolation never crosses it: each side
 * is interpolated on its own rows (the Pb row belongs to both).
 */
export function modelAt(rows, pb, key, pressure) {
  const sorted = [...(rows || [])].filter((r) => finite(r?.pressure)).sort((a, b) => a.pressure - b.pressure);
  if (!finite(pb)) return interpolateAt(sorted, pressure, 'pressure', key);
  const pbRow = sorted.length ? sorted.reduce((best, r) => (Math.abs(r.pressure - pb) < Math.abs(best.pressure - pb) ? r : best)) : null;
  const pSat = pbRow ? pbRow.pressure : pb;
  const side = pressure <= pSat ? sorted.filter((r) => r.pressure <= pSat) : sorted.filter((r) => r.pressure >= pSat);
  return interpolateAt(side, pressure, 'pressure', key);
}

/**
 * The misfit of the model against the laboratory values, per property.
 * Deviation is model minus laboratory, as a percent of the laboratory value.
 * @param {{labData: object, rows: object[], pb: ?number}} a rows are the model table (engine units)
 * @returns {Array<{id: string, key: string, label: string, kind: string, n: number, outside: number,
 *   meanAbsPct: ?number, biasPct: ?number, maxAbsPct: ?number, maxAt: ?number, basis: string,
 *   points: Array<{pressure: number, lab: number, model: number, pct: number}>}>}
 *   one entry per property with laboratory values
 */
export function labMisfit({ labData, rows, pb }) {
  const cmp = labComparison(labData);
  const rel = modelRelativeVolume(rows, pb);
  const withRel = [...(rows || [])].map((r) => ({ ...r, Vrel: rel.find((x) => x.pressure === r.pressure)?.Vrel ?? null }));
  const out = [];
  for (const prop of LAB_PROPERTIES) {
    const lab = cmp.points[prop.id];
    if (!lab.length) continue;
    const points = [];
    let outside = 0;
    for (const p of lab) {
      const model = modelAt(withRel, pb, prop.key, p.pressure);
      if (model === null || !finite(model) || !(Math.abs(p.value) > 0)) { outside += 1; continue; }
      points.push({ pressure: p.pressure, lab: p.value, model, pct: (100 * (model - p.value)) / p.value });
    }
    const n = points.length;
    const worst = n ? points.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a)) : null;
    const oilBasis = prop.id === 'bo' || prop.id === 'rs';
    out.push({
      id: prop.id, key: prop.key, label: prop.label, kind: prop.kind, n, outside,
      meanAbsPct: n ? points.reduce((s, p) => s + Math.abs(p.pct), 0) / n : null,
      biasPct: n ? points.reduce((s, p) => s + p.pct, 0) / n : null,
      maxAbsPct: worst ? Math.abs(worst.pct) : null,
      maxAt: worst ? worst.pressure : null,
      basis: oilBasis ? (cmp.basis.oil || '') : '',
      points,
    });
  }
  return out;
}

/** A stable text of the lab data, for "did the lab data change since the match". */
export const labFingerprint = (labData) => {
  const d = labData || emptyLabData();
  const rows = (t) => (t ? t.rows.map((r) => Object.keys(r).sort().map((k) => `${k}:${Number(r[k]).toPrecision(8)}`).join(',')) : null);
  return JSON.stringify({ cce: rows(d.cce), dl: rows(d.dl), viscosity: rows(d.viscosity), basis: d.dlBasis, sep: [d.separatorTest?.bofb ?? null, d.separatorTest?.rsfb ?? null], t: [d.cce?.tempF ?? null, d.dl?.tempF ?? null, d.viscosity?.tempF ?? null] });
};
