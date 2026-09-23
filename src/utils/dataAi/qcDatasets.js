// Data Quality Studio (Data & AI D1): the three data sources, each turned
// into one dataset shape the QC profile reads.
//
//   wells       well log curves from the shared wells registry
//               (src/lib/wellsRegistry.js, the Well Data Manager's store):
//               float32 samples, NaN for a LAS null, depth in metres.
//   production  one well's rows from the Production data spine
//               (src/lib/productionSpine.js, po_daily_production).
//   upload      a CSV, TSV or Excel sheet read by src/lib/tabularFile.js.
//
// Nothing here ingests data anywhere: the registry and the spine are read
// through their own services, and an upload stays in the browser (a saved
// run keeps the columns it checked, see qcRun.js).
//
// Dataset shape:
//   { source, label, ref,
//     index: null | { name, unit, kind: 'depth'|'time'|'number', values, labels },
//     channels: [{ key, name, unit, values, notes }],
//     identifiers: null | { name, values, note },
//     notes: [string] }
// values hold numbers or null (missing). Units are labels only: nothing in
// this file converts a value.

export const DAY_MS = 86400000;

/** YYYY-MM-DD (optionally with a time) to a whole UTC day number, or null. */
export const dayNumber = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? '').trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return t / DAY_MS;
};

export const dayLabel = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * Unit spellings mapped to the unit keys the engine's definitional limits use.
 * These are spellings of the SAME unit (G/C3 and g/cm3), never conversions.
 */
const UNIT_SPELLINGS = {
  'g/cm3': ['G/C3', 'G/CC', 'GM/CC', 'G/CM3', 'GR/CC', 'G/CM^3'],
  gAPI: ['GAPI', 'API'],
  'ohm.m': ['OHMM', 'OHM.M', 'OHM-M', 'OHM M', 'OHMS'],
  'us/ft': ['US/F', 'US/FT', 'USEC/FT', 'USEC/F'],
  'us/m': ['US/M', 'USEC/M'],
  in: ['IN', 'INCH', 'INCHES'],
  mm: ['MM'],
  'v/v': ['V/V', 'DEC', 'FRAC', 'FRACTION', 'M3/M3'],
  psia: ['PSIA'],
  kPa: ['KPA'],
  bara: ['BARA'],
  degC: ['DEGC', '°C'],
  degF: ['DEGF', '°F'],
  K: ['K', 'KELVIN'],
};

/** The engine unit key for a unit spelling, or null when it is not one we know. */
export const normaliseUnit = (unit) => {
  const u = String(unit ?? '').trim().toUpperCase();
  if (!u) return null;
  for (const [key, spellings] of Object.entries(UNIT_SPELLINGS)) {
    if (spellings.includes(u)) return key;
  }
  return null;
};

// Curve names whose values are fractions by definition. Neutron porosity is
// deliberately absent: an apparent neutron porosity can read below zero.
const FRACTION_NAMES = ['PHIE', 'PHIT', 'PHI', 'SW', 'SWE', 'SWT', 'VSH', 'VCL', 'NTG', 'WC', 'WCT', 'WATER_CUT', 'WATERCUT', 'BSW'];
const RATE_NAMES = ['OIL_STB', 'WATER_STB', 'GAS_MSCF', 'WINJ_STB', 'GINJ_MSCF', 'OIL', 'WATER', 'GAS', 'QO', 'QW', 'QG', 'OIL_RATE', 'WATER_RATE', 'GAS_RATE', 'LIQUID_RATE'];
const CUMULATIVE_NAMES = ['NP', 'WP', 'GP', 'CUM_OIL', 'CUM_WATER', 'CUM_GAS', 'CUMULATIVE_OIL', 'OIL_CUM', 'WATER_CUM', 'GAS_CUM'];

const baseName = (name) => String(name ?? '').trim().toUpperCase().split(':')[0].replace(/\s+/g, '_');

/**
 * A suggested range rule for a channel. Only definitional limits are ever
 * suggested (engine DEFINITIONAL_LIMITS); plausibility ranges are the user's
 * to type. The user can change or clear every suggestion.
 *   { mode: 'definitional', channel, unit } | { mode: 'custom', min, max, note } | { mode: 'none' }
 */
