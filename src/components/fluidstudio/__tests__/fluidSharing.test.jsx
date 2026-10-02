/**
 * Fluid Systems Studio adopts record sharing (Reservoir round, Step 0a
 * contract; FLUID-U1-026). The project hook on the in-memory mirror of the
 * database rules (src/lib/recordSharing/memoryDb): the picker splits own
 * projects from those colleagues shared, a view-only project is never
 * written, a project shared for editing is written only while it is checked
 * out, a newer save by someone else is refused with the reason, and "Save a
 * copy" makes the user's own.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeHarnessSharing, colleagueShared, HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

const TABLE = 'saved_fluid_studio_projects';
const mockBackend = { db: null, uid: null };

jest.mock('@/utils/savedProjects', () => {
  const T = 'saved_fluid_studio_projects';
  const rows = () => mockBackend.db.select(T, mockBackend.uid).data || [];
  const service = {
    list: async () => rows().map((r) => ({ id: r.id, name: r.project_name })),
    listRows: async () => rows().map((r) => ({ id: r.id, name: r.project_name, userId: r.user_id, shared: r.visibility === 'organization', orgAccess: r.org_access })),
    load: async (id) => rows().find((r) => r.id === id)?.inputs_data ?? null,
    loadRow: async (id) => {
      const r = rows().find((x) => x.id === id);
      if (!r) return null;
      const { inputs_data: payload, ...row } = r;
      return { payload, row };
    },
    save: async (id, payload) => {
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

import { useFluidStudioProjects } from '../useFluidStudioProjects';

const payload = (name, marker) => ({ name, schema: 2, inputs: { marker } });

function setup() {
  const h = makeHarnessSharing();
  mockBackend.db = h.db;
  mockBackend.uid = HARNESS_ME;
  h.db.seed(TABLE, [{ id: 'mine', user_id: HARNESS_ME, project_name: 'My fluid', inputs_data: payload('My fluid', 1) }], { owner: HARNESS_ME });
  h.db.seed(TABLE, [
    colleagueShared({ id: 'ada-view', project_name: 'Ada view fluid', inputs_data: payload('Ada view fluid', 2) }),
    colleagueShared({ id: 'ada-edit', project_name: 'Ada edit fluid', inputs_data: payload('Ada edit fluid', 3) }, { access: 'edit' }),
    { id: 'ada-private', user_id: HARNESS_COLLEAGUE, project_name: 'Ada private', inputs_data: payload('Ada private', 4) },
  ]);
  return h;
}
const row = (h, id) => h.db._rows(TABLE).find((r) => r.id === id);

function mount(h, inputs = { marker: 99 }) {
  const setInputs = jest.fn();
  const view = renderHook(({ i }) => useFluidStudioProjects({ inputs: i, setInputs, sharingStore: h.store }), { initialProps: { i: inputs } });
  return { ...view, setInputs };
}

describe('Fluid Systems Studio projects under record sharing', () => {
  test('the picker lists own projects, then those shared with me; a private project of a colleague is not seen', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await waitFor(() => expect(result.current.projects.map((p) => p.id)).toEqual(['mine']));
    expect(result.current.sharedProjects.map((p) => p.id).sort()).toEqual(['ada-edit', 'ada-view']);
  });

  test('a project shared for viewing opens read-only: nothing is written, and Save a copy makes my own', async () => {
    const h = setup();
    const { result, setInputs } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('ada-view'); });
    expect(setInputs).toHaveBeenCalledWith({ marker: 2 });
    await waitFor(() => expect(result.current.sharing.canWrite).toBe(false));
    expect(result.current.viewingShared).toBe(true);
    expect(result.current.sharing.readOnlyReason).toBe('Shared by Ada Colleague for viewing. Save a copy to work on your own version.');
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(result.current.saveError).toBe('Read-only');
    expect(row(h, 'ada-view').inputs_data.inputs).toEqual({ marker: 2 });
    expect(result.current.notifications.some((n) => /Shared by Ada Colleague for viewing/.test(n.message))).toBe(true);

    let copyId;
    await act(async () => { copyId = await result.current.saveCopy(); });
    const copy = row(h, copyId);
    expect(copy).toMatchObject({ user_id: HARNESS_ME, project_name: 'Ada view fluid (copy)', visibility: 'private' });
    expect(copy.inputs_data.inputs).toEqual({ marker: 99 });
    expect(result.current.currentProjectId).toBe(copyId);
    await waitFor(() => expect(result.current.sharing.canWrite).toBe(true));
    expect(row(h, 'ada-view').inputs_data.inputs).toEqual({ marker: 2 });
  });

  test('a project shared for editing is written only while it is checked out, and the colleague sees who holds it', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('ada-edit'); });
    await waitFor(() => expect(result.current.sharing.access.canTake).toBe(true));
    expect(result.current.sharing.canWrite).toBe(false);
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(row(h, 'ada-edit').inputs_data.inputs).toEqual({ marker: 3 });

    await act(async () => { await result.current.sharing.startEditing(); });
    await waitFor(() => expect(result.current.sharing.canWrite).toBe(true));
    expect(row(h, 'ada-edit').editing_by).toBe(HARNESS_ME);
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    const saved = row(h, 'ada-edit');
    expect(saved.inputs_data.inputs).toEqual({ marker: 99 });
    // still the colleague's record, one version on, saved by me
    expect(saved).toMatchObject({ user_id: HARNESS_COLLEAGUE, version: 2, updated_by: HARNESS_ME });
    // the colleague cannot write while I hold it
    const refused = await h.colleagueStore.update(TABLE, 'ada-edit', { project_name: 'Ada writes over me' }, { versioned: false });
    expect(refused.error).toBeTruthy();
    expect(row(h, 'ada-edit').project_name).toBe('Ada edit fluid');
  });

  test('a newer save from elsewhere is refused with the reason, and nothing is overwritten', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('mine'); });
    await waitFor(() => expect(result.current.sharing.canWrite).toBe(true));
    // my other tab saves first
    const other = h.storeAs(HARNESS_ME);
    other.trackOpened(TABLE, row(h, 'mine'));
    expect((await other.update(TABLE, 'mine', { inputs_data: payload('My fluid', 'other tab') })).error).toBeNull();
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(result.current.saveError).toBe('Save failed');
    expect(result.current.notifications.some((n) => /saved a newer version/.test(n.message))).toBe(true);
    expect(row(h, 'mine').inputs_data.inputs).toEqual({ marker: 'other tab' });
  });

  test('my own project saves through the store and keeps its sharing state', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('mine'); });
    await act(async () => { await result.current.sharing.share({ shared: true, access: 'view' }); });
    expect(row(h, 'mine')).toMatchObject({ visibility: 'organization', org_access: 'view' });
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    expect(row(h, 'mine')).toMatchObject({ visibility: 'organization', org_access: 'view', user_id: HARNESS_ME });
    expect(row(h, 'mine').inputs_data.inputs).toEqual({ marker: 99 });
    // the colleague now sees it, read-only
    mockBackend.uid = HARNESS_COLLEAGUE;
    expect((h.db.select(TABLE, HARNESS_COLLEAGUE).data || []).map((r) => r.id)).toContain('mine');
  });

  test('before the migration is applied every save is the plain owner save', async () => {
    const h = makeHarnessSharing({ applied: false });
    mockBackend.db = h.db;
    mockBackend.uid = HARNESS_ME;
    h.db.seed(TABLE, [{ id: 'mine', user_id: HARNESS_ME, project_name: 'My fluid', inputs_data: payload('My fluid', 1) }], { owner: HARNESS_ME });
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    expect(result.current.sharing.available).toBe(false);
    await act(async () => { await result.current.openProject('mine'); });
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    expect(row(h, 'mine').inputs_data.inputs).toEqual({ marker: 99 });
  });
});
