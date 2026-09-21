/**
 * EC3-0 gate (owner decision 2026-09-14): the NPV Scenario Builder's risk cards
 * follow the Suite percentile convention. runMonteCarlo returns plain
 * percentiles (p10 = the LOW NPV), so the Low case P90 card must show p10 and
 * the High case P10 card p90. The cards used to be the other way round.
 *
 * Runs the real seeded engine on the published golden mc_seed7_500.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { runMonteCarlo } from '@/utils/npvCalculations';
import { EXCEEDANCE_DEFINITION } from '@/lib/percentileConventions';
import {
  RiskCaseCards, riskCases, casesAscending, RISK_KEY_FOR_OUTCOME,
} from '../riskCases';

const G = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../../../packages/engines/test-data/economics/goldens/screening_cases.json'), 'utf8',
));
const golden = G.monteCarloSeeded.find((c) => c.id === 'mc_seed7_500');
const SWAPPED = { p90: 'p90', p50: 'p50', p10: 'p10' };

/** Card values as they appear in the DOM, in DOM order. */
const domValues = (container) => [...container.querySelectorAll('[data-testid="npv-risk-case"]')]
  .map((el) => Number(el.getAttribute('data-value')));

describe('NPV risk cases on a seeded run', () => {
  let risk;
  beforeAll(async () => {
    risk = await runMonteCarlo(golden.inputs, golden.settings);
  });

  it('maps the exceedance cases onto the percentile keys', () => {
    const cases = riskCases(risk);
    expect(cases.map((c) => c.label)).toEqual(['Low case P90', 'Best case P50', 'High case P10']);
    expect(cases[0].value).toBe(risk.p10);
    expect(cases[1].value).toBe(risk.p50);
    expect(cases[2].value).toBe(risk.p90);
    expect(RISK_KEY_FOR_OUTCOME).toEqual({ p90: 'p10', p50: 'p50', p10: 'p90' });
    expect(cases[0].value).toBeLessThan(cases[1].value);
    expect(cases[1].value).toBeLessThan(cases[2].value);
    expect(casesAscending(cases)).toBe(true);
  });

  it('renders the cards low to high, with the exceedance definition and the run seed', () => {
    const { container } = render(<RiskCaseCards risk={risk} formatValue={(v) => v.toFixed(4)} />);
    const cards = [...container.querySelectorAll('[data-testid="npv-risk-case"]')];
    expect(cards.map((c) => c.getAttribute('data-case'))).toEqual(['low', 'best', 'high']);
    const values = domValues(container);
    expect(values[0]).toBeLessThan(values[1]);
    expect(values[1]).toBeLessThan(values[2]);
    expect(cards[0].textContent).toContain('Low case P90');
    expect(cards[0].textContent).toContain(risk.p10.toFixed(4));
    expect(cards[2].textContent).toContain('High case P10');
    expect(cards[2].textContent).toContain(risk.p90.toFixed(4));
    expect(container.textContent).toContain(EXCEEDANCE_DEFINITION);
    expect(screen.getByTestId('npv-risk-seed').textContent)
      .toBe('Run seed 7: the same inputs and seed reproduce this result.');
  });

  it('negative control: the old mapping, P90 read from p90, fails the ordering gate', () => {
    const swapped = riskCases(risk, SWAPPED);
    expect(swapped[0].value).toBe(risk.p90);
    expect(casesAscending(swapped)).toBe(false);
  });

  it('no seed on the result means no seed line, never a fabricated one', () => {
    const { p10, p50, p90 } = risk;
    render(<RiskCaseCards risk={{ p10, p50, p90 }} />);
    expect(screen.queryByTestId('npv-risk-seed')).toBeNull();
  });
});
