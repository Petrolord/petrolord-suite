/**
 * QI Studio kept edits only when the 10 s autosave fired: leaving sooner (to
 * Rock Physics Studio, say) lost them while the header said "Saved", and
 * reopening a project wrote it again for nothing. Found recording the QI
 * videos (2026-10-09), the SCAL-T1 pattern. Pending edits are now written on
 * unmount, on page hide and before another project opens; opening is not an
 * edit; `dirty` says "Unsaved changes" until the edits are stored.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';

const mockStore = { rows: new Map(), saves: 0 };
jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: async () => [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })),
    listRows: async () => [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })),
    load: async (id) => mockStore.rows.get(id)?.payload ?? null,
    loadRow: async (id) => { const r = mockStore.rows.get(id); return r ? { payload: r.payload, row: { id, project_name: r.name } } : null; },
    save: async (id, payload) => { mockStore.saves += 1; mockStore.rows.set(id, { id, name: payload.name, payload: JSON.parse(JSON.stringify(payload)) }); return { success: true }; },
    remove: async (id) => { mockStore.rows.delete(id); return { success: true }; },
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';

jest.setTimeout(60000);
beforeEach(() => { mockStore.rows = new Map(); mockStore.saves = 0; });

async function mount(backend) {
  const ref = {};
  const Probe = () => { ref.api = useQIStudio(); return null; };
  const view = render(<QIStudioProvider backend={backend}><Probe /></QIStudioProvider>);
  await waitFor(() => expect(ref.api.wells?.length).toBe(3));
  return { ref, view };
}

test('an edit made just before leaving is written when QI Studio unmounts', async () => {
  const backend = makeInMemoryBackend();
  const { ref, view } = await mount(backend);
  await act(async () => { await ref.api.createProject('Ekene QI'); });
  act(() => { ref.api.toggleWell('qi-w1'); });
  await waitFor(() => expect(ref.api.dirty).toBe(true));
  const id = [...mockStore.rows.keys()][0];
  expect(mockStore.rows.get(id).payload.wellIds).toEqual([]);   // the 10 s autosave has not fired
  view.unmount();                                                 // leave within the 10 s
  await waitFor(() => expect(mockStore.rows.get(id).payload.wellIds).toEqual(['qi-w1']));
});

test('opening a project is not an edit: nothing is written and nothing is pending', async () => {
  const backend = makeInMemoryBackend();
  mockStore.rows.set('p1', { id: 'p1', name: 'Ekene QI', payload: { id: 'p1', name: 'Ekene QI', wellIds: ['qi-w2'], targets: [], volumeIds: [] } });
  const { ref, view } = await mount(backend);
  await waitFor(() => expect(ref.api.projects.length).toBe(1));
  await act(async () => { await ref.api.openProject('p1'); });
  await waitFor(() => expect(ref.api.project.wellIds).toEqual(['qi-w2']));
  expect(ref.api.dirty).toBe(false);
  view.unmount();
  await new Promise((r) => setTimeout(r, 50));
  expect(mockStore.saves).toBe(0);
});

test('a manual save clears the pending state, and an edit sets it again', async () => {
  const backend = makeInMemoryBackend();
  const { ref } = await mount(backend);
  await act(async () => { await ref.api.createProject('Ekene QI'); });
  act(() => { ref.api.toggleWell('qi-w3'); });
  await waitFor(() => expect(ref.api.dirty).toBe(true));
  await act(async () => { await ref.api.manualSave(); });
  expect(ref.api.dirty).toBe(false);
  act(() => { ref.api.toggleWell('qi-w3'); });
  await waitFor(() => expect(ref.api.dirty).toBe(true));
});
