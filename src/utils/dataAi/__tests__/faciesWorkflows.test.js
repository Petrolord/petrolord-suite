/**
 * Electrofacies Studio workflows (Data & AI D3), gated against the engine.
 *
 * The engine itself is gated in packages/engines/__tests__/dataai.cluster.test.js
 * (stdlib oracle goldens, iris, scikit-learn / scipy pins, 40/40 negative
 * control). These tests gate the APP layer: every number the studio shows
 * must equal a direct engine call made in the stated way on the same rows.
 * Nothing here restates a formula; each expectation is the engine's output.
 *
 * Data: the engine's own seeded synthetic facies logs (syntheticFacies in
 * packages/engines/tools/validation/dataai/synthetic_wells.js: four facies
 * in blocky runs, GR / RHOB / NPHI / PEF drawn per facies, wells of 500
 * rows), laid out as a studio table with a depth per sample.
 */
import * as C from '@/utils/dataAi/engine/cluster';
import * as ML from '@/utils/dataAi/engine/ml';
import {
  buildFaciesDesign, faciesAtDepth, compactIntervals, faciesTableFromUpload, coreFacies, wellStarts, MAX_ROWS,
  MAX_KNN_TRAIN_ROWS,
} from '@/utils/dataAi/faciesData';
import {
  defaultSpec, parseSpec, sampleRows, runPca, runKmeans, runElbow, runAgglomerative, runSupervised, knnBatched,
  compareClusters, ENGINE_COMMIT, ENGINE_VERSION,
} from '@/utils/dataAi/faciesWorkflows';
import { syntheticFacies } from '../../../../packages/engines/tools/validation/dataai/synthetic_wells';

const LOGS = ['GR', 'RHOB', 'NPHI', 'PEF'];

/** A studio table of nWells x 500 rows from the engine's synthetic facies. */
function synthTable(nWells, seed = 20260924) {
  const { X, facies, groups } = syntheticFacies(nWells * 500, 4, seed);
  const columns = Object.fromEntries(LOGS.map((l, j) => [l, X.map((r) => r[j])]));
  const wells = [...new Set(groups)].map((g) => ({ id: `id-${g}`, name: g, rows: 500 }));
  return {
    source: 'wells', label: 'synthetic', ref: {}, wells, group: groups, depth: groups.map((_, i) => 1000 + (i % 500) * 0.5), depthUnit: 'm',
    columns: { ...columns, FACIES_CODE: facies.map((f) => ['sandstone', 'shaly_sand', 'shale', 'limestone'].indexOf(f)) },
    units: {}, facies, faciesName: 'FACIES', intervals: null, notes: [],
  };
}

const specWith = (over = {}) => ({
  ...defaultSpec(),
  features: LOGS.map((name) => ({ name, log: false })),
  facies: { source: 'column', curve: '', kind: '' },
  ...over,
});

const design6 = buildFaciesDesign(synthTable(6), specWith());
const parsedWith = (fn) => { const s = specWith(); fn(s); return parseSpec(s); };

describe('the engine pin', () => {
  it('names the commit VENDOR.json pins', () => {
     
    const vendor = require('../../../../packages/engines/VENDOR.json');
    expect(ENGINE_COMMIT).toBe(vendor.canonical.commit);
    expect(ENGINE_VERSION.startsWith(`petrolord-engines ${vendor.canonical.commit.slice(0, 7)} `)).toBe(true);
  });
});

