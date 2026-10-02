/**
 * Material Balance Studio adopts record sharing for viewing (Reservoir
 * round, app 2; rb_cases and its children under migration 20261002130000).
 * The studio on the /dev harness rows (an in-memory copy of the rb_* tables
 * behind the real Supabase client calls of lib/api.js): the picker splits
 * the user's own cases from those colleagues shared; a shared case opens
 * read-only with its owner's results; no write of any tab reaches it; the
 * owner shares and unshares with the switch; and "Save a copy" makes the
 * reader's own case with the same inputs and no run.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const mockStore = { db: null, writes: [] };
jest.mock('@/lib/customSupabaseClient', () => {
  // the PostgREST calls lib/api.js makes, over mockStore.db; every write is recorded
  const query = (table) => {
    const st = { filters: [], op: 'select', payload: null, order: null };
    const rows = () => mockStore.db[table] || [];
    const match = (r) => st.filters.every(([k, op, v]) => (op === 'eq' ? r[k] === v : op === 'is' ? (r[k] ?? null) === v : op === 'gte' ? r[k] >= v : true));
    const run = () => {
      if (st.op !== 'select') mockStore.writes.push({ table, op: st.op, filters: st.filters.map((f) => f.join(' ')), payload: st.payload });
      if (st.op === 'insert' || st.op === 'upsert') {
        const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r, i) => ({ id: r.id || `${table}-new-${mockStore.writes.length}-${i}`, ...r }));
        mockStore.db[table] = [...rows(), ...list];
        return list;
      }
      if (st.op === 'update') { const out = []; mockStore.db[table] = rows().map((r) => (match(r) ? (out.push({ ...r, ...st.payload }), out[out.length - 1]) : r)); return out; }
      if (st.op === 'delete') { const gone = rows().filter(match); mockStore.db[table] = rows().filter((r) => !match(r)); return gone; }
      let out = rows().filter(match);
      if (st.order) out = [...out].sort((a, b) => ((a[st.order[0]] > b[st.order[0]] ? 1 : -1) * (st.order[1] ? 1 : -1)));
      return out;
    };
    const q = {
      select: () => q, eq: (k, v) => { st.filters.push([k, 'eq', v]); return q; }, is: (k, v) => { st.filters.push([k, 'is', v]); return q; },
      gte: (k, v) => { st.filters.push([k, 'gte', v]); return q; }, in: () => q, limit: () => q,
      order: (k, o = {}) => { st.order = [k, o.ascending !== false]; return q; },
      insert: (p) => { st.op = 'insert'; st.payload = p; return q; }, upsert: (p) => { st.op = 'upsert'; st.payload = p; return q; },
      update: (p) => { st.op = 'update'; st.payload = p; return q; }, delete: () => { st.op = 'delete'; return q; },
      single: () => { const r = run(); return Promise.resolve(r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows' } }); },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return q;
  };
  const supabase = {
    from: (t) => query(t),
    auth: { getUser: async () => ({ data: { user: { id: 'dev-user' } }, error: null }), getSession: async () => ({ data: { session: null }, error: null }) },
    functions: { invoke: jest.fn(async () => ({ data: null, error: { message: 'not on this test' } })) },
    rpc: jest.fn(async () => ({ data: null, error: null })),
  };
  return { supabase, default: supabase };
});

import ReservoirBalance from '../ReservoirBalance';
import { MaterialBalanceStudioProvider, useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import {
  seedSampleStore, addSharingToStore, SAMPLE_USER, SAMPLE_ORG_ID, SAMPLE_COLLEAGUE, SAMPLE_SHARED_CASE_ID, SAMPLE_SHARED_CONFIG_ID, SAMPLE_CASE_IDS,
} from '../harness/sampleCases';
import { runEngineOnStore } from '../harness/engineStandIn';
import { buildRunConfigInput } from '../lib/runStaleness';
import { makeSharingStore } from '@/lib/recordSharing';
import {
  setCaseReadOnly, caseReadOnlyReason, updateCase, replaceProductionData, upsertProductionRow, createRunConfig, updateRunConfig,
  deleteRunConfig, runMBAL, upsertCaseDefaultConfig, savePvtConfig, deleteCase, archiveCase, createCase,
} from '../lib/api';
import { copyCaseAsOwn, caseCopyInput, configCopyInput } from '../lib/copyCase';

// the sharing store over the same rows: only the owner's writes land (row level security)
const sharingStoreOver = () => makeSharingStore({
  async user() { return { id: SAMPLE_USER.id, organizationId: SAMPLE_ORG_ID }; },
  async probe() { return true; },
  async getSharing(table, id) { return (mockStore.db[table] || []).find((r) => r.id === id) || null; },
  async update(table, id, body) {
    const row = (mockStore.db[table] || []).find((r) => r.id === id);
    if (!row || row.user_id !== SAMPLE_USER.id) return { data: [], error: null };
    const { version: _v, change_note: _n, ...patch } = body;
    const next = { ...row, ...patch, version: (row.version || 1) + 1, updated_by: SAMPLE_USER.id };
    mockStore.db[table] = mockStore.db[table].map((r) => (r.id === id ? next : r));
    return { data: [next], error: null };
  },
  async rpc() { return { data: { ok: false, reason: 'not_available' }, error: null }; },
  async changes() { return { data: [], error: null }; },
  async names(ids) { return Object.fromEntries(ids.filter((i) => i === SAMPLE_COLLEAGUE.id).map((i) => [i, SAMPLE_COLLEAGUE.name])); },
});

function seed() {
  const db = addSharingToStore(seedSampleStore());
  const shared = db.rb_cases.find((c) => c.id === SAMPLE_SHARED_CASE_ID);
  const defaultCfg = db.rb_run_configs.find((c) => c.id === SAMPLE_SHARED_CONFIG_ID);
  const production = db.rb_production_data.filter((r) => r.case_id === shared.id).sort((a, b) => a.timestep_index - b.timestep_index);
  db.rb_run_configs.push({ id: 'cfg-colleague-run', case_id: shared.id, user_id: shared.user_id, is_scenario: true, name: 'Run', ...buildRunConfigInput({ ...shared, production_data: production }, defaultCfg) });
  runEngineOnStore(db, { run_config_id: 'cfg-colleague-run' });
  mockStore.db = db;
  mockStore.writes = [];
  return db;
}

const mount = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/mbal" element={<ReservoirBalance sharingStore={sharingStoreOver()} />} />
      <Route path="/mbal/cases/:caseId" element={<ReservoirBalance sharingStore={sharingStoreOver()} />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { mockToast.mockClear(); setCaseReadOnly(null, null); });

describe('the write guard of lib/api.js', () => {
  const REASON = 'Shared by Ada Colleague for viewing.';
  test('every write to the read-only case answers with the reason and never reaches the database', async () => {
    seed();
    setCaseReadOnly(SAMPLE_SHARED_CASE_ID, REASON);
    expect(caseReadOnlyReason()).toBe(REASON);
    const id = SAMPLE_SHARED_CASE_ID;
    const answers = await Promise.all([
      updateCase(id, { name: 'x' }), archiveCase(id), deleteCase(id), replaceProductionData(id, []), replaceProductionData(id, [{ timestep_index: 0, pressure_psia: 1 }]),
      upsertProductionRow(id, { timestep_index: 0, pressure_psia: 1 }), createRunConfig(id, {}), updateRunConfig('cfg-colleague-shared', { name: 'x' }),
      deleteRunConfig('cfg-colleague-shared'), runMBAL('cfg-colleague-shared'), upsertCaseDefaultConfig(id, { oil_gravity_api: 1 }), savePvtConfig(id, { oil_gravity_api: 1 }),
    ]);
    for (const a of answers) expect(a.error).toMatchObject({ code: 'MBAL_READ_ONLY', message: REASON });
    expect(mockStore.writes).toEqual([]);
  });

  test('a case of the user\'s own is written while a shared one is open, and the guard lifts', async () => {
    seed();
    setCaseReadOnly(SAMPLE_SHARED_CASE_ID, REASON);
    expect((await updateCase(SAMPLE_CASE_IDS.ahmed, { description: 'mine' })).error).toBeNull();
    expect((await createCase({ name: 'New', fluid_system: 'oil' })).error).toBeNull();
    expect(mockStore.writes.map((w) => w.op)).toEqual(['update', 'insert']);
    setCaseReadOnly(null, null);
    expect(caseReadOnlyReason()).toBeNull();
    expect((await updateCase(SAMPLE_SHARED_CASE_ID, { description: 'now writable' })).error).toBeNull();
  });
});

describe('the studio under record sharing', () => {
  test('the picker lists the user\'s own cases, then the one a colleague shared', async () => {
    seed();
    const Probe = () => {
      const { ownCases, sharedCases } = useMaterialBalanceStudio();
      return <div><p data-testid="own">{ownCases.map((c) => c.name).join('|')}</p><p data-testid="shared">{sharedCases.map((c) => c.name).join('|')}</p></div>;
    };
    render(<MaterialBalanceStudioProvider caseId={null} sharingStore={sharingStoreOver()}><Probe /></MaterialBalanceStudioProvider>);
    await waitFor(() => expect(screen.getByTestId('shared')).toHaveTextContent('North flank oil (shared by Ada)'));
    const own = screen.getByTestId('own').textContent.split('|').sort();
    expect(own).toEqual(['Ahmed Example 11-3 (depletion drive)', 'Dake Exercise 9.2 (water drive)', 'Pletcher gas with pot aquifer']);
    expect(screen.getByTestId('shared').textContent).toBe('North flank oil (shared by Ada)');
  });

  test('a shared case opens read-only: it says whose it is, shows the owner\'s result, hides Edit and Delete, and a run writes nothing', async () => {
    seed();
    mount(`/mbal/cases/${SAMPLE_SHARED_CASE_ID}?tab=run`);
    const banner = await screen.findByTestId('mbal-read-only');
    await waitFor(() => expect(banner).toHaveTextContent('Shared by Ada Colleague for viewing'));
    expect(banner).toHaveTextContent('Nothing you change here is saved to it');
    expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Ada Colleague');
    expect(screen.queryByTestId('share-switch')).toBeNull();
    expect(screen.queryByTestId('mbal-edit-case')).toBeNull();
    expect(screen.queryByLabelText(/Delete/i)).toBeNull();
    // the owner's run is there to read
    expect(await screen.findByTestId('mbal-result-card')).toBeInTheDocument();
    // a run is refused with the reason, and no row is written
    fireEvent.click(screen.getByRole('button', { name: /Run MBAL/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: expect.stringMatching(/Shared by Ada Colleague for viewing/) })));
    expect(mockStore.writes).toEqual([]);
  });

  test('the owner shares a case with the organisation and takes it back; an own case has no read-only notice', async () => {
    seed();
    mount(`/mbal/cases/${SAMPLE_CASE_IDS.ahmed}?tab=run`);
    const sw = await screen.findByTestId('share-switch');
    expect(screen.queryByTestId('mbal-read-only')).toBeNull();
    expect(screen.getByTestId('mbal-edit-case')).toBeInTheDocument();
    await act(async () => { fireEvent.click(sw); });
    await waitFor(() => expect(mockStore.db.rb_cases.find((c) => c.id === SAMPLE_CASE_IDS.ahmed)).toMatchObject({ visibility: 'organization', organization_id: SAMPLE_ORG_ID, org_access: 'view' }));
    expect(await screen.findByTestId('share-view-only')).toHaveTextContent('Colleagues can view it and save their own copy.');
    expect(screen.queryByTestId('share-access')).toBeNull(); // editing by colleagues is not offered in this round
    await act(async () => { fireEvent.click(screen.getByTestId('share-switch')); });
    await waitFor(() => expect(mockStore.db.rb_cases.find((c) => c.id === SAMPLE_CASE_IDS.ahmed)).toMatchObject({ visibility: 'private', organization_id: null }));
  });

  test('Save a copy makes the reader\'s own case with the same inputs and no run, and leaves the shared case as it was', async () => {
    const db = seed();
    const before = JSON.stringify([db.rb_cases.find((c) => c.id === SAMPLE_SHARED_CASE_ID), db.rb_production_data.filter((r) => r.case_id === SAMPLE_SHARED_CASE_ID)]);
    mount(`/mbal/cases/${SAMPLE_SHARED_CASE_ID}?tab=run`);
    await screen.findByTestId('mbal-read-only');
    await act(async () => { fireEvent.click(await screen.findByTestId('save-copy')); });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Copy saved as your own case' })));
    const copy = mockStore.db.rb_cases.find((c) => c.name === 'North flank oil (shared by Ada) (copy)');
    expect(copy).toBeTruthy();
    expect(copy.user_id).toBeUndefined(); // the database stamps the owner; the copy never claims the colleague's id
    expect(copy.visibility).toBeUndefined();
    expect(copy.initial_pressure_psia).toBe(3685);
    expect(mockStore.db.rb_production_data.filter((r) => r.case_id === copy.id)).toHaveLength(13);
    const cfg = mockStore.db.rb_run_configs.filter((r) => r.case_id === copy.id);
    expect(cfg).toHaveLength(1);
    expect(cfg[0]).toMatchObject({ is_scenario: false, oil_gravity_api: 35, formation_compressibility_psi: 4.95e-6 });
    expect(mockStore.db.rb_runs.filter((r) => r.case_id === copy.id)).toHaveLength(0);
    // the shared case and its rows are untouched
    expect(JSON.stringify([mockStore.db.rb_cases.find((c) => c.id === SAMPLE_SHARED_CASE_ID), mockStore.db.rb_production_data.filter((r) => r.case_id === SAMPLE_SHARED_CASE_ID)])).toBe(before);
    expect(mockStore.writes.every((w) => !JSON.stringify(w).includes(SAMPLE_SHARED_CASE_ID))).toBe(true);
  });
});

describe('the copy', () => {
  const caseData = { id: 'c', user_id: 'ada', name: 'Field A (copy)', visibility: 'organization', organization_id: 'o', org_access: 'view', version: 4, updated_by: 'ada', updated_at: 't', created_at: 't', archived_at: null, org_id: null, fluid_system: 'oil', initial_pressure_psia: 3000, production_data: [{ timestep_index: 0, pressure_psia: 3000 }] };
  test('the case row keeps the inputs and drops the owner, the sharing state and the stamps', () => {
    expect(caseCopyInput(caseData, ['Field A (copy)'])).toEqual({ name: 'Field A (copy 2)', fluid_system: 'oil', initial_pressure_psia: 3000 });
  });
  test('the run settings keep the study record and drop the run snapshot', () => {
    const cfg = configCopyInput({ id: 'x', case_id: 'c', user_id: 'ada', is_scenario: false, name: 'Default Config', created_at: 't', updated_at: 't', oil_gravity_api: 30, pvt_correlations: { pb_rs_bo: 'standing', study: { v: 1 }, run_snapshot: { v: 1 } } });
    expect(cfg).toEqual({ oil_gravity_api: 30, pvt_correlations: { pb_rs_bo: 'standing', study: { v: 1 } } });
    expect(configCopyInput(null)).toBeNull();
  });
  test('a failure part way removes the half-made case and says what failed', async () => {
    const api = {
      createCase: jest.fn(async () => ({ data: { id: 'new' }, error: null })),
      replaceProductionData: jest.fn(async () => ({ data: null, error: { message: 'disk full' } })),
      upsertCaseDefaultConfig: jest.fn(),
      deleteCase: jest.fn(async () => ({ error: null })),
    };
    const out = await copyCaseAsOwn(api, caseData, { oil_gravity_api: 30 });
    expect(out.error.message).toBe('The copy was not made: its production data could not be written (disk full).');
    expect(api.deleteCase).toHaveBeenCalledWith('new');
    expect(api.upsertCaseDefaultConfig).not.toHaveBeenCalled();
    expect((await copyCaseAsOwn(api, null, null)).error.message).toMatch(/no open case/);
  });
});
