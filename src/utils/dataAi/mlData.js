// ML Workbench (Data & AI D2): the data table and the design matrix.
//
// Two sources, each turned into one table shape:
//
//   wells    well log curves from the shared wells registry
//            (src/lib/wellsRegistry.js, the Well Data Manager's store), one
//            block of rows per well, curves joined sample by sample.
//   upload   a CSV, TSV or Excel sheet read by src/lib/tabularFile.js, with
//            a column naming the well (the group) of every row.
//
// Table shape:
//   { source, label, ref,
//     wells: [{ id, name, rows }],          in row order
//     group: string[]                       the well name of every row
//     depth: (number|null)[] | null         depth of every row, if known
//     depthUnit: string
//     columns: { NAME: (number|null)[] }    one entry per curve or column
//     units: { NAME: string }
//     notes: string[] }
//
// buildDesign turns a table and a model spec into the engine's inputs: the
// feature matrix X (rows of finite numbers), the target y and the groups.
// Every row it drops is counted with its reason; nothing is filled in.
// No number here is a model result: those all come from the vendored engine
// (packages/engines/engines/dataai/ml.js) in mlWorkflows.js.
import { readCell, describeColumns } from '@/utils/dataAi/qcDatasets';

/** Rows the studio fits on at most (engine timings, FINDINGS-ml.md). */
export const MAX_FIT_ROWS = 150000;
/** Held-out rows permutation importance scores at most. */
export const MAX_IMPORTANCE_ROWS = 50000;

export const ROW_CAP_BASIS = [
  `Fits use at most ${MAX_FIT_ROWS.toLocaleString('en-US')} rows. The engine's measured timings (Node 18, one host) put one OLS fit on 200,000 rows and 8 features at about 1 s and one logistic fit at about 2 s, or 5 to 6 s when the label is separated. Group k-fold multiplies that by the number of folds, so the cap keeps a five-fold run under about half a minute.`,
  `Permutation importance scores at most ${MAX_IMPORTANCE_ROWS.toLocaleString('en-US')} held-out rows. It re-scores the model once per feature and repeat, and with AUC every re-scoring sorts the rows: at 200,000 rows and 8 features the engine took about 10 s, at 50,000 rows about 2.3 s.`,
  'Above a cap the studio refuses and says by how much. Narrow the depth window or keep every second (or nth) sample; neighbouring log samples are strongly correlated, so thinning loses little.',
];

export const baseName = (name) => String(name ?? '').trim().toUpperCase().split(':')[0].replace(/\s+/g, '_');

const DEPTH_MNEMONICS = ['DEPT', 'DEPTH', 'MD'];
export const isDepthLog = (log) => DEPTH_MNEMONICS.includes(baseName(log.mnemonic));

const toValue = (v) => (Number.isFinite(v) ? v : null);

/**
 * One well's registry logs to a block of rows. Curves are joined sample by
 * sample, so every chosen curve must share the depth curve's sample count;
 * a curve on another grid is refused by name rather than shifted.
 *
 * @param {{ well: {id, name}, logs: object[], samples: Record<string, Float32Array> }} p
 * @returns {{ block } | { error }}
 */
export function wellBlock({ well, logs, samples }) {
  const depthLog = logs.find(isDepthLog);
  const notes = [];
  const curves = {};
  const units = {};
  const logIds = {};
  let n = null;
  let depth = null;
  if (depthLog && samples[depthLog.id]) {
    depth = Array.from(samples[depthLog.id], toValue);
    n = depth.length;
  }
  for (const log of logs) {
    if (log === depthLog || !samples[log.id]) continue;
    const name = baseName(log.mnemonic);
    if (curves[name]) { notes.push(`${well.name} has more than one ${name} curve; the first stored one is used.`); continue; }
    const values = Array.from(samples[log.id], toValue);
    if (n === null) n = values.length;
    if (values.length !== n) {
      return {
        error: `${well.name}: ${name} has ${values.length} samples and ${depthLog ? depthLog.mnemonic : 'the first curve'} has ${n}. The workbench joins curves sample by sample, so every curve of a well must be on one depth grid; resample it in the Well Data Manager first.`,
      };
    }
    curves[name] = values;
    units[name] = log.unit || '';
    logIds[name] = log.id;
  }
  if (!depth && n !== null) {
    const ref = logs.find((l) => !isDepthLog(l) && Number.isFinite(l.start_md_m) && Number.isFinite(l.step_m) && l.step_m > 0);
    if (ref) {
      depth = Array.from({ length: n }, (_, i) => ref.start_md_m + i * ref.step_m);
      notes.push(`${well.name}: no depth curve is stored, so depth is rebuilt from the start depth and step in the registry.`);
    }
  }
  const first = logs.find((l) => !isDepthLog(l) && Number.isFinite(l.step_m));
  return {
    block: {
      well: { id: well.id, name: well.name }, n: n || 0, depth, curves, units, logIds, notes,
      grid: {
        startMdM: depth && depth.length ? depth[0] : (first?.start_md_m ?? null),
        stopMdM: depth && depth.length ? depth[depth.length - 1] : (first?.stop_md_m ?? null),
        stepM: depthLog?.step_m ?? first?.step_m ?? null,
      },
      depthLogId: depthLog?.id || null,
    },
  };
}

