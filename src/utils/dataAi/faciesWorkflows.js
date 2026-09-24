// Electrofacies Studio (Data & AI D3): the workflows, every number from the
// engine.
//
// Each function takes the design buildFaciesDesign made (X, names, groups,
// core facies) and the parsed spec, and calls the vendored engine
// (packages/engines/engines/dataai/cluster.js and ml.js, through their
// one-line shims). The app adds only bookkeeping: which rows a sample
// holds, which rows are cored, which wells are held out, and how batched
// kNN results are joined back in row order.
//
// Conventions this layer adds (stated on screen and in the help guide):
//   - Every row index counts from 0, as the engine's do.
//   - A seeded sample of m rows from n is the engine's own sample rule
//     (cluster.js silhouette sampleSize): the first m rows of a mulberry32
//     Fisher-Yates shuffle from the end, j = floor(u (i + 1)), sorted back
//     into row order. The silhouette returns its sample rows, and the tests
//     check this sampler gives the same rows.
//   - The elbow runs the engine's elbow one k at a time (each k has its own
//     mulberry32(seed) stream, so a one-k call equals that row of the full
//     call) so the screen can count progress; the drops, the rises and the
//     best silhouette k are then read off in the engine's own way, and the
//     tests check the joined table equals the engine's single call whole.
//   - Cluster to core facies matching is one-to-one when the clusters on
//     the cored rows are no more than the facies there, and majority
//     otherwise. The screen says which ran.
//   - kNN classifies in batches of at most floor(100,000,000 / training
//     rows) rows, the engine's pair limit; each row's neighbours and vote do
//     not depend on the other rows classified with it, so the joined
//     predictions equal one call (the tests check this too).
//   - CART splits on the logs as given: a tree's thresholds do not change
//     under a scaling of a log, so no scaler is fitted for it.
import * as C from '@/utils/dataAi/engine/cluster';
import * as ML from '@/utils/dataAi/engine/ml';
import { mulberry32 } from '@/utils/dataAi/engine/stats';
import {
  ELBOW_SAMPLE_ROWS, SILHOUETTE_MAX_ROWS, AGGLOMERATIVE_MAX_ROWS, MAX_KNN_TRAIN_ROWS,
} from '@/utils/dataAi/faciesData';

/** The engine build the studio runs: petrolord-engines at the VENDOR.json pin. */
export const ENGINE_VERSION = 'petrolord-engines ec89b6b (engines/dataai/cluster.js, PR #253 and PR #254; unchanged since ef4058f)';
export const ENGINE_COMMIT = 'ec89b6b957746d34ad405a9abb81497ab28debc0';

export const DEFAULT_SEED = 42;
export const KNN_MAX_PAIRS = C.DEFAULTS.KNN_MAX_PAIRS;

export const METHODS = {
  kmeans: 'k-means (k-means++ starts, Lloyd iterations)',
  agglomerative: 'agglomerative clustering',
  knn: 'k-nearest neighbours (kNN)',
  cart: 'CART classification tree',
};
export const LINKAGES = [
  { value: 'ward', label: 'Ward' },
  { value: 'complete', label: 'Complete' },
  { value: 'average', label: 'Average (UPGMA)' },
];
export const SCALES = [
  { value: 'standard', label: 'Standardise: z-score, population SD (engine default)' },
  { value: 'minmax', label: 'Min-max to 0 to 1' },
  { value: 'none', label: 'None: logs as given' },
];

/** A fresh spec: everything as typed text, read by parseSpec. */
export const defaultSpec = () => ({
  features: [],
  depthMin: '',
  depthMax: '',
  every: '1',
  facies: { source: 'none', curve: '', kind: '' },
  scale: 'standard',
  pca: { matrix: 'correlation', x: '1', y: '2' },
  kmeans: { k: '4', seed: String(DEFAULT_SEED), nInit: '10' },
  elbow: { kMin: '1', kMax: '10' },
  agglomerative: { linkage: 'ward', k: '4', sample: false, seed: String(DEFAULT_SEED) },
  supervised: {
    holdout: 'seeded', nTest: '1', seed: String(DEFAULT_SEED), chosen: [], knnK: '5', maxDepth: '5', minLeaf: '1',
  },
});

