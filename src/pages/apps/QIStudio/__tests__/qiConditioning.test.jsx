/**
 * Prestack conditioning and spectral balancing in QI Studio (QI round 3):
 * the forms turn typed text into the worker's settings and hold bad ones
 * with a reason; the Prestack tab runs Radon demultiple and f-x on a gather
 * store and keeps the run with what it removed; the AVO tab balances the
 * stacks to a reference before matching; the report prints both. The engine
 * and worker numbers are gated in the engines and worker suites.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null,
    save: async () => ({ success: true }), remove: async () => ({ success: true }),
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));

/* eslint-disable import/first */
import QIStudio from '../QIStudio';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { conditioningParams, settingsText, RADON_DEFAULTS, FX_DEFAULTS } from '../components/ConditioningSection';
import { balanceParams, operatorRows } from '../components/SpectralBalanceSection';
import { projectFromPayload, runChoices } from '../services/model';
/* eslint-enable import/first */

jest.setTimeout(60000);
const NO_AREA = { on: false };

test('conditioning settings: typed text to the worker\'s numbers; bad ones held with the reason', () => {
  expect(conditioningParams('radon', RADON_DEFAULTS, FX_DEFAULTS, NO_AREA).params).toEqual({ cut_ms: 30, q_min_ms: -60, q_max_ms: 300, high_res: 3, avo_terms: true, window_ms: 300, f_max_hz: 70 });
  expect(conditioningParams('radon', { ...RADON_DEFAULTS, cut: '' }, FX_DEFAULTS, NO_AREA).error).toMatch(/the cut/);
  expect(conditioningParams('radon', { ...RADON_DEFAULTS, cut: '0' }, FX_DEFAULTS, NO_AREA).error).toMatch(/above zero/);
  expect(conditioningParams('radon', { ...RADON_DEFAULTS, cut: '400' }, FX_DEFAULTS, NO_AREA).error).toMatch(/between/);
  expect(conditioningParams('radon', { ...RADON_DEFAULTS, highRes: '2.5' }, FX_DEFAULTS, NO_AREA).error).toMatch(/0 to 5/);
  expect(conditioningParams('fx', RADON_DEFAULTS, FX_DEFAULTS, NO_AREA).params).toEqual({ filter_length: 3, window_ms: 200, f_lo_hz: 3 });
  expect(conditioningParams('fx', RADON_DEFAULTS, { ...FX_DEFAULTS, fHi: '90' }, NO_AREA).params.f_hi_hz).toBe(90);
  expect(conditioningParams('fx', RADON_DEFAULTS, { ...FX_DEFAULTS, length: '12' }, NO_AREA).error).toMatch(/1 to 8/);
  expect(conditioningParams('fx', RADON_DEFAULTS, FX_DEFAULTS, { on: true, il0: '10', il1: '20', xl0: '5', xl1: '' }).error).toMatch(/area/);
  expect(conditioningParams('fx', RADON_DEFAULTS, FX_DEFAULTS, { on: true, il0: '10', il1: '20', xl0: '5', xl1: '9' }).params.area).toEqual({ il: [10, 20], xl: [5, 9] });
  expect(settingsText('radon_demultiple', { cut_ms: 30, q_min_ms: -60, q_max_ms: 300, high_res: 0, avo_terms: false, window_ms: 0, f_max_hz: 70 })).toBe('cut 30 ms at the far offset, moveout -60 to 300 ms, least squares, whole trace, up to 70 Hz');
});

test('balancing settings and the operator chart rows', () => {
  expect(balanceParams({ target: 'reference', reference: '', lo: '8', hi: '60', maxGain: '20' }, ['a']).error).toMatch(/reference/);
  expect(balanceParams({ target: 'flat', reference: '', lo: '8', hi: '10', maxGain: '20' }, ['a']).error).toMatch(/5 Hz above/);
  expect(balanceParams({ target: 'flat', reference: '', lo: '8', hi: '60', maxGain: '20' }, []).error).toMatch(/Choose the stacks/);
  expect(balanceParams({ target: 'reference', reference: 'r', lo: '8', hi: '60', maxGain: '20' }, ['a']).params).toEqual({ target: 'reference', reference_volume_id: 'r', f_lo_hz: 8, f_hi_hz: 60, max_gain_db: 20 });
  expect(operatorRows([{ operator: [[0, 0], [2, 1]] }, { operator: [[2, 3]] }])).toEqual([{ f: 0, s0: 0, s1: null }, { f: 2, s0: 1, s1: 3 }]);
});

