// Electrofacies Studio (Data & AI D3): the table, the core facies and the
// design matrix.
//
// The table is the ML Workbench's (mlData.js): well log curves from the
// wells registry joined sample by sample, one block of rows per well, or an
// uploaded CSV, TSV or Excel sheet with a column naming the well of each
// row. This file adds the CORE FACIES, the labels the clusters are compared
// with and the supervised methods learn from, from one of three places:
//
//   curve      a facies code curve among the loaded curves (numbers);
//   intervals  the wells registry's interval logs (geo_wells_intervals) of
//              one kind, such as facies or core_description: a sample at
//              depth d takes the code of the interval with top <= d < base;
//   column     a column of the uploaded table (text, or numbers when every
//              filled cell reads as a number).
//
// buildFaciesDesign turns a table and a spec into the engine's inputs: the
// feature matrix X (rows of finite numbers) and, beside it, the core facies
// of every row (null where the row has none). Every row it drops is counted
// with its reason; nothing is filled in. No number here is a model result:
// those all come from the vendored engine
// (packages/engines/engines/dataai/cluster.js) in faciesWorkflows.js.
import { readCell, describeColumns } from '@/utils/dataAi/qcDatasets';
import { baseName, ordinal } from '@/utils/dataAi/mlData';

/** Rows the studio clusters and classifies at most. */
export const MAX_ROWS = 100000;
/** Training rows kNN accepts (it measures every training row from every row it classifies). */
export const MAX_KNN_TRAIN_ROWS = 10000;
/** Rows the elbow runs k-means on: a seeded sample above this. */
export const ELBOW_SAMPLE_ROWS = 10000;
/** The engine's own caps, restated for the screens (the engine enforces them). */
export const SILHOUETTE_MAX_ROWS = 10000;
export const AGGLOMERATIVE_MAX_ROWS = 3000;

export const ROW_CAP_BASIS = [
  `The studio works on at most ${MAX_ROWS.toLocaleString('en-US')} rows. The engine's measured timings (Node 18, one host, four logs) put k-means with 10 starts at about 1.6 s on 50,000 rows and a CART tree at about 0.3 s, so a run at the cap stays within a few seconds in the background worker.`,
  `The silhouette is computed in full up to ${SILHOUETTE_MAX_ROWS.toLocaleString('en-US')} rows (every pair of rows, about 0.45 s at the cap). Above that the studio scores a seeded sample of ${SILHOUETTE_MAX_ROWS.toLocaleString('en-US')} rows, drawn by the engine's rule, and says so.`,
  `The elbow runs k-means once per k. Above ${ELBOW_SAMPLE_ROWS.toLocaleString('en-US')} rows it runs on a seeded sample of ${ELBOW_SAMPLE_ROWS.toLocaleString('en-US')} rows (the same rule), shown with a progress count.`,
  `Agglomerative clustering holds every pairwise distance, so the engine refuses above ${AGGLOMERATIVE_MAX_ROWS.toLocaleString('en-US')} rows. The studio shows that refusal as the engine wrote it, and offers a seeded sample of ${AGGLOMERATIVE_MAX_ROWS.toLocaleString('en-US')} rows instead; the labels then cover the sampled rows only.`,
  `kNN measures the distance from every row it classifies to every training row. The studio takes at most ${MAX_KNN_TRAIN_ROWS.toLocaleString('en-US')} training rows and classifies in batches that stay inside the engine's limit of 100,000,000 distance pairs per call.`,
  'Above a cap the studio refuses and says by how much. Narrow the depth window or keep every second (or nth) sample; neighbouring log samples are strongly correlated, so thinning loses little.',
];

export const FACIES_SOURCES = ['none', 'curve', 'intervals', 'column'];

/** Interval kinds that can carry core facies, in the order offered. */
export const FACIES_INTERVAL_KINDS = ['facies', 'core_description', 'lithology', 'electrofacies'];

const toLabel = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  return s ? s : null;
};

