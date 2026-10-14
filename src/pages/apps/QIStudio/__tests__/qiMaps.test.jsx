/**
 * Maps from volumes (QI upgrade P1.5): the inputs a study offers, the
 * products and settings of the zone_maps job, the units and labels the maps
 * carry, and the Maps tab end to end on the in-memory backend (run, save to
 * the surface registry, kept with the study, in the report). The maths is
 * gated in engines qi.zoneMaps and the worker's zoneMaps test.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import MapsPanel from '../components/MapsPanel';
import {
  mapInputs, productChoices, zoneMapProblem, zoneMapParams, zoneMapLabel, zoneText,
} from '../services/zoneMapsRun';
import { reportModel, buildQIStudioPdf } from '../services/report';
import { blankProject, projectFromPayload } from '../services/model';
import { readPdf, flat } from '@/lib/reportKit/testKit';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));
jest.setTimeout(60000);

const project = {
  ...blankProject(),
  volumeIds: ['qi-v1'],
  inversion: { 'qi-v1': { runs: [
    { jobId: 'j1', status: 'ready', name: 'Keta AI', method: 'model_based', volumeId: 'ai-1' },
    { jobId: 'j2', status: 'ready', name: 'Keta AI uncertainty', method: 'model_based', volumeId: 'q50', volumeIds: { q10: 'q10', q50: 'q50', q90: 'q90', spread: 'sp' } },
  ] } },
  properties: { 'ai-1': { facies: { calibration: { result: { settings: { names: { 1: 'gas sand', 2: 'shale' } } } }, runs: [{ jobId: 'j3', status: 'ready', name: 'Keta facies', volumeIds: { 'p:1': 'p1', 'p:2': 'p2', best: 'b' } }] } } },
};
const volumes = [{ id: 'qi-v1', name: 'Keta 3D full stack' }];

test('the study offers its stack, its impedance, the uncertainty triple and the facies probabilities', () => {
  const inputs = mapInputs(project, volumes);
  expect(inputs.map((x) => [x.family, x.name, x.seismicId])).toEqual([
    ['seismic', 'Keta 3D full stack', 'qi-v1'],
    ['value', 'Keta AI', 'qi-v1'],
    ['triple', 'Keta AI uncertainty', 'qi-v1'],
    ['probability', 'Keta facies: probability of gas sand', 'qi-v1'],
    ['probability', 'Keta facies: probability of shale', 'qi-v1'],
  ]);
  // negative control: an unfinished run offers nothing
  const queued = { ...project, inversion: { 'qi-v1': { runs: [{ ...project.inversion['qi-v1'].runs[0], status: 'queued' }] } }, properties: {} };
  expect(mapInputs(queued, volumes).map((x) => x.family)).toEqual(['seismic']);
});

test('the job settings: each volume once, the spread on the triple, the cutoff, the zone', () => {
  const triple = mapInputs(project, volumes)[2];
  expect(productChoices(triple).filter((c) => c.defaultOn).map((c) => c.key)).toEqual(['q50_mean', 'spread']);
  const zone = { mode: 'base', topId: 'h1', baseId: 'h2' };
  const p = zoneMapParams({ input: triple, picked: ['q50_mean', 'spread', 'q50_frac'], zone, cutoffs: { q50_frac: '7000' }, above: { q50_frac: false } });
  expect(p.volume_ids).toEqual(['q50', 'q10', 'q90']);
  expect(p.products).toEqual([
    { key: 'q50_mean', kind: 'stat', input: 0, stat: 'mean' },
    { key: 'spread', kind: 'spread', q10: 1, q50: 0, q90: 2 },
    { key: 'q50_frac', kind: 'stat', input: 0, stat: 'frac', cutoff: 7000, above: false },
  ]);
  expect(p.base_horizon_id).toBe('h2');
  expect(zoneMapParams({ input: triple, picked: ['spread'], zone: { mode: 'window', topId: 'h1', windowMs: '40' } }).window_ms).toBe(40);
  expect(zoneMapProblem({ input: triple, picked: ['q50_frac'], zone })).toMatch(/cutoff/);
  expect(zoneMapProblem({ input: triple, picked: ['spread'], zone: { ...zone, baseId: 'h1', topId: 'h1' } })).toMatch(/other than the top/);
  expect(zoneMapProblem({ input: triple, picked: ['spread'], zone: { mode: 'window', topId: 'h1', windowMs: '' } })).toMatch(/window/);
  expect(zoneMapProblem({ input: triple, picked: [], zone })).toMatch(/Tick/);
  expect(zoneMapProblem({ input: triple, picked: ['spread'], zone })).toBeNull();
});

test('labels and units: the spread keeps the volume unit, a share is a fraction, the zone in words', () => {
  const [, ai, triple, prob] = mapInputs(project, volumes);
  const words = zoneText({ mode: 'base', topId: 'h1', baseId: 'h2' }, [{ id: 'h1', name: 'Top A' }, { id: 'h2', name: 'Base A' }]);
  expect(words).toBe('Top A to Base A');
  expect(zoneMapLabel(triple, { key: 'spread', kind: 'spread' }, words)).toMatchObject({ unit: 'AI', name: 'Keta AI uncertainty: confidence (Q90 minus Q10), Top A to Base A' });
  expect(zoneMapLabel(ai, { key: 'frac', kind: 'stat', stat: 'frac', cutoff: 7000, above: false }, words).name).toMatch(/share beyond cutoff \(below 7000\)/);
  expect(zoneMapLabel(ai, { key: 'frac', kind: 'stat', stat: 'frac', cutoff: 7000 }, words).unit).toBe('fraction');
  expect(zoneMapLabel(prob, { key: 'p_mean', kind: 'stat', stat: 'mean' }, words)).toMatchObject({ unit: 'probability', qiClass: 'calibrated_prediction' });
});

test('maps are kept with the study and older payloads read as none', () => {
  expect(projectFromPayload({ ...blankProject(), maps: { runs: [{ jobId: 'x' }] } }).maps.runs).toHaveLength(1);
  expect(projectFromPayload({ wellIds: [] }).maps).toEqual({});
});

test('UI: make a confidence map and a property map, save them to the surface registry, and the report lists them', async () => {
  const backend = makeInMemoryBackend();
  const saved = [];
  const save = backend.saveZoneMap;
  backend.saveZoneMap = async (a) => { saved.push(a); return save(a); };
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /><MapsPanel /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api.volumes.length).toBe(1));
  await waitFor(() => { api.toggleVolume('qi-v1'); });
  await waitFor(() => { api.setInversion('qi-v1', { runs: project.inversion['qi-v1'].runs }); });
  const sel = await screen.findByTestId('qi-maps-input');
  fireEvent.change(sel, { target: { value: 'inv3:j2' } });
  expect(screen.getByTestId('qi-maps-p-q50_mean')).toBeChecked();
  expect(screen.getByTestId('qi-maps-p-spread')).toBeChecked();
  await waitFor(() => expect(screen.getByTestId('qi-maps-top')).toHaveValue('qi-h1'));
  fireEvent.click(screen.getByTestId('qi-maps-run'));
  await waitFor(() => expect(api.project.maps.runs).toHaveLength(1));
  const run = api.project.maps.runs[0];
  expect(run.zone).toBe('Top Sand A to Base Sand B');
  expect(run.products.map((p) => p.key)).toEqual(['q50_mean', 'spread']);
  fireEvent.click(screen.getByTestId('qi-maps-save-mem-job-1'));
  await waitFor(() => expect(api.project.maps.runs[0].products.every((p) => p.surfaceId)).toBe(true));
  expect(saved.map((s) => [s.seismic.id, s.unit])).toEqual([['qi-v1', 'AI'], ['qi-v1', 'AI']]);
  expect(saved[1].name).toBe('Keta AI uncertainty: confidence (Q90 minus Q10), Top Sand A to Base Sand B');
  expect(saved[1].provenance).toMatchObject({ statistic: 'Q90 minus Q10', zone: 'Top Sand A to Base Sand B' });
  const matrix = { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } };
  const model = reportModel({ project: api.project, inventory: [], matrix, issues: [], chosenVolumes: [], ready: [] });
  expect(model.maps).toHaveLength(2);
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-15T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Maps from volumes/);
  expect(t).toMatch(/saved to the surface registry/);
});
