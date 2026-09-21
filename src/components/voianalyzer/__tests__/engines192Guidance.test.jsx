/**
 * EC4-1 (engines #192) in the VOI Analyzer.
 *
 * The engine returns `bestActionWithoutInfo` with the tied actions at both
 * precisions, and writes its guidance sentence from the CARD precision set,
 * so the sentence and the EMV cards beside it cannot disagree about which
 * action is best. The panel names the tie where there is one.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { generateVoiData } from '@/utils/voiCalculations';

jest.mock('@/components/voianalyzer/DecisionTreePlot', () => () => null);

import ResultsPanel from '@/components/voianalyzer/ResultsPanel';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

// EMV(act) = 0.3 x 300 + 0.7 x (-50) - cost = 55 - cost, against 0 for not
// acting, so a decision cost of 55 makes the two actions exactly equal.
const inputs = (decisionCost) => ({
  projectName: 'Tie prospect',
  decisionName: 'Drill Exploration Well',
  decisionCost,
  outcomes: [
    { id: 1, name: 'Success Case', probability: 30, payoff: 300 },
    { id: 2, name: 'Dry Hole', probability: 70, payoff: -50 },
  ],
  infoScenario: {
    name: '3D Seismic Survey',
    cost: 10,
    indicators: [
      { id: 1, name: 'Positive Seismic', probability: 40, conditionalProbabilities: [{ outcomeId: 1, probability: 60 }, { outcomeId: 2, probability: 40 }] },
      { id: 2, name: 'Negative Seismic', probability: 60, conditionalProbabilities: [{ outcomeId: 1, probability: 10 }, { outcomeId: 2, probability: 90 }] },
    ],
  },
});

describe('a decision the EMVs cannot separate', () => {
  const tied = generateVoiData(inputs(55));

  it('is reported as indifferent by the engine, at both precisions', () => {
    expect(tied.bestActionWithoutInfo.indifferent).toBe(true);
    expect(tied.bestActionWithoutInfo.indifferentAtCardPrecision).toBe(true);
    expect(tied.bestActionWithoutInfo.tiedLabelsAtCardPrecision).toHaveLength(2);
    // The sentence the panel prints says so too.
    expect(tied.insights).toMatch(/indifferent/i);
  });

  it('is named on the guidance panel, beside the cards it agrees with', () => {
    render(<ResultsPanel results={tied} />);
    const line = screen.getByTestId('voi-indifferent');
    tied.bestActionWithoutInfo.tiedLabelsAtCardPrecision.forEach((label) => {
      expect(line).toHaveTextContent(label);
    });
    expect(line).toHaveTextContent('the decision is indifferent between');
  });

  it('negative control: a clear best action names one action and no tie', () => {
    const clear = generateVoiData(inputs(40));
    expect(clear.bestActionWithoutInfo.indifferentAtCardPrecision).toBe(false);
    expect(clear.bestActionWithoutInfo.tiedLabelsAtCardPrecision).toHaveLength(1);
    render(<ResultsPanel results={clear} />);
    expect(screen.queryByTestId('voi-indifferent')).not.toBeInTheDocument();
  });
});
