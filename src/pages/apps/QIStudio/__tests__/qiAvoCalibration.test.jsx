/**
 * AVO calibration on the AVO tab (QI upgrade P2.10): the job's terms, one
 * scale or a scale field from the wells comparison, and the curvature and
 * class products. The maths is gated in engines qi.avoCalibration and the
 * worker's avoCalibration test.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import AvoPanel, { avoCalibrationBlock } from '../components/AvoPanel';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));
jest.setTimeout(60000);
beforeAll(() => { global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }; });

const wells = {
  runJobId: 'r1', runName: 'Keta AVO', scale: 2000, n: 2, agree: 2,
  points: [{ name: 'W1', il: 2, xl: 3, t_ms: 1500 }, { name: 'W2', il: 10, xl: 20, t_ms: 1520 }],
  wells: [{ name: 'W1', modelled: { A: -0.05, B: -0.1 }, observed: { A: -100, B: -200 }, scaled: { A: -0.05, B: -0.1 }, residual: 0, modelledClass: 'III', observedClass: 'III', agree: true }, { name: 'W2', modelled: { A: -0.04, B: -0.12 }, observed: { A: -120, B: -360 }, scaled: { A: -0.06, B: -0.18 }, residual: 0.01, modelledClass: 'III', observedClass: 'III', agree: true }, { name: 'W3', error: 'No gather' }],
};

test('the calibration block: terms, one scale, a field from each well\'s scale at its position', () => {
  expect(avoCalibrationBlock({ cal: { terms: '2', mode: 'none' }, wells })).toEqual({});
  expect(avoCalibrationBlock({ cal: { terms: 'auto', mode: 'one' }, wells })).toEqual({ terms: 'auto', scale: 2000 });
  const f = avoCalibrationBlock({ cal: { terms: '3', mode: 'field', fieldMethod: 'kriging', range: '1500' }, wells });
  expect(f.terms).toBe(3);
  expect(f.scale_field.wells.map(({ name, il, xl }) => ({ name, il, xl }))).toEqual([{ name: 'W1', il: 2, xl: 3 }, { name: 'W2', il: 10, xl: 20 }]);
  f.scale_field.wells.forEach((w, i) => expect(w.scale).toBeCloseTo([2000, 3000][i], 9));
  expect(f.scale_field.variogram).toEqual({ model: 'spherical', range: 1500 });
});

test('UI: a scale field and a class volume reach the AVO job', async () => {
  const backend = makeInMemoryBackend();
  backend.listVolumes = async () => ['near', 'mid', 'far'].map((n) => ({ id: `qi-${n}`, name: `Keta ${n}`, kind: 'seismic', status: 'ready' }));
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /><AvoPanel /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api.volumes.length).toBe(3));
  await waitFor(() => { for (const v of api.volumes) api.toggleVolume(v.id); api.setAvo({ wells }); });
  [['qi-near', 8], ['qi-mid', 22], ['qi-far', 38]].forEach(([id, a], k) => {
    fireEvent.change(screen.getByTestId(`qi-avo-stack-${k}`), { target: { value: id } });
    fireEvent.change(screen.getByTestId(`qi-avo-angle-${k}`), { target: { value: String(a) } });
  });
  const box = screen.getByTestId('qi-avo-calibration');
  fireEvent.change(within(box).getByTestId('qi-avo-terms'), { target: { value: 'auto' } });
  expect(within(box).getByTestId('qi-avo-terms-note')).toHaveTextContent(/support 3 terms/);
  fireEvent.change(within(box).getByTestId('qi-avo-cal-mode'), { target: { value: 'field' } });
  fireEvent.click(within(box).getByTestId('qi-avo-product-C'));
  fireEvent.click(within(box).getByTestId('qi-avo-product-class'));
  fireEvent.click(screen.getByTestId('qi-avo-run'));
  await waitFor(() => expect(enqueue.mock.calls.some(([k]) => k === 'avo_volumes')).toBe(true));
  const [, p] = enqueue.mock.calls.find(([k]) => k === 'avo_volumes');
  expect(p.terms).toBe('auto');
  expect(Object.keys(p.products)).toEqual(['A', 'B', 'FF', 'C', 'class']);
  p.scale_field.wells.forEach((w, i) => expect(w.scale).toBeCloseTo([2000, 3000][i], 9));
});
