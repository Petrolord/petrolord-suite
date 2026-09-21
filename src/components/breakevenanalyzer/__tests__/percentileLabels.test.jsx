/**
 * EC3-0 gate (owner decision 2026-09-14): the Probabilistic Breakeven Analyzer
 * carries no P-label anywhere. A breakeven price is a quantity where more is
 * worse and capex, opex and efficiency are parameters, so under the Suite
 * percentile convention (src/lib/percentileConventions.js) all of them are
 * described by their percentiles.
 *
 * Swept: the result screen as rendered on a real seeded run, the CSV export
 * rows, the variable input labels, the plots, every help guide sentence, the
 * engine's insight sentence, and every source file of the app for a P-label
 * literal.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, screen } from '@testing-library/react';
import { findPLabels } from '@/lib/percentileConventions';
import { generateBreakevenData } from '@/utils/breakevenCalculations';
import { exportToCSV } from '@/utils/exportUtils';
import ResultsPanel from '../ResultsPanel';
import VariableCard from '../VariableCard';
import { BREAKEVEN_HELP_CONTENT } from '../BreakevenHelpGuide';
import { VARIABLE_PERCENTILE_LABELS, breakevenPercentileLabel } from '../percentileLabels';

jest.mock('@/utils/exportUtils', () => ({ exportToCSV: jest.fn(() => true) }));
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const React = require('react');
  const ResponsiveContainer = ({ children }) => React.cloneElement(children, { width: 800, height: 360 });
  return { ...actual, ResponsiveContainer };
});

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const ROOT = path.join(__dirname, '../../../..');
const G = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'packages/engines/test-data/economics/goldens/breakeven_cases.json'), 'utf8',
));
const inputs = { ...G.monteCarlo.find((c) => c.id === 'mc_seed_7').inputs, iterations: 200 };

const allTitles = (container) => [...container.querySelectorAll('[title]')].map((e) => e.getAttribute('title'));

describe('the gate itself', () => {
  it('negative control: findPLabels catches the labels this app used to print', () => {
    expect(findPLabels(['Breakeven (P10)', 'Breakeven P90 ($/bbl)', 'P50 $179.22', 'fine'])).toHaveLength(3);
    expect(findPLabels(['10th percentile of breakeven price', 'P-labels are for outcomes'])).toHaveLength(0);
  });
});

describe('no P-label anywhere in the Probabilistic Breakeven Analyzer', () => {
  let result;
  beforeAll(() => {
    result = generateBreakevenData(inputs);
  });

  it('the engine insight sentence', () => {
    expect(findPLabels([result.insights])).toEqual([]);
  });

  it('the result screen, including the plots and the interpretation, and every hover title', () => {
    const { container } = render(<ResultsPanel results={result} />);
    fireEvent.click(screen.getByText('Interpretation'));
    const text = container.textContent;
    expect(text).toContain(breakevenPercentileLabel('q10'));
    expect(text).toContain(breakevenPercentileLabel('q90'));
    expect(findPLabels([text, ...allTitles(container)])).toEqual([]);
  });

  it('the CSV export rows', () => {
    render(<ResultsPanel results={result} />);
    fireEvent.click(screen.getByText('Export Results'));
    fireEvent.click(screen.getByText('Export data'));
    const rows = exportToCSV.mock.calls.at(-1)[0];
    const fields = rows.map((r) => r.field);
    expect(fields).toContain(`${breakevenPercentileLabel('q10')} ($/bbl)`);
    expect(fields).toContain(`${breakevenPercentileLabel('q50')} ($/bbl)`);
    expect(fields).toContain(`${breakevenPercentileLabel('q90')} ($/bbl)`);
    expect(findPLabels(fields.map(String))).toEqual([]);
  });

  it('the variable input labels', () => {
    const variable = inputs.variables[0];
    const { container } = render(<VariableCard variable={variable} onChange={() => {}} onRemove={() => {}} />);
    expect(Object.values(VARIABLE_PERCENTILE_LABELS)).toEqual(['10th percentile', '50th percentile', '90th percentile']);
    Object.values(VARIABLE_PERCENTILE_LABELS).forEach((l) => expect(container.textContent).toContain(l));
    expect(findPLabels([container.textContent])).toEqual([]);
  });

  it('every help guide sentence', () => {
    const strings = BREAKEVEN_HELP_CONTENT.flatMap((s) => [s.title, s.content]);
    expect(strings.length).toBeGreaterThan(10);
    expect(findPLabels(strings)).toEqual([]);
    expect(strings.join(' ')).toMatch(/reserves P-labels for outcomes where more is better/);
  });

  it('a clamped fit: the notes the insight carries use percentile words (engines #176)', () => {
    // mc_inexact_fit_note clamps both the capex and the opex fit, so the
    // engine appends both notes to the insight the result screen shows.
    const clamped = generateBreakevenData({ ...G.monteCarlo.find((c) => c.id === 'mc_inexact_fit_note').inputs, iterations: 200 });
    expect(clamped.distributionFits.capex.exact).toBe(false);
    expect(clamped.distributionFits.opex.exact).toBe(false);
    const notes = Object.values(clamped.distributionFits).map((x) => x.note).filter(Boolean);
    expect(notes).toHaveLength(2);
    expect(clamped.insights).toMatch(/too near the 10th percentile/);
    expect(clamped.insights).toMatch(/too near the 90th percentile/);
    const { container } = render(<ResultsPanel results={clamped} />);
    fireEvent.click(screen.getByText('Interpretation'));
    expect(findPLabels([clamped.insights, ...notes, container.textContent, ...allTitles(container)])).toEqual([]);
    // Negative control: the wording before engines #176 fails this gate.
    const old = clamped.insights.replace('too near the 10th percentile', 'too near the P10');
    expect(findPLabels([old])).toHaveLength(1);
  });

  it('no source file of the app writes a P-label literal', () => {
    const dir = path.join(ROOT, 'src/components/breakevenanalyzer');
    const files = [
      ...fs.readdirSync(dir).filter((f) => /\.(jsx?|tsx?)$/.test(f)).map((f) => path.join(dir, f)),
      path.join(ROOT, 'src/pages/apps/ProbabilisticBreakevenAnalyzer.jsx'),
    ];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((f) => findPLabels([fs.readFileSync(f, 'utf8')]).length > 0)
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
