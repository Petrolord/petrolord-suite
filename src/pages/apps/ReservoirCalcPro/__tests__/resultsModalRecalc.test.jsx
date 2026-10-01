/**
 * The full results dialog stays open, on the view the user chose, while a
 * recalculation runs.
 *
 * Found by the e2e suite on CI (2026-10-01): the panel used to return its
 * "Processing" state without the dialog, so a recalculation that landed
 * while the dialog was open (the debounced run after an input change, or
 * Recalculate) unmounted it and brought it back on the Presentation view.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

let mockState;
jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({ state: mockState, calculate: jest.fn() }),
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
// a stand-in dialog with the one piece of state that matters here: the chosen view
jest.mock('../components/results/ResultsModal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ isOpen }) => {
      const [view, setView] = React.useState('slide');
      if (!isOpen) return null;
      return (
        <div role="dialog">
          <button type="button" onClick={() => setView('detail')}>Detailed</button>
          <span data-testid="view">{view}</span>
        </div>
      );
    },
  };
});

import ExpertResultsPanel from '../components/ExpertResultsPanel';

const base = {
  results: { stooip: 12.5e6, fluidType: 'oil', unitSystem: 'field', warnings: [] },
  isCalculating: false, calcMethod: 'deterministic', probResults: null, error: null,
  unitSystem: 'field', inputs: { fluidType: 'oil' },
};

test('the results dialog and its chosen view survive a recalculation', () => {
  mockState = { ...base };
  const { rerender } = render(<ExpertResultsPanel />);
  fireEvent.click(screen.getByRole('button', { name: /View Full Results/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Detailed' }));
  expect(screen.getByTestId('view')).toHaveTextContent('detail');

  // a recalculation starts: the panel shows its progress state
  mockState = { ...base, isCalculating: true };
  rerender(<ExpertResultsPanel />);
  expect(screen.getByText('Processing Data...')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByTestId('view')).toHaveTextContent('detail');

  // and lands
  mockState = { ...base, results: { ...base.results, stooip: 13e6 } };
  rerender(<ExpertResultsPanel />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByTestId('view')).toHaveTextContent('detail');
});
