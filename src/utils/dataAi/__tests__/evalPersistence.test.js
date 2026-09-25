/**
 * AI Evaluation Studio (D5): dai_eval_runs persistence (organization scoped,
 * author kept, refusals reported); the saved run payload (inputs, seed,
 * engine pin, summary, fingerprint; never the helper's output); the CSV
 * report (full precision, refusals, excluded queries and unsupported claims
 * with their reasons, interval labels, bin edges); the worker protocol; and
 * the helper client's status mapping.
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
  createEvalRunsService, NO_ORG_MESSAGE, EVAL_RUNS_TABLE, EVAL_RUNS_MIGRATION,
} from '@/utils/dataAi/evalRunsService';
import {
  serializeStudy, studyFromPayload, fingerprint, stampFor, STUDY_SCHEMA, specFromPayload,
} from '@/utils/dataAi/evalStudy';
import {
  defaultSpec, parseSpec, runRetrieval, runMetrics, runCompare, runAnswers, runExtraction, runAgreement, runCalibration, ENGINE_COMMIT,
} from '@/utils/dataAi/evalWorkflows';
import {
  ekeneDataset, uploadDataset, datasetFromSnapshot, MAX_SAVED_UPLOAD_CHARS,
} from '@/utils/dataAi/evalData';
import { buildEvalCsv, CSV_COLUMNS } from '@/utils/dataAi/evalReport';
import { handleEvalMessage, runEvalAsync, JOBS } from '@/utils/dataAi/evalJobs';
import {
  askAssist, kindForStatus, AssistError, ASSIST_MESSAGES,
} from '@/utils/dataAi/evalAssist';

beforeEach(() => { mockCalls.length = 0; mockResult = { data: [], error: null }; });

const D = ekeneDataset();
const spec = defaultSpec();
const parsed = parseSpec(spec);
const results = {
  retrieval: { result: runRetrieval({ dataset: D, parsed }) },
  metrics: { result: runMetrics({ dataset: D, parsed }) },
  compare: { result: runCompare({ dataset: D, parsed }) },
  answers: { result: runAnswers({ dataset: D, parsed: parseSpec({ ...spec, answers: { system: 'B', numericRelTol: '0' } }) }) },
  extraction: { result: runExtraction({ dataset: D, parsed }) },
  agreement: { result: runAgreement({ dataset: D }) },
  calibration: { result: runCalibration({ dataset: D, parsed }) },
};

describe('dai_eval_runs service', () => {
  it('lists only the current organization, newest first', async () => {
    mockResult = { data: [{ id: 'a', name: 'A', source: 'ekene', summary: { passages: 60 }, created_at: 't0', updated_at: 't1', created_by: 'u1' }], error: null };
    const list = await createEvalRunsService(() => 'org-1').list();
    expect(EVAL_RUNS_TABLE).toBe('dai_eval_runs');
    expect(EVAL_RUNS_MIGRATION).toBe('20260925190000_d5_dai_eval_runs');
    expect(mockCalls).toContainEqual(['from', 'dai_eval_runs']);
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
    expect(mockCalls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(list).toEqual([{ id: 'a', name: 'A', source: 'ekene', summary: { passages: 60 }, createdAt: 't0', updatedAt: 't1', createdBy: 'u1' }]);
  });

  it('saves under the organization, lifts source and summary into columns, and never sends the author', async () => {
    mockResult = { error: null };
    const payload = serializeStudy({
      name: '  Ekene A against B  ', dataset: D, datasetPrint: fingerprint(D), spec, results,
    });
    await createEvalRunsService(() => 'org-1').save('r1', payload);
    const upsert = mockCalls.find((c) => c[0] === 'upsert');
    expect(upsert[1]).toMatchObject({
      id: 'r1', organization_id: 'org-1', name: 'Ekene A against B', source: 'ekene', summary: payload.summary, payload,
    });
    expect(upsert[1]).not.toHaveProperty('created_by');
    expect(upsert[1]).toHaveProperty('schema_version', 1);
  });

  it('names an unnamed run, refuses to save without an organization, and reports a refused delete', async () => {
    mockResult = { error: null };
    await createEvalRunsService(() => 'org-1').save('r2', { name: ' ' });
    expect(mockCalls.find((c) => c[0] === 'upsert')[1].name).toBe('Untitled evaluation run');
    await expect(createEvalRunsService(() => null).save('r1', { name: 'x' })).rejects.toThrow(NO_ORG_MESSAGE);
    expect(NO_ORG_MESSAGE).toBe('Evaluation runs are saved to your organization. Join or select an organization to save one.');
    mockResult = { data: [], error: null };
    await expect(createEvalRunsService(() => 'org-1').remove('r1'))
      .rejects.toThrow('Only the author of an evaluation run or an organization owner or admin can delete it.');
  });
});

describe('the saved run payload', () => {
  const payload = serializeStudy({
    name: 'E', dataset: D, datasetPrint: fingerprint(D), spec, results,
  });

  it('references the Ekene documents, keeps the spec with the seed and the engine pin, and reads back', () => {
    expect(payload.schema).toBe(STUDY_SCHEMA);
    expect(payload.source).toBe('ekene');
    expect(payload.snapshot).toBeNull();
    expect(payload.dataRef).toEqual({ fixture: 'ekene-docs', commit: ENGINE_COMMIT });
    expect(payload.engine.commit).toBe(ENGINE_COMMIT);
    expect(payload.summary.fingerprint).toBe(fingerprint(D));
    const back = studyFromPayload(JSON.parse(JSON.stringify(payload)));
    expect(back.spec).toEqual(spec);
    expect(specFromPayload({ compare: { seed: '7' } }).compare).toEqual({ ...defaultSpec().compare, seed: '7' });
  });

  it('records what the runs found: the excluded query, the comparison with its seed and labels, the kappas and the closure', () => {
    const s = payload.summary;
    const cp = results.compare.result;
    expect(s.metrics.excluded).toEqual([{ query: 'Q24', reason: 'no judged document has grade 1 or more' }]);
    expect(s.metrics.mean).toEqual(results.metrics.result.evaluation.mean);
    expect(s.compare).toMatchObject({
      a: 'A', b: 'B', metric: 'ndcg', queries: 23, seed: 20260925, nBoot: 2000, level: 0.95, paired: true, difference: cp.paired.difference, lower: cp.paired.lower, upper: cp.paired.upper, labels: cp.paired.labels,
    });
    expect(s.answers).toMatchObject({ system: 'B', nClaims: results.answers.result.check.nClaims, shortExact: 13, shortN: 24 });
    expect(s.agreement.quadratic).toBe(results.agreement.result.results.quadratic.kappa);
    expect(s.calibration.closure).toBe(results.calibration.result.result.murphy.closure);
  });

  it('keeps an uploaded dataset in the run, and drops one too large to keep with a flag', () => {
    const up = uploadDataset({ label: 'x', documents: [{ id: 'a', text: 'oil rate 120' }], queries: [{ id: 'q', text: 'oil' }], judgments: { q: { a: 2 } } });
    const p = serializeStudy({
      name: 'U', dataset: up, datasetPrint: fingerprint(up), spec, results: {},
    });
    expect(p.source).toBe('upload');
    expect(fingerprint(datasetFromSnapshot(p.snapshot))).toBe(fingerprint(up));
    const big = uploadDataset({ label: 'b', documents: [{ id: 'a', text: 'x'.repeat(MAX_SAVED_UPLOAD_CHARS) }], queries: [{ id: 'q', text: 'x' }] });
    const pb = serializeStudy({
      name: 'B', dataset: big, datasetPrint: fingerprint(big), spec, results: {},
    });
    expect(pb.snapshot).toBeNull();
    expect(pb.snapshotOmitted).toBe(true);
  });

  it('changes the fingerprint when one grade changes, and marks results stale when their inputs change', () => {
    const d2 = ekeneDataset();
    d2.judgments.Q01['EKD-002'] += 1;
    expect(fingerprint(d2)).not.toBe(fingerprint(D));
    expect(fingerprint(ekeneDataset())).toBe(fingerprint(D));
    const p = fingerprint(D);
    const s2 = { ...spec, compare: { ...spec.compare, seed: '1' } };
    expect(stampFor('compare', p, s2)).not.toBe(stampFor('compare', p, spec));
    expect(stampFor('metrics', p, s2)).toBe(stampFor('metrics', p, spec));
    const s3 = { ...spec, retrieval: { ...spec.retrieval, b: '0.5' } };
    // metrics reads the retrieval settings only when its source is the retrieval run
    expect(stampFor('metrics', p, s3)).not.toBe(stampFor('metrics', p, spec));
    expect(stampFor('compare', p, s3)).toBe(stampFor('compare', p, spec));
    expect(stampFor('answers', fingerprint(d2), spec)).not.toBe(stampFor('answers', p, spec));
  });
});

describe('the CSV report', () => {
  const csv = buildEvalCsv({
    runName: 'E', dataset: D, spec, results,
  });
  const lines = csv.trim().split('\n');

  it('has one header, the engine pin, the synthetic label and full-precision engine values', () => {
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(csv).toContain(`engine commit,${ENGINE_COMMIT}`);
    expect(csv).toMatch(/^meta,,,,,synthetic,,"?Synthetic teaching data for the Ekene field/m);
    const e = results.metrics.result.evaluation;
    expect(csv).toContain(`mean,metrics,current retrieval settings (BM25, top 5),,,ndcg,${String(e.mean.ndcg)},`.replace('current retrieval settings (BM25, top 5)', '"current retrieval settings (BM25, top 5)"'));
    const p = results.compare.result.paired;
    expect(csv).toContain(`bootstrap,compare,A minus B,,,difference,${String(p.difference)},`);
    expect(csv).toContain(`bootstrap,compare,A minus B,,,lower label,,${p.labels.lower}`);
    expect(csv).toContain(`murphy,calibration,,,,closure,${String(results.calibration.result.result.murphy.closure)},`);
  });

  it('writes the excluded query, every unsupported claim and every bin with its reason or edges', () => {
    expect(csv).toContain('excluded,metrics,"current retrieval settings (BM25, top 5)",Q24,,,,no judged document has grade 1 or more');
    const unsupported = results.answers.result.check.perAnswer.flatMap((a) => a.claims.filter((c) => !c.supported));
    expect(unsupported.length).toBeGreaterThan(0);
    unsupported.forEach((c) => expect(csv).toContain(c.reason.includes(',') ? c.reason.replace(/"/g, '""') : c.reason));
    expect(csv).toContain('bin,calibration,,,,"bin 0 [0, 0.1)"');
    expect(csv).toContain('bin,calibration,,,,"bin 9 [0.9, 1]"');
    expect(csv).toContain('tie,retrieval,,Q10,,,,EKD-046 = EKD-058');
  });

  it('writes refusals as rows', () => {
    const bad = { metrics: { result: runMetrics({ dataset: D, parsed: parseSpec({ ...spec, metrics: { ...spec.metrics, k: '0' } }) }) } };
    const c = buildEvalCsv({
      runName: 'E', dataset: D, spec, results: bad,
    });
    expect(c).toContain('refused,metrics,,,,,,k must be a whole number from 1 to 1000');
  });
});

describe('the worker protocol', () => {
  it('runs every job inline and posts the engine result, and names an unknown job', async () => {
    expect(Object.keys(JOBS).sort()).toEqual(['agreement', 'answers', 'assistCheck', 'assistContext', 'calibration', 'compare', 'extraction', 'metrics', 'retrieval']);
    const posted = [];
    handleEvalMessage({
      type: 'run', id: 7, job: 'calibration', payload: { dataset: D, parsed },
    }, (m) => posted.push(m));
    expect(posted[0]).toMatchObject({ type: 'done', id: 7, job: 'calibration' });
    expect(posted[0].result.result.brier).toBe(results.calibration.result.result.brier);
    handleEvalMessage({ type: 'run', id: 8, job: 'nope' }, (m) => posted.push(m));
    expect(posted[1]).toEqual({
      type: 'error', id: 8, job: 'nope', message: 'Unknown AI Evaluation Studio job nope.',
    });
    const { promise } = runEvalAsync('agreement', { dataset: D, parsed });
    expect((await promise).results.none.kappa).toBe(results.agreement.result.results.none.kappa);
  });

  it('uses a worker when one can be made, and cancels', async () => {
    const worker = { postMessage: jest.fn(), terminate: jest.fn() };
    const { promise, cancel } = runEvalAsync('metrics', { dataset: D, parsed }, { createWorker: () => worker });
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'run', job: 'metrics' }));
    cancel();
    await expect(promise).rejects.toThrow('cancelled');
    expect(worker.terminate).toHaveBeenCalled();
  });
});

describe('the helper client', () => {
  it('maps statuses to kinds, with 503 and a missing function as not configured', () => {
    expect([401, 403, 429, 503, 502, 400, 404, 500].map(kindForStatus)).toEqual(['auth', 'not-member', 'cap', 'not-configured', 'upstream', 'bad-request', 'not-configured', 'failed']);
  });

  it('sends the organization, the query and the passages, and returns the answer with its citations', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { answer: 'x', citations: ['A', '', 3], model: 'm', calls_today: 1, daily_cap: 50 }, error: null });
    const r = await askAssist({ functions: { invoke } }, { organizationId: 'o', query: 'q', passages: [{ id: 'A', text: 't', extra: 1 }] });
    expect(invoke).toHaveBeenCalledWith('ai-eval-assist', { body: { organization_id: 'o', query: 'q', passages: [{ id: 'A', text: 't' }] } });
    expect(r).toEqual({
      answer: 'x', citations: ['A'], model: 'm', usage: null, callsToday: 1, dailyCap: 50,
    });
  });

  it('refuses without an organization or passages, and carries the cap count on 429', async () => {
    const invoke = jest.fn();
    await expect(askAssist({ functions: { invoke } }, { organizationId: null, query: 'q', passages: [{ id: 'a', text: 't' }] })).rejects.toMatchObject({ kind: 'not-member' });
    await expect(askAssist({ functions: { invoke } }, { organizationId: 'o', query: 'q', passages: [] })).rejects.toMatchObject({ kind: 'bad-request' });
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockResolvedValue({ data: null, error: { context: { status: 429, json: async () => ({ error: 'cap reached', calls_today: 50, daily_cap: 50 }) } } });
    const e = await askAssist({ functions: { invoke } }, { organizationId: 'o', query: 'q', passages: [{ id: 'a', text: 't' }] }).catch((x) => x);
    expect(e).toBeInstanceOf(AssistError);
    expect(e).toMatchObject({
      kind: 'cap', message: 'cap reached', callsToday: 50, dailyCap: 50,
    });
    invoke.mockResolvedValue({ data: null, error: { context: { status: 503, json: async () => { throw new Error('not json'); } } } });
    await expect(askAssist({ functions: { invoke } }, { organizationId: 'o', query: 'q', passages: [{ id: 'a', text: 't' }] })).rejects.toMatchObject({ kind: 'not-configured', message: ASSIST_MESSAGES['not-configured'] });
  });
});
