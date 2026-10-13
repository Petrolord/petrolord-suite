/**
 * The large decorative "O" and "G" behind the STOOIP and GIIP cards sat
 * over the result-unit selector and took its clicks, so the STB / MMSTB /
 * sm3 choice could not be opened with the mouse (found scripting the
 * ReservoirCalc Pro lessons, 2026-10-12; Playwright: "<div ...>O</div>
 * intercepts pointer events"). The letters are decoration only now.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({ state: { unitSystem: 'field', inputMethod: 'simple', inputs: {}, maps: [], results: { fluidType: 'oil_gas', unitSystem: 'field', stooip: 12.14e6, recoverableOil: 3e6, giip: 4.2e9, recoverableGas: 3e9, warnings: [], inputs: {} } } }),
}));
jest.mock('../components/results/DeterministicSummaryTable', () => () => null);
jest.mock('../components/results/ContactSweepChart', () => () => null);
import DeterministicResultsDisplay from '../components/results/DeterministicResultsDisplay';

test('the decorative letters do not take pointer events and are hidden from assistive tech', () => {
  render(<DeterministicResultsDisplay />);
  for (const letter of ['O', 'G']) {
    const el = screen.getByText(letter, { selector: 'div' });
    expect(el).toHaveClass('pointer-events-none');
    expect(el).toHaveAttribute('aria-hidden', 'true');
  }
});
