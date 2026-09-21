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
//
// EC4-0 (owner decision 2026-09-14, engines #177): percent inputs that are
// not distributions are refused with the sum named in percent, and inputs
// whose indicator numbers contradict the stated outcome chances keep EMV
// without information and EVPI but withhold everything else.

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

const clone = () => JSON.parse(JSON.stringify(DEFAULT_INPUTS));

describe('generateVoiData (delegating to the canonical decision engine)', () => {
  const result = generateVoiData(DEFAULT_INPUTS);

  it('matches the hand-derived KPIs', () => {
    expect(Number(result.kpis.emvWithoutInfo)).toBeCloseTo(15, 2);
    expect(Number(result.kpis.emvWithInfo)).toBeCloseTo(38, 2);
    expect(Number(result.kpis.voi)).toBeCloseTo(33, 2);
    expect(Number(result.kpis.netVoi)).toBeCloseTo(23, 2);
    expect(Number(result.kpis.evpi)).toBeCloseTo(63, 2);
  });

  it('reports the default inputs as Bayes-consistent, with no warning and nothing withheld', () => {
    expect(result.consistency.consistent).toBe(true);
    expect(result.withheld).toBe(false);
    expect(result.insights).not.toContain('Consistency warning');
    expect(result.insights).not.toMatch(/withheld/i);
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

  describe('refuses percent inputs that are not distributions (EC4-0)', () => {
    it("names an indicator's outcome chance sum in percent", () => {
      // 90 and 40 is not a distribution. This used to compute full KPIs and
      // only withhold the diagram, while the consistency check passed.
      const malformed = clone();
      malformed.infoScenario.indicators[0].conditionalProbabilities[0].probability = 90;
      expect(() => generateVoiData(malformed)).toThrow(
        'Outcome chances given "Positive Seismic" sum to 130 percent, expected 100',
      );
    });

    it('names the outcome chance sum in percent', () => {
      const bad = clone();
      bad.outcomes[0].probability = 40;
      expect(() => generateVoiData(bad)).toThrow('Outcome chances sum to 110 percent, expected 100');
    });

    it('names the indicator chance sum in percent', () => {
      const bad = clone();
      bad.infoScenario.indicators[1].probability = 50;
      expect(() => generateVoiData(bad)).toThrow('Indicator chances sum to 90 percent, expected 100');
    });

    it('throws a DecisionTreeError, which the page toasts as its message', () => {
      const bad = clone();
      bad.outcomes[0].probability = 40;
      let caught;
      try { generateVoiData(bad); } catch (e) { caught = e; }
      expect(caught).toBeDefined();
      expect(caught.name).toBe('DecisionTreeError');
      expect(caught.message).toMatch(/percent/);
    });
  });

  describe('withholds the value when indicator numbers contradict the stated chances (EC4-0)', () => {
    // Positive Seismic posteriors [90, 10] are a distribution, but they imply
    // P(success) = 0.4*0.9 + 0.6*0.1 = 42 percent against a stated 30.
    const contradicting = clone();
    contradicting.infoScenario.indicators[0].conditionalProbabilities[0].probability = 90;
    contradicting.infoScenario.indicators[0].conditionalProbabilities[1].probability = 10;
    const r = generateVoiData(contradicting);

    it('flags the inputs inconsistent and marks the result withheld', () => {
      expect(r.consistency.consistent).toBe(false);
      expect(r.withheld).toBe(true);
    });

    it('keeps the two cards that depend only on the stated outcome chances', () => {
      expect(r.kpis.emvWithoutInfo).toBe('15.00');
      expect(r.kpis.evpi).toBe('63.00');
    });

    it('withholds EMV with information, VOI, net VOI and the tree, AND says so', () => {
      // It survived AND it said so: null cards alone would leave a user
      // staring at blanks, and a message alone would leave numbers on screen.
      expect(r.kpis.emvWithInfo).toBeNull();
      expect(r.kpis.voi).toBeNull();
      expect(r.kpis.netVoi).toBeNull();
      expect(r.tree).toBeNull();
      expect(r.insights).toContain('Consistency warning');
      expect(r.insights).toMatch(/is withheld/);
      expect(r.insights).toContain('Success Case 42.0% vs stated 30%');
      // No gross or net VOI figure is quoted in the text either.
      expect(r.insights).not.toMatch(/Net VOI is/);
      expect(r.insights).not.toMatch(/Value of Information \(VOI\) is/);
    });
  });

  describe('the half percentage point consistency allowance', () => {
    it('accepts a delta of exactly 0.005 (implied 30.5 against 30)', () => {
      // 0.4*0.6125 + 0.6*0.1 = 0.305. Binary representation error used to
      // push this just past 0.005 and flag it.
      const edge = clone();
      edge.infoScenario.indicators[0].conditionalProbabilities[0].probability = 61.25;
      edge.infoScenario.indicators[0].conditionalProbabilities[1].probability = 38.75;
      const r = generateVoiData(edge);
      expect(r.consistency.consistent).toBe(true);
      expect(r.withheld).toBe(false);
      expect(r.kpis.voi).not.toBeNull();
    });

    it('withholds just past it (implied 30.6 against 30)', () => {
      const past = clone();
      past.infoScenario.indicators[0].conditionalProbabilities[0].probability = 61.5;
      past.infoScenario.indicators[0].conditionalProbabilities[1].probability = 38.5;
      const r = generateVoiData(past);
      expect(r.consistency.consistent).toBe(false);
      expect(r.withheld).toBe(true);
    });
  });

  // Economics E2: the panel used to be a "Chart removed" placeholder, so the
  // tree is new. It must not be a second, independent calculation: the
  // picture and the KPI card have to be the same analysis.
  describe('the decision tree behind the diagram', () => {
    it('is built and rolled back by the canonical engine', () => {
      expect(result.tree).toBeTruthy();
      expect(result.tree.type).toBe('decision');
      expect(result.tree.branches).toHaveLength(2);
    });

    it("values the acquire branch at exactly the reported EMV with information", () => {
      const acquire = result.tree.branches[0];
      expect(acquire.label).toMatch(/Acquire/);
      // branchValue is the child EMV less the cost of information, which is
      // the definition of the EMV-with-information KPI.
      expect(acquire.branchValue).toBeCloseTo(Number(result.kpis.emvWithInfo), 8);
    });

    it('values the no-information branch at exactly the reported EMV without information', () => {
      const noInfo = result.tree.branches[1];
      expect(noInfo.branchValue).toBeCloseTo(Number(result.kpis.emvWithoutInfo), 8);
    });

    it('reproduces the indicator chances the user entered, not a re-derived set', () => {
      // The builder wants P(indicator | outcome) and the user types
      // P(outcome | indicator); the Bayes inversion has to round-trip or the
      // diagram would show different odds than the inputs.
      const signalNode = result.tree.branches[0].node;
      expect(signalNode.type).toBe('chance');
      const chances = signalNode.branches.map((b) => b.probability);
      expect(chances[0]).toBeCloseTo(0.4, 10);
      expect(chances[1]).toBeCloseTo(0.6, 10);
    });
  });
});
