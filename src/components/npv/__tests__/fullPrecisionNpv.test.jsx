/**
 * W3 (D3): the NPV Scenario Builder under the shared Full precision switch.
 * Off, the cards print exactly the compact currency they always did. On, money
 * (held in million USD) prints at 4 decimals, the sensitivity sweep appears as
 * a table, and the Risk tab offers Monte Carlo settings and a sorted sample
 * export. Every expected number is read from the engine, never restated.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  expandQuickInputs, calculateEconomics, generateScenarios, runSensitivityAnalysis, runMonteCarlo,
} from '@/utils/npvCalculations';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull, sortedSampleCsv } from '@/lib/fullPrecision';
import ResultsPanel from '../ResultsPanel';
import { settingsFromForm, formFromRisk, sampleFilename } from '../MonteCarloSettings';

jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => ({}));
jest.mock('../charts/WaterfallChart', () => () => null);
jest.mock('../charts/TornadoChart', () => () => null);
jest.mock('../charts/StackedCashflowChart', () => () => null);
jest.mock('../charts/SpiderChart', () => () => null);
jest.mock('../charts/RiskCharts', () => ({ HistogramChart: () => null, SCurveChart: () => null }));

// the UMUNEDE quick case (NextGen uncertainty capstone inputs)
const QUICK = { initialRate: 3900, declineRate: 10, oilPrice: 64, capex: 150, fixedOpex: 2.1, opexPerBbl: 14.5, royaltyRate: 17.5, taxRate: 38, discountRate: 13, startYear: 2028 };
const MC = { iterations: 1200, uncertainties: { price: 0.22, capex: 0.15, reserves: 0.2 }, seed: 9031 };

let results;
beforeAll(async () => {
  const inputs = expandQuickInputs(QUICK);
  const det = calculateEconomics(inputs);
  const risk = await runMonteCarlo(inputs, MC);
  results = {
    inputs,
    metrics: det.metrics,
    cashflow: det.cashflow,
    scenarios: generateScenarios(inputs),
    sensitivity: runSensitivityAnalysis(inputs),
    risk: { ...risk, uncertainties: MC.uncertainties },
  };
});

const compact = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(v);
const openTab = (name) => {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
};

test('off: the dashboard prints the compact product text and no Monte Carlo settings', () => {
  render(<FullPrecisionProvider><ResultsPanel results={results} /></FullPrecisionProvider>);
  expect(screen.getByText(compact(results.metrics.npv))).toBeTruthy();
  expect(screen.queryByTestId('full-precision-note')).toBeNull();
  openTab('Cashflow');
  expect(screen.getAllByText(`-${compact(results.cashflow[4].royalty * 1e6)}`).length).toBeGreaterThan(0);
  expect(screen.queryByTestId('npv-cashflow-full')).toBeNull();
  openTab('Sensitivity');
  expect(screen.queryByTestId('npv-sensitivity-table')).toBeNull();
  openTab('Risk');
  expect(screen.queryByTestId('npv-mc-settings')).toBeNull();
  expect(screen.getByTestId('npv-risk-emv').textContent).toBe(compact(results.risk.emv));
});

test('on: KPI, cashflow, sensitivity and risk print million USD at 4 decimals', () => {
  render(<FullPrecisionProvider initial><ResultsPanel results={results} /></FullPrecisionProvider>);
  expect(screen.getByText(formatFull(results.metrics.npv, 4))).toBeTruthy();
  openTab('Cashflow');
  const y5 = screen.getAllByRole('row').find((r) => within(r).queryByText(String(results.cashflow[4].year)));
  expect(within(y5).getByText(formatFull(results.cashflow[4].royalty, 4))).toBeTruthy();
  const pay = results.cashflow.find((c) => c.cumulativeNCF >= 0);
  expect(screen.getAllByText(formatFull(pay.cumulativeNCF, 4)).length).toBeGreaterThan(0);
  openTab('Sensitivity');
  const table = screen.getByTestId('npv-sensitivity-table');
  const price = results.sensitivity.find((s) => s.name === 'Oil Price');
  expect(within(table).getByText(formatFull(price.highParamNPV, 4))).toBeTruthy();
  openTab('Risk');
  expect(screen.getByTestId('npv-risk-emv').textContent).toContain(formatFull(results.risk.emv, 4));
  const cards = screen.getAllByTestId('npv-risk-case');
  expect(within(cards[0]).getByText(formatFull(results.risk.p10, 4))).toBeTruthy();
  expect(within(cards[2]).getByText(formatFull(results.risk.p90, 4))).toBeTruthy();
});

test('on: the Monte Carlo settings hand the engine the typed settings', () => {
  const onRun = jest.fn();
  const r = { ...results, risk: { ...results.risk, iterations: 1000, seed: 20260829, uncertainties: { price: 0.2, capex: 0.2, reserves: 0.2 } } };
  render(<FullPrecisionProvider initial><ResultsPanel results={r} onRerunRisk={onRun} /></FullPrecisionProvider>);
  openTab('Risk');
  const set = (id, v) => fireEvent.change(document.getElementById(`npv-mc-${id}`), { target: { value: v } });
  set('iterations', '1200'); set('price', '22'); set('capex', '15'); set('reserves', '20'); set('seed', '9031');
  fireEvent.click(screen.getByText('Run Monte Carlo'));
  expect(onRun).toHaveBeenCalledWith(MC);
});

test('the sorted sample export carries every iteration, ranked, so the floor rule reads by hand', async () => {
  const risk = await runMonteCarlo(results.inputs, settingsFromForm(formFromRisk(results.risk)));
  expect(risk.allValues).toEqual(results.risk.allValues);
  const lines = sortedSampleCsv(risk.allValues, 'npv_musd', 10).trim().split('\n');
  expect(lines[0]).toBe('rank,npv_musd');
  expect(lines).toHaveLength(MC.iterations + 1);
  const k = Math.floor(0.1 * MC.iterations);
  // the row of rank k + 1 is the engine's sorted value at index k
  expect(lines[k + 1]).toBe(`${k + 1},${formatFull(risk.allValues[k], 10)}`);
  expect(sampleFilename(risk)).toBe('npv-monte-carlo-sorted-sample-seed-9031.csv');
});