/**
 * A typed field to what the engine is given: blank is undefined (the
 * engine's default where it has one, else its refusal), a number is a
 * number, anything else is NaN (which the engine refuses by name).
 */
export const num = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

/** The typed spec to engine arguments. The engine judges every value. */
export function parseSpec(spec) {
  const s = spec || defaultSpec();
  const sup = s.supervised || {};
  return {
    scale: ['standard', 'minmax', 'none'].includes(s.scale) ? s.scale : 'standard',
    pca: { matrix: s.pca?.matrix === 'covariance' ? 'covariance' : 'correlation' },
    kmeans: { k: num(s.kmeans?.k), seed: num(s.kmeans?.seed), nInit: num(s.kmeans?.nInit) },
    elbow: { kMin: num(s.elbow?.kMin), kMax: num(s.elbow?.kMax) },
    agglomerative: {
      linkage: s.agglomerative?.linkage || 'ward', k: num(s.agglomerative?.k), sample: !!s.agglomerative?.sample, seed: num(s.agglomerative?.seed),
    },
    supervised: {
      holdout: sup.holdout === 'chosen' ? 'chosen' : 'seeded',
      nTest: num(sup.nTest),
      seed: num(sup.seed),
      chosen: Array.isArray(sup.chosen) ? sup.chosen.slice() : [],
      knnK: num(sup.knnK),
      maxDepth: num(sup.maxDepth),
      minLeaf: num(sup.minLeaf),
    },
  };
}

const pick = (arr, idx) => idx.map((i) => arr[i]);

/**
 * The engine's seeded sample rule: the first `size` rows of a mulberry32
 * Fisher-Yates shuffle from the end (j = floor(u (i + 1))), in row order.
 */
export function sampleRows(n, size, seed) {
  const rng = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i >= 1; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, size).sort((x, y) => x - y);
}

/** The engine's seed check, for sampling before any engine call sees the seed. */
const seedProblem = (field, seed) => (Number.isInteger(seed) && seed >= 0 && seed <= 4294967295 ? null : `${field} must be a whole number from 0 to 4294967295`);

/* ------------------------------------------------------------------ PCA */

export function runPca({ design, parsed }) {
  return C.pca({ X: design.X, names: design.names, matrix: parsed.pca.matrix });
}

/* ------------------------------------------------------ core comparison */

/**
 * Clusters against the core facies on the cored rows among `rows` (design
 * indices; every row when null). Matching mode: one-to-one when the
 * clusters present there are no more than the facies, majority otherwise.
 */
export function compareClusters(design, labels, rows = null) {
  if (!design.facies) return { none: 'No core facies source is chosen, so the clusters are not compared with the core.' };
  const at = (rows || design.X.map((_, j) => j)).filter((j) => design.facies[j] !== null && labels[j] !== null && labels[j] !== undefined);
  if (at.length < 2) return { none: 'Fewer than 2 of the clustered rows have a core facies, so there is nothing to compare.' };
  const yTrue = pick(design.facies, at);
  const clusters = pick(labels, at);
  const nClusters = new Set(clusters).size;
  const nFacies = new Set(yTrue).size;
  const mode = nClusters <= nFacies ? 'one-to-one' : 'majority';
  const match = C.matchClusters({ yTrue, clusters, mode });
  return {
    rows: at.length, nClusters, nFacies, mode, match,
    modeText: mode === 'one-to-one'
      ? `one-to-one: ${nClusters} clusters on the cored rows, no more than the ${nFacies} core facies, so each cluster takes a different facies (Hungarian, most rows matched)`
      : `majority: ${nClusters} clusters on the cored rows, more than the ${nFacies} core facies, so each cluster takes its most common facies and several clusters can share one`,
  };
}

/** The silhouette of a labelling, sampled by the engine above its row cap. */
function silhouetteOf(X, labels, parsed, names, seed) {
  if (X.length > SILHOUETTE_MAX_ROWS) {
    return { ...C.silhouette({ X, labels, scale: parsed.scale, names, sampleSize: SILHOUETTE_MAX_ROWS, seed }), sampled: true };
  }
  return { ...C.silhouette({ X, labels, scale: parsed.scale, names }), sampled: false };
}

/** A silhouette result without its per-row values (the screen shows the means). */
const slimSilhouette = (s) => {
  if (!s || s.error) return s;
  const { values, ...rest } = s;
  return rest;
};