/** Well blocks (wellBlock) to one table, wells in the order given. */
export function tableFromBlocks(blocks, { label } = {}) {
  const names = [...new Set(blocks.flatMap((b) => Object.keys(b.curves)))].sort();
  const columns = {};
  const units = {};
  names.forEach((c) => { columns[c] = []; });
  const group = [];
  const depth = [];
  const notes = [];
  const wells = [];
  blocks.forEach((b) => {
    wells.push({ id: b.well.id, name: b.well.name, rows: b.n });
    for (let i = 0; i < b.n; i += 1) {
      group.push(b.well.name);
      depth.push(b.depth ? b.depth[i] : null);
      names.forEach((c) => columns[c].push(b.curves[c] ? b.curves[c][i] : null));
    }
    names.forEach((c) => { if (b.units[c] && !units[c]) units[c] = b.units[c]; });
    notes.push(...b.notes);
    const missing = names.filter((c) => !b.curves[c]);
    if (missing.length) notes.push(`${b.well.name} has no ${missing.join(', ')}; its rows count as missing there.`);
  });
  if (blocks.length) notes.push('Registry curves are stored as 32-bit floats; fits run on the stored values.');
  return {
    source: 'wells',
    label: label || `${blocks.length} wells: ${blocks.map((b) => b.well.name).join(', ')}`,
    ref: { wellIds: blocks.map((b) => b.well.id), wellNames: blocks.map((b) => b.well.name) },
    wells,
    group,
    depth,
    depthUnit: 'm',
    columns,
    units,
    notes,
  };
}

/**
 * A parsed table (tabularFile's { header, rows }) to a table. groupColumn
 * names the well of each row; depthColumn is optional.
 */
export function tableFromUpload(parsed, {
  label = 'Uploaded table', groupColumn, depthColumn = null, valueColumns = [], nullValues = [], depthUnit = '',
} = {}) {
  const cols = describeColumns(parsed);
  if (groupColumn === null || groupColumn === undefined || !cols[groupColumn]) throw new Error('Choose the column that names the well of each row.');
  if (!valueColumns.length) throw new Error('Choose at least two number columns: a target and a feature.');
  const notes = [];
  const rows = parsed.rows.filter((r) => String(r[groupColumn] ?? '').trim() !== '');
  if (rows.length < parsed.rows.length) notes.push(`${parsed.rows.length - rows.length} rows with no well name are left out.`);
  const group = rows.map((r) => String(r[groupColumn]).trim());
  const depth = depthColumn === null || depthColumn === undefined ? null : rows.map((r) => readCell(r[depthColumn], nullValues).value);
  const columns = {};
  const units = {};
  valueColumns.forEach((c) => {
    const name = baseName(cols[c].name) || `COLUMN_${c + 1}`;
    if (columns[name]) throw new Error(`Two chosen columns read as ${name}; rename one in the file.`);
    let unreadable = 0;
    columns[name] = rows.map((r) => {
      const cell = readCell(r[c], nullValues);
      if (cell.unreadable) unreadable += 1;
      return cell.value;
    });
    units[name] = '';
    if (unreadable) notes.push(`${name}: ${unreadable} cell${unreadable === 1 ? '' : 's'} could not be read as a number and count as missing.`);
  });
  const order = [];
  const counts = new Map();
  group.forEach((g) => { if (!counts.has(g)) order.push(g); counts.set(g, (counts.get(g) || 0) + 1); });
  return {
    source: 'upload',
    label,
    ref: { groupColumn, depthColumn, valueColumns, nullValues, depthUnit },
    wells: order.map((g) => ({ id: null, name: g, rows: counts.get(g) })),
    group,
    depth,
    depthUnit,
    columns,
    units,
    notes,
  };
}

