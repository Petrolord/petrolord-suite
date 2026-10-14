/**
 * QI pilot sub-volume and the seismic provenance in the report (crop before
 * upload programme, 2026-10-14): the AVO run sends the pilot area to the
 * worker and names its products as a pilot; a back-to-front area holds the
 * run; the report lists the cropped volumes' source and crop, and the pilot
 * runs.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null,
    save: async () => ({ success: true }), remove: async () => ({ success: true }),
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));
jest.mock('@/pages/apps/Seismolord/services/cropDefinitions', () => ({
  cropDefinitions: () => ({ list: async () => ({ rows: [{ id: 'c1', name: 'Block A', definition: { il: { from: 2, to: 4 }, xl: { from: 1, to: 3 }, window: { from: 1500, to: 2500 } } }], saved: true }) }),
}));

/* eslint-disable import/first */
import QIStudio from '../QIStudio';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { reportModel } from '../services/report';
import { pilotParam, pilotFormProblem, pilotName, EMPTY_PILOT } from '../components/PilotArea';
/* eslint-enable import/first */

jest.setTimeout(60000);

test('pilot form: the job block, the name and the problems', () => {
  const v = { ...EMPTY_PILOT, on: true, ilFrom: '100', ilTo: '140', xlFrom: '20', xlTo: '60', tFrom: '1500', tTo: '2500', cropName: 'Block A', definitionId: 'c1' };
  expect(pilotParam(v)).toEqual({ il: { from: 100, to: 140 }, xl: { from: 20, to: 60 }, t_ms: { from: 1500, to: 2500 }, crop_name: 'Block A', definition_id: 'c1' });
  expect(pilotName('Keta AI', v)).toBe('Keta AI (pilot)');
  expect(pilotName('Keta AI', EMPTY_PILOT)).toBe('Keta AI');
  expect(pilotFormProblem({ ...v, ilTo: '90' })).toBe('The pilot inline range runs backwards.');
  expect(pilotFormProblem({ ...v, tTo: '' })).toBe('Give the pilot time range, from and to.');
  expect(pilotParam({ ...v, on: false })).toBeNull();
});

test('AVO in a pilot area: the area reaches the job and the products are named as a pilot', async () => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  const backend = makeInMemoryBackend();
  const base = backend.listVolumes;
  backend.listVolumes = async () => [...(await base()), { id: 'qi-v2', name: 'Keta mid stack', kind: 'seismic', status: 'ready' }, { id: 'qi-v3', name: 'Keta far stack', kind: 'seismic', status: 'ready' }];
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  const register = jest.spyOn(backend, 'registerAvoVolume');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  for (const v of ['qi-v1', 'qi-v2', 'qi-v3']) fireEvent.click(await screen.findByTestId(`qi-volume-${v}`, {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-tab-avo'));
  [['qi-v1', 8], ['qi-v2', 20], ['qi-v3', 32]].forEach(([v, a], k) => {
    fireEvent.change(screen.getByTestId(`qi-avo-stack-${k}`), { target: { value: v } });
    fireEvent.change(screen.getByTestId(`qi-avo-angle-${k}`), { target: { value: String(a) } });
  });
  fireEvent.click(screen.getByTestId('qi-avo-pilot-on'));
  // a saved Seismolord crop fills the area
  fireEvent.change(await screen.findByLabelText('Pilot from a saved crop'), { target: { value: 'c1' } });
  expect(screen.getByLabelText('Pilot first inline')).toHaveValue('2');
  expect(screen.getByLabelText('Pilot window end')).toHaveValue('2500');
  fireEvent.change(screen.getByLabelText('Pilot last inline'), { target: { value: '1' } });
  expect(screen.getByTestId('qi-avo-run')).toBeDisabled();
  expect(screen.getByTestId('qi-avo-pilot-problem')).toHaveTextContent('The pilot inline range runs backwards.');
  fireEvent.change(screen.getByLabelText('Pilot last inline'), { target: { value: '4' } });
  expect(screen.getByTestId('qi-avo-run')).toHaveTextContent('Compute the AVO volumes in the pilot area');
  fireEvent.click(screen.getByTestId('qi-avo-run'));
  await screen.findByTestId('qi-avo-runs', {}, { timeout: 20000 });
  const [kind, params] = enqueue.mock.calls.find((c) => c[0] === 'avo_volumes');
  expect(kind).toBe('avo_volumes');
  expect(params.pilot).toEqual({ il: { from: 2, to: 4 }, xl: { from: 1, to: 3 }, t_ms: { from: 1500, to: 2500 }, crop_name: 'Block A', definition_id: 'c1' });
  expect(params.name).toMatch(/AVO \(pilot\)$/);
  expect(register.mock.calls.every(([a]) => / \(pilot\)$/.test(a.name))).toBe(true);
});

test('report: cropped volumes show their source and crop; pilot runs are listed', () => {
  const project = {
    targets: [], feasibility: {}, dates: {},
    inversion: { v1: { runs: [{ name: 'Keta AI (pilot)', status: 'ready', pilot: { il: { from: 2, to: 4 }, xl: { from: 1, to: 3 }, t_ms: { from: 1500, to: 2500 }, crop_name: 'Block A' } }] } },
    avo: { runs: [{ name: 'Keta AVO', status: 'ready', stacks: [], volumeIds: {}, vsVp: 0.5 }] },
  };
  const crop = {
    name: 'Block A', mode: 'upload', il: { from: 2, to: 4, step: 1 }, xl: { from: 1, to: 3, step: 1 }, polygon: null,
    window: { from: 1500, to: 2500 }, samples: { first: 375, last: 625 }, kept_traces: 9,
    source: { file_name: 'keta_near.sgy', traces: 400, il: { min: 1, max: 20, step: 1 }, xl: { min: 1, max: 20, step: 1 }, ns: 1501, dt_us: 4000 },
  };
  const m = reportModel({
    project, inventory: [], matrix: { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } }, issues: [],
    chosenVolumes: [{ name: 'Keta near', survey_meta: { ingest: { crop } } }, { name: 'Keta far', survey_meta: {} }],
  });
  expect(m.seismicData[0][1]).toBe('Source file keta_near.sgy: 400 traces, inlines 1 to 20, crosslines 1 to 20, 1,501 samples at 4 ms. '
    + 'Crop "Block A" (cropped before upload): inlines 2 to 4, crosslines 1 to 3, 1500 to 2500 ms (samples 375 to 625), 9 traces kept.');
  expect(m.seismicData[1][1]).toBe('Imported whole (no crop).');
  expect(m.pilots).toEqual([['Keta AI (pilot)', 'Pilot "Block A": inlines 2 to 4, crosslines 1 to 3, 1500 to 2500 ms', 'Ready']]);
});
