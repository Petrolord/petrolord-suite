/**
 * Depth uncertainty for prospects (QI upgrade P2.12): velocity cases on a
 * time structure give a GRV range, and a suggested Pg the user keeps or not.
 * The maths is gated in engines qi.depthUncertainty.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import DepthCasesSection, { casesProblem, engineCases, DEFAULT_CASES } from '../components/DepthCasesSection';

jest.mock('@/utils/savedProjects', () => ({ createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({ success: true }) }) }));
jest.setTimeout(60000);

test('case checks and the engine form', () => {
  expect(casesProblem(DEFAULT_CASES)).toBeNull();
  expect(casesProblem([{ name: 'x', kind: 'constant', v: '100', weight: '1' }])).toMatch(/500 to 7000/);
  expect(casesProblem([{ name: 'x', kind: 'linear', v0: '1800', k: '', weight: '1' }])).toMatch(/v0/);
  expect(engineCases([{ name: 'L', kind: 'linear', v0: '1800', k: '0.6', weight: '2' }])).toEqual([{ name: 'L', weight: 2, velocity: { kind: 'linear', v0: 1800, k: 0.6 } }]);
});

test('UI: the cases give a widening GRV with velocity, and a suggested Pg is kept only on request', async () => {
  const backend = makeInMemoryBackend();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /><DepthCasesSection /></QIStudioProvider></MemoryRouter>);
  await waitFor(() => expect(api).toBeTruthy());
  await waitFor(() => api.saveProspect({ id: 'p1', name: 'Alpha', target: '', result: { assessment: { recommendation: 'downgrade', reasons: [] }, anomaly: null } }));
  await screen.findByTestId('qi-pros-depth-p1');
  await waitFor(() => expect(screen.getByTestId('qi-pros-depth-surface-p1')).toHaveValue('qi-s3'));
  fireEvent.click(screen.getByTestId('qi-pros-depth-run-p1'));
  await screen.findByTestId('qi-pros-depth-result-p1');
  const r = api.project.prospects[0].depthCases.result;
  expect(r.rows.map((x) => x.name)).toEqual(['Slow', 'Mid', 'Fast']);
  expect(r.rows[2].grvM3).toBeGreaterThan(r.rows[0].grvM3);
  expect(r.low).toBe(r.rows[0].grvM3);
  fireEvent.change(screen.getByTestId('qi-pros-pg-input-p1'), { target: { value: '0.3' } });
  expect(screen.getByTestId('qi-pros-pg-suggestion-p1')).toHaveTextContent(/0\.21 \(x 0\.7\)/);
  expect(api.project.prospects[0].depthCases.pg).toBeUndefined();
  fireEvent.click(screen.getByTestId('qi-pros-pg-keep-p1'));
  await waitFor(() => expect(api.project.prospects[0].depthCases.pg.suggestedPg).toBeCloseTo(0.21, 9));
});
