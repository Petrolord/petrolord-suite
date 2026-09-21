/**
 * EC3 open findings (owner decisions 2026-09-15, engines #182): the app side.
 *
 * The engine repairs are gated in packages/engines. What is pinned here is
 * that the two apps show them: a payback that never happens or goes back
 * below zero says so, an open tornado end is drawn open and named, the
 * breakeven run leaves the main thread, and the help says what the ranges
 * move.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { calculateEconomics } from '@/utils/npvCalculations';
import { generateBreakevenData } from '@/utils/breakevenCalculations';
import { exportToCSV } from '@/utils/exportUtils';
import { findPLabels } from '@/lib/percentileConventions';
import NpvResultsPanel from '@/components/npv/ResultsPanel';
import BreakevenPlots from '@/components/breakevenanalyzer/BreakevenPlots';
import BreakevenResultsPanel from '@/components/breakevenanalyzer/ResultsPanel';
import { runBreakevenAnalysis } from '@/components/breakevenanalyzer/runBreakeven';
import { BREAKEVEN_HELP_CONTENT } from '@/components/breakevenanalyzer/BreakevenHelpGuide';
import { HELP_ARTICLES, FAQS, GLOSSARY } from '@/data/npvHelpContent';

jest.mock('@/utils/exportUtils', () => ({ exportToCSV: jest.fn(() => true) }));
jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => ({}));
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const ReactLib = require('react');
  const ResponsiveContainer = ({ children }) => ReactLib.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const ROOT = path.join(__dirname, '../../..');
const golden = (name) => JSON.parse(fs.readFileSync(
  path.join(ROOT, `packages/engines/test-data/economics/goldens/${name}_cases.json`), 'utf8',
));
const SCREENING = golden('screening');
const BREAKEVEN = golden('breakeven');

const paybackCase = (id) => SCREENING.payback.find((c) => c.id === id);
const npvResults = (inputs) => {
  const r = calculateEconomics(inputs);
  return { metrics: r.metrics, cashflow: r.cashflow, sensitivity: null, risk: null, scenarios: null };
};

describe('Scenario Builder payback (EC3-1, EC3-2)', () => {
  test('never pays back: n/a with the reason, and no project life dressed as a payback', () => {
    const c = paybackCase('payback_never');
    const results = npvResults(c.inputs);
    expect(results.metrics.payback).toBeNull();
    render(<NpvResultsPanel results={results} />);
    expect(screen.getByTestId('npv-payback').textContent).toBe('n/a');
    expect(screen.getByTestId('npv-payback-note').textContent).toMatch(/never pays back/);
    // Negative control: the retired value was the project life.
    expect(screen.getByTestId('npv-payback').textContent).not.toContain(String(c.inputs.projectLife));
  });

  test('recrossed: the first crossing, and the time it recovers for good', () => {
    const results = npvResults(paybackCase('payback_recrossed_from_first_period').inputs);
    render(<NpvResultsPanel results={results} />);
    expect(screen.getByTestId('npv-payback').textContent).toBe('0.0 Years');
    expect(screen.getByTestId('npv-payback-note').textContent)
      .toBe('the cumulative cash flow goes back below zero afterwards and recovers for good at 2.1 years');
  });

  test('recrossed and never recovered for good', () => {
    render(<NpvResultsPanel results={npvResults(paybackCase('payback_recrossed_never_recovers').inputs)} />);
    expect(screen.getByTestId('npv-payback-note').textContent).toMatch(/goes back below zero afterwards and never recovers/);
  });

  test('nothing at risk: payback 0 says there was nothing to pay back', () => {
    render(<NpvResultsPanel results={npvResults(paybackCase('payback_first_period_positive').inputs)} />);
    expect(screen.getByTestId('npv-payback').textContent).toBe('0.0 Years');
    expect(screen.getByTestId('npv-payback-note').textContent).toMatch(/nothing to pay back/);
  });

  test('an ordinary crossing carries no note', () => {
    render(<NpvResultsPanel results={npvResults(paybackCase('payback_spend_then_earn').inputs)} />);
    expect(screen.getByTestId('npv-payback').textContent).toBe('1.7 Years');
    expect(screen.queryByTestId('npv-payback-note')).toBeNull();
  });

  test('the scenario and risk tabs say what their ranges move', () => {
    const code = fs.readFileSync(path.join(ROOT, 'src/components/npv/ResultsPanel.jsx'), 'utf8');
    expect(code).toMatch(/Variable operating cost moves with production/);
    expect(code).toMatch(/one factor for price, one for reserves and one for capex/);
    expect(code).toMatch(/applies it to every year/);
  });
});

describe('Breakeven tornado open ends (B1)', () => {
  const openTornado = () => {
    fireEvent.mouseDown(screen.getByText('Tornado Chart'), { button: 0 });
  };

  test('the one open bar is labelled, listed first and explained', () => {
    const r = generateBreakevenData(BREAKEVEN.monteCarlo.find((c) => c.id === 'mc_one_bar_unreachable').inputs);
    const { container } = render(
      <BreakevenPlots cdfData={r.plotData.cdf} histogramData={r.plotData.histogram} tornadoData={r.tornadoData} kpis={r.kpis} />,
    );
    openTornado();
    expect(screen.getByTestId('breakeven-open-bars').textContent)
      .toMatch(/^Total CAPEX has no breakeven below \$500 a barrel\s+at one end of its range/);
    expect(container.textContent).toContain('Total CAPEX (open end)');
    expect(findPLabels([container.textContent])).toEqual([]);
  });

  test('NEGATIVE CONTROL: a run with every end reachable shows no open-end note', () => {
    const r = generateBreakevenData(BREAKEVEN.monteCarlo.find((c) => c.id === 'mc_seed_7').inputs);
    const { container } = render(
      <BreakevenPlots cdfData={r.plotData.cdf} histogramData={r.plotData.histogram} tornadoData={r.tornadoData} kpis={r.kpis} />,
    );
    openTornado();
    expect(screen.queryByTestId('breakeven-open-bars')).toBeNull();
    expect(container.textContent).not.toContain('(open end)');
  });

  test('the CSV export says which belief was used and how many draws were held', () => {
    const r = generateBreakevenData({ ...BREAKEVEN.monteCarlo.find((c) => c.id === 'mc_efficiency_past_100').inputs, iterations: 200 });
    render(<BreakevenResultsPanel results={r} />);
    fireEvent.click(screen.getByText('Export Results'));
    fireEvent.click(screen.getByText('Export data'));
    const rows = exportToCSV.mock.calls.at(-1)[0];
    const byField = Object.fromEntries(rows.map((row) => [row.field, row.value]));
    expect(byField['efficiency draws held at a physical limit']).toBe(r.clippedDraws.efficiency);
    expect(r.clippedDraws.efficiency).toBeGreaterThan(0);
    expect(byField['capex belief used for the base case and tornado']).toBe('stated');
    expect(findPLabels(rows.map((row) => row.field))).toEqual([]);
  });
});

describe('the breakeven run leaves the main thread', () => {
  const inputs = { ...BREAKEVEN.monteCarlo.find((c) => c.id === 'mc_seed_7').inputs, iterations: 60 };

  test('no worker available: the same result, computed inline', async () => {
    const r = await runBreakevenAnalysis(inputs, { createWorker: () => null });
    expect(r.kpis).toEqual(generateBreakevenData(inputs).kpis);
  });

  test('a worker answers: its result is returned and the worker is closed', async () => {
    const posted = [];
    const worker = {
      terminate: jest.fn(),
      postMessage(data) {
        posted.push(data);
        setTimeout(() => this.onmessage({ data: { ok: true, result: { from: 'worker' } } }), 0);
      },
    };
    await expect(runBreakevenAnalysis(inputs, { createWorker: () => worker })).resolves.toEqual({ from: 'worker' });
    expect(posted[0]).toBe(inputs);
    expect(worker.terminate).toHaveBeenCalled();
  });

  test('a worker that reports a refusal rejects with its message', async () => {
    const worker = {
      terminate: jest.fn(),
      postMessage() { setTimeout(() => this.onmessage({ data: { ok: false, error: 'OPEX percentiles must not be negative.' } }), 0); },
    };
    await expect(runBreakevenAnalysis(inputs, { createWorker: () => worker })).rejects.toThrow('OPEX percentiles must not be negative.');
  });

  test('a worker that fails to load falls back to the inline run', async () => {
    const worker = {
      terminate: jest.fn(),
      postMessage() { setTimeout(() => this.onerror(new Event('error')), 0); },
    };
    const r = await runBreakevenAnalysis(inputs, { createWorker: () => worker });
    expect(r.kpis).toEqual(generateBreakevenData(inputs).kpis);
  });

  test('the worker module answers a message with the engine result, and a refusal with its message', async () => {
    const sent = [];
    const originalPost = self.postMessage;
    self.postMessage = (m) => sent.push(m);
    await import('@/components/breakevenanalyzer/breakeven.worker.js');
    self.onmessage({ data: inputs });
    const refused = BREAKEVEN.monteCarlo.find((c) => c.id === 'mc_refuses_negative_opex');
    self.onmessage({ data: refused.inputs });
    self.postMessage = originalPost;
    expect(sent[0].ok).toBe(true);
    expect(sent[0].result.kpis).toEqual(generateBreakevenData(inputs).kpis);
    expect(sent[1]).toEqual({ ok: false, error: refused.expected.error });
  });

  test('the page runs the analysis through the worker client', () => {
    const code = fs.readFileSync(path.join(ROOT, 'src/pages/apps/ProbabilisticBreakevenAnalyzer.jsx'), 'utf8');
    expect(code).toMatch(/runBreakevenAnalysis\(next\)/);
    expect(code).not.toMatch(/generateBreakevenData\(next\)/);
  });
});

describe('help says what the engines now do', () => {
  test('Scenario Builder: one factor per iteration, variable opex with production, payback n/a', () => {
    const mc = HELP_ARTICLES.find((a) => a.id === 'monte-carlo').content;
    expect(mc).toMatch(/one factor for price, one for reserves and one for capex/);
    expect(mc).toMatch(/applies each factor to every year/);
    expect(mc).not.toMatch(/sampling price, reserves and capex uniformly/);
    expect(HELP_ARTICLES.find((a) => a.id === 'scenario-building').content).toMatch(/Variable operating cost moves with production/);
    expect(FAQS.map((f) => f.q)).not.toContain('Why is my IRR zero?');
    expect(GLOSSARY.find((g) => g.term === 'Payback Period').def).toMatch(/first turns non-negative/);
  });

  test('Breakeven Analyzer: open ends, refused percentiles, held draws, adjusted beliefs', () => {
    const text = BREAKEVEN_HELP_CONTENT.map((s) => s.content).join(' ');
    expect(text).toMatch(/left open, the bar is marked as an open end and it is listed first/);
    expect(text).toMatch(/is refused/);
    expect(text).toMatch(/held at the limit/);
    expect(text).toMatch(/adjusted triangle's own percentiles/);
    expect(findPLabels(BREAKEVEN_HELP_CONTENT.flatMap((s) => [s.title, s.content]))).toEqual([]);
  });
});
