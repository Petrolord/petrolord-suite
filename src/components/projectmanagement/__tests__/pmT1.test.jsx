// Senior test T1 (2026-09-27) for Project Management Pro: the portfolio
// figures come from the earned value engine over the projects' own tasks,
// and the stage tracker and stage table measure the same tasks. The worked
// case is the harness project (src/dev/StudiosHarness.jsx) as of 2026-09-01.
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

import { summarisePortfolio, healthOf } from '../ExecutiveSummary';
import { currentStageOf, stageProgress } from '../StageTracker';
import { taskReportRows } from '../ExportControls';

const P = [{ id: 'p1', baseline_budget: 10000000 }];
const T = [
  { project_id: 'p1', name: 'FEED', task_category: 'FEED', status: 'Done', planned_start_date: '2026-01-01', planned_end_date: '2026-03-31', planned_cost: 1000000, actual_cost: 1100000, percent_complete: 100 },
  { project_id: 'p1', name: 'Procurement', task_category: 'Detailed Design', status: 'In Progress', planned_start_date: '2026-03-01', planned_end_date: '2026-12-31', planned_cost: 4000000, actual_cost: 2200000, percent_complete: 50 },
  { project_id: 'p1', name: 'Construction', task_category: 'Execution', status: 'In Progress', planned_start_date: '2026-07-01', planned_end_date: '2027-06-30', planned_cost: 5000000, actual_cost: 400000, percent_complete: 10 },
];
const R = [
  { project_id: 'p1', risk_score: 16, status: 'Open' },
  { project_id: 'p1', risk_score: 20, status: 'Closed' },
  { project_id: 'p1', risk_score: 6, status: 'Open' },
];

test('portfolio SPI and CPI are the engine figures, not the 1.00 fallback', () => {
  const s = summarisePortfolio(P, T, R, '2026-09-01');
  const pv = 1 + 4 * 184 / 305 + 5 * 62 / 364; // $MM
  expect(s.spi).toBeCloseTo(3.5 / pv, 6);
  expect(s.cpi).toBeCloseTo(3.5 / 3.7, 6);
  expect(s.spi).not.toBeCloseTo(1, 2);
  expect(s.highRisks).toBe(1); // 16 open; the closed 20 and the 6 do not count
  expect(s.health).toEqual({ onTrack: 0, atRisk: 0, critical: 1, unmeasured: 0 });
});

test('a portfolio with no costed tasks reports no index and an unmeasured project', () => {
  const s = summarisePortfolio(P, [], [], '2026-09-01');
  expect(s.spi).toBeNull();
  expect(s.cpi).toBeNull();
  expect(s.health.unmeasured).toBe(1);
});

test('health bands', () => {
  expect(healthOf({ cpi: 1, spi: 0.96 })).toBe('onTrack');
  expect(healthOf({ cpi: 0.93, spi: 1 })).toBe('atRisk');
  expect(healthOf({ cpi: 1, spi: 0.89 })).toBe('critical');
  expect(healthOf({ cpi: null, spi: 1 })).toBe('unmeasured');
});

test('the tracker sits on the first stage with unfinished work, in the template vocabulary', () => {
  const names = ['Concept', 'FEED', 'Detailed Design', 'Execution', 'Ramp-up', 'Closeout'];
  expect(currentStageOf(names, T, 'Concept')).toBe('Detailed Design');
  expect(currentStageOf(names, [], 'Prospecting')).toBe('Concept');
  expect(currentStageOf(names, T.map((t) => ({ ...t, status: 'Done' })), 'Concept')).toBe('Closeout');
});

test('stage progress reads percent complete, so a half-done stage is not 0', () => {
  expect(stageProgress([T[1]])).toBe(50);
  expect(stageProgress([T[0], T[2]])).toBe(55);
  expect(stageProgress([])).toBe(0);
});

test('the task report carries the measured columns', () => {
  const rows = taskReportRows(T);
  expect(rows).toHaveLength(3);
  expect(rows[1]).toMatchObject({ Task: 'Procurement', Stage: 'Detailed Design', 'Planned cost': 4000000, 'Percent complete': 50 });
});