describe('the design', () => {
  it('keeps every row with all logs, in table order, with the core facies beside it', () => {
    expect(design6.error).toBeUndefined();
    expect(design6.X).toHaveLength(3000);
    expect(design6.names).toEqual(LOGS);
    expect(design6.facies).toHaveLength(3000);
    expect(design6.labelled).toHaveLength(3000);
    expect(design6.classes).toEqual(['limestone', 'sandstone', 'shale', 'shaly_sand']);
    expect(design6.wells.map((w) => w.rows)).toEqual([500, 500, 500, 500, 500, 500]);
  });

  it('thins from entry 0 of each well and counts every dropped row', () => {
    const t = synthTable(2);
    t.columns.GR[3] = null;
    t.columns.PEF[500] = -1;
    const d = buildFaciesDesign(t, specWith({ every: '2', features: [...LOGS.slice(0, 3).map((name) => ({ name, log: false })), { name: 'PEF', log: true }] }));
    // entry 0, 2, 4 ... of each well; row 3 is odd so thinned before its gap is seen; row 500 is entry 0 of well 2
    expect(d.rows.slice(0, 3)).toEqual([0, 2, 4]);
    expect(d.rows).not.toContain(500);
    expect(d.counts).toEqual({ total: 1000, outsideWindow: 0, thinned: 500, missing: 0, nonPositiveLog: 1 });
    expect(d.names[3]).toBe('log10(PEF)');
    expect(d.X[0][3]).toBe(Math.log10(t.columns.PEF[0]));
  });

  it('applies the depth window inclusively at both ends', () => {
    const d = buildFaciesDesign(synthTable(1), specWith({ depthMin: '1010', depthMax: '1020' }));
    expect(d.depth[0]).toBe(1010);
    expect(d.depth[d.depth.length - 1]).toBe(1020);
    expect(d.X).toHaveLength(21);
  });

  it('refuses above the row cap and names a thinning', () => {
    const d = buildFaciesDesign(synthTable(2), specWith(), { maxRows: 400 });
    expect(d.error).toBe('1,000 rows are more than the 400 the studio works on. Narrow the depth window, or keep every 3rd sample.');
    expect(MAX_ROWS).toBe(100000);
  });

  it('refuses the core facies curve as a log', () => {
    const d = buildFaciesDesign(synthTable(1), specWith({ features: [{ name: 'GR' }, { name: 'FACIES_CODE' }], facies: { source: 'curve', curve: 'FACIES_CODE' } }));
    expect(d.error).toMatch(/FACIES_CODE is also chosen as a log/);
  });

  it('places interval facies with top inclusive and base exclusive', () => {
    const iv = compactIntervals([
      { kind: 'facies', top_md_m: 1000, base_md_m: 1001, code: 'A' },
      { kind: 'facies', top_md_m: 1001, base_md_m: 1002, code: '', label: 'B' },
      { kind: 'facies', top_md_m: 1003, base_md_m: 1003, code: 'bad' },
    ]);
    expect(iv).toEqual([{ kind: 'facies', top: 1000, base: 1001, code: 'A' }, { kind: 'facies', top: 1001, base: 1002, code: 'B' }]);
    expect(faciesAtDepth(iv, 1000)).toBe('A');
    expect(faciesAtDepth(iv, 1001)).toBe('B');
    expect(faciesAtDepth(iv, 1002)).toBeNull();
    expect(faciesAtDepth(iv, 999.9)).toBeNull();
    const t = synthTable(1);
    t.intervals = { W0000: iv, other: [] };
    const f = coreFacies(t, { source: 'intervals', kind: 'facies' });
    expect(f.labels.slice(0, 5)).toEqual(['A', 'A', 'B', 'B', null]);
  });

  it('reads an uploaded facies column as numbers only when every filled cell is one', () => {
    const parsed = {
      header: ['WELL', 'DEPTH', 'GR', 'FAC'],
      rows: [['A', '1', '50', '2'], ['A', '2', '60', ''], ['B', '1', '70', '10']],
    };
    const t = faciesTableFromUpload(parsed, { groupColumn: 0, depthColumn: 1, valueColumns: [2], faciesColumn: 3 });
    expect(t.facies).toEqual([2, null, 10]);
    const t2 = faciesTableFromUpload({ ...parsed, rows: [...parsed.rows, ['B', '2', '80', 'sand']] }, { groupColumn: 0, valueColumns: [2], faciesColumn: 3 });
    expect(t2.facies).toEqual(['2', null, '10', 'sand']);
    expect(wellStarts(t2)).toEqual({ A: 0, B: 2 });
  });
});