export const suggestLimit = ({ name, unit }) => {
  const b = baseName(name);
  const u = normaliseUnit(unit);
  if (FRACTION_NAMES.includes(b) && (u === 'v/v' || !unit)) return { mode: 'definitional', channel: 'fraction', unit: 'v/v' };
  if (RATE_NAMES.includes(b)) return { mode: 'definitional', channel: 'rate', unit: 'any' };
  if (CUMULATIVE_NAMES.includes(b)) return { mode: 'definitional', channel: 'cumulative', unit: 'any' };
  if (b === 'HOURS_ON' || b === 'HOURS') return { mode: 'custom', min: '0', max: '24', note: 'hours in one day' };
  if (u === 'gAPI' && ['GR', 'SGR', 'CGR', 'GRC'].includes(b)) return { mode: 'definitional', channel: 'gammaRay', unit: 'gAPI' };
  if (u === 'g/cm3' && ['RHOB', 'DEN', 'ZDEN', 'RHOZ'].includes(b)) return { mode: 'definitional', channel: 'bulkDensity', unit: 'g/cm3' };
  if (u === 'ohm.m') return { mode: 'definitional', channel: 'resistivity', unit: 'ohm.m' };
  if ((u === 'us/ft' || u === 'us/m') && ['DT', 'DTC', 'AC', 'DTCO', 'DTS', 'DTSM'].includes(b)) return { mode: 'definitional', channel: 'sonic', unit: u };
  if ((u === 'in' || u === 'mm') && ['CALI', 'CAL', 'HCAL', 'BS'].includes(b)) return { mode: 'definitional', channel: 'caliper', unit: u };
  return { mode: 'none' };
};

const toValue = (v) => (Number.isFinite(v) ? v : null);

/** A slug usable as a stable channel key. */
const keyOf = (name, taken) => {
  const k = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'channel';
  let out = k;
  let i = 2;
  while (taken.has(out)) { out = `${k}_${i}`; i += 1; }
  taken.add(out);
  return out;
};

const INDEX_MNEMONICS = ['DEPT', 'DEPTH', 'MD'];

/**
 * Well log curves (registry rows plus their downloaded float32 samples) to a
 * dataset. The depth log, if stored, is the index; otherwise the index is
 * rebuilt from start_md_m and step_m, and without either the samples are
 * indexed by position.
 *
 * @param {{ well: {id, name}, logs: object[], samples: Record<string, Float32Array>,
 *           wellNames?: string[] }} p
 */
export function datasetFromWellLogs({ well, logs, samples, wellNames = [] }) {
  const notes = [];
  const depthLog = logs.find((l) => INDEX_MNEMONICS.includes(baseName(l.mnemonic)));
  const valueLogs = logs.filter((l) => l !== depthLog);
  const n = valueLogs.reduce((a, l) => Math.max(a, samples[l.id]?.length ?? 0), depthLog ? (samples[depthLog.id]?.length ?? 0) : 0);
  let index = null;
  if (depthLog && samples[depthLog.id]) {
    index = { name: depthLog.mnemonic, unit: depthLog.unit || 'M', kind: 'depth', values: Array.from(samples[depthLog.id], toValue), labels: null };
  } else {
    const ref = valueLogs.find((l) => Number.isFinite(l.start_md_m) && Number.isFinite(l.step_m) && l.step_m > 0);
    if (ref) {
      index = {
        name: 'MD (from start and step)', unit: 'M', kind: 'depth',
        values: Array.from({ length: n }, (_, i) => ref.start_md_m + i * ref.step_m), labels: null,
      };
      notes.push('No depth curve was stored with these logs, so depth is rebuilt from the start depth and step in the registry.');
    }
  }
  const taken = new Set();
  const channels = valueLogs.filter((l) => samples[l.id]).map((l) => {
    const data = samples[l.id];
    const values = Array.from(data, toValue);
    const chNotes = [];
    if (values.length !== n) chNotes.push(`${values.length} samples against ${n} in the longest curve; the missing tail counts as missing.`);
    while (values.length < n) values.push(null);
    return { key: keyOf(l.mnemonic, taken), name: l.mnemonic, unit: l.unit || '', values, notes: chNotes, logId: l.id };
  });
  if (channels.length) notes.push('Registry curves are stored as 32-bit floats, so a value typed as 2.0969 reads back as 2.0968999862. Checks run on the stored values.');
  return {
    source: 'wells',
    label: `${well.name}: ${channels.map((c) => c.name).join(', ')}`,
    ref: { wellId: well.id, wellName: well.name, logIds: logs.map((l) => l.id) },
    index,
    channels,
    identifiers: wellNames.length ? { name: 'Well names in the registry', values: wellNames.slice(), note: 'every well you can see in the registry' } : null,
    notes,
  };
}

