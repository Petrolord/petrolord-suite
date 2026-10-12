/**
 * Probabilistic mode: the Simulation Setup card folds away like Project
 * Settings, so the distributions get the panel's height (at 1440 x 810 the
 * distribution list had about a quarter of the panel; found scripting the
 * ReservoirCalc Pro videos, 2026-10-12).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({
    state: { calcMethod: 'probabilistic', unitSystem: 'field', inputMethod: 'surfaces', inputs: { fluidType: 'oil' } },
    updateInputs: () => {}, setUnitSystem: () => {}, profileUnitSystem: 'field', setCalcMethod: () => {},
    setInputMethod: () => {}, setInputUnit: () => {}, calculate: () => {}, sources: null,
  }),
}));
jest.mock('../components/probabilistic/ProbabilisticPanel', () => () => <div data-testid="mock-mc-panel" />);
jest.mock('../components/common/ReportDetails', () => () => <div data-testid="mock-report-details" />);
jest.mock('@/components/units/ProjectUnitSystemNote', () => () => null);

import ExpertInputPanel from '../components/ExpertInputPanel';

test('Simulation Setup folds and unfolds; the distributions stay', () => {
  render(<MemoryRouter><ExpertInputPanel /></MemoryRouter>);
  const toggle = screen.getByTestId('rcp-sim-setup-toggle');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByTestId('mock-report-details')).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByTestId('mock-report-details')).toBeNull();
  expect(screen.getByTestId('mock-mc-panel')).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByTestId('mock-report-details')).toBeInTheDocument();
});
