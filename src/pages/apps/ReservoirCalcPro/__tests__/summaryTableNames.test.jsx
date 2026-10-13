/**
 * The detailed results table printed the placeholders "Input_Top" and
 * "Input_Base" for every run, and a contact filled to the spill printed
 * only the spill. It now names the surfaces behind the run and says when
 * the entered contact was taken at the spill (found scripting the
 * ReservoirCalc Pro videos, 2026-10-12).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

let mockState;
jest.mock('../contexts/ReservoirCalcContext', () => ({ useReservoirCalc: () => ({ state: mockState }) }));
import DeterministicSummaryTable from '../components/results/DeterministicSummaryTable';

const base = (over = {}) => ({
  unitSystem: 'field', inputMethod: 'surfaces',
  surfaces: { s1: { id: 's1', name: 'Ekene Sand top (6-well map)', registryName: 'Ekene Sand top (6-well map)' }, s2: { id: 's2', name: 'Ekene Sand base (6-well map)' } },
  inputs: { topSurfaceId: 's1', baseSurfaceId: 's2', owc: -5036.1 },
  results: { fluidType: 'oil', unitSystem: 'field', inputMethod: 'surfaces', inputs: { ntg: 0.8, porosity: 0.2, sw: 0.35, fvf: 1.2, owc: -5036.1 }, stooip: 12.14e6 },
  ...over,
});

test('the table names the top and base surfaces of a Surfaces run', () => {
  mockState = base();
  render(<DeterministicSummaryTable />);
  expect(screen.getByTestId('rcp-summary-top')).toHaveTextContent('Ekene Sand top (6-well map)');
  expect(screen.getByTestId('rcp-summary-base')).toHaveTextContent('Ekene Sand base (6-well map)');
  expect(screen.queryByText('Input_Top')).toBeNull();
  expect(screen.getByText(/OWC: -5,036$/)).toBeInTheDocument();
});

test('a contact taken at the spill says what was entered', () => {
  const s = base();
  s.results = { ...s.results, inputs: { ...s.results.inputs, owc: -4972 }, trap: { filledToSpill: true, spillElevation: -4972 } };
  mockState = s;
  render(<DeterministicSummaryTable />);
  expect(screen.getByText('OWC: -4,972 (entered -5,036, filled to spill)')).toBeInTheDocument();
});

test('Simple runs have no surfaces', () => {
  mockState = base({ inputMethod: 'simple', results: { ...base().results, inputMethod: 'simple' } });
  render(<DeterministicSummaryTable />);
  expect(screen.getByTestId('rcp-summary-top')).toHaveTextContent('-');
});
