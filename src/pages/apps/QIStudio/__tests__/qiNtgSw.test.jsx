/**
 * NTG and Sw beside porosity (QI upgrade P1.3): the net flag from cutoffs,
 * the gate (with its negative controls) and the Properties tab holding the
 * volume run until the blind check passes the gate as it is set.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PropertiesPanel from '../components/PropertiesPanel';
import { netFromCutoffs, netFraction, pickNtgCurve } from '../services/inversionWells';
import { propertyGate, validatePropertyParams, propertyClass } from '../services/propertyRun';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));
jest.setTimeout(60000);

test('a net flag from shale volume and porosity cutoffs, on the shale curve\'s depths', () => {
  const vsh = [0.1, 0.5, 0.2, NaN, 0.3];
  const phi = [0.2, 0.2, 0.05, 0.2, 0.15, 0.15]; // starts 0.5 m higher, 0.5 m step
  expect(netFromCutoffs(vsh, 1000, 1, phi, 999.5, 0.5, { vsh: 0.4, phi: 0.08 })).toEqual([1, 0, 1, NaN, NaN]);
  expect(netFraction([0, 1, 1, 0])).toEqual([0, 1, 1, 0]);
  expect(netFraction([0, 60, 100, 20])).toEqual([0, 0.6, 1, 0.2]); // percent to fraction
  expect(pickNtgCurve([{ mnemonic: 'GR' }, { mnemonic: 'NET_FLAG', start_md_m: 0, stop_md_m: 10 }]).log.mnemonic).toBe('NET_FLAG');
  expect(pickNtgCurve([{ mnemonic: 'NETWORK' }])).toBeNull();
});

test('the gate: blind, two wells, correlation and coverage at every well', () => {
  const rows = [{ name: 'A', corr: 0.8, coverage: 0.8 }, { name: 'B', corr: 0.7, coverage: 0.85 }];
  const blind = { fully_blind: true, rows: [] };
  expect(propertyGate({ settings: { kind: 'ntg' }, rows, blind_protocol: blind }).pass).toBe(true);
  expect(propertyGate({ settings: { kind: 'ntg' }, rows, blind_protocol: { fully_blind: false } }).reasons[0]).toMatch(/not fully blind/);
  expect(propertyGate({ settings: { kind: 'ntg' }, rows: rows.slice(0, 1), blind_protocol: blind }).reasons[0]).toMatch(/two wells/);
  expect(propertyGate({ settings: { kind: 'sw' }, rows: [rows[0], { name: 'B', corr: 0.3, coverage: 0.99 }], blind_protocol: blind }).reasons).toEqual(['B: left-out correlation 0.30, under 0.5', 'B: 99 percent inside Q10 to Q90, outside 60 to 95']);
  expect(propertyGate({ settings: { kind: 'sw' }, rows, blind_protocol: blind }, { min_corr: 0.75 }).text).toMatch(/^The water saturation volume is withheld: B: left-out correlation 0.70, under 0.75/);
  expect(validatePropertyParams({ mode: 'calibrate', property: { kind: 'ntg', wells: [{ name: 'a', il: 0, xl: 0, ln_ai: [1], target: [1] }, { name: 'b', il: 0, xl: 0, ln_ai: [1], target: [1] }], gate: { coverage: [0.9, 0.5] } } })).toMatch(/coverage/);
  expect(propertyClass('sw')).toBe('fluid_hypothesis');
  expect(propertyClass('ntg')).toBe('calibrated_prediction');
});

test('UI: NTG from cutoffs is checked, and the volume waits for the gate as set', async () => {
  const backend = makeInMemoryBackend();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /><PropertiesPanel /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api.wells?.length).toBe(3));
  await waitFor(() => { api.toggleWell('qi-w1'); api.toggleWell('qi-w2'); api.toggleVolume('qi-v1'); });
  await waitFor(() => { api.setInversion('qi-v1', { runs: [{ jobId: 'j1', status: 'ready', name: 'Keta AI', method: 'model_based', volumeId: 'ai-1' }] }); });
  await waitFor(() => expect(api.ready.length).toBe(2));
  fireEvent.change(await screen.findByTestId('qi-prop-kind'), { target: { value: 'ntg' } });
  expect(screen.getByTestId('qi-prop-ntg-cutoffs')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('qi-prop-read'));
  const wells = await screen.findByTestId('qi-prop-wells', {}, { timeout: 20000 });
  expect(wells).toHaveTextContent(/net where VSH is at most 0.4 and PHIE at least 0.08/);
  expect(screen.getByTestId('qi-prop-gate')).toHaveTextContent(/Calibrate and check first/);
  expect(screen.getByTestId('qi-prop-run')).toBeDisabled();
  // the harness has one well with a time-depth, so the check result is set as the worker returns it
  const result = { settings: { kind: 'ntg' }, summary: { a: 1.2, b: -1e-4, r2: 0.6, n: 300, s: 0.1 }, blind_protocol: { fully_blind: true, rows: [] }, rows: [{ name: 'KETA-1', n: 150, rms: 0.1, corr: 0.82, coverage: 0.8 }, { name: 'KETA-4', n: 150, rms: 0.12, corr: 0.77, coverage: 0.83 }] };
  await waitFor(() => { api.setProperty('ai-1', { ntg: { calibration: { jobId: 'c1', at: '2026-10-15T10:00:00Z', volumeName: 'Keta AI', result } } }); });
  await waitFor(() => expect(screen.getByTestId('qi-prop-gate')).toHaveTextContent(/The net-to-gross check passes/));
  expect(screen.getByTestId('qi-prop-transform')).toHaveTextContent(/^net-to-gross = /);
  fireEvent.change(screen.getByTestId('qi-prop-gate-corr'), { target: { value: '0.95' } });
  expect(screen.getByTestId('qi-prop-gate')).toHaveTextContent(/withheld/);
  expect(screen.getByTestId('qi-prop-run')).toBeDisabled();
});