/** Values kept in a saved run for an uploaded table (numbers and names). */
export const MAX_SAVED_UPLOAD_VALUES = 200000;

export function snapshotTable(t) {
  const count = Object.values(t.columns).reduce((a, c) => a + c.length, 0) + (t.depth ? t.depth.length : 0);
  if (count > MAX_SAVED_UPLOAD_VALUES) return null;
  return { label: t.label, wells: t.wells, group: t.group, depth: t.depth, depthUnit: t.depthUnit, columns: t.columns, units: t.units, notes: t.notes };
}

export function tableFromSnapshot(snap, ref = {}) {
  if (!snap || !snap.columns || !Array.isArray(snap.group)) return null;
  return {
    source: 'upload', label: snap.label, ref, wells: snap.wells || [], group: snap.group, depth: snap.depth || null,
    depthUnit: snap.depthUnit || '', columns: snap.columns, units: snap.units || {}, notes: snap.notes || [],
  };
}

export const curveNames = (table) => (table ? Object.keys(table.columns) : []);

/** Engine feature name for a feature choice. */
export const featureName = (f) => (f.log ? `log10(${f.name})` : f.name);

export const LABEL_OPS = ['>', '>=', '<', '<='];
const compare = (v, op, c) => (op === '>' ? v > c : op === '>=' ? v >= c : op === '<' ? v < c : v <= c);

/** The label rule in words, for screens and exports. */
export function labelRuleText(label) {
  if (!label) return '';
  if (label.mode === 'column') return `class 1 where ${label.column} is 1, class 0 where it is 0`;
  return `class 1 where ${label.curve} ${label.op} ${label.cutoff}, class 0 otherwise`;
}

/** 2 -> 2nd, 3 -> 3rd, 4 -> 4th, 11 -> 11th, 21 -> 21st. */
export const ordinal = (k) => {
  const t = k % 100;
  if (t >= 11 && t <= 13) return `${k}th`;
  return `${k}${({ 1: 'st', 2: 'nd', 3: 'rd' })[k % 10] || 'th'}`;
};

const parseNumber = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/**
 * The engine's inputs from a table and a spec. Refusals are returned as
 * { error } with the exact condition; a successful build lists every row it
 * dropped and why.
 *
 * spec: { task: 'regression'|'classification', target, features: [{ name, log }],
 *         label: { mode: 'cutoff', curve, op, cutoff } | { mode: 'column', column },
 *         depthMin, depthMax, every }
 * Row order is the table's; sample thinning keeps entry 0 of each well and
 * every nth after it (entries counted from 0).
 */
