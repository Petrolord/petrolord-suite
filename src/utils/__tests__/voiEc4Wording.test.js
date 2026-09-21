/**
 * EC4 (engines #184) as the VOI Analyzer reads it.
 *
 * EC4-2: net VOI is rounded once to card precision and that one value feeds
 * both the card and the verdict, so a survey priced at 32.996 no longer shows
 * a 0.00 card under "Since this is positive", 33.004 no longer prints
 * "-0.00", and a net VOI that rounds to zero gets its own neutral sentence.
 * EC4-8 and EC4-9: chances typed on the tolerance edge are accepted, and the
 * derived branch probabilities are renormalised so the diagram the cards come
 * with is built rather than refused.
 */
import { generateVoiData } from '../voiCalculations';

const BASE = {
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

/** The same analysis at a different survey price. Gross VOI here is 33.00. */
const atCost = (cost) => generateVoiData({
  ...BASE, infoScenario: { ...BASE.infoScenario, cost },
});

const NEUTRAL = 'Since this rounds to zero, the information costs what it is worth, so acquiring it or not is indifferent on EMV grounds.';

describe('the net VOI card and its verdict are one rounded number', () => {
  it('a survey priced at the value of the information reads indifferent', () => {
    const r = atCost(33);
    expect(r.kpis.netVoi).toBe('0.00');
    expect(r.insights).toContain(NEUTRAL);
  });

  it('a net VOI that rounds to zero from above is not called positive', () => {
    const r = atCost(32.996);
    expect(r.kpis.netVoi).toBe('0.00');
    expect(r.insights).toContain(NEUTRAL);
    expect(r.insights).not.toContain('Since this is positive');
  });

  it('a net VOI that rounds to zero from below never prints a negative zero', () => {
    const r = atCost(33.004);
    expect(r.kpis.netVoi).toBe('0.00');
    expect(r.kpis.netVoi).not.toBe('-0.00');
    expect(r.insights).toContain(NEUTRAL);
    expect(r.insights).not.toMatch(/-0\.00/);
    expect(r.insights).not.toContain('is not justified on EMV grounds');
  });

  it('negative controls: a clearly worthwhile and a clearly wasteful survey keep their verdicts', () => {
    const good = atCost(10);
    expect(good.kpis.netVoi).toBe('23.00');
    expect(good.insights).toContain('Since this is positive, acquiring the information is financially advantageous.');
    const bad = atCost(50);
    expect(bad.kpis.netVoi).toBe('-17.00');
    expect(bad.insights).toContain('the information costs more than the value it adds');
  });

  it('no card ever carries a negative zero', () => {
    Object.values(atCost(33.004).kpis).forEach((v) => expect(String(v)).not.toBe('-0.00'));
  });
});

describe('chances typed on the tolerance edge', () => {
  // Three branches typed 33.3333 sum to 99.9999, exactly one tolerance short
  // in the typed decimals and a shade more than that in binary. The engine
  // used to refuse the sum it had just accepted elsewhere.
  const THIRDS = {
    projectName: 'Thirds',
    decisionName: 'Develop',
    decisionCost: 20,
    outcomes: [
      { id: 1, name: 'High', probability: 33.3333, payoff: 300 },
      { id: 2, name: 'Mid', probability: 33.3333, payoff: 100 },
      { id: 3, name: 'Low', probability: 33.3333, payoff: -100 },
    ],
    infoScenario: {
      name: 'Appraisal well',
      // Free, so the neutral verdict is about the information being worth
      // nothing rather than about its price.
      cost: 0,
      indicators: [
        {
          id: 1,
          name: 'Encouraging',
          probability: 33.3333,
          conditionalProbabilities: [
            { outcomeId: 1, probability: 33.3333 },
            { outcomeId: 2, probability: 33.3333 },
            { outcomeId: 3, probability: 33.3333 },
          ],
        },
        {
          id: 2,
          name: 'Neutral',
          probability: 66.6667,
          conditionalProbabilities: [
            { outcomeId: 1, probability: 33.3333 },
            { outcomeId: 2, probability: 33.3333 },
            { outcomeId: 3, probability: 33.3333 },
          ],
        },
      ],
    },
  };

  it('are accepted, and the decision tree is built rather than refused', () => {
    const r = generateVoiData(THIRDS);
    expect(r.withheld).toBe(false);
    expect(r.tree).not.toBeNull();
    // An uninformative indicator is worth nothing, so this is the neutral
    // case too, and it says so in words.
    expect(r.kpis.voi).toBe('0.00');
    expect(r.insights).toContain(NEUTRAL);
  });

  it('negative control: a sum genuinely off by more than the tolerance is still refused', () => {
    const off = {
      ...THIRDS,
      outcomes: THIRDS.outcomes.map((o, i) => (i === 0 ? { ...o, probability: 34 } : o)),
    };
    expect(() => generateVoiData(off)).toThrow(/sum to 100.6666 percent, expected 100/);
  });
});
