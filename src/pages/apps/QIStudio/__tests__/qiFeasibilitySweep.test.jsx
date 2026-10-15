/**
 * Automatic feasibility sweeps on the Feasibility tab (QI upgrade P2.9): the
 * inputs to the engine (Batzle and Wang fluids, effective stress), the
 * suggested verdict rules, and the tab: run, suggestion, take it or leave
 * it, saved and in the report. The maths is gated in engines
 * qi.feasibilitySweep.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import FeasibilitySweepSection from '../components/FeasibilitySweepSection';
import { SWEEP_DEFAULTS, sweepProblem, sweepInputs, runSweep } from '../services/feasibilitySweepRun';
import { reportModel, buildQIStudioPdf } from '../services/report';
import { runChoices } from '../services/model';
import { readPdf, flat } from '@/lib/reportKit/testKit';
import { brine, gas } from '../../RockPhysicsStudio/engine/fluids';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));
jest.setTimeout(60000);

test('inputs: fluids at the reservoir conditions, effective stress, the sweeps', () => {
  const i = sweepInputs(SWEEP_DEFAULTS);
  expect(i.base.peffMPa).toBe(23);
  expect(i.fluidA.k).toBeCloseTo(brine(80, 22, 0.035).k, 3);
  expect(i.fluidB.rho).toBeCloseTo(gas(80, 22, 0.7).rho, 6);
  expect(i.sweeps.thicknessM).toEqual([2, 5, 10, 20, 40]);
  expect(sweepProblem({ ...SWEEP_DEFAULTS, phi: '' })).toMatch(/porosity/);
  expect(sweepProblem({ ...SWEEP_DEFAULTS, porePressureMPa: '50' })).toMatch(/overburden/);
  expect(sweepProblem({ ...SWEEP_DEFAULTS, thicknessRange: '2, x' })).toMatch(/numbers/);
});

test('suggestions: a gas sand at high S/N is feasible; at very low S/N not feasible; a thin base bed that separates only when thick is conditional', () => {
  expect(runSweep(SWEEP_DEFAULTS).suggestion.verdict).toBe('feasible');
  expect(runSweep({ ...SWEEP_DEFAULTS, snr: '0.2' }).suggestion.verdict).toBe('not-feasible');
  const thin = runSweep({ ...SWEEP_DEFAULTS, thicknessM: '0.3', snr: '1.5' });
  expect(thin.suggestion.verdict).toBe('conditional');
  expect(thin.suggestion.text).toMatch(/thickness \(m\)/);
});

test('UI: run, take the suggestion, kept with the study, a decision can refer to it, and the report prints it', async () => {
  const backend = makeInMemoryBackend();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /><FeasibilitySweepSection /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api.wells?.length).toBe(3));
  await waitFor(() => { api.toggleWell('qi-w1'); });
  await waitFor(() => expect(api.targetChoices).toContain('SAND A'));
  await waitFor(() => { api.toggleTarget('SAND A'); });
  const box = await screen.findByTestId('qi-feas-sweep-SAND A');
  fireEvent.click(box.querySelector('[data-testid="qi-feas-sweep-run"]'));
  expect(await screen.findByTestId('qi-feas-sweep-suggestion-SAND A')).toHaveTextContent(/Suggested verdict: Feasible/);
  expect(api.project.feasibility['SAND A'].verdict).toBeUndefined(); // never set by itself
  fireEvent.click(screen.getByTestId('qi-feas-sweep-use-SAND A'));
  await waitFor(() => expect(api.project.feasibility['SAND A'].verdict).toBe('feasible'));
  expect(runChoices(api.project).some((r) => r.key === 'feasibility-sweep:SAND A')).toBe(true);
  const matrix = { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } };
  const t = flat(readPdf(buildQIStudioPdf(reportModel({ project: api.project, inventory: [], matrix, issues: [], chosenVolumes: [], ready: [] }), { generatedAt: new Date() }).doc).text);
  expect(t).toMatch(/Feasibility sweep: SAND A/);
});