/* -------------------------------------------------------------- k-means */

export function runKmeans({ design, parsed }) {
  const { k, seed, nInit } = parsed.kmeans;
  const km = C.kmeans({
    X: design.X, k, seed, nInit, scale: parsed.scale, names: design.names,
  });
  if (km.error) return { kmeans: km };
  const sil = silhouetteOf(design.X, km.labels, parsed, design.names, seed);
  return {
    kmeans: km,
    silhouette: slimSilhouette(sil),
    compare: compareClusters(design, km.labels),
    labels: km.labels,
  };
}

/* ---------------------------------------------------------------- elbow */

/**
 * The elbow on at most ELBOW_SAMPLE_ROWS rows (a seeded sample above), one
 * engine call per k so progress can be counted, joined as the engine joins
 * them. The k range is checked by the engine first, over the rows used.
 */
export function runElbow({ design, parsed, onProgress }) {
  const { seed, nInit } = parsed.kmeans;
  const { kMin = 1, kMax = 10 } = parsed.elbow;
  const n = design.X.length;
  let rows = null;
  if (n > ELBOW_SAMPLE_ROWS) {
    const bad = seedProblem('seed', seed);
    if (bad) return { error: bad, field: 'seed' };
    rows = sampleRows(n, ELBOW_SAMPLE_ROWS, seed);
  }
  const X = rows ? pick(design.X, rows) : design.X;
  const common = {
    X, seed, nInit, scale: parsed.scale, names: design.names,
  };
  // The engine validates X, kMin and kMax before withSilhouette: an invalid
  // withSilhouette therefore returns the engine's own range refusal, or its
  // withSilhouette refusal when the range is good, without clustering.
  const probe = C.elbow({
    ...common, kMin, kMax, withSilhouette: 'check',
  });
  if (probe.field !== 'withSilhouette') return { ...probe, rows, n: X.length };
  const table = [];
  const total = kMax - kMin + 1;
  for (let k = kMin; k <= kMax; k += 1) {
    const r = C.elbow({
      ...common, kMin: k, kMax: k, withSilhouette: true,
    });
    if (r.error) return { ...r, rows, n: X.length, table };
    const row = { ...r.table[0] };
    const prev = table[table.length - 1];
    row.drop = prev ? prev.inertia - row.inertia : null;
    row.dropFraction = prev && prev.inertia > 0 ? (prev.inertia - row.inertia) / prev.inertia : null;
    table.push(row);
    onProgress?.({ phase: 'elbow', done: k - kMin + 1, total });
  }
  const inertiaRises = table.filter((r, i) => i > 0 && r.inertia > table[i - 1].inertia).map((r) => r.k);
  let bestSilhouetteK = null;
  let bv = -Infinity;
  table.forEach((r) => { if (r.silhouette !== null && r.silhouette > bv) { bv = r.silhouette; bestSilhouetteK = r.k; } });
  const out = {
    table, bestSilhouetteK, inertiaRises, rows, n: X.length, sampled: !!rows, seed,
  };
  if (inertiaRises.length) out.warning = `inertia rises at k = ${inertiaRises.join(', ')}: those runs stopped in a local minimum; raise nInit`;
  return out;
}

/* -------------------------------------------------------- agglomerative */

export function runAgglomerative({ design, parsed }) {
  const { linkage, k, sample, seed } = parsed.agglomerative;
  const n = design.X.length;
  let rows = null;
  if (sample && n > AGGLOMERATIVE_MAX_ROWS) {
    const bad = seedProblem('seed', seed);
    if (bad) return { agglomerative: { error: bad, field: 'seed' } };
    rows = sampleRows(n, AGGLOMERATIVE_MAX_ROWS, seed);
  }
  const X = rows ? pick(design.X, rows) : design.X;
  const ag = C.agglomerative({
    X, linkage, k, scale: parsed.scale, names: design.names,
  });
  if (ag.error) return { agglomerative: ag, rows };
  const labels = new Array(n).fill(null);
  (rows || X.map((_, i) => i)).forEach((j, i) => { labels[j] = ag.labels ? ag.labels[i] : null; });
  const sil = ag.labels ? silhouetteOf(X, ag.labels, parsed, design.names, seed ?? DEFAULT_SEED) : null;
  return {
    agglomerative: ag,
    rows,
    sampled: !!rows,
    silhouette: slimSilhouette(sil),
    compare: ag.labels ? compareClusters(design, labels, rows) : { none: 'Give k to cut the tree into clusters.' },
    labels,
  };
}

