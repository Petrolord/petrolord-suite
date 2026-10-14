/**
 * QI Studio and depth-domain volumes (QI upgrade P1.6, 2026-10-15): a depth
 * volume imported into Seismolord is listed on Setup but cannot be ticked,
 * with the reason, and never enters the study's volumes (every QI tool works
 * in two-way time). The time volume beside it behaves as before (negative
 * control).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockStore = { rows: new Map() };
jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: async () => [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })),
    listRows: async () => [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })),
    load: async (id) => mockStore.rows.get(id)?.payload ?? null,
    loadRow: async (id) => { const r = mockStore.rows.get(id); return r ? { payload: r.payload, row: { id, project_name: r.name } } : null; },
    save: async (id, payload) => { mockStore.rows.set(id, { id, name: payload.name, payload: JSON.parse(JSON.stringify(payload)) }); return { success: true }; },
    remove: async (id) => { mockStore.rows.delete(id); return { success: true }; },
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));

// eslint-disable-next-line import/first
import QIStudio from '../QIStudio';
// eslint-disable-next-line import/first
import { makeInMemoryBackend } from '../services/inMemoryBackend';
// eslint-disable-next-line import/first
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';

jest.setTimeout(90000);
beforeEach(() => { mockStore.rows = new Map(); });

const DEPTH_VOL = { id: 'qi-vd', name: 'Keta PSDM interval velocity', kind: 'seismic', status: 'ready', survey_meta: { vertical: { domain: 'depth', unit: 'm', dz: 10 } } };
const withDepth = () => {
  const b = makeInMemoryBackend();
  const list = b.listVolumes.bind(b);
  return { ...b, listVolumes: async () => [...(await list()), DEPTH_VOL] };
};

test('a depth volume is listed but cannot join the study; the time volume can', async () => {
  render(<MemoryRouter><QIStudio backend={withDepth()} sharingStore={null} /></MemoryRouter>);
  const depthBox = await screen.findByTestId('qi-volume-qi-vd', {}, { timeout: 30000 });
  expect(depthBox).toBeDisabled();
  expect(screen.getByTestId('qi-volume-depth-qi-vd')).toHaveTextContent('depth: QI Studio works in two-way time');
  const timeBox = screen.getByTestId('qi-volume-qi-v1');
  expect(timeBox).not.toBeDisabled();
  fireEvent.click(timeBox);
  expect(timeBox).toBeChecked();
});

test('a depth volume saved in an older study stays out of the chosen volumes', async () => {
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={withDepth()}><Probe /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api.volumes.length).toBe(2));
  act(() => { api.toggleVolume('qi-vd'); api.toggleVolume('qi-v1'); });
  await waitFor(() => expect(api.project.volumeIds).toEqual(['qi-vd', 'qi-v1']));
  expect(api.chosenVolumes.map((v) => v.id)).toEqual(['qi-v1']);
});
