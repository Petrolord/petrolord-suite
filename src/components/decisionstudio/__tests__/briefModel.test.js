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