export const PRODUCTION_COLUMNS = [
  { col: 'oil_stb', name: 'oil_stb', unit: 'stb/d' },
  { col: 'water_stb', name: 'water_stb', unit: 'stb/d' },
  { col: 'gas_mscf', name: 'gas_mscf', unit: 'Mscf/d' },
  { col: 'winj_stb', name: 'winj_stb', unit: 'stb/d' },
  { col: 'ginj_mscf', name: 'ginj_mscf', unit: 'Mscf/d' },
  { col: 'hours_on', name: 'hours_on', unit: 'h' },
];

/**
 * One well's production spine rows (getDailyProduction) to a dataset indexed
 * by date. A column that is empty on every row is left out.
 *
 * @param {{ field: {id, name}, well: {id, name}, rows: object[], fieldWellNames?: string[] }} p
 */
export function datasetFromProduction({ field, well, rows, fieldWellNames = [] }) {
  const sorted = rows.slice().sort((a, b) => String(a.prod_date).localeCompare(String(b.prod_date)));
  const days = sorted.map((r) => dayNumber(r.prod_date));
  const taken = new Set();
  const channels = PRODUCTION_COLUMNS
    .filter(({ col }) => sorted.some((r) => r[col] !== null && r[col] !== undefined))
    .map(({ col, name, unit }) => ({
      key: keyOf(name, taken), name, unit,
      values: sorted.map((r) => (r[col] === null || r[col] === undefined || r[col] === '' ? null : toValue(Number(r[col])))),
      notes: [],
    }));
  return {
    source: 'production',
    label: `${well.name} (${field.name}): ${sorted.length} rows`,
    ref: { fieldId: field.id, fieldName: field.name, wellId: well.id, wellName: well.name },
    index: { name: 'prod_date', unit: 'day', kind: 'time', values: days, labels: sorted.map((r) => String(r.prod_date).slice(0, 10)) },
    channels,
    identifiers: fieldWellNames.length ? { name: `Well names in ${field.name}`, values: fieldWellNames.slice(), note: 'the production wells of this field' } : null,
    notes: ['The spine stores one volume per well per day (stb/d, Mscf/d). A monthly file imported to it has one row a month, so its date steps are 28 to 31 days.'],
  };
}

const NULL_TOKENS = new Set(['', 'NA', 'N/A', 'NAN', 'NULL', 'NONE', '-']);

/** One cell to a number, missing, or unreadable. */
export const readCell = (raw, extraNulls = []) => {
  const s = String(raw ?? '').trim();
  if (NULL_TOKENS.has(s.toUpperCase()) || extraNulls.includes(s)) return { value: null };
  const v = Number(s.replace(/,(?=\d{3}\b)/g, ''));
  if (Number.isFinite(v)) return { value: v };
  return { value: null, unreadable: true };
};

/**
 * Column profile of a parsed table: which columns read as numbers, which as
 * dates, so the picker can offer sensible roles. Nothing is decided here.
 */
export function describeColumns(table) {
  const header = table.header || (table.rows[0] || []).map((_, i) => `Column ${i + 1}`);
  return header.map((name, c) => {
    let numeric = 0;
    let dates = 0;
    let filled = 0;
    table.rows.forEach((r) => {
      const s = String(r[c] ?? '').trim();
      if (!s) return;
      filled += 1;
      if (dayNumber(s) !== null) dates += 1;
      else if (Number.isFinite(Number(s))) numeric += 1;
    });
    const kind = filled && dates / filled >= 0.9 ? 'date' : filled && numeric / filled >= 0.5 ? 'number' : 'text';
    return { index: c, name: String(name), kind, filled };
  });
}

