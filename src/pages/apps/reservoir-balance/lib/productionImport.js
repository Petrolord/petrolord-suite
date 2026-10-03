// The import door of the Material Balance Data tab (MBAL-U1, PL2 and RL10).
//
// A pressure and production table arrives as text (a CSV, a semicolon or tab
// file, a paste) or as a workbook sheet turned into text. This module reads
// it with the shared typed reader (src/lib/tabularParse.js) and turns it
// into rb_production_data rows in engine units, and it says what it did:
//
//   columns   found from the header by name, in any order; a column the
//             reader could not place can be placed by hand, which is also
//             how a file with no header is read
//   units     read from the header where it names one ("Pressure (psig)",
//             "cum_gas_mscf"), offered at the door where it does not, and
//             converted with the Suite registry. Gauge pressure takes the
//             atmospheric pressure stated at the door
//   dates     never guessed: when no value settles day first or month
//             first the reader asks and the rows wait for the answer
//   decimals  one mark per file; when the file cannot settle it the reader
//             says which reading it took and offers the other
//   rows      every row left out is listed with its line and the reason
//
// Pure: text in, a plain object out. The Data tab holds the choices and
// calls this again when one changes.
import { parseTabular, questionText } from '@/lib/tabularParse';
import { convert, PA_PER_PSI } from '@/lib/units/registry';

/** Standard atmosphere, psia: what a gauge pressure is raised by unless the door states another value. */
export const STANDARD_ATMOSPHERE_PSI = 101325 / PA_PER_PSI;


/** The units each kind of column may arrive in. `unit` is the registry unit; the first entry is the engine's. */
export const DOOR_UNITS = Object.freeze({
  pressure: [
    { key: 'psia', label: 'psia', family: 'pressure', unit: 'psi', gauge: false },
    { key: 'psig', label: 'psig (gauge)', family: 'pressure', unit: 'psi', gauge: true },
    { key: 'kPa', label: 'kPa abs', family: 'pressure', unit: 'kPa', gauge: false },
    { key: 'kPag', label: 'kPa gauge', family: 'pressure', unit: 'kPa', gauge: true },
    { key: 'bara', label: 'bara', family: 'pressure', unit: 'bar', gauge: false },
    { key: 'barg', label: 'barg (gauge)', family: 'pressure', unit: 'bar', gauge: true },
    { key: 'MPa', label: 'MPa abs', family: 'pressure', unit: 'MPa', gauge: false },
  ],
  stock: [
    { key: 'STB', label: 'STB', family: 'liquidVolume', unit: 'STB' },
    { key: 'MSTB', label: 'MSTB (thousand)', family: 'liquidVolume', unit: 'MSTB' },
    { key: 'MMSTB', label: 'MMSTB (million)', family: 'liquidVolume', unit: 'MMSTB' },
    { key: 'm3', label: 'sm3', family: 'liquidVolume', unit: 'm3' },
    { key: '10^3 m3', label: '10^3 sm3', family: 'liquidVolume', unit: '10^3 m3' },
    { key: '10^6 m3', label: '10^6 sm3', family: 'liquidVolume', unit: '10^6 m3' },
  ],
  gas: [
    { key: 'scf', label: 'scf', family: 'gasVolume', unit: 'scf' },
    { key: 'Mscf', label: 'Mscf (thousand)', family: 'gasVolume', unit: 'Mscf' },
    { key: 'MMscf', label: 'MMscf (million)', family: 'gasVolume', unit: 'MMscf' },
    { key: 'Bscf', label: 'Bscf (billion)', family: 'gasVolume', unit: 'Bscf' },
    { key: 'm3', label: 'sm3', family: 'gasVolume', unit: 'm3' },
    { key: '10^3 m3', label: '10^3 sm3', family: 'gasVolume', unit: '10^3 m3' },
    { key: '10^6 m3', label: '10^6 sm3', family: 'gasVolume', unit: '10^6 m3' },
    { key: '10^9 m3', label: '10^9 sm3', family: 'gasVolume', unit: '10^9 m3' },
  ],
  res: [
    { key: 'RB', label: 'RB', family: 'liquidVolume', unit: 'RB' },
    { key: 'MRB', label: 'MRB (thousand)', family: 'liquidVolume', unit: 'MRB' },
    { key: 'MMRB', label: 'MMRB (million)', family: 'liquidVolume', unit: 'MMRB' },
    { key: 'm3', label: 'rm3', family: 'liquidVolume', unit: 'm3' },
    { key: '10^6 m3', label: '10^6 rm3', family: 'liquidVolume', unit: '10^6 m3' },
  ],
  fvf: [{ key: 'RB/STB', label: 'RB/STB or rm3/sm3', family: 'fvfOil', unit: 'RB/STB' }],
  gor: [
    { key: 'scf/STB', label: 'scf/STB', family: 'gor', unit: 'scf/STB' },
    { key: 'Mscf/STB', label: 'Mscf/STB', family: 'gor', unit: 'Mscf/STB' },
    { key: 'm3/m3', label: 'sm3/sm3', family: 'gor', unit: 'm3/m3' },
  ],
  fvfGas: [
    { key: 'RB/Mscf', label: 'RB/Mscf', family: 'fvfGas', unit: 'RB/Mscf' },
    { key: 'RB/scf', label: 'RB/scf', family: 'fvfGas', unit: 'RB/scf' },
    { key: 'm3/m3', label: 'rm3/sm3 or rcf/scf', family: 'fvfGas', unit: 'm3/m3' },
  ],
  none: [],
});

