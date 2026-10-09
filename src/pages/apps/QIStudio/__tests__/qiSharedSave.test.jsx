/**
 * QI Studio saving through the record-sharing store, as production runs it.
 * The table was missing from the sharing rules (found 2026-10-09), so the
 * store threw before any request: a project could be created, but no edit to
 * it was ever stored, and the header said "Save failed". This runs the
 * provider on the in-memory sharing database with the real store.
 * Negative control: src/lib/recordSharing/__tests__/registryGuard.test.js
 * fails, and this test fails, with the registry entry removed.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';

const mockWorld = { db: null };
jest.mock('@/utils/savedProjects', () => {
  const T = 'saved_qi_studio_projects';
  const rowOf = (id) => (mockWorld.db.select(T, 'u-owner').data || []).find((r) => r.id === id) || null;
  const service = {
    list: async () => (mockWorld.db.select(T, 'u-owner').data || []).map((r) => ({ id: r.id, name: r.project_name })),
    listRows: async () => (mockWorld.db.select(T, 'u-owner').data || []).map((r) => ({ id: r.id, name: r.project_name, userId: r.user_id })),
    load: async (id) => rowOf(id)?.inputs_data ?? null,
    loadRow: async (id) => { const r = rowOf(id); return r ? { payload: r.inputs_data, row: r } : null; },
    save: async (id, payload) => {
      const existing = rowOf(id);
      const res = existing
        ? mockWorld.db.update(T, 'u-owner', id, { project_name: payload.name, inputs_data: payload })
        : mockWorld.db.insert(T, 'u-owner', { id, user_id: 'u-owner', project_name: payload.name, inputs_data: payload });
      if (res.error) throw new Error(res.error.message);
      return { success: true };
    },
    remove: async () => ({ success: true }),
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));

import { makeSharingDb, makeSharingStore, memoryTransport } from '@/lib/recordSharing';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';

jest.setTimeout(60000);

test('a QI study saves its edits through the sharing store', async () => {
  mockWorld.db = makeSharingDb({ members: { 'u-owner': { orgId: 'org-1', name: 'Owner' } } });
  const store = makeSharingStore(memoryTransport(mockWorld.db, 'u-owner'));
  const ref = {};
  const Probe = () => { ref.api = useQIStudio(); return null; };
  render(<QIStudioProvider backend={makeInMemoryBackend()} sharingStore={store}><Probe /></QIStudioProvider>);
  await waitFor(() => expect(ref.api.wells?.length).toBe(3));
  await act(async () => { await ref.api.createProject('Ekene QI'); });
  act(() => { ref.api.toggleWell('qi-w1'); });
  await waitFor(() => expect(ref.api.dirty).toBe(true));
  let ok;
  await act(async () => { ok = await ref.api.manualSave(); });
  expect(ok).toBe(true);
  expect(ref.api.saveError).toBeNull();
  const row = mockWorld.db.select('saved_qi_studio_projects', 'u-owner').data[0];
  expect(row.inputs_data.wellIds).toEqual(['qi-w1']);
  expect(row.version).toBe(2);
});