test('Prestack tab: Radon demultiple on a store, the run kept with what it removed; f-x on an area', async () => {
  const backend = makeInMemoryBackend();
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-tab-prestack', {}, { timeout: 20000 }));
  const sec = await screen.findByTestId('qi-pre-cond', {}, { timeout: 20000 });
  await waitFor(() => expect(within(sec).getByTestId('qi-pre-cond-store')).toHaveValue('qi-d2'));
  // a cleared cut holds the run
  fireEvent.change(within(sec).getByTestId('qi-pre-cond-cut'), { target: { value: '' } });
  expect(within(sec).getByTestId('qi-pre-cond-run')).toBeDisabled();
  expect(within(sec).getByTestId('qi-pre-cond-problem')).toHaveTextContent('Give the cut.');
  fireEvent.change(within(sec).getByTestId('qi-pre-cond-cut'), { target: { value: '40' } });
  fireEvent.click(within(sec).getByTestId('qi-pre-cond-run'));
  await waitFor(() => expect(enqueue).toHaveBeenCalledWith('radon_demultiple', expect.objectContaining({ dataset_id: 'qi-d2', cut_ms: 40, high_res: 3, avo_terms: true, keep_removed: true })));
  const runs = await screen.findByTestId('qi-pre-cond-runs', {}, { timeout: 20000 });
  expect(runs).toHaveTextContent(/Radon demultiple of Keta CDP gathers gathers: 1400 CDPs, 31 percent of the energy removed, 0\.82 s per gather\. cut 40 ms/);
  expect(runs).toHaveTextContent(/with what was removed beside it/);
  expect(within(runs).getAllByRole('row')).toHaveLength(5);
  // f-x on an area
  fireEvent.click(within(sec).getByTestId('qi-pre-cond-fx'));
  fireEvent.click(within(sec).getByTestId('qi-pre-cond-area'));
  fireEvent.change(screen.getByLabelText('Area inline from'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Area inline to'), { target: { value: '140' } });
  fireEvent.change(screen.getByLabelText('Area crossline from'), { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('Area crossline to'), { target: { value: '260' } });
  fireEvent.click(within(sec).getByTestId('qi-pre-cond-keep'));
  fireEvent.click(within(sec).getByTestId('qi-pre-cond-run'));
  await waitFor(() => expect(enqueue).toHaveBeenCalledWith('fx_denoise', expect.objectContaining({ filter_length: 3, area: { il: [100, 140], xl: [200, 260] }, keep_removed: false })));
  await waitFor(() => expect(screen.getByTestId('qi-pre-cond-runs')).toHaveTextContent(/f-x noise attenuation of Keta CDP gathers gathers: 120 CDPs in inlines 100 to 140, crosslines 200 to 260/));
});

test('AVO tab: balance the stacks to the near stack, with the table and the operators', async () => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  const backend = makeInMemoryBackend();
  const base = backend.listVolumes;
  backend.listVolumes = async () => [...(await base()), { id: 'qi-v2', name: 'Keta mid stack', kind: 'seismic', status: 'ready' }, { id: 'qi-v3', name: 'Keta far stack', kind: 'seismic', status: 'ready' }];
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  const reg = jest.spyOn(backend, 'registerBalancedVolume');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  for (const v of ['qi-v1', 'qi-v2', 'qi-v3']) fireEvent.click(await screen.findByTestId(`qi-volume-${v}`, {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-tab-avo'));
  [['qi-v1', 8], ['qi-v2', 20], ['qi-v3', 32]].forEach(([v, a], k) => {
    fireEvent.change(screen.getByTestId(`qi-avo-stack-${k}`), { target: { value: v } });
    fireEvent.change(screen.getByTestId(`qi-avo-angle-${k}`), { target: { value: String(a) } });
  });
  expect(screen.getByTestId('qi-avo-balance-run')).toBeDisabled();
  fireEvent.change(screen.getByTestId('qi-avo-balance-ref'), { target: { value: 'qi-v1' } });
  fireEvent.click(screen.getByTestId('qi-avo-balance-run'));
  const res = await screen.findByTestId('qi-avo-balance-result', {}, { timeout: 20000 });
  const [, p] = enqueue.mock.calls.find((c) => c[0] === 'spectral_balance');
  expect(p).toMatchObject({ target: 'reference', reference_volume_id: 'qi-v1', stacks: ['qi-v2', 'qi-v3'], volume_ids: { 'qi-v2': 'mem-balance-qi-v2', 'qi-v3': 'mem-balance-qi-v3' }, f_lo_hz: 8, f_hi_hz: 60, max_gain_db: 20 });
  expect(reg).toHaveBeenCalledWith(expect.objectContaining({ name: 'Keta far stack balanced to Keta 3D full stack' }));
  expect(res).toHaveTextContent(/Balanced to Keta 3D full stack between 8 and 60 Hz/);
  expect(within(res).getAllByRole('row')).toHaveLength(3);
  expect(res).toHaveTextContent(/24\.0 to 31\.5\s*32\.0\s*12 to 36; 14 to 48/);
});

test('the model keeps the runs, and they join the decision register\'s run list', () => {
  const p = projectFromPayload({ conditioning: { runs: [{ jobId: 'j1', kind: 'radon_demultiple', at: '2026-10-15T10:00:00Z', sourceName: 'Keta gathers' }] }, avo: { balancing: { at: '2026-10-15T11:00:00Z', reference: 'near', stacks: [] } } });
  expect(p.conditioning.runs).toHaveLength(1);
  expect(projectFromPayload({}).conditioning).toEqual({});
  const opts = runChoices(p).map((o) => o.label);
  expect(opts).toContain('Radon demultiple of Keta gathers, 2026-10-15');
  expect(opts).toContain('Spectral balancing to near, 2026-10-15');
});
