/**
 * MBAL-U2-001: colleague editing of a Material Balance case under the
 * check-out (the owner's grant of 2026-10-01, record sharing migration
 * 20261002130000).
 *
 * Two users, the owner ("You") and Ada Colleague, in one organisation, on
 * the in-memory mirror of the database (src/lib/recordSharing/memoryDb):
 * rb_cases carries the sharing columns, the guard trigger and the check-out
 * functions; its four child tables (production data, run settings, runs,
 * results) follow the case's check-out as their policies do. The studio
 * calls the real lib/api.js, whose Supabase client is replaced by a small
 * PostgREST stand-in over that database, acting as whichever user is signed
 * in. So a refusal asserted here is a refusal the rules give, not one the
 * app chose to show.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const OWNER = 'dev-user';
const ADA = 'user-colleague';
const ORG = 'org-dev';
const CHILDREN = ['rb_production_data', 'rb_run_configs', 'rb_runs', 'rb_results'];
const mockState = { db: null, children: null, me: OWNER, writes: [] };

jest.mock('@/lib/customSupabaseClient', () => {
  const rls = (t) => ({ code: '42501', message: `new row violates row-level security policy for table "${t}"` });
  const query = (table) => {
    const st = { filters: [], op: 'select', payload: null, order: null };
    const match = (r) => st.filters.every(([k, op, v]) => (op === 'eq' ? r[k] === v : op === 'is' ? (r[k] ?? null) === v : op === 'gte' ? r[k] >= v : true));
    const db = () => mockState.db;
    const readableCase = (caseId) => (db().select('rb_cases', mockState.me).data || []).some((c) => c.id === caseId);
    const run = () => {
      const me = mockState.me;
      if (table === 'rb_cases') {
        if (st.op === 'select') return { data: (db().select('rb_cases', me).data || []).filter(match), error: null };
        if (st.op === 'insert') { const r = db().insert('rb_cases', me, { ...st.payload, user_id: me }); return r.error ? r : { data: [r.data], error: null }; }
        if (st.op === 'update') {
          const target = (db().select('rb_cases', me).data || []).filter(match);
          const out = [];
          for (const t of target) { const r = db().update('rb_cases', me, t.id, st.payload); if (r.error) return r; out.push(...r.data); }
          mockState.writes.push({ table, op: 'update', by: me });
          return { data: out, error: null };
        }
        if (st.op === 'delete') { const t = (db().select('rb_cases', me).data || []).filter(match); t.forEach((x) => db().remove('rb_cases', me, x.id)); return { data: t, error: null }; }
      }
      const rows = () => mockState.children[table] || [];
      if (st.op === 'select') {
        let out = rows().filter((r) => readableCase(r.case_id)).filter(match);
        if (st.order) out = [...out].sort((a, b) => ((a[st.order[0]] > b[st.order[0]] ? 1 : -1) * (st.order[1] ? 1 : -1)));
        return { data: out, error: null };
      }
      // writes: the case owner unless a colleague holds the check-out, or the member who holds it
      const touched = st.op === 'insert' || st.op === 'upsert'
        ? (Array.isArray(st.payload) ? st.payload : [st.payload])
        : rows().filter(match);
      for (const r of touched) if (!db().canWriteChildOf('rb_cases', me, r.case_id)) return { data: null, error: rls(table) };
      mockState.writes.push({ table, op: st.op, by: me });
      const what = table === 'rb_production_data' ? 'production data' : table === 'rb_run_configs' ? 'run settings' : null;
      if (st.op === 'insert' || st.op === 'upsert') {
        // production rows are keyed by (case_id, timestep_index), as the upsert's onConflict says
        const sameKey = (x, y) => (table === 'rb_production_data' ? x.case_id === y.case_id && x.timestep_index === y.timestep_index : x.id === y.id);
        const list = touched.map((r, i) => {
          const prev = rows().find((x) => sameKey(x, r));
          return { id: r.id || prev?.id || `${table}-${mockState.writes.length}-${i}`, ...r };
        });
        mockState.children[table] = [...rows().filter((x) => !list.some((y) => sameKey(x, y))), ...list];
        if (what && list.length) db().logChildOf('rb_cases', me, list[0].case_id, what, 'added', list.length);
        return { data: list, error: null };
      }
      if (st.op === 'update') {
        const out = [];
        mockState.children[table] = rows().map((r) => (match(r) ? (out.push({ ...r, ...st.payload }), out[out.length - 1]) : r));
        if (what && out.length) db().logChildOf('rb_cases', me, out[0].case_id, what, 'changed', out.length);
        return { data: out, error: null };
      }
      const gone = rows().filter(match);
      mockState.children[table] = rows().filter((r) => !match(r));
      if (what && gone.length) db().logChildOf('rb_cases', me, gone[0].case_id, what, 'removed', gone.length);
      return { data: gone, error: null };
    };
    const q = {
      select: () => q, eq: (k, v) => { st.filters.push([k, 'eq', v]); return q; }, is: (k, v) => { st.filters.push([k, 'is', v]); return q; },
      gte: (k, v) => { st.filters.push([k, 'gte', v]); return q; }, in: () => q, limit: () => q,
      order: (k, o = {}) => { st.order = [k, o.ascending !== false]; return q; },
      insert: (p) => { st.op = 'insert'; st.payload = p; return q; }, upsert: (p) => { st.op = 'upsert'; st.payload = p; return q; },
      update: (p) => { st.op = 'update'; st.payload = p; return q; }, delete: () => { st.op = 'delete'; return q; },
      single: () => { const r = run(); return Promise.resolve(r.error ? r : (r.data?.length ? { data: r.data[0], error: null } : { data: null, error: { message: 'no rows' } })); },
      maybeSingle: () => { const r = run(); return Promise.resolve(r.error ? r : { data: r.data?.[0] ?? null, error: null }); },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  const supabase = {
    from: (t) => query(t),
    auth: { getUser: async () => ({ data: { user: { id: mockState.me } }, error: null }), getSession: async () => ({ data: { session: null }, error: null }) },
    functions: { invoke: jest.fn() },
    rpc: jest.fn(async () => ({ data: null, error: null })),
  };
  return { supabase, default: supabase };
});

import { supabase } from '@/lib/customSupabaseClient';
import ReservoirBalance from '../ReservoirBalance';
import { seedSampleStore, SAMPLE_CASE_IDS } from '../harness/sampleCases';
import { runEngineOnStore } from '../harness/engineStandIn';
import { makeSharingDb, makeSharingStore, memoryTransport } from '@/lib/recordSharing';
import { setCaseReadOnly, setCaseSharingStore, updateCase, replaceProductionData } from '../lib/api';

const CASE = SAMPLE_CASE_IDS.ahmed;

/** calculate-mbal on the store, as the signed-in user: the run row is a child of the case. */
function engineAsSignedIn({ body }) {
  const cfg = mockState.children.rb_run_configs.find((r) => r.id === body.run_config_id);
  if (!cfg || !mockState.db.canWriteChildOf('rb_cases', mockState.me, cfg.case_id)) {
    return Promise.resolve({ data: null, error: { message: 'Failed to create run record', context: { json: async () => ({ error: 'Not allowed to run this case', detail: 'Start editing first.' }) } } });
  }
  const view = { ...mockState.children, rb_cases: mockState.db._rows('rb_cases') };
  const out = runEngineOnStore(view, body);
  mockState.children.rb_runs = view.rb_runs;
  mockState.children.rb_results = view.rb_results;
  mockState.writes.push({ table: 'rb_runs', op: 'insert', by: mockState.me });
  return Promise.resolve(out);
}

