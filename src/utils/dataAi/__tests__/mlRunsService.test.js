/**
 * dai_ml_runs persistence (D2): organization scoped, author kept, refusals
 * reported; and the saved run payload (inputs, summary, fingerprint). The
 * dai_qc_runs service tests (D1) on the new table.
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

import {
  createMlRunsService, NO_ORG_MESSAGE, ML_RUNS_TABLE, ML_RUNS_MIGRATION,
} from '@/utils/dataAi/mlRunsService';
import {
  serializeStudy, studyFromPayload, fingerprint, summarise, STUDY_SCHEMA,
} from '@/utils/dataAi/mlStudy';
import { defaultSpec, parseSpec, evaluate } from '@/utils/dataAi/mlWorkflows';
import { buildDesign, MAX_SAVED_UPLOAD_VALUES } from '@/utils/dataAi/mlData';

beforeEach(() => { mockCalls.length = 0; mockResult = { data: [], error: null }; });

const NOISE = [0.3, -0.2, 0.1, -0.4, 0.25, -0.15, 0.05, 0.35, -0.3, 0.2];
const makeTable = () => {
  const group = []; const depth = []; const A = []; const T = []; const L = [];
  ['W-1', 'W-2', 'W-3'].forEach((w, k) => {
    for (let i = 0; i < 12; i += 1) {
      group.push(w); depth.push(1000 + i); A.push(i + k); T.push(1 + 2 * (i + k) + NOISE[(i + k) % 10]); L.push((i + k) % 3 === 0 ? 1 : 0);
    }
  });
  return {
    source: 'upload', label: 'wells.csv', ref: { groupColumn: 0 }, wells: [{ id: null, name: 'W-1', rows: 12 }], group, depth, depthUnit: 'm', columns: { A, T, L }, units: {}, notes: [],
  };
};
const table = makeTable();
const spec = { ...defaultSpec(), target: 'T', features: [{ name: 'A', log: false }], validation: { scheme: 'kfold', k: '3', testFraction: '0.25', seed: '5' } };
const design = buildDesign(table, spec);
const parsed = parseSpec(spec);
const evaluation = evaluate({ design, parsed, task: 'regression' });

describe('dai_ml_runs service', () => {
  it('lists only the current organization, newest first, with source, task and summary', async () => {
    mockResult = { data: [{ id: 'a', name: 'A', source: 'wells', task: 'regression', summary: { rows: 9 }, created_at: 't0', updated_at: 't1', created_by: 'u1' }], error: null };
    const list = await createMlRunsService(() => 'org-1').list();
    expect(ML_RUNS_TABLE).toBe('dai_ml_runs');
    expect(ML_RUNS_MIGRATION).toBe('20260924120000_d2_dai_ml_runs');
    expect(mockCalls).toContainEqual(['from', 'dai_ml_runs']);
    expect(mockCalls).toContainEqual(['select', 'id, name, source, task, summary, created_at, updated_at, created_by']);
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
    expect(mockCalls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(list).toEqual([{ id: 'a', name: 'A', source: 'wells', task: 'regression', summary: { rows: 9 }, createdAt: 't0', updatedAt: 't1', createdBy: 'u1' }]);
  });

  it('saves under the organization, lifts source, task and summary into columns, and never sends the author', async () => {
    mockResult = { error: null };
    const payload = serializeStudy({
      name: '  DT from GR  ', source: 'upload', dataRef: {}, table, spec, task: 'regression', design, parsed, evaluation,
    });
    await createMlRunsService(() => 'org-1').save('r1', payload);
    const upsert = mockCalls.find((c) => c[0] === 'upsert');
    expect(upsert[1]).toMatchObject({
      id: 'r1', organization_id: 'org-1', name: 'DT from GR', source: 'upload', task: 'regression', summary: payload.summary, payload,
    });
    expect(upsert[1]).not.toHaveProperty('created_by');
    expect(upsert[1]).not.toHaveProperty('created_at');
    expect(upsert[1]).toHaveProperty('schema_version', 1);
  });

  it('names an unnamed run, and refuses to save without an organization', async () => {
    mockResult = { error: null };
    await createMlRunsService(() => 'org-1').save('r2', { name: ' ' });
    expect(mockCalls.find((c) => c[0] === 'upsert')[1].name).toBe('Untitled ML run');
    await expect(createMlRunsService(() => null).save('r1', { name: 'x' })).rejects.toThrow(NO_ORG_MESSAGE);
    expect(NO_ORG_MESSAGE).toBe('ML runs are saved to your organization. Join or select an organization to save one.');
  });

  it('reports a delete the policy refused instead of claiming success', async () => {
    mockResult = { data: [], error: null };
    await expect(createMlRunsService(() => 'org-1').remove('r1'))
      .rejects.toThrow('Only the author of an ML run or an organization owner or admin can delete it.');
    mockResult = { data: [{ id: 'r1' }], error: null };
    await expect(createMlRunsService(() => 'org-1').remove('r1')).resolves.toEqual({ success: true });
  });

  it('opens a stamped row through the state versioning and returns its payload', async () => {
    mockResult = { data: { id: 'r1', payload: { name: 'A', schema: 1 }, schema_version: 1 }, error: null };
    const p = await createMlRunsService(() => 'org-1').load('r1');
    expect(p).toEqual({ name: 'A', schema: 1 });
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
  });

  it('surfaces a database error rather than an empty list', async () => {
    mockResult = { data: null, error: { message: 'relation "dai_ml_runs" does not exist', code: '42P01' } };
    await expect(createMlRunsService(() => 'org-1').list()).rejects.toMatchObject({ code: '42P01' });
  });
});

describe('the saved run payload', () => {
  it('round-trips the inputs and keeps a summary of the engine scores', () => {
    const payload = serializeStudy({
      name: 'DT', source: 'upload', dataRef: { fileName: 'wells.csv' }, table, spec, task: 'regression', design, parsed, evaluation,
    });
    expect(payload.schema).toBe(STUDY_SCHEMA);
    expect(payload.snapshot.columns.T).toEqual(table.columns.T);
    expect(payload.summary.pooled).toEqual({
      rmse: evaluation.pooled.rmse, mae: evaluation.pooled.mae, r2: evaluation.pooled.r2, n: evaluation.pooled.n,
    });
    expect(payload.summary.folds.map((f) => f.score.r2)).toEqual(evaluation.folds.map((f) => f.test.r2));
    expect(payload.summary.fingerprint).toBe(fingerprint(design));
    expect(payload.summary.engine).toMatch(/^petrolord-engines 3778451/);
    expect(payload.summary.validation).toEqual({ scheme: 'kfold', k: 3, testFraction: null, seed: 5 });
    const back = studyFromPayload(JSON.parse(JSON.stringify(payload)));
    expect(back.spec).toEqual(spec);
    expect(back.source).toBe('upload');
    expect(back.snapshot.group).toEqual(table.group);
  });

  it('records classification scores from the engine report, ROC and log loss', () => {
    const cspec = { ...spec, task: 'classification', label: { mode: 'column', column: 'L', curve: '', op: '>=', cutoff: '' } };
    const d = buildDesign(table, cspec);
    const p = parseSpec(cspec);
    const e = evaluate({ design: d, parsed: p, task: 'classification' });
    const s = summarise({ task: 'classification', design: d, parsed: p, evaluation: e });
    expect(s.pooled).toEqual({
      accuracy: e.pooled.report.accuracy, f1Class1: e.pooled.report.perClass[1].f1, auc: e.pooled.roc.auc, logLoss: e.pooled.logLoss.logLoss,
    });
    expect(s.folds[0].score.converged).toBe(e.folds[0].fit.converged);
  });

  it('changes the fingerprint when one fitted value changes', () => {
    const t2 = makeTable();
    t2.columns.T[4] += 1e-9;
    expect(fingerprint(buildDesign(t2, spec))).not.toBe(fingerprint(design));
    expect(fingerprint(buildDesign(makeTable(), spec))).toBe(fingerprint(design));
  });

  it('does not store registry data, only its reference', () => {
    const payload = serializeStudy({
      name: 'x', source: 'wells', dataRef: { wellIds: ['w1', 'w2'], curves: ['GR', 'DT'] }, table: { ...table, source: 'wells' }, spec, task: 'regression', design, parsed, evaluation,
    });
    expect(payload.snapshot).toBeNull();
    expect(payload.dataRef).toEqual({ wellIds: ['w1', 'w2'], curves: ['GR', 'DT'] });
  });

  it('keeps the spec only when an upload is too large to store, and says so', () => {
    const big = { ...table, columns: { T: new Array(MAX_SAVED_UPLOAD_VALUES + 1).fill(1) }, depth: null };
    const payload = serializeStudy({
      name: 'x', source: 'upload', dataRef: {}, table: big, spec, task: 'regression', design, parsed, evaluation,
    });
    expect(payload.snapshot).toBeNull();
    expect(payload.snapshotOmitted).toBe(true);
  });

  it('refuses a payload of another schema, and fills an old spec from the defaults', () => {
    expect(studyFromPayload({ schema: 99 })).toBeNull();
    expect(studyFromPayload(null)).toBeNull();
    const back = studyFromPayload({ schema: 1, spec: { task: 'nonsense', target: 'DT' } });
    expect(back.spec.task).toBe('regression');
    expect(back.spec.target).toBe('DT');
    expect(back.spec.validation).toEqual(defaultSpec().validation);
  });
});