/**
 * Registry intervals (geo_wells_intervals rows) to the compact shape a
 * table keeps: { kind, top, base, code }. The code is the interval's code,
 * or its label when the code is blank.
 */
export function compactIntervals(rows = []) {
  return rows
    .map((r) => ({
      kind: r.kind,
      top: Number(r.top_md_m),
      base: Number(r.base_md_m),
      code: toLabel(r.code) ?? toLabel(r.label),
    }))
    .filter((r) => Number.isFinite(r.top) && Number.isFinite(r.base) && r.base > r.top && r.code !== null);
}

/**
 * The code of the interval holding depth d (top <= d < base), or null.
 * Intervals are searched in order; the first that holds d wins.
 */
export function faciesAtDepth(intervals, d) {
  if (d === null || d === undefined || !Number.isFinite(d)) return null;
  for (const r of intervals) if (r.top <= d && d < r.base) return r.code;
  return null;
}

/** The interval kinds present in a table's wells, with the wells holding each. */
export function intervalKinds(table) {
  const out = new Map();
  Object.entries(table?.intervals || {}).forEach(([well, rows]) => {
    rows.forEach((r) => {
      if (!out.has(r.kind)) out.set(r.kind, new Set());
      out.get(r.kind).add(well);
    });
  });
  return [...out.entries()]
    .map(([kind, wells]) => ({ kind, wells: [...wells] }))
    .sort((a, b) => {
      const ia = FACIES_INTERVAL_KINDS.indexOf(a.kind);
      const ib = FACIES_INTERVAL_KINDS.indexOf(b.kind);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.kind.localeCompare(b.kind);
    });
}

/**
 * A parsed table (tabularFile's { header, rows }) to a table. groupColumn
 * names the well of each row; depthColumn and faciesColumn are optional.
 * A facies column is read as numbers when every filled cell is a number,
 * else as trimmed text.
 */
export function faciesTableFromUpload(parsed, {
  label = 'Uploaded table', groupColumn, depthColumn = null, valueColumns = [], faciesColumn = null, nullValues = [], depthUnit = '',
} = {}) {
  const cols = describeColumns(parsed);
  if (groupColumn === null || groupColumn === undefined || !cols[groupColumn]) throw new Error('Choose the column that names the well of each row.');
  if (!valueColumns.length) throw new Error('Choose at least one log column.');
  if (faciesColumn !== null && valueColumns.includes(faciesColumn)) throw new Error('The core facies column is also chosen as a log; clear it from the logs.');
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
  let facies = null;
  let faciesName = null;
  if (faciesColumn !== null && faciesColumn !== undefined) {
    if (!cols[faciesColumn]) throw new Error('The core facies column is not in the file.');
    faciesName = cols[faciesColumn].name;
    const raw = rows.map((r) => {
      const s = String(r[faciesColumn] ?? '').trim();
      return s === '' || nullValues.includes(s) ? null : s;
    });
    const filled = raw.filter((s) => s !== null);
    const numeric = filled.length > 0 && filled.every((s) => Number.isFinite(Number(s)));
    facies = raw.map((s) => (s === null ? null : (numeric ? Number(s) : s)));
    notes.push(`Core facies from the column ${faciesName}, read as ${numeric ? 'numbers' : 'text'}; ${filled.length.toLocaleString('en-US')} of ${raw.length.toLocaleString('en-US')} rows have one.`);
  }
  const order = [];
  const counts = new Map();
  group.forEach((g) => { if (!counts.has(g)) order.push(g); counts.set(g, (counts.get(g) || 0) + 1); });
  return {
    source: 'upload',
    label,
    ref: { groupColumn, depthColumn, valueColumns, faciesColumn, nullValues, depthUnit },
    wells: order.map((g) => ({ id: null, name: g, rows: counts.get(g) })),
    group,
    depth,
    depthUnit,
    columns,
    units,
    facies,
    faciesName,
    intervals: null,
    notes,
  };
}

