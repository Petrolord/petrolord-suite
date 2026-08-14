// Oracle tests for the canonical decision-analysis engine (D3).
// Every expected number is hand-derived in closed form in the comments; the
// classic drill / farm-out / do-nothing prospect follows the structure of
// the standard petroleum decision-analysis texts (Newendorp & Schuyler;
// Mian). Literature byte-verification against the published worked examples
// is a separate gate pending owner-provided references
// (docs/scope/Economics-ROADMAP.md D3).

import {
  rollback, evpi, evii, bestActionEmv, impliedPriors,
  buildInformationTree, payoffValue, DecisionTreeError,
} from '../decisionTree';

// Shared prospect: P(success) = 0.3, P(dry) = 0.7.
//   Drill: cost 40; payoff 300 on success, -10 on dry (abandonment).
//     EMV = 0.3*300 + 0.7*(-10) - 40 = 90 - 7 - 40 = 43
//   Farm out: no cost; carried payoff 60 on success, 0 on dry. EMV = 18.
//   Do nothing: 0.
const OUTCOMES = [
  { label: 'Success', probability: 0.3 },
  { label: 'Dry hole', probability: 0.7 },
];
const ACTIONS = [
  { label: 'Drill', cost: 40, payoffs: [300, -10] },
  { label: 'Farm out', cost: 0, payoffs: [60, 0] },
  { label: 'Do nothing', cost: 0, payoffs: [0, 0] },
];
// Seismic signal likelihoods: P(pos|success)=0.8, P(neg|success)=0.2,
// P(pos|dry)=0.3, P(neg|dry)=0.7.
const SIGNALS = [
  { label: 'Positive seismic', likelihoods: [0.8, 0.3] },
  { label: 'Negative seismic', likelihoods: [0.2, 0.7] },
];

const drillTree = {
  type: 'decision',
  label: 'Prospect decision',
  branches: [
    {
      label: 'Drill', cost: 40,
      node: {
        type: 'chance', label: 'Drill outcome',
        branches: [
          { label: 'Success', probability: 0.3, node: { type: 'terminal', label: 'Success', payoff: 300 } },
          { label: 'Dry hole', probability: 0.7, node: { type: 'terminal', label: 'Dry', payoff: -10 } },
        ],
      },
    },
    {
      label: 'Farm out', cost: 0,
      node: {
        type: 'chance', label: 'Farm-out outcome',
        branches: [
          { label: 'Success', probability: 0.3, node: { type: 'terminal', label: 'Success', payoff: 60 } },
          { label: 'Dry hole', probability: 0.7, node: { type: 'terminal', label: 'Dry', payoff: 0 } },
        ],
      },
    },
    { label: 'Do nothing', cost: 0, node: { type: 'terminal', label: 'Walk away', payoff: 0 } },
  ],
};

