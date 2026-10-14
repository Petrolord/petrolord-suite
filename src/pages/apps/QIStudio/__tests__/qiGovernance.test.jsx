/**
 * Light governance (QI upgrade P1.1, 2026-10-15): the objectives and
 * acceptance criteria on Setup, decisions in the issue register, both saved
 * with the study and printed in the report. Decisions never enter the issue
 * table or its counts.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

import QIStudio from '../QIStudio';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
import {
  blankProject, projectFromPayload, issueRegister, decisionRows, decisionProblem, runChoices, upsertIssue,
} from '../services/model';
import { reportModel, buildQIStudioPdf } from '../services/report';
import { readPdf, flat } from '@/lib/reportKit/testKit';

jest.setTimeout(60000);
beforeEach(() => { mockStore.rows = new Map(); });

const decision = {
  type: 'decision', key: 'd1', gate: 'feasibility', gateOther: '', outcome: 'conditional', decision: 'Go to the pilot with model-based inversion',
  by: 'QI lead', date: '2026-10-15', ref: { key: 'inversion-blind:j1', label: 'Blind-well check on Keta 3D, 2026-10-06' }, refText: 'v2 horizons', note: 'Only where two wells are within 3 km',
};

test('decisions share the saved list but stay out of the issue register', () => {
  const saved = [{ key: 'i1', title: 'Shear missing', severity: 'high', status: 'open' }, decision];
  const reg = issueRegister(saved, []);
  expect(reg.map((r) => r.key)).toEqual(['i1']);
  expect(decisionRows(saved).map((d) => d.key)).toEqual(['d1']);
  // negative control: without the filter the decision row would be listed as an issue
  expect(saved.filter((i) => i.key === 'd1')).toHaveLength(1);
});

test('a decision needs a gate, the decision, who and a date; other gates need a name', () => {
  expect(decisionProblem({ ...decision })).toBeNull();
  expect(decisionProblem({ ...decision, gate: 'other' })).toMatch(/Name the gate/);
  expect(decisionProblem({ ...decision, gate: 'other', gateOther: 'Depth conversion' })).toBeNull();
  expect(decisionProblem({ ...decision, decision: '  ' })).toMatch(/Write the decision/);
  expect(decisionProblem({ ...decision, by: '' })).toMatch(/who made/);
  expect(decisionProblem({ ...decision, date: '15/10/2026' })).toMatch(/date/);
  expect(decisionProblem({ ...decision, gate: 'approval' })).toMatch(/gate/);
});

test('objectives round-trip and tolerate older payloads', () => {
  const p = projectFromPayload({ ...blankProject(), objectives: { text: 'Blind error under 8 percent', targets: { 'SAND A': 'Porosity Q50 within 0.03', bad: 5 } } });
  expect(p.objectives).toEqual({ text: 'Blind error under 8 percent', targets: { 'SAND A': 'Porosity Q50 within 0.03' } });
  expect(projectFromPayload({ wellIds: [] }).objectives).toEqual({ text: '', targets: {} });
});

test('runs a decision can refer to are listed newest first', () => {
  const project = {
    ...blankProject(),
    inversion: { v1: { blind: { jobId: 'j1', at: '2026-10-06T20:00:00Z', volumeName: 'Keta 3D' }, runs: [{ jobId: 'j2', name: 'Keta AI', at: '2026-10-07T08:00:00Z' }] } },
    simultaneous: { blind: { jobId: 'j3', at: '2026-10-08T08:00:00Z', volumeName: 'near mid far' } },
  };
  const runs = runChoices(project);
  expect(runs.map((r) => r.key)).toEqual(['simultaneous-blind:j3', 'inversion:j2', 'inversion-blind:j1']);
  expect(runs[2].label).toBe('Blind-well check on Keta 3D, 2026-10-06');
});

test('the report prints the objectives and the decisions, and the summary counts them', () => {
  const project = { ...blankProject(), targets: ['SAND A'], objectives: { text: 'Map porosity with a blind-well error under 0.03.', targets: { 'SAND A': 'AVO separates gas from brine' } }, issues: upsertIssue([], decision) };
  const matrix = { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } };
  const model = reportModel({ project, inventory: [], matrix, issues: issueRegister(project.issues, []), chosenVolumes: [], ready: [] });
  expect(model.decisions).toEqual([['2026-10-15', 'Feasibility', 'Proceed with conditions: Go to the pilot with model-based inversion. Only where two wells are within 3 km', 'QI lead', 'Blind-well check on Keta 3D, 2026-10-06; v2 horizons']]);
  expect(model.summary).toMatch(/1 decision recorded; the latest: Feasibility, proceed with conditions on 2026-10-15\./);
  expect(model.summary).toMatch(/0 open issues/); // the decision is not an issue
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-15T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Objectives and acceptance criteria/);
  expect(t).toMatch(/Map porosity with a blind-well error under 0.03/);
  expect(t).toMatch(/Objectives per target/);
  expect(t).toMatch(/AVO separates gas from brine/);
  expect(t).toMatch(/Decisions/);
  expect(t).toMatch(/Go to the pilot with model-based inversion/);
  // a study without them reads as before
  const plain = reportModel({ project: blankProject(), inventory: [], matrix, issues: [], chosenVolumes: [], ready: [] });
  expect(plain.summary).not.toMatch(/decision/);
  const t2 = flat(readPdf(buildQIStudioPdf(plain, { generatedAt: new Date('2026-10-15T12:00:00Z') }).doc).text);
  expect(t2).not.toMatch(/Objectives and acceptance criteria/);
  expect(t2).not.toMatch(/Decisions/);
});

test('UI: objectives on Setup and a decision on Issues are saved with the study', async () => {
  render(<MemoryRouter><QIStudio backend={makeInMemoryBackend()} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 20000 }));
  fireEvent.click(await screen.findByTestId('qi-target-SAND A', {}, { timeout: 20000 }));
  fireEvent.change(screen.getByTestId('qi-objectives-text'), { target: { value: 'Blind AI error under 8 percent.' } });
  fireEvent.change(screen.getByTestId('qi-objective-target-SAND A'), { target: { value: 'Porosity within 0.03' } });
  fireEvent.click(screen.getByTestId('qi-tab-issues'));
  expect(screen.getByTestId('qi-issues')).toBeInTheDocument(); // the register is still there, unchanged
  const add = screen.getByTestId('qi-decision-add-btn');
  expect(add).toBeDisabled();
  expect(screen.getByTestId('qi-decision-problem')).toHaveTextContent(/Write the decision/);
  fireEvent.change(screen.getByTestId('qi-decision-gate'), { target: { value: 'data_qc' } });
  fireEvent.change(screen.getByTestId('qi-decision-text'), { target: { value: 'Data fit for the study' } });
  fireEvent.change(screen.getByTestId('qi-decision-by'), { target: { value: 'A. Asaolu' } });
  fireEvent.change(screen.getByTestId('qi-decision-date'), { target: { value: '2026-10-15' } });
  expect(add).not.toBeDisabled();
  fireEvent.click(add);
  expect(screen.getByTestId('qi-decision-row')).toHaveTextContent(/Data QC/);
  expect(screen.getByTestId('qi-decision-row')).toHaveTextContent(/Proceed: Data fit for the study/);
  expect(screen.queryAllByTestId('qi-issue-row').some((r) => /Data fit/.test(r.textContent))).toBe(false);
  expect(screen.getByTestId('qi-issues')).not.toHaveTextContent(/Data fit/);
});

test('objectives and decisions are saved with the study and reopen', async () => {
  const backend = makeInMemoryBackend();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  const { unmount } = render(<QIStudioProvider backend={backend}><Probe /></QIStudioProvider>);
  await waitFor(() => expect(api.wells?.length).toBe(3));
  await waitFor(() => { api.setObjectivesText('Blind AI error under 8 percent.'); });
  await waitFor(() => { api.setTargetObjective('SAND A', 'Porosity within 0.03'); });
  await waitFor(() => { api.saveDecision({ gate: 'pilot', outcome: 'proceed', decision: 'Run the full volume', by: 'QI lead', date: '2026-10-15', ref: null, refText: '', note: '' }); });
  await waitFor(() => expect(api.decisions).toHaveLength(1));
  expect(api.issues.some((i) => i.type === 'decision')).toBe(false);
  await api.createProject('Governance study');
  await waitFor(() => expect(mockStore.rows.size).toBe(1));
  const payload = [...mockStore.rows.values()][0].payload;
  expect(payload.objectives).toEqual({ text: 'Blind AI error under 8 percent.', targets: { 'SAND A': 'Porosity within 0.03' } });
  unmount();
  const id = [...mockStore.rows.keys()][0];
  render(<QIStudioProvider backend={backend}><Probe /></QIStudioProvider>);
  await waitFor(() => expect(api.projects.length).toBe(1));
  await api.openProject(id);
  await waitFor(() => expect(api.decisions).toHaveLength(1));
  expect(api.decisions[0]).toMatchObject({ gate: 'pilot', decision: 'Run the full volume', type: 'decision' });
  expect(api.project.objectives.targets['SAND A']).toBe('Porosity within 0.03');
  await waitFor(() => { api.removeDecision(api.decisions[0].key); });
  await waitFor(() => expect(api.decisions).toHaveLength(0));
});
