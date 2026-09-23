/**
 * dai_qc_runs persistence (D1): organization scoped, author kept, refusals
 * reported. The ps_lopa_studies service tests (PS1) on the new table.
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

import { createQcRunsService, NO_ORG_MESSAGE, QC_RUNS_TABLE } from '@/utils/dataAi/qcRunsService';
import { serializeRun, runFromPayload, fingerprint, RUN_SCHEMA } from '@/utils/dataAi/qcRun';
import { defaultProfile, runQcProfile } from '@/utils/dataAi/qcProfile';
import { MAX_SAVED_UPLOAD_VALUES } from '@/utils/dataAi/qcDatasets';

beforeEach(() => { mockCalls.length = 0; mockResult = { data: [], error: null }; });

const ds = {
  source: 'upload', label: 'test.csv', ref: {},
  index: { name: 'depth', unit: 'm', kind: 'number', values: [1, 2, 3, 4, 5, 6], labels: null },
  channels: [{ key: 'gr', name: 'GR', unit: 'gAPI', values: [50, 52, null, 51, 49, 400], notes: [] }],
  identifiers: null, notes: [],
};

describe('dai_qc_runs service', () => {
  it('lists only the current organization, newest first, with the stored summary', async () => {
    mockResult = { data: [{ id: 'a', name: 'A', source: 'wells', summary: { total: 0.9 }, created_at: 't0', updated_at: 't1', created_by: 'u1' }], error: null };
    const list = await createQcRunsService(() => 'org-1').list();
    expect(QC_RUNS_TABLE).toBe('dai_qc_runs');
    expect(mockCalls).toContainEqual(['from', 'dai_qc_runs']);
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
    expect(mockCalls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(list).toEqual([{ id: 'a', name: 'A', source: 'wells', summary: { total: 0.9 }, createdAt: 't0', updatedAt: 't1', createdBy: 'u1' }]);
  });

  it('saves under the organization, lifts source and summary into columns, and never sends the author', async () => {
    mockResult = { error: null };
    const payload = { name: '  Ekene-3 logs  ', source: 'wells', summary: { total: 0.97 }, profile: {} };
    await createQcRunsService(() => 'org-1').save('r1', payload);
    const upsert = mockCalls.find((c) => c[0] === 'upsert');
    expect(upsert[1]).toMatchObject({ id: 'r1', organization_id: 'org-1', name: 'Ekene-3 logs', source: 'wells', summary: { total: 0.97 }, payload });
    expect(upsert[1]).not.toHaveProperty('created_by');
    expect(upsert[1]).not.toHaveProperty('created_at');
    expect(upsert[1]).toHaveProperty('schema_version', 1);
  });

  it('refuses to save without an organization', async () => {
    await expect(createQcRunsService(() => null).save('r1', { name: 'x' })).rejects.toThrow(NO_ORG_MESSAGE);
  });

  it('reports a delete the policy refused instead of claiming success', async () => {
    mockResult = { data: [], error: null };
    await expect(createQcRunsService(() => 'org-1').remove('r1'))
      .rejects.toThrow(/Only the author of a QC run or an organization owner or admin/);
    mockResult = { data: [{ id: 'r1' }], error: null };
    await expect(createQcRunsService(() => 'org-1').remove('r1')).resolves.toEqual({ success: true });
  });

  it('opens a stamped row through the state versioning and returns its payload', async () => {
    mockResult = { data: { id: 'r1', payload: { name: 'A', schema: 1 }, schema_version: 1 }, error: null };
    const p = await createQcRunsService(() => 'org-1').load('r1');
    expect(p).toEqual({ name: 'A', schema: 1 });
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
  });

  it('surfaces a database error rather than an empty list', async () => {
    mockResult = { data: null, error: { message: 'relation "dai_qc_runs" does not exist', code: '42P01' } };
    await expect(createQcRunsService(() => 'org-1').list()).rejects.toMatchObject({ code: '42P01' });
  });
});

describe('the saved run payload', () => {
  const profile = defaultProfile();
  const run = runQcProfile(ds, profile);

  it('round-trips the inputs and keeps a summary of what the run found', () => {
    const payload = serializeRun({ name: 'GR check', source: 'upload', datasetRef: ds.ref, dataset: ds, profile, run });
    expect(payload.schema).toBe(RUN_SCHEMA);
    expect(payload.snapshot.channels[0].values).toEqual(ds.channels[0].values);
    expect(payload.summary.total).toBe(run.scorecard.total);
    expect(payload.summary.flagCount).toBe(run.flags.length);
    expect(payload.summary.fingerprint).toBe(fingerprint(ds));
    const back = runFromPayload(JSON.parse(JSON.stringify(payload)));
    expect(back.profile).toEqual(profile);
    expect(back.source).toBe('upload');
    expect(back.snapshot.channels[0].values).toEqual(ds.channels[0].values);
  });

  it('changes the fingerprint when one value changes', () => {
    const edited = { ...ds, channels: [{ ...ds.channels[0], values: [50, 52, null, 51, 49, 401] }] };
    expect(fingerprint(edited)).not.toBe(fingerprint(ds));
  });

  it('does not store registry data, only its reference', () => {
    const payload = serializeRun({ name: 'x', source: 'wells', datasetRef: { wellId: 'w' }, dataset: { ...ds, source: 'wells' }, profile, run });
    expect(payload.snapshot).toBeNull();
    expect(payload.datasetRef).toEqual({ wellId: 'w' });
  });

  it('keeps the profile only when an upload is too large to store, and says so', () => {
    const big = { ...ds, channels: [{ ...ds.channels[0], values: new Array(MAX_SAVED_UPLOAD_VALUES + 1).fill(1) }], index: null };
    const payload = serializeRun({ name: 'x', source: 'upload', datasetRef: {}, dataset: big, profile, run });
    expect(payload.snapshot).toBeNull();
    expect(payload.snapshotOmitted).toBe(true);
  });

  it('refuses a payload of another schema instead of misreading it', () => {
    expect(runFromPayload({ schema: 99 })).toBeNull();
    expect(runFromPayload(null)).toBeNull();
  });
});
