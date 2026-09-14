/**
 * EC4-0 gate (owner decision 2026-09-14, engines #177): when the indicator
 * numbers contradict the stated outcome chances, the engine withholds EMV
 * with information, VOI and net VOI as null. The results panel must say
 * "Withheld" for those cards, never "$nullM", and the CSV export must write
 * the same word. The two cards the engine keeps still read as money.
 *
 * Driven by the real engine output, not a hand-built result object, so a
 * change in the engine's withheld shape breaks this test too.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { generateVoiData } from '@/utils/voiCalculations';
import ResultsPanel from '../ResultsPanel';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const INPUTS = {
  decisionCost: 40,
  outcomes: [
    { id: 1, name: 'Success Case', probability: 30, payoff: 300 },
    { id: 2, name: 'Dry Hole', probability: 70, payoff: -50 },
  ],
  infoScenario: {
    name: '3D Seismic Survey',
    cost: 10,
    indicators: [
      // [90, 10] implies P(success) = 42 percent against a stated 30.
      { id: 1, name: 'Positive Seismic', probability: 40, conditionalProbabilities: [{ outcomeId: 1, probability: 90 }, { outcomeId: 2, probability: 10 }] },
      { id: 2, name: 'Negative Seismic', probability: 60, conditionalProbabilities: [{ outcomeId: 1, probability: 10 }, { outcomeId: 2, probability: 90 }] },
    ],
  },
};

describe('VOI ResultsPanel when the value is withheld', () => {
  const results = generateVoiData(INPUTS);

  it('is driven by a genuinely withheld engine result', () => {
    expect(results.withheld).toBe(true);
    expect(results.kpis.emvWithInfo).toBeNull();
    expect(results.kpis.netVoi).toBeNull();
  });

  it('reads "Withheld" on the withheld cards and money on the kept ones', () => {
    const { container } = render(<ResultsPanel results={results} />);
    expect(screen.getByTestId('voi-kpi-emvWithInfo')).toHaveTextContent(/^Withheld$/);
    expect(screen.getByTestId('voi-kpi-netVoi')).toHaveTextContent(/^Withheld$/);
    expect(screen.getByTestId('voi-kpi-emvWithoutInfo')).toHaveTextContent(/^\$15\.00M$/);
    expect(screen.getByTestId('voi-kpi-evpi')).toHaveTextContent(/^\$63\.00M$/);
    expect(container.textContent).not.toMatch(/null/i);
    expect(container.textContent).not.toMatch(/\$M/);
  });

  it('says why the diagram is missing, and no longer claims the values are unaffected', () => {
    const { container } = render(<ResultsPanel results={results} />);
    expect(container.textContent).toMatch(/diagram is withheld because the indicator numbers contradict the stated\s+outcome chances/);
    expect(container.textContent).not.toMatch(/values above are unaffected/);
    // And the guidance it points to does explain it.
    expect(container.textContent).toMatch(/is withheld rather than computed/);
  });

  it('writes "Withheld" in the CSV export', async () => {
    const written = [];
    const RealBlob = global.Blob;
    global.Blob = class { constructor(parts) { written.push(parts.join('')); } };
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:voi';
    URL.revokeObjectURL = () => {};
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(<ResultsPanel results={results} />);
      fireEvent.click(screen.getByText('Export Results'));
      fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
      expect(written).toHaveLength(1);
      const csv = written[0];
      expect(csv).toContain('"EMV with Information","Withheld"');
      expect(csv).toContain('"Gross Value of Information (VOI)","Withheld"');
      expect(csv).toContain('"Net Value of Information (Net VOI)","Withheld"');
      expect(csv).toContain('"EMV without Information","15.00"');
      expect(csv).toContain('"Expected Value of Perfect Information (EVPI)","63.00"');
      expect(csv).not.toMatch(/null/);
    } finally {
      global.Blob = RealBlob;
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      click.mockRestore();
    }
  });
});

describe('VOI ResultsPanel when nothing is withheld', () => {
  it('shows every card as money', () => {
    const consistent = JSON.parse(JSON.stringify(INPUTS));
    consistent.infoScenario.indicators[0].conditionalProbabilities = [{ outcomeId: 1, probability: 60 }, { outcomeId: 2, probability: 40 }];
    const results = generateVoiData(consistent);
    expect(results.withheld).toBe(false);
    render(<ResultsPanel results={results} />);
    expect(screen.getByTestId('voi-kpi-emvWithInfo')).toHaveTextContent(/^\$38\.00M$/);
    expect(screen.getByTestId('voi-kpi-netVoi')).toHaveTextContent(/^\$23\.00M$/);
    expect(screen.queryByText('Withheld')).toBeNull();
  });
});