describe('the seeded sample', () => {
  it('is the engine silhouette sample, row for row', () => {
    const X = design6.X;
    const labels = design6.facies;
    [1, 42, 20260924].forEach((seed) => {
      const s = C.silhouette({ X, labels, sampleSize: 700, seed });
      expect(sampleRows(X.length, 700, seed)).toEqual(s.rows);
    });
  });
});

describe('PCA', () => {
  it('is the engine pca of the design, whole', () => {
    ['correlation', 'covariance'].forEach((matrix) => {
      const parsed = parsedWith((s) => { s.pca.matrix = matrix; });
      expect(runPca({ design: design6, parsed })).toEqual(C.pca({ X: design6.X, names: design6.names, matrix }));
    });
  });
});

describe('k-means', () => {
  const parsed = parsedWith((s) => { s.kmeans = { k: '4', seed: '7', nInit: '3' }; });
  const r = runKmeans({ design: design6, parsed });

  it('is the engine kmeans, the silhouette of its labels and the matching against the core', () => {
    const km = C.kmeans({ X: design6.X, k: 4, seed: 7, nInit: 3, scale: 'standard', names: design6.names });
    expect(r.kmeans).toEqual(km);
    const { values, ...sil } = C.silhouette({ X: design6.X, labels: km.labels, scale: 'standard', names: design6.names });
    expect(r.silhouette).toEqual({ ...sil, sampled: false });
    expect(values).toHaveLength(3000);
    expect(r.compare.mode).toBe('one-to-one');
    expect(r.compare.match).toEqual(C.matchClusters({ yTrue: design6.facies, clusters: km.labels, mode: 'one-to-one' }));
    expect(r.labels).toEqual(km.labels);
  });

  it('matches by majority when the clusters outnumber the facies, and says so', () => {
    const p6 = parsedWith((s) => { s.kmeans = { k: '6', seed: '7', nInit: '1' }; });
    const r6 = runKmeans({ design: design6, parsed: p6 });
    expect(r6.compare.mode).toBe('majority');
    expect(r6.compare.modeText).toMatch(/^majority: 6 clusters on the cored rows, more than the 4 core facies/);
    expect(r6.compare.match).toEqual(C.matchClusters({ yTrue: design6.facies, clusters: r6.labels, mode: 'majority' }));
  });

  it('compares only the cored rows, and at 4 clusters against 4 facies runs one-to-one (the boundary)', () => {
    const t = synthTable(2);
    t.facies = t.facies.map((f, i) => (i % 3 === 0 ? f : null));
    const d = buildFaciesDesign(t, specWith());
    const labels = d.X.map((_, j) => j % 4);
    const cmp = compareClusters(d, labels);
    const at = d.labelled;
    expect(cmp.rows).toBe(at.length);
    expect(cmp.mode).toBe('one-to-one');
    expect(cmp.match).toEqual(C.matchClusters({ yTrue: at.map((j) => d.facies[j]), clusters: at.map((j) => labels[j]), mode: 'one-to-one' }));
  });

  it('scores a seeded silhouette sample above 10,000 rows', () => {
    const big = buildFaciesDesign(synthTable(21), specWith());
    expect(big.X.length).toBe(10500);
    const p = parsedWith((s) => { s.kmeans = { k: '3', seed: '5', nInit: '1' }; });
    const rb = runKmeans({ design: big, parsed: p });
    const { values, ...sil } = C.silhouette({ X: big.X, labels: rb.labels, scale: 'standard', names: big.names, sampleSize: 10000, seed: 5 });
    expect(rb.silhouette).toEqual({ ...sil, sampled: true });
    expect(values).toHaveLength(10000);
  }, 60000);

  it('shows the engine refusal verbatim', () => {
    const p = parsedWith((s) => { s.kmeans = { k: '0', seed: '1', nInit: '1' }; });
    expect(runKmeans({ design: design6, parsed: p }).kmeans).toEqual(C.kmeans({ X: design6.X, k: 0, seed: 1, nInit: 1, names: design6.names }));
    const p2 = parsedWith((s) => { s.kmeans = { k: '3', seed: '1.5', nInit: '1' }; });
    expect(runKmeans({ design: design6, parsed: p2 }).kmeans.error).toBe('seed must be a whole number from 0 to 4294967295');
  });
});

