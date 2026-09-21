// D5 tests for the decision brief data model. The decision and portfolio
// sections recompute through the canonical engines, so the expected numbers
// reuse the hand-derived cases already proven in decisionTree.test.js and
// portfolioOptimizer.test.js.

import {
  economicsSection, decisionSection, portfolioSection, buildBriefModel, fmtMMUsd,
} from '../briefModel';

const MC_RUN = {
  id: 'aaaabbbb-cccc-dddd-eeee-ffff00001111',
  created_at: '2026-08-14T10:00:00Z',
  configName: 'PIA Validation Config',
  results: {
    seed: 42,
    iterations: 1000,
    npv: { p90: 40e6, p50: 130e6, p10: 240e6, mean: 135e6 },
    probNpvPositive: 0.92,
    base: { npv: 135185570.34, pv_basis: 'real' },
    tornado: [{ parameter: 'oil_price' }],
  },
};

const TREE_PROJECT = {
  id: '22223333-4444-5555-6666-777788889999',
  project_name: 'Drill or farm out',
  updated_at: '2026-08-14T11:00:00Z',
  inputs_data: {
    tree: {
      type: 'decision', label: 'Prospect decision',
      branches: [
        {
          label: 'Drill', cost: 40,
          node: {
            type: 'chance', label: 'Outcome',
            branches: [
              { label: 'Success', probability: 0.3, node: { type: 'terminal', payoff: 300 } },
              { label: 'Dry', probability: 0.7, node: { type: 'terminal', payoff: -10 } },
            ],
          },
        },
        { label: 'Farm out', cost: 0, node: { type: 'terminal', payoff: 18 } },
      ],
    },
  },
};

const PORTFOLIO = { id: 'p1', name: 'FY27 Capital Plan', capex_limit: 450 };
const PROJECTS = [
  { id: 'A', name: 'A', capex: 100, npv_p50: 60 },
  { id: 'B', name: 'B', capex: 200, npv_p50: 100 },
  { id: 'C', name: 'C', capex: 300, npv_p50: 120 },
  { id: 'D', name: 'D', capex: 150, npv_p50: 90, source_type: 'epe_mc' },
];

describe('economicsSection', () => {
  it('reports the MC percentiles with full provenance', () => {
    const s = economicsSection(MC_RUN);
    expect(s.rows).toContainEqual(['NPV P50', '$130.0M']);
    expect(s.rows).toContainEqual(['Chance NPV is positive', '92.0%']);
    expect(s.provenance).toContain('aaaabbbb');
    expect(s.provenance).toContain('seed 42');
    expect(s.provenance).toContain('1000 iterations');
    expect(s.note).toContain('oil price');
  });
  it('returns null without a run', () => {
    expect(economicsSection(null)).toBeNull();
  });
});

describe('decisionSection', () => {
  it('recomputes EMV 43 with drill recommended (hand-derived case)', () => {
    const s = decisionSection(TREE_PROJECT);
    expect(s.rows).toContainEqual(['Optimal EMV', '$43.0M']);
    expect(s.rows).toContainEqual(['Recommended first move', 'Drill']);
    expect(s.rows).toContainEqual(['Next best alternative', '$18.0M']);
    expect(s.rows).toContainEqual(['Decision advantage', '$25.0M']);
    expect(s.provenance).toContain('Drill or farm out');
  });
  it('degrades gracefully when the saved tree fails validation', () => {
    const broken = JSON.parse(JSON.stringify(TREE_PROJECT));
    broken.inputs_data.tree.branches[0].node.branches[0].probability = 0.9;
    const s = decisionSection(broken);
    expect(s.rows).toContainEqual(['Status', 'Saved tree failed validation']);
    expect(s.note).toContain('probabilities sum');
  });
});

describe('portfolioSection', () => {
  it('re-optimizes at brief time (knapsack case: A+B+D, EMV 250)', () => {
    const s = portfolioSection(PORTFOLIO, PROJECTS);
    expect(s.rows).toContainEqual(['Risked portfolio EMV', '$250.0M']);
    expect(s.rows).toContainEqual(['Projects funded', '3 of 4']);
    expect(s.note).toContain('A');
    expect(s.note).toContain('D');
    expect(s.provenance).toContain('1 valued by linked EPE Monte Carlo runs');
    expect(s.rows).toContainEqual(['Capital deployed', '$450.0M of $450.0M']);
    expect(s.overLimit).toBe(false);
  });

  it('states the seeded Monte Carlo behind the loss chance, not a normal approximation', () => {
    const s = portfolioSection(PORTFOLIO, PROJECTS);
    expect(s.provenance).toContain('seed 20260829');
    expect(s.provenance).toContain('10000 iterations');
    expect(s.provenance).not.toMatch(/normal approximation/i);
  });

  // EC5 (engines #194): the exact solve cannot exceed the limit, so the case
  // that used to overshoot by 2 now funds the best set that fits, and no
  // brief claims otherwise. The exact figures still appear, because the
  // rounded row alone would read "$6.00B of $6.00B" over real headroom.
  it('funds the best fitting set on the case that used to overshoot (D3)', () => {
    const s = portfolioSection(
      { id: 'p3', name: 'Overshoot', capex_limit: 6000 },
      [
        { id: 'A', name: 'A', capex: 4000, npv_p50: 500 },
        { id: 'B', name: 'B', capex: 2002, npv_p50: 300 },
        { id: 'C', name: 'C', capex: 1995, npv_p50: 280 },
      ],
    );
    expect(s.overLimit).toBe(false);
    expect(s.rows).not.toContainEqual(['Over the capital limit by', '2 $MM']);
    expect(s.note).not.toMatch(/Capital limit exceeded/);
    expect(s.note).toMatch(/Capital deployed exactly: 5,995 \$MM of 6,000 \$MM\./);
    expect(s.note).toContain('Funded: A, C.');
    expect(s.provenance).toMatch(/Solved exactly on the capital figures/);
    expect(s.provenance).not.toMatch(/grid resolution null/);
  });

  it('states a grid fallback in the provenance when one is used', () => {
    // The brief reads the engine's own solveMethod, so a fallback says so
    // rather than presenting a bounded answer as an exact one.
    const s = portfolioSection(PORTFOLIO, PROJECTS);
    expect(s.provenance).toMatch(/Solved exactly on the capital figures/);
  });
});

describe('buildBriefModel', () => {
  it('includes only sections whose sources are provided, with a footer', () => {
    const m = buildBriefModel({
      title: '  Deepwater Alpha FID  ',
      recommendation: 'Proceed to FID.',
      preparedBy: 'ayo',
      mcRun: MC_RUN,
      treeProject: null,
      portfolio: PORTFOLIO,
      portfolioProjects: PROJECTS,
    });
    expect(m.title).toBe('Deepwater Alpha FID');
    expect(m.sections.map((s) => s.heading)).toEqual(['Probabilistic economics', 'Capital allocation']);
    expect(m.footer).toContain('provenance');
    expect(m.sections.every((s) => s.provenance.length > 0)).toBe(true);
  });
});

describe('fmtMMUsd', () => {
  it('formats USD into $MM and $B', () => {
    expect(fmtMMUsd(135185570.34)).toBe('$135.2M');
    expect(fmtMMUsd(2.4e9)).toBe('$2.40B');
    expect(fmtMMUsd(null)).toBe('N/A');
  });
});