/* ----------------------------------------------------------- supervised */

/**
 * Which cored rows train and which are held out: a seeded engine group
 * split of the cored wells, or the wells the user chose.
 */
export function holdOut(design, sup) {
  if (!design.facies) return { error: 'Choose a core facies source first: kNN and CART learn from the core.' };
  const cored = design.labelled;
  if (cored.length < 2) return { error: 'Fewer than 2 rows have a core facies, so there is nothing to learn from.' };
  const groups = pick(design.groups, cored);
  if (sup.holdout === 'chosen') {
    const wells = [...new Set(groups)];
    const test = new Set(sup.chosen.filter((w) => wells.includes(w)));
    if (!test.size) return { error: 'Choose at least one cored well to hold out.' };
    if (test.size >= wells.length) return { error: 'Leave at least one cored well to train on.' };
    const trainIdx = []; const testIdx = [];
    cored.forEach((j, i) => (test.has(groups[i]) ? testIdx : trainIdx).push(j));
    return {
      scheme: 'chosen', trainIdx, testIdx, trainGroups: wells.filter((w) => !test.has(w)), testGroups: wells.filter((w) => test.has(w)),
    };
  }
  const s = ML.groupSplit({ groups, nTestGroups: sup.nTest, seed: sup.seed });
  if (s.error) return { error: s.error, field: s.field };
  return {
    scheme: 'seeded',
    seed: s.seed,
    trainIdx: pick(cored, s.trainIndices),
    testIdx: pick(cored, s.testIndices),
    trainGroups: s.trainGroups,
    testGroups: s.testGroups,
    basis: s.basis,
  };
}

/**
 * kNN over any number of new rows, in batches inside the engine's pair
 * limit. Returns the engine's predictions joined in row order and the tied
 * vote count summed, or the first refusal.
 */
export function knnBatched({
  X, y, Xnew, k, scale, names, onProgress, phase = 'knn', pairLimit = KNN_MAX_PAIRS,
}) {
  if (!Array.isArray(X) || !X.length || !Array.isArray(Xnew) || !Xnew.length) {
    return C.knnClassify({
      X, y, Xnew, k, scale, names,
    });
  }
  const size = Math.max(1, Math.floor(pairLimit / X.length));
  const predictions = [];
  let tiedVotes = 0;
  let first = null;
  for (let at = 0; at < Xnew.length; at += size) {
    const r = C.knnClassify({
      X, y, Xnew: Xnew.slice(at, at + size), k, scale, names,
    });
    if (r.error) return r;
    if (!first) first = r;
    for (const p of r.predictions) predictions.push(p);
    tiedVotes += r.tiedVotes;
    onProgress?.({ phase, done: Math.min(Xnew.length, at + size), total: Xnew.length });
  }
  return {
    k: first.k, predictions, tiedVotes, scaler: first.scaler, classes: first.classes, basis: first.basis, batches: Math.ceil(Xnew.length / size), batchRows: size,
  };
}

/** A fitted tree without its training predictions (the screen shows the tree and its accuracy). */
const slimTree = (t) => {
  if (!t || t.error) return t;
  const { trainingPredictions, ...rest } = t;
  return rest;
};

function scoreBlind(yTrue, yPred) {
  return {
    report: ML.classificationReport({ yTrue, yPred }),
    ari: C.adjustedRandIndex({ a: yTrue, b: yPred }),
  };
}

/**
 * kNN or CART against the core facies: trained on the cored rows of the
 * training wells, scored on the cored rows of the held-out wells; then the
 * final model, trained on every cored row, classifies every row for the
 * depth tracks and the write-back.
 */
