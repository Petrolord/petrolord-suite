/**
 * The Well Spacing Optimizer saves projects (WS-U1-003; gap matrix 4.13:
 * "nothing saved") under the record sharing rules, on the in-memory mirror
 * of the database rules (src/lib/recordSharing/memoryDb): own and shared
 * projects; a view-only project is never written; an edit-shared project is
 * written only under my check-out; a saved project opens with every input,
 * source, intake and its unit system, and the same cases (RL12); before the
 * migration a save says that saving is not switched on.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeHarnessSharing, colleagueShared, HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

const TABLE = 'saved_well_spacing_projects';
const mockBackend = { db: null, uid: null, missing: false };

jest.mock('@/utils/savedProjects', () => {
  const T = 'saved_well_spacing_projects';
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
import { WellSpacingProvider, useWellSpacing, NOT_SWITCHED_ON } from '@/contexts/WellSpacingContext';
// eslint-disable-next-line import/first
import { wsWtaIntake } from '@/utils/wellspacing/intakes';
// eslint-disable-next-line import/first
import { WTA_BLOCK } from '@/utils/wellspacing/__tests__/wsTestKit';
// eslint-disable-next-line import/first
import { SAMPLE_FORM } from '@/utils/wellspacing/model';

const payload = (name, area) => ({ id: name, name, schema: 1, inputs: { form: { ...SAMPLE_FORM, reservoirArea: area }, unitSystem: 'oilfield' } });

function setup({ applied = true, missing = false } = {}) {
  const h = makeHarnessSharing({ applied });
  mockBackend.db = h.db;
  mockBackend.uid = HARNESS_ME;
  mockBackend.missing = missing;
  h.db.seed(TABLE, [{ id: 'mine', user_id: HARNESS_ME, project_name: 'My study', inputs_data: payload('My study', '5000') }], { owner: HARNESS_ME });
  if (applied) {
    h.db.seed(TABLE, [
      colleagueShared({ id: 'ada-view', project_name: 'Ada view', inputs_data: payload('Ada view', '4000') }),
      colleagueShared({ id: 'ada-edit', project_name: 'Ada edit', inputs_data: payload('Ada edit', '3000') }, { access: 'edit' }),
      { id: 'ada-private', user_id: HARNESS_COLLEAGUE, project_name: 'Ada private', inputs_data: payload('Ada private', '2000') },
    ]);
  }
  return h;
}
const row = (h, id) => h.db._rows(TABLE).find((r) => r.id === id);
const mount = (h, profileSystem = null) => renderHook(() => useWellSpacing(), {
  wrapper: ({ children }) => <WellSpacingProvider sharingStore={h.store} profileSystem={profileSystem}>{children}</WellSpacingProvider>,
});

describe('Well Spacing projects', () => {
  test('a new workspace opens blank in the profile system and says what it needs; the sample is labelled', async () => {
    const h = setup();
    const { result } = mount(h, 'si');
    await waitFor(() => expect(result.current.inputs.unitSystem).toBe('si'));
    expect(result.current.results).toBeNull();
    expect(result.current.errors.join(' ')).toMatch(/Field name is required/);
    act(() => result.current.loadSample());
    expect(result.current.inputs.sampleNote).toMatch(/not a real field/);
    expect(result.current.results.spacingResults).toHaveLength(15);
  });

  test('the cases follow every edit (no stale table)', async () => {
    const h = setup();
    const { result } = mount(h);
    act(() => result.current.loadSample());
    const before = result.current.results.spacingResults[0].npv;
    act(() => result.current.setFormField('oilPrice', '60'));
    expect(result.current.results.spacingResults[0].npv).toBeLessThan(before);
    act(() => result.current.setFormField('porosity', ''));
    expect(result.current.results).toBeNull();
    expect(result.current.errors.join(' ')).toMatch(/Porosity is required/);
  });

  test('the picker lists my projects, then those shared with me', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await waitFor(() => expect(result.current.projects.map((p) => p.id)).toEqual(['mine']));
    expect(result.current.sharedProjects.map((p) => p.id).sort()).toEqual(['ada-edit', 'ada-view']);
  });

  test('saved and opened again: inputs, sources, intakes, identification, units and the same cases (RL12)', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    act(() => result.current.loadSample());
    await act(async () => { await result.current.createProject('Ekene spacing'); });
    const id = result.current.currentProjectId;
    act(() => {
      result.current.setFormField('porosity', '18');
      result.current.setInputMetaField('porosity', 'source', 'lab');
      result.current.setIdentificationField('field', 'Ekene');
      result.current.setUnitSystem('si');
      result.current.setFormField('wellLayout', 'triangular');
      result.current.takeIntake('wta', wsWtaIntake(WTA_BLOCK, { recordId: 'wt-1' }));
    });
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    const saved = row(h, id).inputs_data.inputs;
    expect(saved.form).toMatchObject({ porosity: '18', permeability: '182.4', skin: '2.1', reservoirPressure: '3985', wellLayout: 'triangular' });
    expect(saved.unitSystem).toBe('si');
    const second = mount(h);
    await waitFor(() => expect(second.result.current.sharing.ready).toBe(true));
    await act(async () => { await second.result.current.openProject(id); });
    const i = second.result.current.inputs;
    expect(i.form.porosity).toBe('18');
    expect(i.inputMeta.porosity.source).toBe('lab');
    expect(i.identification.field).toBe('Ekene');
    expect(i.unitSystem).toBe('si');
    expect(i.intakes.wta.from.recordId).toBe('wt-1');
    expect(second.result.current.results.spacingResults.map((r) => r.npv)).toEqual(result.current.results.spacingResults.map((r) => r.npv));
  });

  test('a project of an earlier build with a flood pattern opens on the matching layout', async () => {
    const { inputsFromPayload } = await import('@/utils/wellspacing/model');
    expect(inputsFromPayload({ inputs: { form: { ...SAMPLE_FORM, wellLayout: undefined, wellPatternType: '7-spot' } } }).form.wellLayout).toBe('triangular');
    expect(inputsFromPayload({ inputs: { form: { reservoirArea: '1' } } }).form.wellLayout).toBe('square');
  });

  test('a project shared for viewing is never written; Save a copy makes my own', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('ada-view'); });
    await waitFor(() => expect(result.current.canWrite).toBe(false));
    act(() => result.current.setFormField('reservoirArea', '9999'));
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(row(h, 'ada-view').inputs_data.inputs.form.reservoirArea).toBe('4000');
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
    act(() => result.current.setFormField('reservoirArea', '3100'));
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    await act(async () => { await result.current.sharing.startEditing(); });
    await waitFor(() => expect(result.current.canWrite).toBe(true));
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    expect(row(h, 'ada-edit')).toMatchObject({ user_id: HARNESS_COLLEAGUE, updated_by: HARNESS_ME });
  });

  test('before the migration: saving is not switched on, said plainly, and the study stays', async () => {
    const h = setup({ missing: true });
    const { result } = mount(h);
    await waitFor(() => expect(result.current.savingAvailable).toBe(false));
    expect(result.current.savingReason).toBe(NOT_SWITCHED_ON);
    act(() => result.current.loadSample());
    await act(async () => { await result.current.createProject('x'); });
    expect(result.current.notifications.map((n) => n.message)).toContain(NOT_SWITCHED_ON);
    expect(result.current.currentProjectId).toBeNull();
    expect(result.current.results.spacingResults).toHaveLength(15);
  });
});