/**
 * A parsed table (tabularFile's { header, rows }) to a dataset.
 *
 * @param {{header: string[]|null, rows: string[][]}} table
 * @param {{ label?: string, indexColumn?: number|null, idColumn?: number|null,
 *           filterValue?: string, channelColumns: number[], nullValues?: string[],
 *           idMode?: 'distinct'|'rows', units?: Record<number, string> }} opts
 */
export function datasetFromTable(table, opts) {
  const {
    label = 'Uploaded table', indexColumn = null, idColumn = null, filterValue = '',
    channelColumns = [], nullValues = [], idMode = 'distinct', units = {},
  } = opts || {};
  const cols = describeColumns(table);
  const rows = (idColumn !== null && idColumn !== undefined && filterValue !== '')
    ? table.rows.filter((r) => String(r[idColumn] ?? '').trim() === filterValue)
    : table.rows;
  const notes = [];
  if (rows !== table.rows) notes.push(`${rows.length} of ${table.rows.length} rows, where ${cols[idColumn].name} is ${filterValue}.`);

  let index = null;
  if (indexColumn !== null && indexColumn !== undefined) {
    const col = cols[indexColumn];
    if (col.kind === 'date') {
      const values = rows.map((r) => dayNumber(r[indexColumn]));
      index = { name: col.name, unit: 'day', kind: 'time', values, labels: rows.map((r) => String(r[indexColumn] ?? '').trim().slice(0, 10)) };
    } else {
      const values = rows.map((r) => readCell(r[indexColumn], nullValues).value);
      index = { name: col.name, unit: units[indexColumn] || '', kind: 'number', values, labels: null };
    }
  }

  const taken = new Set();
  const channels = channelColumns.map((c) => {
    let unreadable = 0;
    const values = rows.map((r) => {
      const cell = readCell(r[c], nullValues);
      if (cell.unreadable) unreadable += 1;
      return cell.value;
    });
    const chNotes = unreadable ? [`${unreadable} cell${unreadable === 1 ? '' : 's'} could not be read as a number and ${unreadable === 1 ? 'is' : 'are'} treated as missing.`] : [];
    return { key: keyOf(cols[c].name, taken), name: cols[c].name, unit: units[c] || '', values, notes: chNotes, column: c };
  });

  let identifiers = null;
  if (idColumn !== null && idColumn !== undefined) {
    const raw = table.rows.map((r) => String(r[idColumn] ?? '').trim()).filter((s) => s !== '');
    const values = idMode === 'rows' ? raw : [...new Set(raw)];
    identifiers = {
      name: cols[idColumn].name,
      values,
      note: idMode === 'rows'
        ? 'every row, so each value should appear once'
        : 'the distinct values of the column, so a repeat on every row of the same well is expected and only different spellings are found',
    };
  }

  return {
    source: 'upload',
    label,
    ref: { indexColumn, idColumn, filterValue, channelColumns, nullValues, idMode },
    index,
    channels,
    identifiers,
    notes,
  };
}

/** Columns and rows of a dataset kept for a saved upload run (numbers only). */
export const MAX_SAVED_UPLOAD_VALUES = 60000;

export function snapshotDataset(ds) {
  const count = ds.channels.reduce((a, c) => a + c.values.length, 0) + (ds.index?.values.length || 0);
  if (count > MAX_SAVED_UPLOAD_VALUES) return null;
  return {
    label: ds.label,
    index: ds.index,
    channels: ds.channels.map(({ key, name, unit, values, notes }) => ({ key, name, unit, values, notes })),
    identifiers: ds.identifiers,
    notes: ds.notes,
  };
}

export function datasetFromSnapshot(snap, ref = {}) {
  if (!snap || !Array.isArray(snap.channels)) return null;
  return { source: 'upload', label: snap.label, ref, index: snap.index || null, channels: snap.channels, identifiers: snap.identifiers || null, notes: snap.notes || [] };
}
