/**
 * Electrofacies Studio (D3): the app layer around the engine workflows.
 *
 *   - the worker protocol (every job posts what a direct workflow call
 *     gives, progress passes through, errors and unknown jobs come back as
 *     error messages, the page-side client terminates its worker);
 *   - dai_facies_runs persistence with a mocked supabase, and the saved
 *     payload (inputs, summary of the engine scores, fingerprint);
 *   - the facies log write-back: depth alignment to the well's samples,
 *     codes and legend, provenance;
 *   - the CSV report keeps the engine's full-precision values and refusals.
 */
const mockCalls = [];
let mockResult = { data: [], error: null };
const mockQ = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'then') return (res) => res(mockResult);
    return (...args) => { mockCalls.push([prop, ...args]); return mockQ; };
  },
});
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: (...a) => { mockCalls.push(['from', ...a]); return mockQ; } } }));

import * as C from '@/utils/dataAi/engine/cluster';
import { handleFaciesMessage, runFaciesAsync, JOBS } from '@/utils/dataAi/faciesJobs';
import {
  defaultSpec, parseSpec, runPca, runKmeans, runElbow, runAgglomerative, runSupervised, ENGINE_COMMIT,
} from '@/utils/dataAi/faciesWorkflows';
import { buildFaciesDesign, MAX_SAVED_UPLOAD_VALUES } from '@/utils/dataAi/faciesData';
import {
  createFaciesRunsService, NO_ORG_MESSAGE, FACIES_RUNS_TABLE, FACIES_RUNS_MIGRATION,
} from '@/utils/dataAi/faciesRunsService';
import {
  serializeStudy, studyFromPayload, fingerprint, STUDY_SCHEMA,
} from '@/utils/dataAi/faciesStudy';
import {
  wellLabels, faciesCodes, faciesProvenance, buildFaciesLog, suggestFaciesMnemonic, mnemonicProblem, trainingRangeCheck, trainingRowsOf,
} from '@/utils/dataAi/faciesWriteBack';
import { buildFaciesCsv, CSV_COLUMNS } from '@/utils/dataAi/faciesReport';
import { createFaciesWorker } from '@/utils/dataAi/faciesWorkerFactory';

beforeEach(() => { mockCalls.length = 0; mockResult = { data: [], error: null }; });

// three wells of 30 samples, two log responses per facies from a fixed list
const WIGGLE = [0.3, -0.2, 0.1, -0.4, 0.25, -0.15, 0.05, 0.35, -0.3, 0.2, 0.12, -0.33];
const FAC = { sand: [40, 2.3], shale: [110, 2.55], lime: [25, 2.68] };
const makeTable = () => {
  const group = []; const depth = []; const GR = []; const RHOB = []; const facies = [];
  ['A-1', 'A-2', 'A-3'].forEach((w, k) => {
    for (let i = 0; i < 30; i += 1) {
      const f = ['sand', 'shale', 'lime'][Math.floor(i / 10 + k) % 3];
      const e = WIGGLE[(i + k) % 12];
      group.push(w); depth.push(2000 + i * 0.5); GR.push(FAC[f][0] + 5 * e); RHOB.push(FAC[f][1] + 0.02 * e);
      facies.push(i % 7 === 3 ? null : f);
    }
  });
  return {
    source: 'wells', label: '3 wells', ref: {}, wells: [{ id: 'w1', name: 'A-1', rows: 30 }, { id: 'w2', name: 'A-2', rows: 30 }, { id: 'w3', name: 'A-3', rows: 30 }],
    group, depth, depthUnit: 'm', columns: { GR, RHOB }, units: {}, facies, faciesName: 'FAC', intervals: null, notes: [],
  };
};
const table = makeTable();
const spec = {
  ...defaultSpec(),
  features: [{ name: 'GR', log: false }, { name: 'RHOB', log: false }],
  depthMin: '2001',
  facies: { source: 'column', curve: '', kind: '' },
  kmeans: { k: '3', seed: '4', nInit: '2' },
  elbow: { kMin: '1', kMax: '4' },
  agglomerative: { linkage: 'ward', k: '3', sample: false, seed: '42' },
  supervised: { ...defaultSpec().supervised, holdout: 'chosen', chosen: ['A-3'], knnK: '3', maxDepth: '3' },
};
const design = buildFaciesDesign(table, spec);
const parsed = parseSpec(spec);