function seed({ access = 'edit', shared = true } = {}) {
  const sample = seedSampleStore();
  const db = makeSharingDb({ members: { [OWNER]: { orgId: ORG, name: 'You' }, [ADA]: { orgId: ORG, name: 'Ada Colleague' } } });
  const own = sample.rb_cases.filter((c) => c.id === CASE).map((c) => ({
    ...c, user_id: OWNER,
    ...(shared ? { visibility: 'organization', organization_id: ORG, org_access: access } : {}),
  }));
  db.seed('rb_cases', own);
  const children = {};
  for (const t of CHILDREN) children[t] = (sample[t] || []).filter((r) => r.case_id === CASE);
  mockState.db = db;
  mockState.children = children;
  mockState.writes = [];
  mockState.me = OWNER;
  supabase.functions.invoke.mockImplementation((name, opts) => engineAsSignedIn(opts));
  return db;
}

const storeAs = (id) => makeSharingStore(memoryTransport(mockState.db, id));
const mountAs = (id, path = `/mbal/cases/${CASE}?tab=run`) => {
  mockState.me = id;
  const store = storeAs(id);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mbal/cases/:caseId" element={<ReservoirBalance sharingStore={store} />} />
      </Routes>
    </MemoryRouter>,
  );
};

beforeEach(() => { mockToast.mockClear(); setCaseReadOnly(null, null); setCaseSharingStore(null); });