/**
 * The columns of rb_production_data the door fills. `names` are header
 * names as people write them, already lower case with punctuation as
 * spaces; the longest name that fits a header wins, so "cum gas inj" is
 * never taken for "cum gas".
 */
export const IMPORT_COLUMNS = Object.freeze([
  { key: 'observation_date', label: 'Date', kind: 'date', units: 'none', names: ['observation date', 'date', 'survey date', 'observed date', 'time'] },
  { key: 'pressure_psia', label: 'Reservoir pressure', kind: 'number', units: 'pressure', required: true, names: ['pressure psia', 'reservoir pressure', 'static pressure', 'average pressure', 'avg pressure', 'res pressure', 'pressure', 'pres', 'p psia', 'pr', 'p'] },
  { key: 'cum_oil_stb', label: 'Cumulative oil Np', kind: 'number', units: 'stock', names: ['cum oil stb', 'cumulative oil produced', 'cumulative oil', 'cum oil prod', 'cum oil', 'oil produced', 'oil prod', 'np stb', 'np'] },
  { key: 'cum_gas_scf', label: 'Cumulative gas Gp', kind: 'number', units: 'gas', names: ['cum gas scf', 'cum gas mscf', 'cum gas mmscf', 'cum gas bscf', 'cumulative gas produced', 'cumulative gas', 'cum gas prod', 'cum gas', 'gas produced', 'gas prod', 'gp scf', 'gp mscf', 'gp mmscf', 'gp bscf', 'gp'] },
  { key: 'cum_water_stb', label: 'Cumulative water Wp', kind: 'number', units: 'stock', names: ['cum water stb', 'cumulative water produced', 'cum water produced', 'cum water prod', 'cumulative water', 'cum water', 'water produced', 'water prod', 'wp stb', 'wp'] },
  { key: 'cum_water_inj_stb', label: 'Cumulative water injected', kind: 'number', units: 'stock', names: ['cum water inj stb', 'cumulative water injected', 'cum water injected', 'cum water inj', 'water injected', 'water inj', 'winj', 'wi stb', 'wi'] },
  { key: 'cum_gas_inj_scf', label: 'Cumulative gas injected', kind: 'number', units: 'gas', names: ['cum gas inj scf', 'cum gas inj mscf', 'cumulative gas injected', 'cum gas injected', 'cum gas inj', 'gas injected', 'gas inj', 'ginj', 'gi scf', 'gi mscf', 'gi'] },
  { key: 'bo_rb_stb', label: 'Bo', kind: 'number', units: 'fvf', names: ['bo rb stb', 'oil formation volume factor', 'oil fvf', 'bo'] },
  { key: 'rs_scf_stb', label: 'Rs', kind: 'number', units: 'gor', names: ['rs scf stb', 'rs mscf stb', 'solution gas oil ratio', 'solution gor', 'solution gas', 'rs'] },
  { key: 'bg_rb_mscf', label: 'Bg', kind: 'number', units: 'fvfGas', names: ['bg rb mscf', 'bg rb scf', 'gas formation volume factor', 'gas fvf', 'bg'] },
  { key: 'bw_rb_stb', label: 'Bw', kind: 'number', units: 'fvf', names: ['bw rb stb', 'water formation volume factor', 'water fvf', 'bw'] },
  { key: 'z_factor', label: 'Z', kind: 'number', units: 'none', names: ['z factor', 'gas deviation factor', 'deviation factor', 'compressibility factor', 'z'] },
  { key: 'observed_we_rb', label: 'Observed water influx We', kind: 'number', units: 'res', names: ['observed we rb', 'cumulative water influx', 'observed water influx', 'water influx', 'we rb', 'we'] },
]);