export function runSupervised({
  design, parsed, method, onProgress,
}) {
  const sup = parsed.supervised;
  const split = holdOut(design, sup);
  if (split.error) return { method, error: split.error };
  const yOf = (idx) => pick(design.facies, idx);
  const Xof = (idx) => pick(design.X, idx);
  const all = design.X.map((_, j) => j);
  const splitInfo = {
    scheme: split.scheme, seed: split.seed ?? null, trainGroups: split.trainGroups, testGroups: split.testGroups, nTrain: split.trainIdx.length, nTest: split.testIdx.length,
  };
  if (method === 'knn') {
    const cap = (m, what) => (m > MAX_KNN_TRAIN_ROWS
      ? `${m.toLocaleString('en-US')} ${what} rows are more than the ${MAX_KNN_TRAIN_ROWS.toLocaleString('en-US')} training rows kNN takes here. Keep every nth sample or narrow the depth window.`
      : null);
    const c1 = cap(split.trainIdx.length, 'cored training');
    if (c1) return { method, split: splitInfo, error: c1 };
    const blind = knnBatched({
      X: Xof(split.trainIdx), y: yOf(split.trainIdx), Xnew: Xof(split.testIdx), k: sup.knnK, scale: parsed.scale, names: design.names, onProgress, phase: 'held-out wells',
    });
    if (blind.error) return { method, split: splitInfo, blind };
    const scores = scoreBlind(yOf(split.testIdx), blind.predictions);
    const c2 = cap(design.labelled.length, 'cored');
    if (c2) {
      return {
        method, split: splitInfo, blind, scores, testIdx: split.testIdx, finalRefusal: c2,
      };
    }
    const final = knnBatched({
      X: Xof(design.labelled), y: yOf(design.labelled), Xnew: design.X, k: sup.knnK, scale: parsed.scale, names: design.names, onProgress, phase: 'every row',
    });
    return {
      method, split: splitInfo, blind, scores, testIdx: split.testIdx, final, labels: final.error ? null : final.predictions,
    };
  }
  // CART
  const tree = C.cartFit({
    X: Xof(split.trainIdx), y: yOf(split.trainIdx), names: design.names, maxDepth: sup.maxDepth, minSamplesLeaf: sup.minLeaf,
  });
  if (tree.error) return { method, split: splitInfo, blindTree: tree };
  const pred = C.cartPredict({ model: tree, X: Xof(split.testIdx) });
  if (pred.error) return { method, split: splitInfo, blindTree: slimTree(tree), blind: pred };
  const scores = scoreBlind(yOf(split.testIdx), pred.predictions);
  const finalTree = C.cartFit({
    X: Xof(design.labelled), y: yOf(design.labelled), names: design.names, maxDepth: sup.maxDepth, minSamplesLeaf: sup.minLeaf,
  });
  const final = finalTree.error ? finalTree : C.cartPredict({ model: finalTree, X: Xof(all) });
  return {
    method,
    split: splitInfo,
    blindTree: slimTree(tree),
    blind: { predictions: pred.predictions },
    scores,
    testIdx: split.testIdx,
    finalTree: slimTree(finalTree),
    final: final.error ? final : { predictions: final.predictions },
    labels: final.error ? null : final.predictions,
  };
}

/* ------------------------------------------------------------- helpers */

/** The labels a result puts on the design rows (null where it has none), or null. */
export function labelsOf(result) {
  if (!result) return null;
  return Array.isArray(result.labels) ? result.labels : null;
}

/** A short description of a result's method and settings, for screens, exports and provenance. */
export function methodText(key, result, parsed) {
  if (!result) return '';
  if (key === 'kmeans') {
    const km = result.kmeans;
    return km && !km.error ? `k-means, k = ${km.k}, seed ${km.seed}, ${km.runs.length} k-means++ start${km.runs.length === 1 ? '' : 's'}, scaling ${km.scale}` : 'k-means';
  }
  if (key === 'agglomerative') {
    const ag = result.agglomerative;
    return ag && !ag.error ? `agglomerative, ${ag.linkage} linkage, k = ${ag.k}, scaling ${ag.scale}${result.sampled ? `, a seeded sample of ${ag.n} rows (seed ${parsed?.agglomerative?.seed})` : ''}` : 'agglomerative';
  }
  if (key === 'knn') return `kNN, k = ${result.final?.k ?? parsed?.supervised?.knnK}, scaling ${parsed?.scale}, trained on every cored row`;
  if (key === 'cart') {
    const t = result.finalTree;
    return t && !t.error ? `CART (Gini), max depth ${t.maxDepth}, min leaf ${t.minSamplesLeaf}, trained on every cored row` : 'CART';
  }
  return key;
}