export function buildDesign(table, spec, { maxRows = MAX_FIT_ROWS } = {}) {
  if (!table) return { error: 'Load data first.' };
  const cols = table.columns;
  const features = (spec.features || []).filter((f) => f && f.name);
  if (!features.length) return { error: 'Choose at least one feature.' };
  const missingCol = features.find((f) => !cols[f.name]);
  if (missingCol) return { error: `Feature ${missingCol.name} is not in the loaded data.` };
  const names = features.map(featureName);
  if (new Set(names).size !== names.length) return { error: 'A feature is chosen twice.' };
  let yOf;
  let targetText;
  if (spec.task === 'classification') {
    const lab = spec.label || {};
    if (lab.mode === 'column') {
      if (!cols[lab.column]) return { error: 'Choose the label column.' };
      if (features.some((f) => f.name === lab.column)) return { error: `The label column ${lab.column} is also a feature; remove it from the features.` };
      yOf = (i) => cols[lab.column][i];
      targetText = lab.column;
    } else {
      if (!cols[lab.curve]) return { error: 'Choose the curve the label is cut from.' };
      if (!LABEL_OPS.includes(lab.op)) return { error: 'Choose a comparison for the cutoff.' };
      const c = parseNumber(lab.cutoff);
      if (c === null) return { error: 'The cutoff must be a number.' };
      yOf = (i) => { const v = cols[lab.curve][i]; return v === null ? null : (compare(v, lab.op, c) ? 1 : 0); };
      targetText = `${lab.curve} ${lab.op} ${c}`;
    }
  } else {
    if (!cols[spec.target]) return { error: 'Choose a target curve.' };
    if (features.some((f) => f.name === spec.target)) return { error: `The target ${spec.target} is also a feature; remove it from the features.` };
    yOf = (i) => cols[spec.target][i];
    targetText = spec.target;
  }
  const dMin = parseNumber(spec.depthMin);
  const dMax = parseNumber(spec.depthMax);
  if (dMin !== null && dMax !== null && !(dMin < dMax)) return { error: 'The top of the depth window must be above its base (top < base).' };
  if ((dMin !== null || dMax !== null) && !table.depth) return { error: 'This data has no depth, so a depth window cannot be applied.' };
  const every = spec.every === undefined || spec.every === '' ? 1 : Number(spec.every);
  if (!Number.isInteger(every) || every < 1) return { error: 'Keep every nth sample: n must be a whole number, 1 or more.' };

  const counts = {
    total: table.group.length, outsideWindow: 0, thinned: 0, missing: 0, nonPositiveLog: 0, badLabel: 0,
  };
  const X = [];
  const y = [];
  const groups = [];
  const depth = [];
  const rows = [];
  const entryInWell = new Map();
  for (let i = 0; i < table.group.length; i += 1) {
    const g = table.group[i];
    const entry = entryInWell.get(g) ?? 0;
    entryInWell.set(g, entry + 1);
    const d = table.depth ? table.depth[i] : null;
    if ((dMin !== null && !(d !== null && d >= dMin)) || (dMax !== null && !(d !== null && d <= dMax))) { counts.outsideWindow += 1; continue; }
    if (entry % every !== 0) { counts.thinned += 1; continue; }
    const t = yOf(i);
    if (t === null || t === undefined) { counts.missing += 1; continue; }
    if (spec.task === 'classification' && t !== 0 && t !== 1) { counts.badLabel += 1; continue; }
    const row = [];
    let skip = null;
    for (const f of features) {
      const v = cols[f.name][i];
      if (v === null || v === undefined) { skip = 'missing'; break; }
      if (f.log) {
        if (!(v > 0)) { skip = 'log'; break; }
        row.push(Math.log10(v));
      } else row.push(v);
    }
    if (skip === 'missing') { counts.missing += 1; continue; }
    if (skip === 'log') { counts.nonPositiveLog += 1; continue; }
    X.push(row);
    y.push(t);
    groups.push(g);
    depth.push(d);
    rows.push(i);
  }
  if (counts.badLabel) return { error: `The label column ${spec.label.column} holds ${counts.badLabel} values other than 0 and 1 (missing cells aside). Logistic regression here is binary: code the classes as 0 and 1.` };
  if (!X.length) return { error: 'No row has the target and every feature present in the window chosen.', counts };
  if (X.length > maxRows) {
    return {
      error: `${X.length.toLocaleString('en-US')} rows are more than the ${maxRows.toLocaleString('en-US')} the workbench fits on. Narrow the depth window, or keep every ${ordinal(Math.max(2, every * Math.ceil(X.length / maxRows)))} sample.`,
      counts,
    };
  }
  const perWell = [];
  const seen = new Map();
  groups.forEach((g) => { if (!seen.has(g)) { seen.set(g, perWell.length); perWell.push({ name: g, rows: 0 }); } perWell[seen.get(g)].rows += 1; });
  return {
    X, y, groups, depth, rows, names, targetText, counts, wells: perWell,
    features: features.map((f) => ({ name: f.name, log: !!f.log })),
  };
}

/**
 * Feature rows of ONE well of a table for prediction (no target needed).
 * Returns the full-length list of row positions so a predicted curve lines
 * up with the well's depth samples; rows with a missing or non-positive
 * (logged) feature get no prediction.
 */
export function predictionRows(block, features) {
  const X = [];
  const at = [];
  let skipped = 0;
  for (let i = 0; i < block.n; i += 1) {
    const row = [];
    let ok = true;
    for (const f of features) {
      const v = block.curves[f.name] ? block.curves[f.name][i] : null;
      if (v === null || v === undefined || (f.log && !(v > 0))) { ok = false; break; }
      row.push(f.log ? Math.log10(v) : v);
    }
    if (ok) { X.push(row); at.push(i); } else skipped += 1;
  }
  return { X, at, skipped, n: block.n };
}
