/**
 * H13 (Reservoir honesty sweep): "{n} report steps" on the Results tab
 * counted `summary.days`, the series the worker thins to at most 5,000
 * points, and those rows are simulator time steps to begin with (SPE1: 123
 * rows for 120 report steps). The worker now records the real counts in the
 * summary and the screen prints them; a summary written by an older worker
 * build is described for what it holds.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { summaryStepCount, summaryStepText, SUMMARY_MAX_POINTS } from '../resultAdapters';

const mockCtx = { value: null };
jest.mock('@/contexts/SimStudioContext', () => ({ useSimStudio: () => mockCtx.value }));
jest.mock('@/lib/simService', () => ({ downloadBlob: jest.fn() }));
jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});
jest.mock('@/components/charts/ChartFrame', () => ({ children }) => <div>{children}</div>);

import ResultsPanel from '../ResultsPanel';

const series = (n) => Array.from({ length: n }, (_, i) => i);
const doc = (points, steps) => ({
  opm_version: 'flow 2026.04', deck_sha256: 'abcdef0123456789', start_date: '2015-01-01T00:00:00',
  days: series(points), field: { FOPR: series(points) }, wells: {},
  ...(steps ? { steps } : {}),
});

describe('H13: the step count is the run\'s, not the plotted series\'', () => {
  it('a thinned run: 12,000 time steps and 240 report steps, 4,000 points plotted', () => {
    const s = doc(4000, { report_steps: 240, time_steps: 12000, stride: 3, points: 4000 });
    expect(summaryStepCount(s)).toEqual({ reportSteps: 240, timeSteps: 12000, stride: 3, points: 4000, recorded: true });
    const text = summaryStepText(s);
    expect(text).toMatch(/240 report steps/);
    expect(text).toMatch(/12,000 simulator time steps/);
    expect(text).toMatch(/1 time step in 3 is plotted and exported \(4,000 points\)/);
    // the defect: the plotted count under the name "report steps"
    expect(text).not.toMatch(/4,000 report steps/);
  });

  it('a run that was not thinned says nothing about thinning (SPE1: 123 rows, 120 report steps)', () => {
    const s = doc(123, { report_steps: 120, time_steps: 123, stride: 1, points: 123 });
    expect(summaryStepText(s)).toBe('120 report steps, 123 simulator time steps');
  });

  it('a summary from an older worker build is described for what it holds', () => {
    // at most half the cap: the worker cannot have thinned it, so these are the time steps
    expect(summaryStepCount(doc(123))).toEqual({ reportSteps: null, timeSteps: 123, stride: 1, points: 123, recorded: false });
    expect(summaryStepText(doc(123))).toMatch(/^123 simulator time steps \(the report step count was not recorded/);
    // above half the cap the series may have been thinned: no step count is claimed
    const big = doc(SUMMARY_MAX_POINTS - 1000);
    expect(summaryStepCount(big).timeSteps).toBeNull();
    expect(summaryStepText(big)).toMatch(/^4,000 plotted points/);
    expect(summaryStepText(big)).not.toMatch(/report steps,/);
    expect(summaryStepText(doc(123))).not.toMatch(/123 report steps/);
  });

  it('the Results tab prints the real counts', () => {
    const summary = doc(4000, { report_steps: 240, time_steps: 12000, stride: 3, points: 4000 });
    const run = { id: 'r1', status: 'complete', result_path: 'u/c/runs/r1/summary.json', queued_at: '2026-10-01T10:00:00Z', report_steps: 240 };
    mockCtx.value = { activeCase: { name: 'Case' }, runs: [run], summary, summaryRunId: 'r1', loadResults: jest.fn(), addNotification: jest.fn() };
    render(<ResultsPanel />);
    const line = screen.getByTestId('sim-step-count');
    expect(line).toHaveTextContent('240 report steps, 12,000 simulator time steps');
    expect(line).toHaveTextContent('1 time step in 3 is plotted and exported');
    expect(document.body.textContent).not.toMatch(/4000 report steps|4,000 report steps/);
  });
});
