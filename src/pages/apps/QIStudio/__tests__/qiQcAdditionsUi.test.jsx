/**
 * QC additions in the tabs (QI upgrade P2.11): depth alignment between wells
 * on the Well ties tab and amplitude preservation at the wells on the AVO tab,
 * on the in-memory backend. The maths is gated in engines qi.qcAdditions.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import DepthAlignmentSection from '../components/DepthAlignmentSection';
import AvoPanel from '../components/AvoPanel';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));
jest.setTimeout(60000);
beforeAll(() => { global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }; });

const withSecondWell = async () => {
  const backend = makeInMemoryBackend();
  const base = await backend.listWells();
  const w4 = { ...base[0], id: 'qi-w4', name: 'KETA-4', surface_x: 600, surface_y: 300 };
  const listWells = backend.listWells; const loadWell = backend.loadWell;
  backend.listWells = async () => [...(await listWells()), w4];
  backend.loadWell = async (w) => (w.id === 'qi-w4' ? { ...(await loadWell(base[0])), well: w4 } : loadWell(w));
  return backend;
};

test('depth alignment: each well\'s mistie, the median and the flag', async () => {
  const backend = await withSecondWell();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /><DepthAlignmentSection /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api.wells?.length).toBe(4));
  await waitFor(() => { api.toggleWell('qi-w1'); api.toggleWell('qi-w4'); api.toggleVolume('qi-v1'); });
  await waitFor(() => expect(api.ready.length).toBe(2));
  fireEvent.click(await screen.findByTestId('qi-depth-align-run', {}, { timeout: 20000 }));
  const table = await screen.findByTestId('qi-depth-align-table', {}, { timeout: 20000 });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(table).toHaveTextContent(/KETA-1/);
  expect(table).toHaveTextContent(/aligned|off the others/);
});

test('amplitude preservation: the stacks sampled at the wells against the model at their angles', async () => {
  const backend = makeInMemoryBackend();
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /><AvoPanel /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api.volumes.length).toBe(1));
  await waitFor(() => {
    api.toggleVolume('qi-v1');
    api.setAvo({
      runs: [{ jobId: 'avo1', name: 'Keta AVO', status: 'ready', volumeIds: { A: 'va', B: 'vb' }, stacks: [{ volumeId: 'near', angle: 10, name: 'near' }, { volumeId: 'far', angle: 30, name: 'far' }], vsVp: 0.5, chiDeg: 20 }],
      wells: { runJobId: 'avo1', runName: 'Keta AVO', at: '2026-10-15', points: [{ name: 'KETA-1', il: 5, xl: 8, t_ms: 1500 }], scale: 2, n: 1, agree: 1, wells: [{ name: 'KETA-1', modelled: { A: -0.05, B: -0.12 }, observed: { A: -0.1, B: -0.24 }, scaled: { A: -0.05, B: -0.12 }, residual: 0, modelledClass: 'III', observedClass: 'III', agree: true }] },
    });
  });
  fireEvent.click(await screen.findByTestId('qi-avo-preservation-run', {}, { timeout: 20000 }));
  expect(await screen.findByTestId('qi-avo-preservation-result', {}, { timeout: 20000 })).toHaveTextContent(/k = KETA-1/);
  const call = enqueue.mock.calls.find(([k, p]) => k === 'sample_volumes' && p.volume_ids.includes('near'));
  expect(call[1].volume_ids).toEqual(['near', 'far']);
  expect(call[1].points).toEqual([{ name: 'KETA-1', il: 5, xl: 8, t_ms: 1500 }]);
  expect(api.project.avo.preservation.angles).toEqual([10, 30]);
});