const COLUMN_BY_KEY = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c]));

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// what a unit looks like when it is written in a header, per kind of column
const UNIT_SPELLINGS = Object.freeze({
  pressure: [
    [/\bpsi\s*g\b|\bpsig\b|\bgauge\b/, 'psig'], [/\bkpa\s*g\b|\bkpag\b/, 'kPag'], [/\bbar\s*g\b|\bbarg\b/, 'barg'],
    [/\bpsi\s*a\b|\bpsia\b/, 'psia'], [/\bkpa\b/, 'kPa'], [/\bmpa\b/, 'MPa'], [/\bbar\s*a\b|\bbara\b|\bbar\b/, 'bara'], [/\bpsi\b/, 'psia'],
  ],
  stock: [
    [/\bmmstb\b|\bmmbbl\b|\bmm stb\b/, 'MMSTB'], [/\bmstb\b|\bmbbl\b|\bm stb\b/, 'MSTB'],
    [/10\s*6\s*s?m3|\bmm\s*s?m3\b/, '10^6 m3'], [/10\s*3\s*s?m3|\bk\s*s?m3\b/, '10^3 m3'], [/\bs?m3\b/, 'm3'], [/\bstb\b|\bbbl\b/, 'STB'],
  ],
  gas: [
    [/\bbscf\b|\bbcf\b/, 'Bscf'], [/\bmmscf\b|\bmmcf\b/, 'MMscf'], [/\bmscf\b|\bmcf\b/, 'Mscf'],
    [/10\s*9\s*s?m3/, '10^9 m3'], [/10\s*6\s*s?m3/, '10^6 m3'], [/10\s*3\s*s?m3/, '10^3 m3'], [/\bs?m3\b/, 'm3'], [/\bscf\b/, 'scf'],
  ],
  res: [[/\bmmrb\b|\bmm rb\b/, 'MMRB'], [/\bmrb\b/, 'MRB'], [/10\s*6\s*r?m3/, '10^6 m3'], [/\br?m3\b/, 'm3'], [/\brb\b|\bres bbl\b/, 'RB']],
  gor: [[/\bmscf\s*stb\b/, 'Mscf/STB'], [/\bs?m3\s*s?m3\b/, 'm3/m3'], [/\bscf\s*stb\b/, 'scf/STB']],
  fvfGas: [[/\brb\s*mscf\b/, 'RB/Mscf'], [/\brb\s*scf\b/, 'RB/scf'], [/\br?m3\s*s?m3\b|\brcf\s*scf\b|\bft3\s*scf\b/, 'm3/m3']],
  fvf: [[/./, 'RB/STB']],
  none: [],
});

/** The unit a header names for a column of this kind, or null. */
export function unitFromHeader(kind, headerText, bracketUnit) {
  const tries = [norm(bracketUnit), norm(headerText)].filter(Boolean);
  for (const text of tries) {
    for (const [re, key] of UNIT_SPELLINGS[kind] ?? []) if (re.test(text)) return key;
  }
  return null;
}

/**
 * Place the file's columns on the schema by header name. Each file column
 * is used once; the longest matching name wins.
 * @param {Array<{index: number, header: ?string, name: string, unit: ?string}>} columns of parseTabular
 * @returns {Object<string, number>} schema key to file column index
 */
