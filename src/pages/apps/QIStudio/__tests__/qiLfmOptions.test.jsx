/**
 * Low-frequency model options on the Inversion tab (QI upgrade P2.8):
 * kriging, a fault from Seismolord and a velocity volume reach the job,
 * the scenarios are compared at the wells and listed, and the report
 * carries them. The maths is gated in engines qi.lfmModels and the worker's
 * poststackLfm test.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QIStudio from '../QIStudio';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { faultTraceXY, lfmOptionsOf } from '../services/inversionRun';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));
jest.setTimeout(60000);

test('a fault trace is the middle of each stick on the world grid; the default options are the original model', () => {
  const tr = faultTraceXY({ sticks: [{ points: [{ il: 1, xl: 2, s: 5 }, { il: 3, xl: 4, s: 6 }, { il: 5, xl: 6, s: 7 }] }, { points: [] }] }, (il, xl) => ({ x: il * 10, y: xl * 10 }));
  expect(tr).toEqual([{ x: 30, y: 40 }]);
  expect(lfmOptionsOf({})).toBeNull();
  expect(lfmOptionsOf({ lfm: { method: 'idw' } })).toBeNull();
  expect(lfmOptionsOf({ lfm: { method: 'kriging', variogram: { range: 500 } } })).toMatchObject({ method: 'kriging', variogram: { model: 'spherical', range: 500, sill: 1 } });
});

test('UI: kriging, a fault and a velocity trend reach the job, and the scenarios come back as a table', async () => {
  const backend = makeInMemoryBackend();
  const base = await backend.listWells();
  const w4 = { ...base[0], id: 'qi-w4', name: 'KETA-4', surface_x: 600, surface_y: 300 };
  const listWells = backend.listWells; const loadWell = backend.loadWell;
  backend.listWells = async () => [...(await listWells()), w4];
  backend.loadWell = async (w) => (w.id === 'qi-w4' ? { ...(await loadWell(base[0])), well: w4 } : loadWell(w));
  backend.listVolumes = async () => [{ id: 'qi-v1', name: 'Keta 3D full stack', kind: 'seismic', status: 'ready' }, { id: 'qi-vel', name: 'Keta interval velocity', kind: 'seismic', status: 'ready' }];
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-well-qi-w4'));
  fireEvent.click(screen.getByTestId('qi-volume-qi-v1'));
  fireEvent.click(screen.getByTestId('qi-tab-inversion'));
  fireEvent.click(await screen.findByTestId('qi-inv-read-wells', {}, { timeout: 20000 }));
  await screen.findByTestId('qi-inv-wells', {}, { timeout: 20000 });
  const box = screen.getByTestId('qi-inv-lfm-options');
  fireEvent.change(within(box).getByTestId('qi-inv-lfm-method'), { target: { value: 'kriging' } });
  expect(within(box).getByTestId('qi-inv-lfm-problem')).toHaveTextContent(/variogram range/);
  expect(screen.getByTestId('qi-inv-blind')).toBeDisabled();
  fireEvent.change(within(box).getByTestId('qi-inv-lfm-range'), { target: { value: '800' } });
  fireEvent.click(await within(box).findByTestId('qi-inv-lfm-fault-qi-f1'));
  fireEvent.change(within(box).getByTestId('qi-inv-lfm-velocity'), { target: { value: 'qi-vel' } });
  fireEvent.change(within(box).getByTestId('qi-inv-lfm-velocity-kind'), { target: { value: 'rms' } });
  fireEvent.click(within(box).getByTestId('qi-inv-lfm-compare'));
  const table = await screen.findByTestId('qi-inv-lfm-scenarios', {}, { timeout: 20000 });
  expect(within(table).getAllByRole('row')).toHaveLength(5);
  expect(table).toHaveTextContent(/Velocity trend/);
  const params = enqueue.mock.calls[enqueue.mock.calls.length - 1][1];
  expect(params.inversion.lfm).toMatchObject({ method: 'kriging', variogram: { model: 'spherical', range: 800 } });
  expect(params.inversion.lfm.barriers).toHaveLength(1);
  expect(params.inversion.lfm.barriers[0].length).toBe(4);
  expect(params.inversion.velocity).toEqual({ volume_id: 'qi-vel', kind: 'rms' });
  expect(params.inversion.lfm_scenarios.map((x) => x.name)).toEqual(['Inverse distance', 'Kriging, spherical 800 m', 'With 1 fault', 'Velocity trend']);
  fireEvent.click(screen.getByTestId('qi-inv-blind'));
  await waitFor(() => expect(enqueue.mock.calls[enqueue.mock.calls.length - 1][1].inversion.lfm_scenarios).toBeUndefined());
});
