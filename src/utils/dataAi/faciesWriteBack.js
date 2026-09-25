// Electrofacies Studio (Data & AI D3): a facies log written back to a well.
//
// A result's labels on one registry well become a NEW curve in the wells
// registry, through the registry's own write path (wellsRegistry.saveLog,
// the one the ML Workbench and every Suite app publishing a computed curve
// use). A stored curve is never overwritten: saveLog only inserts and the
// mnemonic must differ from every curve the well already has.
//
// The curve holds a whole-number code per depth sample, NaN (the registry's
// null) where the result has no label (a sample outside the window, thinned,
// missing a log, or outside an agglomerative sample). The codes are:
//   clusters   the engine's cluster numbers, 0 to k - 1;
//   facies     the facies itself when the core facies are numbers, else
//              its position (from 0) in the sorted facies list.
// The legend travels in the provenance, with the method, its parameters,
// the seed, the scaling, the logs, the rows and wells it was fitted on, its
// scores against the core, the training-range check of the written well
// (rows whose logs lie outside the min and max of the training rows, per
// log) and the engine version and commit.
import { ENGINE_VERSION, ENGINE_COMMIT, methodText } from '@/utils/dataAi/faciesWorkflows';
import { wellStarts } from '@/utils/dataAi/faciesData';

export { mnemonicProblem, buildPredictedLog as buildFaciesLog } from '@/utils/dataAi/mlWriteBack';

export const DEFAULT_MNEMONICS = {
  kmeans: 'EFAC_KM', agglomerative: 'EFAC_AGG', knn: 'EFAC_KNN', cart: 'EFAC_CART',
};

/** The first free mnemonic stem, stem2, stem3, ... on a well. */
export function suggestFaciesMnemonic(key, existing = []) {
  const taken = new Set(existing.map((m) => String(m).trim().toUpperCase().split(':')[0]));
  const stem = DEFAULT_MNEMONICS[key] || 'EFAC';
  if (!taken.has(stem)) return stem;
  for (let k = 2; k < 1000; k += 1) if (!taken.has(`${stem}${k}`)) return `${stem}${k}`;
  return `${stem}${Date.now()}`;
}

const isClusterKey = (key) => key === 'kmeans' || key === 'agglomerative';

/**
 * The code of every label and the legend. Cluster numbers are their own
 * codes; numeric facies are their own codes; text facies are numbered from
 * 0 in sorted order.
 */