describe('the rules the database gives, through lib/api.js', () => {
  test('the case and its child rows are written only by whoever holds the check-out', async () => {
    seed();
    // nobody holds it: the owner may write (the database rule; the UI asks the owner to take it too)
    mockState.me = OWNER;
    const owner = storeAs(OWNER);
    const ada = storeAs(ADA);
    // Ada takes the case
    expect((await ada.take('rb_cases', CASE)).ok).toBe(true);
    // the owner's writes are refused while Ada holds it: the case row and every child
    setCaseSharingStore(owner);
    owner.trackOpened('rb_cases', mockState.db._rows('rb_cases')[0]);
    const refusedRow = await updateCase(CASE, { description: 'owner edit' });
    expect(refusedRow.error).toMatchObject({ code: 'MBAL_CONFLICT', kind: 'locked' });
    expect(refusedRow.error.message).toMatch(/Being edited by Ada Colleague/);
    const refusedData = await replaceProductionData(CASE, [{ timestep_index: 0, pressure_psia: 3685, cum_oil_stb: 0 }]);
    expect(refusedData.error).toBeTruthy();
    expect(mockState.children.rb_production_data).toHaveLength(13);
    // Ada writes both
    mockState.me = ADA;
    setCaseSharingStore(ada);
    ada.trackOpened('rb_cases', mockState.db._rows('rb_cases')[0]);
    expect((await updateCase(CASE, { description: 'Ada edit' })).error).toBeNull();
    const rows = mockState.children.rb_production_data.map(({ id, ...r }) => r);
    expect((await replaceProductionData(CASE, rows.slice(0, 12))).error).toBeNull();
    expect(mockState.children.rb_production_data).toHaveLength(12);
    // the history names who did what
    const history = await ada.history('rb_cases', CASE);
    const words = history.map((h) => `${h.changed_by_name}: ${h.summary ?? h.action}`);
    expect(words).toEqual(expect.arrayContaining(['Ada Colleague: Started editing', expect.stringMatching(/^Ada Colleague: Production data: \d+ (added|removed)/)]));
  });

  test('a save made from an older version is refused, and says who saved the newer one', async () => {
    seed();
    const owner = storeAs(OWNER);
    const ada = storeAs(ADA);
    mockState.me = OWNER;
    owner.trackOpened('rb_cases', mockState.db._rows('rb_cases')[0]);   // the owner opened version 1
    // Ada takes it, saves, and hands it back
    expect((await ada.take('rb_cases', CASE)).ok).toBe(true);
    ada.trackOpened('rb_cases', mockState.db._rows('rb_cases')[0]);
    mockState.me = ADA;
    setCaseSharingStore(ada);
    expect((await updateCase(CASE, { initial_water_saturation: 0.25 })).error).toBeNull();
    await ada.release('rb_cases', CASE);
    // the owner takes it, still showing version 1, and saves
    mockState.me = OWNER;
    const take = await owner.take('rb_cases', CASE);
    expect(take).toMatchObject({ ok: true, stale: true });
    setCaseSharingStore(owner);
    const res = await updateCase(CASE, { initial_water_saturation: 0.30 });
    expect(res.error).toMatchObject({ code: 'MBAL_CONFLICT', kind: 'stale' });
    expect(res.error.message).toMatch(/Ada Colleague saved a newer version/);
    expect(mockState.db._rows('rb_cases')[0].initial_water_saturation).toBe(0.25);
  });
});

