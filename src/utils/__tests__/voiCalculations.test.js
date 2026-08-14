// Tests for the VOI Analyzer computation layer after the D3 refactor onto
// the canonical decision engine. Expected values hand-derived from the
// app's default seed inputs:
//   Decision cost 40; Success 30% payoff 300, Dry 70% payoff -50.
//   EMV(act) = 0.3*300 + 0.7*(-50) - 40 = 15 -> EMV without info = 15.
//   Positive indicator 40%, posteriors [60%, 40%]:
//     EMV = 0.6*300 + 0.4*(-50) - 40 = 120 -> act.
//   Negative indicator 60%, posteriors [10%, 90%]:
//     EMV = 0.1*300 + 0.9*(-50) - 40 = -55 -> do not act, 0.
//   EMV with info (pre cost) = 0.4*120 = 48; VOI = 33; net (cost 10) = 23.
//   EVPI = 0.3*max(260,0) + 0.7*max(-90,0) - 15 = 78 - 15 = 63.
// Implied priors: 0.4*0.6 + 0.6*0.1 = 0.30 = stated -> consistent.

import { generateVoiData } from '../voiCalculations';

const DEFAULT_INPUTS = {
  projectName: 'Test Prospect',
  decisionName: 'Drill Exploration Well',
  decisionCost: 40,
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
};

describe('generateVoiData (delegating to the canonical decision engine)', () => {
  const result = generateVoiData(DEFAULT_INPUTS);

  it('matches the hand-derived KPIs', () => {
    expect(Number(result.kpis.emvWithoutInfo)).toBeCloseTo(15, 2);
    expect(Number(result.kpis.emvWithInfo)).toBeCloseTo(38, 2);
    expect(Number(result.kpis.voi)).toBeCloseTo(33, 2);
    expect(Number(result.kpis.netVoi)).toBeCloseTo(23, 2);
    expect(Number(result.kpis.evpi)).toBeCloseTo(63, 2);
  });

  it('reports the default inputs as Bayes-consistent, with no warning', () => {
    expect(result.consistency.consistent).toBe(true);
    expect(result.insights).not.toContain('Consistency warning');
    expect(result.insights).toContain('positive');
  });

  it('states the negative verdict when info costs exceed its value', () => {
    const pricey = {
      ...DEFAULT_INPUTS,
      infoScenario: { ...DEFAULT_INPUTS.infoScenario, cost: 50 },
    };
    const r = generateVoiData(pricey);
    expect(Number(r.kpis.netVoi)).toBeCloseTo(-17, 2);
    expect(r.insights).toContain('not justified');
  });

  it('warns when indicator entries contradict the stated priors', () => {
    const inconsistent = JSON.parse(JSON.stringify(DEFAULT_INPUTS));
    inconsistent.infoScenario.indicators[0].conditionalProbabilities[0].probability = 90;
    const r = generateVoiData(inconsistent);
    expect(r.consistency.consistent).toBe(false);
    expect(r.insights).toContain('Consistency warning');
  });
});
