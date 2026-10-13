/**
 * The Monte Carlo panel kept its distributions in component state only, so
 * a remount (switching reservoir case, saving and reopening, a mode change)
 * reset them to the defaults while the results on screen came from other
 * ranges (found scripting the ReservoirCalc Pro lessons, 2026-10-12). The
 * panel now starts from what the run on screen recorded it sampled, with
 * its correlations, seed and realisations.
 * Negative control: without a recorded run the defaults (porosity 0.16 to
 * 0.24 around 0.20) still apply.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { distParamsFromRun } from '../services/distributions';

let mockState;
jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({ state: mockState, calculate: async () => ({}), mcProgress: null, cancelSimulation: () => {}, rerun: null }),
}));
import ProbabilisticPanel from '../components/probabilistic/ProbabilisticPanel';

const meta = {
  unitSystem: 'field', iterations: 50000, seed: 20261109, correlations: [],
  inputs: {
    porosity: { type: 'triangular', min: 0.185, mode: 0.2, max: 0.215, variable: true },
    owc: { type: 'triangular', min: -5037.7, mode: -5036.1, max: -5034.5, variable: true },
    fvf: { type: 'constant', value: 1.2, variable: false },
  },
};
const base = { fluidType: 'oil', porosity: 0.2, sw: 0.35, ntg: 0.8, owc: -5036.1, fvf: 1.2, recovery: 25 };

test('distParamsFromRun turns the recorded triangles into the panel form and skips constants', () => {
  const d = distParamsFromRun(meta, 'field');
  expect(d.porosity).toEqual({ type: 'triangular', p90: 0.185, p50: 0.2, p10: 0.215 });
  expect(d.fvf).toBeUndefined();
  expect(distParamsFromRun(meta, 'metric')).toEqual({});
});

test('the panel opens on the ranges of the run on screen', () => {
  mockState = { inputMethod: 'surfaces', unitSystem: 'field', inputs: base, baseCase: { inputs: base }, probResults: { meta } };
  render(<ProbabilisticPanel />);
  const values = [...document.querySelectorAll('input')].map((e) => e.value);
  expect(values).toEqual(expect.arrayContaining(['0.185', '0.215', '-5037.7', '-5034.5']));
});

test('negative control: with no run the defaults apply', () => {
  mockState = { inputMethod: 'surfaces', unitSystem: 'field', inputs: base, baseCase: { inputs: base }, probResults: null };
  render(<ProbabilisticPanel />);
  const values = [...document.querySelectorAll('input')].map((e) => e.value);
  expect(values).toEqual(expect.arrayContaining(['0.16', '0.24']));
  expect(values).not.toContain('0.185');
});