const collect = (msg) => { const out = []; handleFaciesMessage(msg, (m) => out.push(m)); return out; };
const last = (msg) => { const out = collect(msg); return out[out.length - 1]; };

describe('the worker protocol', () => {
  it('runs every job as its workflow and names exactly the six jobs', () => {
    expect(Object.keys(JOBS).sort()).toEqual(['agglomerative', 'cart', 'elbow', 'kmeans', 'knn', 'pca']);
    const payload = { design, parsed };
    expect(last({ type: 'run', id: 1, job: 'pca', payload }).result).toEqual(runPca(payload));
    expect(last({ type: 'run', id: 2, job: 'kmeans', payload }).result).toEqual(runKmeans(payload));
    expect(last({ type: 'run', id: 3, job: 'agglomerative', payload }).result).toEqual(runAgglomerative(payload));
    expect(last({ type: 'run', id: 4, job: 'knn', payload }).result).toEqual(runSupervised({ ...payload, method: 'knn' }));
    expect(last({ type: 'run', id: 5, job: 'cart', payload }).result).toEqual(runSupervised({ ...payload, method: 'cart' }));
  });

  it('posts elbow progress per k, then the result', () => {
    const out = collect({ type: 'run', id: 8, job: 'elbow', payload: { design, parsed } });
    const progress = out.filter((m) => m.type === 'progress');
    expect(progress.map((m) => m.done)).toEqual([1, 2, 3, 4]);
    progress.forEach((m) => { expect(m.id).toBe(8); expect(m.total).toBe(4); expect(m.phase).toBe('elbow'); });
    expect(out[out.length - 1]).toEqual({ type: 'done', id: 8, job: 'elbow', result: runElbow({ design, parsed }) });
  });

  it('answers an unknown job and a thrown error with error messages, and ignores anything else', () => {
    expect(collect({ type: 'run', id: 9, job: 'som', payload: {} }))
      .toEqual([{ type: 'error', id: 9, job: 'som', message: 'Unknown Electrofacies Studio job som.' }]);
    const e = collect({ type: 'run', id: 6, job: 'kmeans', payload: {} });
    expect(e).toHaveLength(1);
    expect(e[0].type).toBe('error');
    expect(collect({ type: 'ping' })).toEqual([]);
    expect(collect(null)).toEqual([]);
  });

  it('runs through a worker when one is made, passes progress on and terminates it', async () => {
    let terminated = 0;
    const fake = () => {
      const w = {
        onmessage: null,
        terminate: () => { terminated += 1; },
        postMessage: (m) => setTimeout(() => handleFaciesMessage(m, (x) => w.onmessage?.({ data: x })), 0),
      };
      return w;
    };
    const seen = [];
    const { promise } = runFaciesAsync('elbow', { design, parsed }, { createWorker: fake, onProgress: (p) => seen.push(p.done) });
    expect(await promise).toEqual(runElbow({ design, parsed }));
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(terminated).toBe(1);
  });

  it('runs inline when no worker can be made (jest maps the factory to null), and cancels', async () => {
    expect(createFaciesWorker()).toBeNull();
    const { promise } = runFaciesAsync('pca', { design, parsed });
    expect(await promise).toEqual(runPca({ design, parsed }));
    const c = runFaciesAsync('pca', { design, parsed });
    c.cancel();
    await expect(c.promise).rejects.toThrow('cancelled');
  });
});