/** Values kept in a saved run for an uploaded table (numbers and labels). */
export const MAX_SAVED_UPLOAD_VALUES = 200000;

export function snapshotFaciesTable(t) {
  const count = Object.values(t.columns).reduce((a, c) => a + c.length, 0) + (t.depth ? t.depth.length : 0) + (t.facies ? t.facies.length : 0);
  if (count > MAX_SAVED_UPLOAD_VALUES) return null;
  return {
    label: t.label, wells: t.wells, group: t.group, depth: t.depth, depthUnit: t.depthUnit, columns: t.columns, units: t.units, facies: t.facies || null, faciesName: t.faciesName || null, notes: t.notes,
  };
}

export function faciesTableFromSnapshot(snap, ref = {}) {
  if (!snap || !snap.columns || !Array.isArray(snap.group)) return null;
  return {
    source: 'upload',
    label: snap.label,
    ref,
    wells: snap.wells || [],
    group: snap.group,
    depth: snap.depth || null,
    depthUnit: snap.depthUnit || '',
    columns: snap.columns,
    units: snap.units || {},
    facies: snap.facies || null,
    faciesName: snap.faciesName || null,
    intervals: null,
    notes: snap.notes || [],
  };
}

/** Engine feature name for a feature choice. */
export const featureName = (f) => (f.log ? `log10(${f.name})` : f.name);

const parseNumber = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/**
 * The core facies of every table row under the spec's facies source, or
 * { error }. Returns { labels, text } where labels[i] is a label or null.
 */
export function coreFacies(table, facies = {}) {
  const n = table.group.length;
  const src = facies.source || 'none';
  if (src === 'none') return { labels: null, text: 'none' };
  if (src === 'curve') {
    const c = table.columns[facies.curve];
    if (!c) return { error: 'Choose the curve that holds the core facies codes.' };
    return { labels: c.map((v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v)), text: `the curve ${facies.curve}` };
  }
  if (src === 'column') {
    if (!table.facies) return { error: 'This table has no core facies column. Choose one when you upload the file.' };
    return { labels: table.facies.slice(), text: `the column ${table.faciesName || 'chosen at upload'}` };
  }
  if (src === 'intervals') {
    if (!table.intervals) return { error: 'Interval logs come from the wells registry; this table has none.' };
    if (!facies.kind) return { error: 'Choose the interval kind that holds the core facies.' };
    if (!table.depth) return { error: 'This data has no depth, so intervals cannot be placed on its samples.' };
    const byWell = {};
    Object.entries(table.intervals).forEach(([w, rows]) => { byWell[w] = rows.filter((r) => r.kind === facies.kind); });
    const labels = new Array(n);
    for (let i = 0; i < n; i += 1) labels[i] = faciesAtDepth(byWell[table.group[i]] || [], table.depth[i]);
    return { labels, text: `the ${facies.kind} intervals (a sample takes the interval with top <= depth < base)` };
  }
  return { error: `Unknown core facies source ${src}.` };
}

/**
 * The engine's inputs from a table and a spec. Refusals are returned as
 * { error } with the exact condition; a successful build lists every row it
 * dropped and why.
 *
 * spec: { features: [{ name, log }], depthMin, depthMax, every, facies }
 * Row order is the table's; sample thinning keeps entry 0 of each well and
 * every nth after it (entries counted from 0). A row needs every feature;
 * its core facies may be missing (null), and such rows are clustered and
 * classified but take no part in a comparison with the core.
 */