export function faciesCodes(key, labels, result) {
  const present = [...new Set(labels.filter((v) => v !== null && v !== undefined))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (isClusterKey(key)) {
    const mapping = result?.compare?.match && !result.compare.match.error ? result.compare.match.mapping : [];
    const legend = present.map((c) => {
      const m = mapping.find((x) => x.cluster === c);
      return { code: c, label: `cluster ${c}`, matchedFacies: m ? m.facies : null };
    });
    return { code: (v) => v, legend, kind: 'cluster' };
  }
  if (present.every((v) => typeof v === 'number')) {
    return { code: (v) => v, legend: present.map((v) => ({ code: v, label: String(v) })), kind: 'facies' };
  }
  const pos = new Map(present.map((v, i) => [v, i]));
  return { code: (v) => pos.get(v), legend: present.map((v, i) => ({ code: i, label: String(v) })), kind: 'facies' };
}

/**
 * One well's labelled samples: the block entries (0-based within the well)
 * and their labels, from the design rows of that well.
 */
export function wellLabels({ design, table, labels, wellName }) {
  const start = wellStarts(table)[wellName];
  const at = [];
  const values = [];
  if (start === undefined) return { at, values };
  for (let j = 0; j < design.X.length; j += 1) {
    if (design.groups[j] !== wellName) continue;
    const v = labels[j];
    if (v === null || v === undefined) continue;
    at.push(design.rows[j] - start);
    values.push(v);
  }
  return { at, values };
}

/**
 * The design rows a method's labels were fitted on:
 *   kmeans         every design row;
 *   agglomerative  the seeded sample when one was taken, else every row;
 *   knn, cart      every cored row (the final model the labels come from).
 */
export function trainingRowsOf(key, result, design) {
  const every = () => design.X.map((_, j) => j);
  if (key === 'kmeans') return { rows: every(), basis: 'every design row (k-means is fitted on all of them)' };
  if (key === 'agglomerative') {
    return Array.isArray(result?.rows) && result.rows.length
      ? { rows: result.rows, basis: `the seeded sample of ${result.rows.length} rows the tree was built on` }
      : { rows: every(), basis: 'every design row (the tree is built on all of them)' };
  }
  return { rows: design.labelled, basis: 'every cored row (the final model is trained on them)' };
}

/**
 * The training-range check of a write-back. For each input log, the min
 * and max over the training rows; then, over the rows of the written well
 * that carry a label, how many lie below that min or above that max (a
 * value equal to a bound is inside). A row counts once in rowsOutside when
 * any log is outside. Values are the design values the model read (log10
 * for a log-scaled curve). The write is never blocked; the counts are shown
 * before it and stored in the provenance.
 */
export function trainingRangeCheck({
  key, result, design, labels, wellName,
}) {
  const { rows: train, basis } = trainingRowsOf(key, result, design);
  const p = design.names.length;
  const min = new Array(p).fill(Infinity);
  const max = new Array(p).fill(-Infinity);
  for (const j of train) {
    const x = design.X[j];
    for (let f = 0; f < p; f += 1) {
      if (x[f] < min[f]) min[f] = x[f];
      if (x[f] > max[f]) max[f] = x[f];
    }
  }
  const below = new Array(p).fill(0);
  const above = new Array(p).fill(0);
  let checked = 0;
  let outside = 0;
  for (let j = 0; j < design.X.length; j += 1) {
    if (design.groups[j] !== wellName) continue;
    if (labels[j] === null || labels[j] === undefined) continue;
    checked += 1;
    let out = false;
    const x = design.X[j];
    for (let f = 0; f < p; f += 1) {
      if (x[f] < min[f]) { below[f] += 1; out = true; } else if (x[f] > max[f]) { above[f] += 1; out = true; }
    }
    if (out) outside += 1;
  }
  return {
    basis,
    trainingRows: train.length,
    rowsChecked: checked,
    rowsOutside: outside,
    features: design.names.map((name, f) => ({
      name, min: min[f], max: max[f], below: below[f], above: above[f], outside: below[f] + above[f],
    })),
  };
}

/** The training-range check as stored in the provenance. */
export const trainingRangeProvenance = (check) => (check ? {
  training_rows: check.basis,
  training_row_count: check.trainingRows,
  rows_checked: check.rowsChecked,
  rows_outside_any_log: check.rowsOutside,
  per_log: check.features.map((f) => ({
    log: f.name, training_min: f.min, training_max: f.max, rows_below: f.below, rows_above: f.above, rows_outside: f.outside,
  })),
} : null);

const coreScores = (key, result) => {
  if (isClusterKey(key)) {
    const c = result?.compare;
    if (!c || c.none || !c.match || c.match.error) return null;
    return {
      matching: c.mode, cored_rows: c.rows, adjusted_rand_index: c.match.ari, accuracy_after_matching: c.match.report.accuracy, mapping: c.match.mapping.map((m) => ({ cluster: m.cluster, facies: m.facies })),
    };
  }
  const s = result?.scores;
  if (!s) return null;
  return {
    held_out_wells: result.split.testGroups,
    held_out_rows: result.split.nTest,
    hold_out: result.split.scheme === 'seeded' ? `engine group split, seed ${result.split.seed}` : 'wells chosen by the user',
    accuracy: s.report.error ? null : s.report.accuracy,
    macro_f1: s.report.error ? null : s.report.macro.f1,
    adjusted_rand_index: s.ari.error ? null : s.ari.ari,
  };
};

const parameters = (key, result, parsed) => {
  if (key === 'kmeans') {
    const km = result.kmeans;
    return {
      k: km.k, seed: km.seed, n_init: km.runs.length, best_run: km.bestRun, inertia: km.inertia, iterations: km.iterations, converged: km.converged,
    };
  }
  if (key === 'agglomerative') {
    const ag = result.agglomerative;
    return {
      linkage: ag.linkage, k: ag.k, sampled: !!result.sampled, sample_rows: result.sampled ? ag.n : null, sample_seed: result.sampled ? parsed.agglomerative.seed : null,
    };
  }
  if (key === 'knn') return { k: result.final?.k, vote_ties: result.final?.tiedVotes };
  const t = result.finalTree;
  return {
    max_depth: t.maxDepth, min_samples_leaf: t.minSamplesLeaf, min_samples_split: t.minSamplesSplit, leaves: t.nLeaves, depth: t.depth, tree: t.printed,
  };
};

/** The provenance stored with a facies log. */
export function faciesProvenance({
  key, result, parsed, design, table, wellName, projectName, legend, rangeCheck = null,
}) {
  return {
    computed: true,
    engine: 'electrofacies-studio',
    operation: isClusterKey(key) ? 'electrofacies-clustering' : 'electrofacies-classification',
    engine_version: ENGINE_VERSION,
    engine_commit: ENGINE_COMMIT,
    method: key,
    method_text: methodText(key, result, parsed),
    parameters: parameters(key, result, parsed),
    scaling: key === 'cart' ? 'none (a tree is unchanged by scaling a log)' : parsed.scale,
    logs: design.names,
    core_facies_source: design.faciesText,
    legend,
    rows: design.X.length,
    wells: design.wells.map((w) => w.name),
    core_comparison: coreScores(key, result),
    training_range: trainingRangeProvenance(rangeCheck),
    source_label: table?.label,
    written_well: wellName,
    run_name: projectName || null,
    created_at: new Date().toISOString(),
  };
}