describe('the elbow', () => {
  it('joins one-k engine calls into exactly the engine single call, with progress', () => {
    const d = buildFaciesDesign(synthTable(2), specWith());
    const parsed = parsedWith((s) => { s.kmeans = { k: '3', seed: '11', nInit: '2' }; s.elbow = { kMin: '1', kMax: '6' }; });
    const progress = [];
    const r = runElbow({ design: d, parsed, onProgress: (p) => progress.push(p.done) });
    const e = C.elbow({ X: d.X, kMin: 1, kMax: 6, seed: 11, nInit: 2, scale: 'standard', names: d.names, withSilhouette: true });
    expect(r.table).toEqual(e.table);
    expect(r.bestSilhouetteK).toBe(e.bestSilhouetteK);
    expect(r.inertiaRises).toEqual(e.inertiaRises);
    expect(r.warning).toBe(e.warning);
    expect(r.sampled).toBe(false);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('runs on the seeded 10,000-row sample above 10,000 rows, as the engine would on those rows', () => {
    const big = buildFaciesDesign(synthTable(21), specWith());
    const parsed = parsedWith((s) => { s.kmeans = { k: '3', seed: '3', nInit: '1' }; s.elbow = { kMin: '2', kMax: '3' }; });
    const r = runElbow({ design: big, parsed });
    expect(r.sampled).toBe(true);
    expect(r.rows).toEqual(sampleRows(10500, 10000, 3));
    const Xs = r.rows.map((j) => big.X[j]);
    const e = C.elbow({ X: Xs, kMin: 2, kMax: 3, seed: 3, nInit: 1, scale: 'standard', names: big.names, withSilhouette: true });
    expect(r.table).toEqual(e.table);
  }, 90000);

  it('shows the engine range refusal verbatim, without clustering', () => {
    const d = buildFaciesDesign(synthTable(1), specWith());
    const parsed = parsedWith((s) => { s.kmeans = { k: '3', seed: '1', nInit: '1' }; s.elbow = { kMin: '4', kMax: '3' }; });
    const r = runElbow({ design: d, parsed });
    const e = C.elbow({ X: d.X, kMin: 4, kMax: 3, seed: 1 });
    expect(r.error).toBe(e.error);
    expect(r.field).toBe('kMax');
  });
});

describe('agglomerative clustering', () => {
  it('is the engine refusal, verbatim, above 3,000 rows without the sample', () => {
    const d = buildFaciesDesign(synthTable(7), specWith());
    const parsed = parsedWith((s) => { s.agglomerative = { linkage: 'ward', k: '4', sample: false, seed: '42' }; });
    const r = runAgglomerative({ design: d, parsed });
    expect(r.agglomerative.error).toBe(C.agglomerative({ X: d.X, linkage: 'ward', k: 4 }).error);
    expect(r.agglomerative.error).toMatch(/^X has 3500 rows, above the 3000/);
  });

  it('clusters the seeded 3,000-row sample as the engine does, and labels only those rows', () => {
    const d = buildFaciesDesign(synthTable(7), specWith());
    const parsed = parsedWith((s) => { s.agglomerative = { linkage: 'average', k: '4', sample: true, seed: '9' }; });
    const r = runAgglomerative({ design: d, parsed });
    const rows = sampleRows(3500, 3000, 9);
    expect(r.rows).toEqual(rows);
    const ag = C.agglomerative({ X: rows.map((j) => d.X[j]), linkage: 'average', k: 4, names: d.names });
    expect(r.agglomerative).toEqual(ag);
    expect(r.labels.filter((v) => v !== null)).toEqual(ag.labels);
    expect(r.labels.filter((v) => v === null)).toHaveLength(500);
    expect(r.compare.rows).toBe(3000);
  }, 30000);

  it('at exactly 3,000 rows clusters every row (the boundary)', () => {
    const d = buildFaciesDesign(synthTable(6), specWith());
    const parsed = parsedWith((s) => { s.agglomerative = { linkage: 'complete', k: '3', sample: true, seed: '1' }; });
    const r = runAgglomerative({ design: d, parsed });
    expect(r.sampled).toBe(false);
    expect(r.labels).toEqual(C.agglomerative({ X: d.X, linkage: 'complete', k: 3, names: d.names }).labels);
  }, 30000);
});

describe('supervised against the core', () => {
  const t = synthTable(4);
  // well W0003 has no core: its facies are unknown to the studio
  t.facies = t.facies.map((f, i) => (t.group[i] === 'W0003' ? null : f));
  const d = buildFaciesDesign(t, specWith());

  it('holds out whole cored wells by the engine group split', () => {
    const parsed = parsedWith((s) => { s.supervised = { ...s.supervised, nTest: '1', seed: '5', knnK: '3' }; });
    const r = runSupervised({ design: d, parsed, method: 'knn' });
    const cored = d.labelled;
    const split = ML.groupSplit({ groups: cored.map((j) => d.groups[j]), nTestGroups: 1, seed: 5 });
    expect(r.split.testGroups).toEqual(split.testGroups);
    expect(r.split.trainGroups).toEqual(split.trainGroups);
    expect(r.testIdx).toEqual(split.testIndices.map((i) => cored[i]));
    expect(r.split.testGroups).not.toContain('W0003');
  });

  it('kNN: held-out predictions, report and ARI are the engine\'s; the final model classifies every row', () => {
    const parsed = parsedWith((s) => { s.supervised = { ...s.supervised, holdout: 'chosen', chosen: ['W0001'], knnK: '5' }; });
    const r = runSupervised({ design: d, parsed, method: 'knn' });
    const train = d.labelled.filter((j) => d.groups[j] !== 'W0001');
    const test = d.labelled.filter((j) => d.groups[j] === 'W0001');
    const direct = C.knnClassify({ X: train.map((j) => d.X[j]), y: train.map((j) => d.facies[j]), Xnew: test.map((j) => d.X[j]), k: 5, names: d.names });
    expect(r.blind.predictions).toEqual(direct.predictions);
    expect(r.blind.tiedVotes).toBe(direct.tiedVotes);
    const yTrue = test.map((j) => d.facies[j]);
    expect(r.scores.report).toEqual(ML.classificationReport({ yTrue, yPred: direct.predictions }));
    expect(r.scores.ari).toEqual(C.adjustedRandIndex({ a: yTrue, b: direct.predictions }));
    const fin = C.knnClassify({ X: d.labelled.map((j) => d.X[j]), y: d.labelled.map((j) => d.facies[j]), Xnew: d.X, k: 5, names: d.names });
    expect(r.labels).toEqual(fin.predictions);
    expect(r.labels).toHaveLength(2000);
  });

  it('batched kNN equals one engine call', () => {
    const X = d.labelled.slice(0, 300).map((j) => d.X[j]);
    const y = d.labelled.slice(0, 300).map((j) => d.facies[j]);
    const Xnew = d.X.slice(1000, 1450);
    const one = C.knnClassify({ X, y, Xnew, k: 4, names: d.names });
    const progress = [];
    const b = knnBatched({ X, y, Xnew, k: 4, names: d.names, pairLimit: 300 * 100 + 7, onProgress: (p) => progress.push(p.done) });
    expect(b.batches).toBe(5);
    expect(b.predictions).toEqual(one.predictions);
    expect(b.tiedVotes).toBe(one.tiedVotes);
    expect(progress).toEqual([100, 200, 300, 400, 450]);
  });

  it('refuses kNN above the training cap', () => {
    expect(MAX_KNN_TRAIN_ROWS).toBe(10000);
    const big = buildFaciesDesign(synthTable(22), specWith());
    const parsed = parsedWith((s) => { s.supervised = { ...s.supervised, holdout: 'chosen', chosen: ['W0000'] }; });
    const r = runSupervised({ design: big, parsed, method: 'knn' });
    expect(r.error).toBe('10,500 cored training rows are more than the 10,000 training rows kNN takes here. Keep every nth sample or narrow the depth window.');
  });

  it('CART: the held-out tree, its predictions and the final tree are the engine\'s', () => {
    const parsed = parsedWith((s) => { s.supervised = { ...s.supervised, holdout: 'chosen', chosen: ['W0002'], maxDepth: '3', minLeaf: '5' }; });
    const r = runSupervised({ design: d, parsed, method: 'cart' });
    const train = d.labelled.filter((j) => d.groups[j] !== 'W0002');
    const test = d.labelled.filter((j) => d.groups[j] === 'W0002');
    const tree = C.cartFit({ X: train.map((j) => d.X[j]), y: train.map((j) => d.facies[j]), names: d.names, maxDepth: 3, minSamplesLeaf: 5 });
    const { trainingPredictions, ...slim } = tree;
    expect(r.blindTree).toEqual(slim);
    expect(r.blindTree.printed).toContain('|--- ');
    const pred = C.cartPredict({ model: tree, X: test.map((j) => d.X[j]) });
    expect(r.blind.predictions).toEqual(pred.predictions);
    expect(r.scores.report).toEqual(ML.classificationReport({ yTrue: test.map((j) => d.facies[j]), yPred: pred.predictions }));
    const ft = C.cartFit({ X: d.labelled.map((j) => d.X[j]), y: d.labelled.map((j) => d.facies[j]), names: d.names, maxDepth: 3, minSamplesLeaf: 5 });
    expect(r.labels).toEqual(C.cartPredict({ model: ft, X: d.X }).predictions);
  });

  it('shows the engine refusals verbatim', () => {
    const p1 = parsedWith((s) => { s.supervised = { ...s.supervised, nTest: '3', seed: '1' }; });
    const r1 = runSupervised({ design: d, parsed: p1, method: 'cart' });
    expect(r1.error).toBe(ML.groupSplit({ groups: d.labelled.map((j) => d.groups[j]), nTestGroups: 3, seed: 1 }).error);
    const p2 = parsedWith((s) => { s.supervised = { ...s.supervised, holdout: 'chosen', chosen: ['W0000'], maxDepth: '-1' }; });
    expect(runSupervised({ design: d, parsed: p2, method: 'cart' }).blindTree.error).toBe('maxDepth must be a whole number, 0 or more (0 is a single leaf)');
    const p3 = parsedWith((s) => { s.supervised = { ...s.supervised, holdout: 'chosen', chosen: ['W0000'], knnK: '0' }; });
    expect(runSupervised({ design: d, parsed: p3, method: 'knn' }).blind.error).toMatch(/^k must be a whole number from 1 to/);
  });

  it('needs a core facies source and a well left to train on', () => {
    const none = buildFaciesDesign(synthTable(2), specWith({ facies: { source: 'none' } }));
    expect(runSupervised({ design: none, parsed: parseSpec(specWith()), method: 'knn' }).error).toMatch(/^Choose a core facies source first/);
    const p = parsedWith((s) => { s.supervised = { ...s.supervised, holdout: 'chosen', chosen: ['W0000', 'W0001', 'W0002'] }; });
    expect(runSupervised({ design: d, parsed: p, method: 'knn' }).error).toBe('Leave at least one cored well to train on.');
  });
});
