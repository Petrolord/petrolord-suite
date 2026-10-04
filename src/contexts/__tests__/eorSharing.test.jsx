/**
 * EOR Screening saves projects (EOR-U1-010; gap matrix 4.11: "state is lost
 * on reload") under the record sharing rules, on the in-memory mirror of the
 * database rules (src/lib/recordSharing/memoryDb): own and shared projects;
 * a view-only project is never written; an edit-shared project is written
 * only under my check-out; a saved project opens with every input, source,
 * intake and its unit system (RL12); before the migration a save says that
 * saving is not switched on.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeHarnessSharing, colleagueShared, HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

const TABLE = 'saved_eor_screening_projects';
const mockBackend = { db: null, uid: null, missing: false };

jest.mock('@/utils/savedProjects', () => {
  const T = 'saved_eor_screening_projects';
  const missing = () => { const e = new Error(`relation "public.${T}" does not exist`); e.code = '42P01'; return e; };
  const rows = () => mockBackend.db.select(T, mockBackend.uid).data || [];
  const service = {
    list: async () => { if (mockBackend.missing) throw missing(); return rows().map((r) => ({ id: r.id, name: r.project_name })); },
    listRows: async () => { if (mockBackend.missing) throw missing(); return rows().map((r) => ({ id: r.id, name: r.project_name, userId: r.user_id, shared: r.visibility === 'organization', orgAccess: r.org_access })); },
    load: async (id) => rows().find((r) => r.id === id)?.inputs_data ?? null,
    loadRow: async (id) => {
      const r = rows().find((x) => x.id === id);
      if (!r) return null;
      const { inputs_data: payload, ...row } = r;
      return { payload, row };
    },
    save: async (id, payload) => {
      if (mockBackend.missing) throw missing();
      const exists = rows().some((r) => r.id === id);
      const res = exists
        ? mockBackend.db.update(T, mockBackend.uid, id, { project_name: payload.name, inputs_data: payload })
        : mockBackend.db.insert(T, mockBackend.uid, { id, user_id: mockBackend.uid, project_name: payload.name, inputs_data: payload });
      if (res.error) throw res.error;
      return { success: true };
    },
    remove: async () => ({ success: true }),
  };
  return { createSavedProjectsService: () => service };
});

// eslint-disable-next-line import/first
import { EorScreeningProvider, useEorScreening, NOT_SWITCHED_ON } from '@/contexts/EorScreeningContext';
// eslint-disable-next-line import/first
import { eorWtaIntake } from '@/utils/eor/intakes';
// eslint-disable-next-line import/first
import { WTA_BLOCK } from '@/utils/eor/__tests__/eorTestKit';

const payload = (name, api) => ({ id: name, name, schema: 1, inputs: { form: { gravityApi: api, depthFt: '5200' }, unitSystem: 'oilfield' } });

function setup({ applied = true, missing = false } = {}) {
  const h = makeHarnessSharing({ applied });
  mockBackend.db = h.db;
  mockBackend.uid = HARNESS_ME;
  mockBackend.missing = missing;
  h.db.seed(TABLE, [{ id: 'mine', user_id: HARNESS_ME, project_name: 'My screen', inputs_data: payload('My screen', '30') }], { owner: HARNESS_ME });
  if (applied) {
    h.db.seed(TABLE, [
      colleagueShared({ id: 'ada-view', project_name: 'Ada view', inputs_data: payload('Ada view', '31') }),
      colleagueShared({ id: 'ada-edit', project_name: 'Ada edit', inputs_data: payload('Ada edit', '32') }, { access: 'edit' }),
      { id: 'ada-private', user_id: HARNESS_COLLEAGUE, project_name: 'Ada private', inputs_data: payload('Ada private', '33') },
    ]);
  }
  return h;
}
const row = (h, id) => h.db._rows(TABLE).find((r) => r.id === id);
const mount = (h, profileSystem = null) => renderHook(() => useEorScreening(), {
  wrapper: ({ children }) => <EorScreeningProvider sharingStore={h.store} profileSystem={profileSystem}>{children}</EorScreeningProvider>,
});

describe('EOR Screening projects', () => {
  test('a new workspace opens on the sample, labelled, in the profile system', async () => {
    const h = setup();
    const { result } = mount(h, 'si');
    await waitFor(() => expect(result.current.inputs.unitSystem).toBe('si'));
    expect(result.current.inputs.sampleNote).toMatch(/not a real field/);
    expect(result.current.results.filter((r) => r.outcome === 'qualified')).toHaveLength(3);
  });

  test('the picker lists my projects, then those shared with me', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await waitFor(() => expect(result.current.projects.map((p) => p.id)).toEqual(['mine']));
    expect(result.current.sharedProjects.map((p) => p.id).sort()).toEqual(['ada-edit', 'ada-view']);
  });

  test('saved and opened again: inputs, sources, intakes, identification and units come back (RL12)', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    let id;
    await act(async () => { await result.current.createProject('Ekene screen'); });
    id = result.current.currentProjectId;
    act(() => {
      result.current.setFormField('viscosityCp', '1.3');
      result.current.setInputMetaField('viscosityCp', 'source', 'lab');
      result.current.setIdentificationField('field', 'Ekene');
      result.current.setUnitSystem('si');
      result.current.setDepthReference('tvdss');
      result.current.takeIntake('wta', eorWtaIntake(WTA_BLOCK, { recordId: 'wt-1' }));
    });
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    const saved = row(h, id).inputs_data.inputs;
    expect(saved.form).toMatchObject({ viscosityCp: '1.3', permeabilityMd: '182.4' });
    expect(saved.unitSystem).toBe('si');
    const second = mount(h);
    await waitFor(() => expect(second.result.current.sharing.ready).toBe(true));
    await act(async () => { await second.result.current.openProject(id); });
    const i = second.result.current.inputs;
    expect(i.form.viscosityCp).toBe('1.3');
    expect(i.inputMeta.viscosityCp.source).toBe('lab');
    expect(i.identification.field).toBe('Ekene');
    expect(i.unitSystem).toBe('si');
    expect(i.depthReference).toBe('tvdss');
    expect(i.intakes.wta.from.recordId).toBe('wt-1');
    expect(i.context.reservoirPressurePsia).toBe('3985');
    expect(second.result.current.results.map((r) => r.outcome)).toEqual(result.current.results.map((r) => r.outcome));
  });

  test('a project shared for viewing is never written; Save a copy makes my own', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('ada-view'); });
    await waitFor(() => expect(result.current.canWrite).toBe(false));
    act(() => result.current.setFormField('gravityApi', '40'));
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(row(h, 'ada-view').inputs_data.inputs.form.gravityApi).toBe('31');
    let copyId;
    await act(async () => { copyId = await result.current.saveCopy(); });
    expect(row(h, copyId)).toMatchObject({ user_id: HARNESS_ME, project_name: 'Ada view (copy)' });
  });

  test('a project shared for editing is written only under my check-out', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('ada-edit'); });
    await waitFor(() => expect(result.current.sharing.access.canTake).toBe(true));
    act(() => result.current.setFormField('gravityApi', '36'));
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    await act(async () => { await result.current.sharing.startEditing(); });
    await waitFor(() => expect(result.current.canWrite).toBe(true));
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    expect(row(h, 'ada-edit')).toMatchObject({ user_id: HARNESS_COLLEAGUE, updated_by: HARNESS_ME });
  });

  test('before the migration: saving is not switched on, said plainly, and the screening stays', async () => {
    const h = setup({ missing: true });
    const { result } = mount(h);
    await waitFor(() => expect(result.current.savingAvailable).toBe(false));
    expect(result.current.savingReason).toBe(NOT_SWITCHED_ON);
    await act(async () => { await result.current.createProject('x'); });
    expect(result.current.notifications.map((n) => n.message)).toContain(NOT_SWITCHED_ON);
    expect(result.current.currentProjectId).toBeNull();
    expect(result.current.results).toHaveLength(8);
  });
});
