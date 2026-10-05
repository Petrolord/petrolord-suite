/**
 * H6 (Reservoir honesty sweep), Well Spacing Optimizer.
 *
 * 1. The screen says "no optimum is nominated here" (the highest NPV is
 *    arithmetic: the widest spacing that divides the area with least waste).
 *    The JSON export carried `optimalSpacing`, "This spacing maximizes NPV"
 *    and three `optimal*` metadata fields all the same.
 * 2. With oil gravity, gas gravity or temperature blank, Standing's Bo is
 *    not computable and the engine falls back to 1. The screen printed
 *    "Bo 1.000 rb/stb, from Standing's correlation".
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import {
  evaluateSpacingCases, generateJSON, standingBo, boNote, NO_OPTIMUM_NOTE,
} from '@/utils/wellSpacingCalculations';

jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});
jest.mock('@/components/charts/ChartLogo', () => () => null);
jest.mock('framer-motion', () => ({ motion: { div: ({ children }) => <div>{children}</div> } }));

import ResultsPanel from '@/components/wellspacing/ResultsPanel';
import { WellSpacingProvider } from '@/contexts/WellSpacingContext';
import { defaultInputs, blankForm } from '@/utils/wellspacing/model';

// WS-U1: the panel reads the study from its provider (the results are a
// pure function of the inputs on screen)
const renderPanel = (form) => render(
  <WellSpacingProvider initialInputs={{ ...defaultInputs('oilfield'), form: { ...blankForm(), ...form } }}>
    <ResultsPanel downloadCSV={() => {}} downloadJSON={() => {}} />
  </WellSpacingProvider>,
);

const SAMPLE = {
  fieldName: 'Example field', reservoirArea: '5000', avgNetPayThickness: '60', porosity: '15.2',
  initialWaterSaturation: '0.25', reservoirTemperature: '180', reservoirPressure: '3500', recoveryFactor: '35',
  oilGravity: '35', gasGravity: '0.75', initialSolutionGOR: '500',
  wellCost: '5000000', operatingExpense: '200000', minEconomicFlowRate: '10', typicalWellDeclineRate: '15',
  oilPrice: '75', gasPrice: '3.5', discountRate: '10', projectDuration: '20', royaltiesTaxes: '25',
  minSpacing: '20', maxSpacing: '160', spacingIncrement: '10',
};

const everyKey = (o, out = []) => {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) { out.push(k); everyKey(v, out); }
  }
  return out;
};

describe('H6: the export nominates no optimum, as the screen says', () => {
  it('the JSON has no optimum field and no recommendation sentence', async () => {
    const results = await evaluateSpacingCases(SAMPLE);
    const json = generateJSON(SAMPLE, results);
    expect(everyKey(json).filter((k) => /optim/i.test(k) && k !== 'optimumNominated')).toEqual([]);
    expect(JSON.stringify(json)).not.toMatch(/maximi[sz]es NPV|recommend(ed|ation) spacing/i);
    expect(json.metadata.optimumNominated).toBe(false);
    expect(json.spacingCases).toHaveLength(results.spacingResults.length);
    // the engine result names no optimum either
    expect(everyKey(results).filter((k) => /optim|justification/i.test(k))).toEqual([]);
  });

  it('the JSON and the screen carry the same sentence', async () => {
    const results = await evaluateSpacingCases(SAMPLE);
    const json = generateJSON(SAMPLE, results);
    renderPanel(SAMPLE);
    expect(NO_OPTIMUM_NOTE).toMatch(/no optimum is nominated/);
    expect(json.metadata.reading).toBe(NO_OPTIMUM_NOTE);
    expect(screen.getByTestId('ws-no-optimum')).toHaveTextContent(NO_OPTIMUM_NOTE);
    expect(screen.queryByText(/Optimization Results/)).toBeNull();
  });
});

describe('H6: a fallback Bo is called a fallback', () => {
  it('Standing is named only when Standing was computed', async () => {
    expect(standingBo({ gor: 500, api: 35, gasGravity: 0.75, temperatureF: 180 }))
      .toEqual({ bo: expect.closeTo(1.2846, 3), source: 'standing' });
    const results = await evaluateSpacingCases(SAMPLE);
    expect(results.boSource).toBe('standing');
    expect(boNote(results)).toMatch(/Bo 1\.284 rb\/stb, from Standing's correlation/);
  });

  it.each([
    ['oil gravity', { oilGravity: '' }],
    ['gas gravity', { gasGravity: '' }],
    ['temperature', { reservoirTemperature: '' }],
  ])('blank %s: Bo 1.000 is a fallback and the note says so', async (_, patch) => {
    const results = await evaluateSpacingCases({ ...SAMPLE, ...patch });
    expect(results.boUsed).toBe(1);
    expect(results.boSource).toBe('fallback');
    const note = boNote(results);
    expect(note).toMatch(/fallback/);
    expect(note).not.toMatch(/from Standing's correlation/);
    renderPanel({ ...SAMPLE, ...patch });
    expect(screen.getByTestId('ws-bo-note')).toHaveTextContent(/fallback of 1\.000 rb\/stb/);
    expect(screen.getByTestId('ws-bo-note')).not.toHaveTextContent(/from Standing's correlation/);
    const json = generateJSON({ ...SAMPLE, ...patch }, results);
    expect(json.metadata.bo).toEqual({ value: 1, unit: 'rb/stb', source: 'fallback' });
  });
});

describe('H7: the discounting convention is labelled on the screen', () => {
  it('the results state mid-year discounting and the engine', async () => {
    const results = await evaluateSpacingCases(SAMPLE);
    renderPanel(SAMPLE);
    expect(results.spacingResults.length).toBeGreaterThan(0);
    expect(screen.getByTestId('ws-npv-convention')).toHaveTextContent(/mid-year discounting/);
    expect(screen.getByTestId('ws-npv-convention')).toHaveTextContent(/Suite screening economics engine/);
  });
});