describe('rollback (hand-derived closed forms)', () => {
  it('solves the drill / farm-out prospect: EMV 43, drill optimal', () => {
    const r = rollback(drillTree);
    expect(r.emv).toBeCloseTo(43, 9);
    expect(r.bestBranchIndex).toBe(0);
    expect(r.branches[0].branchValue).toBeCloseTo(43, 9); // drill
    expect(r.branches[1].branchValue).toBeCloseTo(18, 9); // farm out
    expect(r.branches[2].branchValue).toBeCloseTo(0, 9);
  });

  it('marks the optimal path through decisions and all chance branches under it', () => {
    const r = rollback(drillTree);
    expect(r.branches[0].onOptimalPath).toBe(true);
    expect(r.branches[1].onOptimalPath).toBe(false);
    expect(r.branches[0].node.branches.every((b) => b.onOptimalPath)).toBe(true);
    expect(r.branches[1].node.branches.every((b) => b.onOptimalPath === false)).toBe(true);
  });

  it('solves a two-stage sequential tree', () => {
    // Test (cost 5) -> good 0.4 / bad 0.6; after good: develop (cost 50,
    // sure payoff 200) vs sell (80). After bad: sell (20).
    // Good branch: max(200-50, 80) = 150. Bad branch: 20.
    // Root: 0.4*150 + 0.6*20 - 5 = 60 + 12 - 5 = 67.
    const tree = {
      type: 'decision', label: 'root',
      branches: [{
        label: 'Test', cost: 5,
        node: {
          type: 'chance', label: 'test result',
          branches: [
            {
              label: 'Good', probability: 0.4,
              node: {
                type: 'decision', label: 'after good',
                branches: [
                  { label: 'Develop', cost: 50, node: { type: 'terminal', payoff: 200 } },
                  { label: 'Sell', cost: 0, node: { type: 'terminal', payoff: 80 } },
                ],
              },
            },
            { label: 'Bad', probability: 0.6, node: { type: 'terminal', payoff: 20 } },
          ],
        },
      }],
    };
    const r = rollback(tree);
    expect(r.emv).toBeCloseTo(67, 9);
    expect(r.branches[0].node.branches[0].node.bestBranchIndex).toBe(0); // develop after good
  });

  it('uses the mean of a distribution payoff (EMV is linear)', () => {
    expect(payoffValue({ mean: 135.2, p90: 40, p50: 130, p10: 240, ref: 'mc-run' })).toBe(135.2);
    const r = rollback({
      type: 'chance', label: 'c',
      branches: [
        { label: 'a', probability: 0.5, node: { type: 'terminal', payoff: { mean: 100 } } },
        { label: 'b', probability: 0.5, node: { type: 'terminal', payoff: 50 } },
      ],
    });
    expect(r.emv).toBeCloseTo(75, 9);
  });

  it('rejects chance probabilities that do not sum to 1', () => {
    expect(() => rollback({
      type: 'chance', label: 'bad',
      branches: [
        { label: 'a', probability: 0.5, node: { type: 'terminal', payoff: 1 } },
        { label: 'b', probability: 0.4, node: { type: 'terminal', payoff: 1 } },
      ],
    })).toThrow(DecisionTreeError);
  });
});

describe('EVPI (hand-derived)', () => {
  it('computes EVPI = 35 for the prospect', () => {
    // Perfect info: success (0.3): best = 300-40 = 260. Dry (0.7): best = 0.
    // EV = 0.3*260 = 78. EVPI = 78 - 43 = 35.
    const r = evpi(OUTCOMES, ACTIONS);
    expect(r.emvPrior).toBeCloseTo(43, 9);
    expect(r.evWithPerfect).toBeCloseTo(78, 9);
    expect(r.evpi).toBeCloseTo(35, 9);
  });
});

describe('EVII via Bayes (hand-derived)', () => {
  // P(pos) = 0.3*0.8 + 0.7*0.3 = 0.45; P(neg) = 0.55.
  // Posterior success | pos = 0.24/0.45 = 8/15; | neg = 0.06/0.55 = 6/55.
  // EMV | pos: drill = (8/15)*300 + (7/15)*(-10) - 40 = 115.3333...
  // EMV | neg: farm out = (6/55)*60 = 6.545454...
  // EV with info = 0.45*115.3333 + 0.55*6.545455 = 55.5. EVII = 12.5.
  it('derives signal marginals, posteriors, and EVII = 12.5', () => {
    const r = evii(OUTCOMES, ACTIONS, SIGNALS, 5);
    expect(r.perSignal[0].pSignal).toBeCloseTo(0.45, 9);
    expect(r.perSignal[1].pSignal).toBeCloseTo(0.55, 9);
    expect(r.perSignal[0].posterior[0]).toBeCloseTo(8 / 15, 9);
    expect(r.perSignal[1].posterior[0]).toBeCloseTo(6 / 55, 9);
    expect(r.perSignal[0].bestActionIndex).toBe(0); // drill on positive
    expect(r.perSignal[1].bestActionIndex).toBe(1); // farm out on negative
    expect(r.evWithInfo).toBeCloseTo(55.5, 9);
    expect(r.evii).toBeCloseTo(12.5, 9);
    expect(r.netEvii).toBeCloseTo(7.5, 9);
  });

  it('bounds: 0 <= EVII <= EVPI', () => {
    const { evii: gross } = evii(OUTCOMES, ACTIONS, SIGNALS);
    const { evpi: perfect } = evpi(OUTCOMES, ACTIONS);
    expect(gross).toBeGreaterThanOrEqual(0);
    expect(gross).toBeLessThanOrEqual(perfect + 1e-9);
  });

  it('a useless signal (same likelihoods for every outcome) is worth 0', () => {
    const useless = [
      { label: 'Heads', likelihoods: [0.5, 0.5] },
      { label: 'Tails', likelihoods: [0.5, 0.5] },
    ];
    expect(evii(OUTCOMES, ACTIONS, useless).evii).toBeCloseTo(0, 9);
  });

  it('a perfect signal recovers EVPI exactly', () => {
    const perfectSignals = [
      { label: 'Says success', likelihoods: [1, 0] },
      { label: 'Says dry', likelihoods: [0, 1] },
    ];
    const { evii: gross } = evii(OUTCOMES, ACTIONS, perfectSignals);
    expect(gross).toBeCloseTo(evpi(OUTCOMES, ACTIONS).evpi, 9);
  });

  it('rejects likelihood columns that do not sum to 1', () => {
    expect(() => evii(OUTCOMES, ACTIONS, [
      { label: 'a', likelihoods: [0.8, 0.3] },
      { label: 'b', likelihoods: [0.1, 0.7] },
    ])).toThrow(DecisionTreeError);
  });
});