describe('the studio, as each user', () => {
  test('a case shared for editing opens read-only until it is taken, for the owner too; Run is refused without the hold', async () => {
    seed();
    mountAs(OWNER);
    const banner = await screen.findByTestId('mbal-read-only');
    await waitFor(() => expect(banner).toHaveTextContent('Start editing first: this record is shared for editing, one person at a time.'));
    expect(screen.queryByTestId('mbal-edit-case')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Run MBAL/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: expect.stringMatching(/Start editing first/) })));
    expect(mockState.writes).toEqual([]);
    // take it: the notice goes, Edit case appears, a run writes its rows
    await act(async () => { fireEvent.click(await screen.findByTestId('start-editing')); });
    await waitFor(() => expect(screen.queryByTestId('mbal-read-only')).toBeNull());
    expect(await screen.findByTestId('mbal-edit-case')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Run MBAL/ })); });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'MBAL completed' })));
    expect(mockState.children.rb_runs.some((r) => r.status === 'completed')).toBe(true);
    expect(mockState.writes.map((w) => w.table)).toEqual(expect.arrayContaining(['rb_run_configs', 'rb_runs']));
    expect(mockState.writes.every((w) => w.by === OWNER)).toBe(true);
  });

  test('the colleague sees who is editing; once it is free she takes it, edits, and the History panel names her', async () => {
    seed();
    // the owner holds it
    expect((await storeAs(OWNER).take('rb_cases', CASE)).ok).toBe(true);
    mountAs(ADA);
    const banner = await screen.findByTestId('mbal-read-only');
    await waitFor(() => expect(banner).toHaveTextContent(/Being edited by You since/));
    expect(screen.queryByTestId('start-editing')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Run MBAL/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: expect.stringMatching(/Being edited by You/) })));
    expect(mockState.writes).toEqual([]);
    // the owner finishes; Ada takes it
    await storeAs(OWNER).release('rb_cases', CASE);
    mockState.me = ADA;
    await act(async () => { fireEvent.click(screen.getByTestId('history-button')); });
    // a poll would pick the release up; the reload button of the bar does it at once
    await act(async () => { await storeAs(ADA).take('rb_cases', CASE); });
    expect(mockState.db._rows('rb_cases')[0].editing_by).toBe(ADA);
    const history = await storeAs(ADA).history('rb_cases', CASE);
    expect(history.map((h) => h.changed_by_name)).toEqual(expect.arrayContaining(['You', 'Ada Colleague']));
    expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(['checked_out', 'released']));
  });

  test('negative control: a case shared for viewing never offers editing to the colleague', async () => {
    seed({ access: 'view' });
    mountAs(ADA);
    const banner = await screen.findByTestId('mbal-read-only');
    await waitFor(() => expect(banner).toHaveTextContent('Shared by You for viewing'));
    expect(screen.queryByTestId('start-editing')).toBeNull();
    const take = await storeAs(ADA).take('rb_cases', CASE);
    expect(take).toMatchObject({ ok: false, reason: 'view_only' });
  });

  test('the owner can now let colleagues edit, from the sharing control', async () => {
    seed({ shared: false });
    mountAs(OWNER);
    await act(async () => { fireEvent.click(await screen.findByTestId('share-switch')); });
    const access = await screen.findByTestId('share-access');
    await act(async () => { fireEvent.change(access, { target: { value: 'edit' } }); });
    await waitFor(() => expect(mockState.db._rows('rb_cases')[0]).toMatchObject({ visibility: 'organization', org_access: 'edit' }));
  });
});