export function buildFaciesDesign(table, spec, { maxRows = MAX_ROWS } = {}) {
  if (!table) return { error: 'Load data first.' };
  const cols = table.columns;
  const features = (spec.features || []).filter((f) => f && f.name);
  if (!features.length) return { error: 'Choose at least one log to cluster on.' };
  const missingCol = features.find((f) => !cols[f.name]);
  if (missingCol) return { error: `Log ${missingCol.name} is not in the loaded data.` };
  const names = features.map(featureName);
  if (new Set(names).size !== names.length) return { error: 'A log is chosen twice.' };
  const fac = coreFacies(table, spec.facies);
  if (fac.error) return { error: fac.error };
  if (spec.facies?.source === 'curve' && features.some((f) => f.name === spec.facies.curve)) {
    return { error: `The core facies curve ${spec.facies.curve} is also chosen as a log; clear it from the logs.` };
  }
  const dMin = parseNumber(spec.depthMin);
  const dMax = parseNumber(spec.depthMax);
  if (dMin !== null && dMax !== null && !(dMin < dMax)) return { error: 'The top of the depth window must be above its base (top < base).' };
  if ((dMin !== null || dMax !== null) && !table.depth) return { error: 'This data has no depth, so a depth window cannot be applied.' };
  const every = spec.every === undefined || spec.every === '' ? 1 : Number(spec.every);
  if (!Number.isInteger(every) || every < 1) return { error: 'Keep every nth sample: n must be a whole number, 1 or more.' };

  const counts = {
    total: table.group.length, outsideWindow: 0, thinned: 0, missing: 0, nonPositiveLog: 0,
  };
  const X = [];
  const groups = [];
  const depth = [];
  const rows = [];
  const facies = [];
  const entryInWell = new Map();
  for (let i = 0; i < table.group.length; i += 1) {
    const g = table.group[i];
    const entry = entryInWell.get(g) ?? 0;
    entryInWell.set(g, entry + 1);
    const d = table.depth ? table.depth[i] : null;
    if ((dMin !== null && !(d !== null && d >= dMin)) || (dMax !== null && !(d !== null && d <= dMax))) { counts.outsideWindow += 1; continue; }
    if (entry % every !== 0) { counts.thinned += 1; continue; }
    const row = [];
    let skip = null;
    for (const f of features) {
      const v = cols[f.name][i];
      if (v === null || v === undefined || !Number.isFinite(v)) { skip = 'missing'; break; }
      if (f.log) {
        if (!(v > 0)) { skip = 'log'; break; }
        row.push(Math.log10(v));
      } else row.push(v);
    }
    if (skip === 'missing') { counts.missing += 1; continue; }
    if (skip === 'log') { counts.nonPositiveLog += 1; continue; }
    X.push(row);
    groups.push(g);
    depth.push(d);
    rows.push(i);
    facies.push(fac.labels ? fac.labels[i] : null);
  }
  if (!X.length) return { error: 'No row has every chosen log present in the window chosen.', counts };
  if (X.length > maxRows) {
    return {
      error: `${X.length.toLocaleString('en-US')} rows are more than the ${maxRows.toLocaleString('en-US')} the studio works on. Narrow the depth window, or keep every ${ordinal(Math.max(2, every * Math.ceil(X.length / maxRows)))} sample.`,
      counts,
    };
  }
  const perWell = [];
  const seen = new Map();
  groups.forEach((g, j) => {
    if (!seen.has(g)) { seen.set(g, perWell.length); perWell.push({ name: g, rows: 0, cored: 0 }); }
    const w = perWell[seen.get(g)];
    w.rows += 1;
    if (facies[j] !== null) w.cored += 1;
  });
  const labelled = [];
  facies.forEach((f, j) => { if (f !== null) labelled.push(j); });
  const classes = [...new Set(labelled.map((j) => facies[j]))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    X,
    groups,
    depth,
    rows,
    names,
    counts,
    wells: perWell,
    features: features.map((f) => ({ name: f.name, log: !!f.log })),
    facies: fac.labels ? facies : null,
    faciesText: fac.text,
    labelled,
    classes,
  };
}

/** The table row where each well's block starts (wells in table order). */
export function wellStarts(table) {
  const out = {};
  let at = 0;
  (table?.wells || []).forEach((w) => { out[w.name] = at; at += w.rows; });
  return out;
}
