/**
 * The Voidage Replacement Monitor adopts record sharing (VRR-U1-012;
 * saved_well_test_projects is under the rules since migration 20261002130000),
 * on the in-memory mirror of the database rules
 * (src/lib/recordSharing/memoryDb): own projects and those colleagues
 * shared; a view-only project is never written; a project shared for
 * editing is written only while I hold its check-out; a newer save from
 * elsewhere is refused with the reason; "Save a copy" makes my own; before
 * the migration every save is the plain owner save.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeHarnessSharing, colleagueShared, HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

const TABLE = 'saved_well_test_projects';
const mockBackend = { db: null, uid: null };

jest.mock('@/utils/savedProjects', () => {
  const T = 'saved_well_test_projects';
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

// eslint-disable-next-line import/first
import { WellTestStudioProvider, useWellTestStudio } from '@/contexts/WellTestStudioContext';

const payload = (name, B) => ({ id: name, name, reservoirInputs: { B }, gaugeRows: [{ t: 0.1, p: 4600 }] });

function setup({ applied = true } = {}) {
  const h = makeHarnessSharing({ applied });
  mockBackend.db = h.db;
  mockBackend.uid = HARNESS_ME;
  h.db.seed(TABLE, [{ id: 'mine', user_id: HARNESS_ME, project_name: 'My test', inputs_data: payload('My test', '1.30') }], { owner: HARNESS_ME });
  if (applied) {
    h.db.seed(TABLE, [
      colleagueShared({ id: 'ada-view', project_name: 'Ada view test', inputs_data: payload('Ada view test', '1.40') }),
      colleagueShared({ id: 'ada-edit', project_name: 'Ada edit test', inputs_data: payload('Ada edit test', '1.50') }, { access: 'edit' }),
      { id: 'ada-private', user_id: HARNESS_COLLEAGUE, project_name: 'Ada private', inputs_data: payload('Ada private', '1.60') },
    ]);
  }
  return h;
}
const row = (h, id) => h.db._rows(TABLE).find((r) => r.id === id);
const mount = (h) => renderHook(() => useWellTestStudio(), {
  wrapper: ({ children }) => <WellTestStudioProvider sharingStore={h.store}>{children}</WellTestStudioProvider>,
});

describe('Well Test projects under record sharing', () => {
  test('the picker lists my projects, then those shared with me; a colleague\'s private project is not seen', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await waitFor(() => expect(result.current.projects.map((p) => p.id)).toEqual(['mine']));
    expect(result.current.sharedProjects.map((p) => p.id).sort()).toEqual(['ada-edit', 'ada-view']);
  });

  test('a project shared for viewing opens read-only: nothing is written; Save a copy makes my own', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('ada-view'); });
    expect(result.current.reservoirInputs.B).toBe('1.40');
    await waitFor(() => expect(result.current.canWrite).toBe(false));
    expect(result.current.viewingShared).toBe(true);
    act(() => result.current.setReservoirField('B', '1.99'));
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(row(h, 'ada-view').inputs_data.reservoirInputs.B).toBe('1.40');
    let copyId;
    await act(async () => { copyId = await result.current.saveCopy(); });
    expect(row(h, copyId)).toMatchObject({ user_id: HARNESS_ME, project_name: 'Ada view test (copy)' });
    expect(row(h, copyId).inputs_data.reservoirInputs.B).toBe('1.99');
    await waitFor(() => expect(result.current.canWrite).toBe(true));
  });

  test('a project shared for editing is written only while I hold its check-out', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('ada-edit'); });
    await waitFor(() => expect(result.current.sharing.access.canTake).toBe(true));
    act(() => result.current.setReservoirField('B', '1.55'));
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(row(h, 'ada-edit').inputs_data.reservoirInputs.B).toBe('1.50');
    await act(async () => { await result.current.sharing.startEditing(); });
    await waitFor(() => expect(result.current.canWrite).toBe(true));
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    expect(row(h, 'ada-edit')).toMatchObject({ user_id: HARNESS_COLLEAGUE, updated_by: HARNESS_ME });
    expect(row(h, 'ada-edit').inputs_data.reservoirInputs.B).toBe('1.55');
  });

  test('a newer save from elsewhere is refused with the reason', async () => {
    const h = setup();
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    await act(async () => { await result.current.openProject('mine'); });
    await waitFor(() => expect(result.current.canWrite).toBe(true));
    const other = h.storeAs(HARNESS_ME);
    other.trackOpened(TABLE, row(h, 'mine'));
    expect((await other.update(TABLE, 'mine', { inputs_data: payload('My test', 'other tab') })).error).toBeNull();
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(false);
    expect(result.current.notifications.some((n) => /newer version/.test(n.message))).toBe(true);
    expect(row(h, 'mine').inputs_data.reservoirInputs.B).toBe('other tab');
  });

  test('before the migration is applied every save is the plain owner save', async () => {
    const h = setup({ applied: false });
    const { result } = mount(h);
    await waitFor(() => expect(result.current.sharing.ready).toBe(true));
    expect(result.current.sharing.available).toBe(false);
    await act(async () => { await result.current.openProject('mine'); });
    act(() => result.current.setReservoirField('B', '1.31'));
    let ok;
    await act(async () => { ok = await result.current.manualSave(); });
    expect(ok).toBe(true);
    expect(row(h, 'mine').inputs_data.reservoirInputs.B).toBe('1.31');
  });
});
