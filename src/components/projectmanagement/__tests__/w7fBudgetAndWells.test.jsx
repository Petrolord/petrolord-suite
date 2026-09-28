// W7F: an exploration project created without a budget printed "$NaNM" on
// its budget card, and the appraisal Wells tab showed three made-up wells to
// every user. Negative control: on the old code the first test finds
// "$NaNM" and the last finds "Appraisal-1".
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../GanttChart', () => () => null);
jest.mock('../StageTracker', () => () => null);
jest.mock('../exploration/ExplorationManagers', () => ({
  ExplorationStageManager: () => null,
  ExplorationGateManager: () => null,
  ExplorationDeliverableManager: () => null,
}));
jest.mock('../exploration/ExplorationAnalytics', () => ({
  ExplorationKPIDashboard: () => null,
  ExplorationRiskManager: () => null,
  ExplorationResourceManager: () => null,
}));

import ExplorationProjectDashboard from '../exploration/ExplorationProjectDashboard';
import { AppraisalWellManager } from '../appraisal/AppraisalWellManager';
import { formatBudgetMillions, budgetFromMillionsInput } from '../formatBudget';

const project = (extra) => ({ name: 'P', tasks: [], rawTasks: [], risks: [], resources: [], ...extra });

test('a project with no budget reads "Not set" on the budget card', () => {
  const { container } = render(<ExplorationProjectDashboard projectData={project({})} onDataChange={() => {}} />);
  expect(container.textContent).not.toMatch(/NaN/);
  expect(screen.getByText('Not set')).toBeTruthy();
});

test('a budgeted project still reads in $M', () => {
  render(<ExplorationProjectDashboard projectData={project({ baseline_budget: 15000000 })} onDataChange={() => {}} />);
  expect(screen.getByText('$15.0M')).toBeTruthy();
});

test('helper: blank, null and NaN are not a budget; zero is', () => {
  expect(formatBudgetMillions(undefined)).toBe('Not set');
  expect(formatBudgetMillions(null)).toBe('Not set');
  expect(formatBudgetMillions(NaN)).toBe('Not set');
  expect(formatBudgetMillions(0)).toBe('$0.0M');
  expect(budgetFromMillionsInput('')).toBeNull();
  expect(budgetFromMillionsInput('15')).toBe(15000000);
});

test('the appraisal Wells tab shows no made-up wells', () => {
  const { container } = render(<AppraisalWellManager projectData={project({})} />);
  expect(container.textContent).not.toMatch(/Appraisal-1|Ocean Apex|DST-1/);
  expect(screen.getByTestId('appraisal-wells-not-tracked')).toBeTruthy();
});