describe('buildInformationTree agrees with the closed-form formulas', () => {
  it('rollback of the built tree = max(net info value branch, prior branch)', () => {
    const tree = buildInformationTree({ outcomes: OUTCOMES, actions: ACTIONS, signals: SIGNALS, infoCost: 5 });
    const r = rollback(tree);
    // EV with info 55.5 - cost 5 = 50.5 beats prior EMV 43.
    expect(r.emv).toBeCloseTo(50.5, 9);
    expect(r.bestBranchIndex).toBe(0);
    expect(r.branches[0].node.branches[0].probability).toBeCloseTo(0.45, 9);
    expect(r.branches[1].branchValue).toBeCloseTo(43, 9);
    const { emvPrior, netEvii } = evii(OUTCOMES, ACTIONS, SIGNALS, 5);
    expect(r.emv).toBeCloseTo(emvPrior + netEvii, 9);
  });

  it('keeps the no-information branch optimal when info costs too much', () => {
    const tree = buildInformationTree({ outcomes: OUTCOMES, actions: ACTIONS, signals: SIGNALS, infoCost: 20 });
    const r = rollback(tree); // 55.5 - 20 = 35.5 < 43
    expect(r.emv).toBeCloseTo(43, 9);
    expect(r.bestBranchIndex).toBe(1);
  });
});

describe('impliedPriors (Bayes-consistency check for legacy VOI inputs)', () => {
  it('accepts a consistent set (derived from the Bayes case)', () => {
    const indicators = [
      { label: 'Positive', probability: 0.45, posteriors: [8 / 15, 7 / 15] },
      { label: 'Negative', probability: 0.55, posteriors: [6 / 55, 49 / 55] },
    ];
    const r = impliedPriors(OUTCOMES, indicators);
    expect(r.implied[0]).toBeCloseTo(0.3, 9);
    expect(r.implied[1]).toBeCloseTo(0.7, 9);
    expect(r.consistent).toBe(true);
  });

  it('flags an inconsistent set and reports the implied priors', () => {
    const indicators = [
      { label: 'Positive', probability: 0.45, posteriors: [0.8, 0.2] },
      { label: 'Negative', probability: 0.55, posteriors: [6 / 55, 49 / 55] },
    ];
    const r = impliedPriors(OUTCOMES, indicators);
    expect(r.consistent).toBe(false);
    expect(r.implied[0]).toBeCloseTo(0.45 * 0.8 + 0.55 * (6 / 55), 9);
  });
});

describe('bestActionEmv', () => {
  it('returns the argmax action', () => {
    const r = bestActionEmv(OUTCOMES, ACTIONS);
    expect(r.emv).toBeCloseTo(43, 9);
    expect(r.actionIndex).toBe(0);
  });
});