export function matchColumns(columns) {
  const candidates = [];
  for (const col of columns) {
    if (!col.header) continue;
    const full = ` ${norm(col.header)} `;
    const bare = ` ${norm(col.name)} `;
    for (const target of IMPORT_COLUMNS) {
      for (const name of target.names) {
        const needle = ` ${name} `;
        if (bare === needle || full === needle) candidates.push({ key: target.key, index: col.index, score: 1000 + name.length });
        else if (bare.includes(needle) || full.includes(needle)) candidates.push({ key: target.key, index: col.index, score: name.length });
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
  return map;
}

const toEngine = (kind, key, value, atmospherePsi) => {
  if (!Number.isFinite(value)) return null;
  const def = (DOOR_UNITS[kind] ?? []).find((u) => u.key === key);
  if (!def) return value;
  const engineUnit = DOOR_UNITS[kind][0].unit;
  if (def.unit === engineUnit && !def.gauge) return value; // the engine's own unit: the number as typed
  const v = convert(def.family, value, def.unit, engineUnit);
  // twelve figures: a converted 0.5 Mscf/STB is 500, never 500.00000000000006
  return Number((def.gauge ? v + atmospherePsi : v).toPrecision(12));
};

// a date column that reached the reader as numbers: a year, or an Excel serial day
const dateFromNumber = (n) => {
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return `${n}-01-01`;
  if (n >= 20000 && n <= 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
  return null;
};

/**
 * Read a pressure and production table.
 * @param {string} text the file or the paste
 * @param {object} [choices] what the user chose at the door:
 *   { mapping: { <schema key>: <file column index or null> }, units: { <schema key>: <door unit key> },
 *     defaultUnits: { pressure, stock, gas, res, gor, fvfGas } (the unit to assume where the header names none),
 *     atmospherePsi, dateOrder: 'dmy' | 'mdy', decimal: '.' | ',', header: boolean }
 * @returns {{ok: boolean, refusal: ?string, rows: object[], mapping: object, units: object, unitFrom: object,
 *   columns: object[], questions: Array<{kind: string, text: string}>, readBack: object, warnings: string[], parsed: object}}
 */
export function readProductionTable(text, choices = {}) {
  const parsed = parseTabular(text, {
    decimal: choices.decimal, dateOrder: choices.dateOrder, header: typeof choices.header === 'boolean' ? choices.header : undefined,
  });
  const atmospherePsi = Number.isFinite(choices.atmospherePsi) ? choices.atmospherePsi : STANDARD_ATMOSPHERE_PSI;
  const base = {
    ok: false, refusal: null, rows: [], mapping: {}, units: {}, unitFrom: {}, columns: parsed.columns, questions: [], warnings: [], parsed,
    readBack: { delimiter: parsed.delimiterName, header: Boolean(parsed.header), decimal: parsed.decimal, rowsInFile: 0, rowsRead: 0, skipped: [], columns: [], atmospherePsi },
  };
  if (!parsed.columnCount || !parsed.rows.length) {
    return { ...base, refusal: 'The file holds no table. It needs a row of column names and at least two rows of numbers.' };
  }

  // columns: by header name, then whatever the user placed by hand
  const auto = matchColumns(parsed.columns);
  const mapping = { ...auto };
  for (const [key, index] of Object.entries(choices.mapping ?? {})) {
    if (!COLUMN_BY_KEY[key]) continue;
    if (index === null || index === undefined || index === '') delete mapping[key];
    else {
      for (const k of Object.keys(mapping)) if (mapping[k] === Number(index) && k !== key) delete mapping[k];
      mapping[key] = Number(index);
    }
  }

  // units: the header's, else the user's choice, else the unit assumed at the door
  const units = {};
  const unitFrom = {};
  for (const target of IMPORT_COLUMNS) {
    const index = mapping[target.key];
    if (index === undefined || target.units === 'none') continue;
    const col = parsed.columns[index];
    const fromHeader = unitFromHeader(target.units, col.header, col.unit);
    const chosen = choices.units?.[target.key];
    const options = DOOR_UNITS[target.units];
    if (chosen && options.some((u) => u.key === chosen)) { units[target.key] = chosen; unitFrom[target.key] = 'chosen'; }
    else if (fromHeader) { units[target.key] = fromHeader; unitFrom[target.key] = 'header'; }
    else {
      const fallback = choices.defaultUnits?.[target.units];
      units[target.key] = options.some((u) => u.key === fallback) ? fallback : options[0].key;
      unitFrom[target.key] = options.length > 1 ? 'assumed' : 'fixed';
    }
  }

  const questions = parsed.questions.map((q) => ({ ...q, text: questionText(q) }));
  const warnings = [];
  const skipped = parsed.report.skipped.map((s) => ({ line: s.line, reason: s.reason }));
  const dateIndex = mapping.observation_date;
  const dateCol = dateIndex !== undefined ? parsed.columns[dateIndex] : null;
  const dateWaits = Boolean(dateCol?.dateOrder?.asked);

  const out = [];
  let unreadableDates = 0;
  for (const r of parsed.rows) {
    const row = {};
    for (const target of IMPORT_COLUMNS) {
      const index = mapping[target.key];
      if (index === undefined) continue;
      const v = r.values[index];
      if (target.kind === 'date') {
        if (v && typeof v === 'object' && v.iso) row.observation_date = v.iso;
        else if (typeof v === 'number') row.observation_date = dateFromNumber(v);
        else row.observation_date = null;
        if (row.observation_date == null && String(r.cells[index] ?? '').trim() !== '' && !dateWaits) unreadableDates += 1;
      } else {
        row[target.key] = typeof v === 'number' ? toEngine(target.units, units[target.key], v, atmospherePsi) : null;
      }
    }
    if (mapping.pressure_psia !== undefined && !Number.isFinite(row.pressure_psia)) {
      skipped.push({ line: r.line, reason: 'no pressure on this row' });
      continue;
    }
    out.push(row);
  }
  out.forEach((row, i) => { row.timestep_index = i; });

  for (const u of parsed.report.unreadable) skipped.push({ line: u.line, reason: `"${u.text}" in column ${u.column + 1} is ${u.reason}; the cell was left empty`, cell: true });
  if (unreadableDates) warnings.push(`${unreadableDates} date value(s) could not be read. Those rows are kept without a date.`);
  if (!parsed.header) warnings.push('The file has no row of column names. Choose below which column is which.');
  for (const [key, from] of Object.entries(unitFrom)) {
    if (from === 'assumed') warnings.push(`${COLUMN_BY_KEY[key].label}: the file names no unit. It was read as ${(DOOR_UNITS[COLUMN_BY_KEY[key].units].find((u) => u.key === units[key]) || {}).label}. Change it below if the file is in another unit.`);
  }
  const gaugeKey = units.pressure_psia && DOOR_UNITS.pressure.find((u) => u.key === units.pressure_psia)?.gauge;
  if (gaugeKey) warnings.push(`Gauge pressures were raised by an atmospheric pressure of ${atmospherePsi.toFixed(3)} psi to give absolute pressures.`);

  const readBackColumns = IMPORT_COLUMNS.filter((t) => mapping[t.key] !== undefined).map((t) => {
    const col = parsed.columns[mapping[t.key]];
    const def = (DOOR_UNITS[t.units] ?? []).find((u) => u.key === units[t.key]);
    return {
      key: t.key, label: t.label, fileColumn: col.header || col.name, index: col.index,
      unit: t.kind === 'date' ? (col.dateOrder?.order === 'dmy' ? 'day first' : col.dateOrder?.order === 'mdy' ? 'month first' : (col.kind === 'date' ? 'unambiguous' : 'year or serial day')) : (def?.label ?? ''),
      unitFrom: t.kind === 'date' ? (col.dateOrder?.from ?? 'file') : unitFrom[t.key],
      values: out.filter((row) => row[t.key] != null).length,
    };
  });
  const unplaced = parsed.columns.filter((c) => !Object.values(mapping).includes(c.index)).map((c) => ({ index: c.index, name: c.header || c.name }));

  const result = {
    ...base, mapping, units, unitFrom, questions, warnings, rows: out,
    readBack: { ...base.readBack, rowsInFile: parsed.rows.length, rowsRead: out.length, skipped, columns: readBackColumns, unplaced },
  };
  if (mapping.pressure_psia === undefined) {
    return { ...result, rows: [], refusal: parsed.header
      ? 'No pressure column was found by name. Choose which column holds the reservoir pressure.'
      : 'The file has no row of column names, so nothing could be placed. Choose which column holds the reservoir pressure, and the others you need.' };
  }
  if (dateWaits) {
    return { ...result, ok: false, refusal: 'The dates could be day first or month first and nothing in the file settles it. Choose one below; the dates are not read until you do.' };
  }
  if (out.length < 2) return { ...result, refusal: `Only ${out.length} row(s) carry a pressure. A material balance needs the initial state and at least one later survey.` };
  return { ...result, ok: true };
}
