/**
 * DCA-U1-011: Decline Curve Analysis adopts record sharing (saved_dca_projects
 * is under the sharing rules since migration 20261002130000). The real
 * context on the in-memory mirror of the database rules: own projects, then
 * those shared with me; a project shared for viewing is never written; one
 * shared for editing is written only while I hold the check-out; Save a copy
 * makes my own.
 */
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { makeHarnessSharing, colleagueShared, HARNESS_ME, HARNESS_COLLEAGUE } from '@/lib/recordSharing';

const TABLE = 'saved_dca_projects';
const mockBackend = { db: null, uid: null };

jest.mock('@/utils/savedProjects', () => {
  const T = 'saved_dca_projects';
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
  return { createSavedProjectsService: () => service, exportProjectAsJSON: jest.fn(), importProjectFromJSON: jest.fn() };
});

import { DeclineCurveProvider, useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { sampleWell } from '@/utils/declineCurve/sampleWell';

const payload = (name) => {
  const w = { ...sampleWell('x'), id: 'w1' };
  return { id: null, name, payloadVersion: 2, wells: { w1: w }, scenarios: [], typeCurves: [], wellGroups: [] };
};

let api = null;
const Probe = () => { api = useDeclineCurve(); return null; };

function setup() {
  const h = makeHarnessSharing();
  mockBackend.db = h.db;
  mockBackend.uid = HARNESS_ME;
  h.db.seed(TABLE, [{ id: 'mine', user_id: HARNESS_ME, project_name: 'My wells', inputs_data: payload('My wells') }], { owner: HARNESS_ME });
  h.db.seed(TABLE, [
    colleagueShared({ id: 'ada-view', project_name: 'Ada view', inputs_data: payload('Ada view') }),
    colleagueShared({ id: 'ada-edit', project_name: 'Ada edit', inputs_data: payload('Ada edit') }, { access: 'edit' }),
    { id: 'ada-private', user_id: HARNESS_COLLEAGUE, project_name: 'Ada private', inputs_data: payload('Ada private') },
  ]);
  return h;
}
const row = (h, id) => h.db._rows(TABLE).find((r) => r.id === id);

const mount = async (h) => {
  await act(async () => { render(<DeclineCurveProvider sharingStore={h.store}><Probe /></DeclineCurveProvider>); });
  await waitFor(() => expect(api.sharing.ready).toBe(true));
};

describe('Decline Curve Analysis under record sharing', () => {
  jest.setTimeout(120000);

  test('the picker lists my projects, then those shared with me; a private one is not seen', async () => {
    const h = setup();
    await mount(h);
    await waitFor(() => expect(api.projects.map((p) => p.id)).toEqual(['mine']));
    expect(api.sharedProjects.map((p) => p.id).sort()).toEqual(['ada-edit', 'ada-view']);
  });

  test('a project shared for viewing opens read-only and is never written; Save a copy makes my own', async () => {
    const h = setup();
    await mount(h);
    await act(async () => { await api.openProject('ada-view'); });
    expect(api.viewingShared).toBe(true);
    expect(api.canWrite).toBe(false);
    const before = JSON.stringify(row(h, 'ada-view').inputs_data);
    let ok;
    await act(async () => { ok = await api.manualSave(); });
    expect(ok).toBe(false);
    expect(JSON.stringify(row(h, 'ada-view').inputs_data)).toBe(before);
    await act(async () => { await api.saveCopy(); });
    const mineNow = h.db._rows(TABLE).filter((r) => r.user_id === HARNESS_ME).map((r) => r.project_name);
    expect(mineNow).toContain('Ada view (copy)');
  });

  test('a project shared for editing is written only while I hold the check-out', async () => {
    const h = setup();
    await mount(h);
    await act(async () => { await api.openProject('ada-edit'); });
    expect(api.canWrite).toBe(false);
    let ok;
    await act(async () => { ok = await api.manualSave(); });
    expect(ok).toBe(false);
    await act(async () => { await api.sharing.startEditing(); });
    await waitFor(() => expect(api.canWrite).toBe(true));
    await act(async () => { api.updateIdentification('w1', 'analyst', 'Me'); });
    await act(async () => { ok = await api.manualSave(); });
    expect(ok).toBe(true);
    expect(row(h, 'ada-edit').inputs_data.wells.w1.identification.analyst).toBe('Me');
  });
});