describe('dai_facies_runs service', () => {
  it('lists only the current organization, newest first', async () => {
    mockResult = { data: [{ id: 'a', name: 'A', source: 'wells', summary: { rows: 9 }, created_at: 't0', updated_at: 't1', created_by: 'u1' }], error: null };
    const list = await createFaciesRunsService(() => 'org-1').list();
    expect(FACIES_RUNS_TABLE).toBe('dai_facies_runs');
    expect(FACIES_RUNS_MIGRATION).toBe('20260924140000_d3_dai_facies_runs');
    expect(mockCalls).toContainEqual(['from', 'dai_facies_runs']);
    expect(mockCalls).toContainEqual(['select', 'id, name, source, summary, created_at, updated_at, created_by']);
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
    expect(mockCalls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(list).toEqual([{ id: 'a', name: 'A', source: 'wells', summary: { rows: 9 }, createdAt: 't0', updatedAt: 't1', createdBy: 'u1' }]);
  });

  it('saves under the organization and never sends the author', async () => {
    const payload = serializeStudy({
      name: '  Ward on A wells ', source: 'wells', dataRef: { wellIds: ['w1'] }, table, spec, design, parsed, results: {},
    });
    await createFaciesRunsService(() => 'org-1').save('r1', payload);
    const upsert = mockCalls.find((c) => c[0] === 'upsert');
    expect(upsert[1]).toMatchObject({
      id: 'r1', organization_id: 'org-1', name: 'Ward on A wells', source: 'wells', summary: payload.summary, payload,
    });
    expect(upsert[1]).not.toHaveProperty('created_by');
    expect(upsert[1]).toHaveProperty('schema_version', 1);
  });

  it('names an unnamed run, refuses without an organization, and reports a refused delete', async () => {
    await createFaciesRunsService(() => 'org-1').save('r2', { name: ' ' });
    expect(mockCalls.find((c) => c[0] === 'upsert')[1].name).toBe('Untitled facies run');
    await expect(createFaciesRunsService(() => null).save('r1', { name: 'x' })).rejects.toThrow(NO_ORG_MESSAGE);
    mockResult = { data: [], error: null };
    await expect(createFaciesRunsService(() => 'org-1').remove('r1'))
      .rejects.toThrow('Only the author of a facies run or an organization owner or admin can delete it.');
  });
});

describe('the saved run payload', () => {
  const results = {
    pca: { result: runPca({ design, parsed }) },
    kmeans: { result: runKmeans({ design, parsed }) },
    knn: { result: runSupervised({ design, parsed, method: 'knn' }) },
    cart: { result: runSupervised({ design, parsed, method: 'cart' }) },
  };

  it('keeps the inputs, the seeds and a summary of the engine scores', () => {
    const payload = serializeStudy({
      name: 'F', source: 'upload', dataRef: {}, table: { ...table, source: 'upload' }, spec, design, parsed, results,
    });
    expect(payload.schema).toBe(STUDY_SCHEMA);
    expect(payload.snapshot.facies).toEqual(table.facies);
    const s = payload.summary;
    expect(s.fingerprint).toBe(fingerprint(design));
    expect(s.engine).toMatch(/^petrolord-engines 1906182/);
    expect(s.pca.explainedVarianceRatio).toEqual(results.pca.result.explainedVarianceRatio);
    const km = results.kmeans.result;
    expect(s.methods.kmeans).toMatchObject({
      k: 3, seed: 4, nInit: 2, inertia: km.kmeans.inertia, silhouette: km.silhouette.mean,
      core: { mode: km.compare.mode, rows: km.compare.rows, ari: km.compare.match.ari, accuracy: km.compare.match.report.accuracy },
    });
    expect(s.methods.knn).toMatchObject({ heldOutWells: ['A-3'], accuracy: results.knn.result.scores.report.accuracy, ari: results.knn.result.scores.ari.ari });
    expect(s.methods.cart.macroF1).toBe(results.cart.result.scores.report.macro.f1);
    const back = studyFromPayload(JSON.parse(JSON.stringify(payload)));
    expect(back.spec).toEqual(spec);
  });

  it('records a refusal as the engine wrote it', () => {
    const p = parseSpec({ ...spec, kmeans: { k: '0', seed: '4', nInit: '1' } });
    const s = serializeStudy({
      name: 'x', source: 'wells', dataRef: {}, table, spec, design, parsed: p, results: { kmeans: { result: runKmeans({ design, parsed: p }) } },
    }).summary;
    expect(s.methods.kmeans.refused).toBe(C.kmeans({ X: design.X, k: 0, seed: 4, nInit: 1 }).error);
  });

  it('changes the fingerprint when one core facies changes, and keeps the spec only for a large upload', () => {
    const t2 = makeTable();
    t2.facies[5] = 'lime';
    expect(fingerprint(buildFaciesDesign(t2, spec))).not.toBe(fingerprint(design));
    expect(fingerprint(buildFaciesDesign(makeTable(), spec))).toBe(fingerprint(design));
    const big = { ...table, source: 'upload', columns: { GR: new Array(MAX_SAVED_UPLOAD_VALUES + 1).fill(1) }, depth: null, facies: null };
    const payload = serializeStudy({
      name: 'x', source: 'upload', dataRef: {}, table: big, spec, design, parsed, results: {},
    });
    expect(payload.snapshot).toBeNull();
    expect(payload.snapshotOmitted).toBe(true);
    expect(studyFromPayload({ schema: 2 })).toBeNull();
  });
});

describe('the facies log write-back', () => {
  const km = runKmeans({ design, parsed });

  it('puts each label on its own depth sample of the well, from entry 0', () => {
    const { at, values } = wellLabels({
      design, table, labels: km.labels, wellName: 'A-2',
    });
    // the window starts at 2001 m, so entries 0 and 1 (2000, 2000.5 m) are out
    expect(at[0]).toBe(2);
    expect(at).toHaveLength(28);
    const j0 = design.groups.indexOf('A-2');
    expect(values[0]).toBe(km.labels[j0]);
    expect(table.depth[design.rows[j0]]).toBe(2001);
    const block = {
      n: 30, grid: { startMdM: 2000, stopMdM: 2014.5, stepM: 0.5 }, logIds: { GR: 'l1', RHOB: 'l2' }, depthLogId: 'd',
    };
    const codes = faciesCodes('kmeans', km.labels, km);
    const log = buildFaciesLog({
      block, values: values.map(codes.code), at, mnemonic: 'EFAC_KM', unit: '', description: 'x', provenance: { method: 'kmeans' },
    });
    expect(log.nSamples).toBe(30);
    expect(Number.isNaN(log.data[0])).toBe(true);
    expect(Number.isNaN(log.data[1])).toBe(true);
    expect(log.data[2]).toBe(values[0]);
    expect(log.nullCount).toBe(2);
    expect(log.provenance.input_log_ids).toEqual(['l1', 'l2']);
  });

  it('codes clusters as themselves with the matched facies, and text facies by sorted position', () => {
    const c = faciesCodes('kmeans', km.labels, km);
    expect(c.kind).toBe('cluster');
    expect(c.legend.map((l) => l.code)).toEqual([0, 1, 2]);
    c.legend.forEach((l) => {
      expect(l.matchedFacies).toBe(km.compare.match.mapping.find((m) => m.cluster === l.code).facies);
    });
    const knn = runSupervised({ design, parsed, method: 'knn' });
    const f = faciesCodes('knn', knn.labels, knn);
    expect(f.legend).toEqual([{ code: 0, label: 'lime' }, { code: 1, label: 'sand' }, { code: 2, label: 'shale' }]);
    expect(f.code('shale')).toBe(2);
    const n = faciesCodes('cart', [3, null, 1, 3], {});
    expect(n.legend).toEqual([{ code: 1, label: '1' }, { code: 3, label: '3' }]);
    expect(n.code(3)).toBe(3);
  });

  it('carries the method, seed, parameters, scores and engine pin as provenance', () => {
    const p = faciesProvenance({
      key: 'kmeans', result: km, parsed, design, table, wellName: 'A-2', projectName: 'run', legend: [],
    });
    expect(p).toMatchObject({
      computed: true, engine: 'electrofacies-studio', operation: 'electrofacies-clustering', engine_commit: ENGINE_COMMIT, method: 'kmeans',
      parameters: { k: 3, seed: 4, n_init: 2, inertia: km.kmeans.inertia }, scaling: 'standard', logs: ['GR', 'RHOB'], written_well: 'A-2',
      core_comparison: { matching: km.compare.mode, adjusted_rand_index: km.compare.match.ari },
    });
    const cart = runSupervised({ design, parsed, method: 'cart' });
    const pc = faciesProvenance({
      key: 'cart', result: cart, parsed, design, table, wellName: 'A-1', legend: [],
    });
    expect(pc.scaling).toMatch(/^none/);
    expect(pc.parameters.tree).toBe(cart.finalTree.printed);
    expect(pc.core_comparison).toMatchObject({ held_out_wells: ['A-3'], hold_out: 'wells chosen by the user', accuracy: cart.scores.report.accuracy });
  });

  it('suggests a free mnemonic and never overwrites a stored curve', () => {
    expect(suggestFaciesMnemonic('kmeans', ['GR', 'EFAC_KM'])).toBe('EFAC_KM2');
    expect(suggestFaciesMnemonic('cart', [])).toBe('EFAC_CART');
    expect(mnemonicProblem('GR', '', ['GR', 'RHOB'])).toMatch(/already has a curve named GR/);
    expect(mnemonicProblem('EFAC_KM', '', ['GR'])).toBeNull();
  });
});

describe('the write-back training-range check', () => {
  // A-1 and A-2 cored (every row), A-3 uncored and a copy of A-1 with planted
  // values: GR 200 on entries 0 to 4 (above every training GR), RHOB 2.0 on
  // entries 3 to 6 (below every training RHOB), GR exactly the training max on
  // entry 10 and RHOB exactly the training min on entry 11 (inside: a bound is
  // inside). So on A-3: GR 5 above, RHOB 4 below, 7 rows outside (0 to 6).
  const base = makeTable();
  const n = 30;
  const GR = base.columns.GR.slice(); const RHOB = base.columns.RHOB.slice();
  const facies = base.facies.slice();
  for (let i = 0; i < 2 * n; i += 1) {
    const f = ['sand', 'shale', 'lime'][Math.floor((i % n) / 10 + Math.floor(i / n)) % 3];
    facies[i] = f;
  }
  // the training range, counted here from the raw columns of A-1 and A-2
  const grMax = Math.max(...GR.slice(0, 2 * n));
  const rhobMin = Math.min(...RHOB.slice(0, 2 * n));
  for (let i = 0; i < n; i += 1) {
    GR[2 * n + i] = GR[i]; RHOB[2 * n + i] = RHOB[i]; facies[2 * n + i] = null;
  }
  [0, 1, 2, 3, 4].forEach((i) => { GR[2 * n + i] = 200; });
  [3, 4, 5, 6].forEach((i) => { RHOB[2 * n + i] = 2.0; });
  GR[2 * n + 10] = grMax;
  RHOB[2 * n + 11] = rhobMin;
  const t = { ...base, columns: { GR, RHOB }, facies };
  const sp = {
    ...spec, depthMin: '', supervised: { ...spec.supervised, holdout: 'chosen', chosen: ['A-2'] },
  };
  const d = buildFaciesDesign(t, sp);
  const pr = parseSpec(sp);

  it('counts per log the labelled rows of the written well outside the min and max of the final model training rows', () => {
    expect(d.labelled).toHaveLength(2 * n);
    ['knn', 'cart'].forEach((method) => {
      const r = runSupervised({ design: d, parsed: pr, method });
      const c = trainingRangeCheck({
        key: method, result: r, design: d, labels: r.labels, wellName: 'A-3',
      });
      expect(c.trainingRows).toBe(2 * n);
      expect(c.rowsChecked).toBe(n);
      expect(c.rowsOutside).toBe(7);
      expect(c.features).toEqual([
        { name: 'GR', min: Math.min(...GR.slice(0, 2 * n)), max: grMax, below: 0, above: 5, outside: 5 },
        { name: 'RHOB', min: rhobMin, max: Math.max(...RHOB.slice(0, 2 * n)), below: 4, above: 0, outside: 4 },
      ]);
      // the training wells themselves are inside by construction
      const own = trainingRangeCheck({
        key: method, result: r, design: d, labels: r.labels, wellName: 'A-1',
      });
      expect(own.rowsOutside).toBe(0);
    });
  });

  it('uses every design row for k-means, so nothing is outside', () => {
    const km = runKmeans({ design: d, parsed: pr });
    const c = trainingRangeCheck({
      key: 'kmeans', result: km, design: d, labels: km.labels, wellName: 'A-3',
    });
    expect(c.trainingRows).toBe(3 * n);
    expect(c.rowsOutside).toBe(0);
    expect(trainingRowsOf('agglomerative', { rows: [0, 5] }, d).rows).toEqual([0, 5]);
    expect(trainingRowsOf('agglomerative', { rows: null }, d).rows).toHaveLength(3 * n);
  });

  it('stores the counts in the write-back provenance', () => {
    const r = runSupervised({ design: d, parsed: pr, method: 'knn' });
    const c = trainingRangeCheck({
      key: 'knn', result: r, design: d, labels: r.labels, wellName: 'A-3',
    });
    const p = faciesProvenance({
      key: 'knn', result: r, parsed: pr, design: d, table: t, wellName: 'A-3', legend: [], rangeCheck: c,
    });
    expect(p.training_range).toEqual({
      training_rows: 'every cored row (the final model is trained on them)',
      training_row_count: 2 * n,
      rows_checked: n,
      rows_outside_any_log: 7,
      per_log: [
        { log: 'GR', training_min: c.features[0].min, training_max: grMax, rows_below: 0, rows_above: 5, rows_outside: 5 },
        { log: 'RHOB', training_min: rhobMin, training_max: c.features[1].max, rows_below: 4, rows_above: 0, rows_outside: 4 },
      ],
    });
  });
});

describe('the CSV report', () => {
  it('writes the engine values at full precision, one label row per design row and method', () => {
    const results = {
      pca: { result: runPca({ design, parsed }) },
      kmeans: { result: runKmeans({ design, parsed }) },
      cart: { result: runSupervised({ design, parsed, method: 'cart' }) },
    };
    const csv = buildFaciesCsv({
      runName: 'r', table, design, parsed, results,
    });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines).toContain(`score,kmeans,,,inertia,${results.kmeans.result.kmeans.inertia},`);
    expect(lines).toContain(`pca,pca,,,eigenvalue PC1,${results.pca.result.eigenvalues[0]},`);
    expect(lines.filter((l) => l.startsWith('row,kmeans,'))).toHaveLength(design.X.length);
    expect(lines.filter((l) => l.startsWith('row,cart,'))).toHaveLength(design.X.length);
    expect(lines.filter((l) => l.startsWith('row,core,'))).toHaveLength(design.X.length);
    expect(csv).toContain('tree,cart,,,final tree,,"|--- ');
  });

  it('carries the PCA warning as one meta row when the engine gives one, and none when it does not', () => {
    const golden = require('../../../../packages/engines/test-data/dataai/goldens/cluster_cases.json');
    const c = golden.cases.find((x) => x.id === 'pca-warning-both');
    if (!c) throw new Error('golden case pca-warning-both missing from cluster_cases.json');
    const pca = C.pca(c.input || c.args);
    expect(pca.warning.split('; ')).toHaveLength(2);
    const csv = buildFaciesCsv({
      runName: 'r', table, design, parsed, results: { pca: { result: pca } },
    });
    const q = `"${pca.warning.replace(/"/g, '""')}"`;
    const rows = csv.trim().split('\n').filter((l) => l.startsWith('meta,pca,,,warning,'));
    expect(rows).toEqual([`meta,pca,,,warning,,${/[",\n\r]/.test(pca.warning) ? q : pca.warning}`]);
    const plain = buildFaciesCsv({
      runName: 'r', table, design, parsed, results: { pca: { result: runPca({ design, parsed }) } },
    });
    expect(plain).not.toContain('meta,pca,,,warning');
  });

  it('writes a refusal as the engine wrote it', () => {
    const p = parseSpec({ ...spec, agglomerative: { linkage: 'single', k: '3', sample: false, seed: '1' } });
    const csv = buildFaciesCsv({
      runName: 'r', table, design, parsed: p, results: { agglomerative: { result: runAgglomerative({ design, parsed: p }) } },
    });
    expect(csv).toContain('refused,agglomerative,,,,,"linkage must be \'ward\', \'complete\' or \'average\'"');
  });
});
