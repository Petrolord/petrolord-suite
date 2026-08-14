// D4 tests for the capital portfolio optimizer. Expected values are
// hand-derived closed forms in the comments.

import {
  projectEmv, projectMoments, portfolioRiskMetrics, optimizePortfolio, successStdDev,
} from '../portfolioOptimizer';
import { normalCDF } from '@/lib/monteCarlo';

const P = (name, capex, npv, extra = {}) => ({ id: name, name, capex, npv_p50: npv, ...extra });

describe('projectEmv (risked)', () => {
  it('defaults to the unrisked NPV when pos/fail_cost are absent', () => {
    expect(projectEmv(P('a', 100, 250))).toBe(250);
  });
  it('risks the NPV: EMV = pos*npv - (1-pos)*fail_cost', () => {
    // 0.3*300 - 0.7*50 = 90 - 35 = 55
    expect(projectEmv(P('a', 100, 300, { pos: 0.3, fail_cost: 50 }))).toBeCloseTo(55, 9);
  });
});

describe('successStdDev', () => {
  it('prefers an explicit npv_stddev (linked Monte Carlo run)', () => {
    expect(successStdDev({ npv_stddev: 40, npv_p10: 200, npv_p90: 50 })).toBe(40);
  });
  it('falls back to (P10-P90)/2.5631 from entered percentiles', () => {
    // (200 - 50) / 2.5631 = 58.523...
    expect(successStdDev({ npv_p10: 200, npv_p90: 50 })).toBeCloseTo(150 / 2.5631, 6);
  });
  it('is 0 with neither', () => {
    expect(successStdDev({})).toBe(0);
  });
});

describe('projectMoments (success/failure mixture, exact)', () => {
  it('matches the closed-form mixture variance', () => {
    // pos 0.5, success N(100, sd 20), failure -40:
    // mean = 0.5*100 - 0.5*40 = 30
    // E[X^2] = 0.5*(400 + 10000) + 0.5*1600 = 5200 + 800 = 6000
    // var = 6000 - 900 = 5100
    const m = projectMoments({ npv_p50: 100, npv_stddev: 20, pos: 0.5, fail_cost: 40 });
    expect(m.mean).toBeCloseTo(30, 9);
    expect(m.variance).toBeCloseTo(5100, 9);
  });
  it('a sure project with no spread has zero variance', () => {
    const m = projectMoments({ npv_p50: 100 });
    expect(m.mean).toBe(100);
    expect(m.variance).toBe(0);
  });
});

describe('portfolioRiskMetrics (independent normal approximation)', () => {
  it('sums means and variances and computes P(loss) = Phi(-mean/sd)', () => {
    const a = { npv_p50: 100, npv_stddev: 20, pos: 0.5, fail_cost: 40 }; // mean 30, var 5100
    const b = { npv_p50: 50, npv_stddev: 10 };                            // mean 50, var 100
    const r = portfolioRiskMetrics([a, b]);
    expect(r.emv).toBeCloseTo(80, 9);
    expect(r.stdDev).toBeCloseTo(Math.sqrt(5200), 9);
    expect(r.probLoss).toBeCloseTo(normalCDF(-80 / Math.sqrt(5200)), 12);
    expect(r.p90).toBeLessThan(r.emv);
    expect(r.p10).toBeGreaterThan(r.emv);
  });
  it('a deterministic profitable portfolio has zero loss probability', () => {
    expect(portfolioRiskMetrics([{ npv_p50: 10 }]).probLoss).toBe(0);
  });
});

describe('optimizePortfolio (step-scaled knapsack)', () => {
  const projects = [
    P('A', 100, 60),
    P('B', 200, 100),
    P('C', 300, 120),
    P('D', 150, 90),
  ];

  it('solves the classic knapsack exactly', () => {
    // Limit 450: best is A(100,60) + B(200,100) + D(150,90) = capex 450, EMV 250.
    const r = optimizePortfolio({ projects, capexLimit: 450 });
    expect(r.optimalProjects.map((p) => p.name).sort()).toEqual(['A', 'B', 'D']);
    expect(r.totalEmv).toBeCloseTo(250, 6);
    expect(r.totalCapex).toBeCloseTo(450, 6);
  });

  it('optimizes RISKED EMV, not the headline NPV', () => {
    // Same capex; a risked big NPV loses to a sure small one:
    // X: npv 300 but pos 0.2, fail 50 -> EMV = 60 - 40 = 20. Y: sure 50.
    const r = optimizePortfolio({
      projects: [P('X', 100, 300, { pos: 0.2, fail_cost: 50 }), P('Y', 100, 50)],
      capexLimit: 100,
    });
    expect(r.optimalProjects.map((p) => p.name)).toEqual(['Y']);
  });

  it('never forces in a negative-EMV project', () => {
    const r = optimizePortfolio({
      projects: [P('bad', 50, -20), P('good', 50, 30)],
      capexLimit: 200,
    });
    expect(r.optimalProjects.map((p) => p.name)).toEqual(['good']);
  });

  it('keeps the DP bounded when the limit is typed in raw dollars', () => {
    // 450,000,000 "dollars": resolution scales; same relative solution.
    const dollarProjects = projects.map((p) => ({ ...p, capex: p.capex * 1e6 }));
    const r = optimizePortfolio({ projects: dollarProjects, capexLimit: 450e6 });
    expect(r.optimalProjects.map((p) => p.name).sort()).toEqual(['A', 'B', 'D']);
    expect(r.resolution).toBeGreaterThan(1); // quantized, not 4.5e8 cells
  });

  it('produces a monotone frontier ending at the optimum', () => {
    const r = optimizePortfolio({ projects, capexLimit: 450 });
    for (let i = 1; i < r.frontierData.length; i++) {
      expect(r.frontierData[i].emv).toBeGreaterThan(r.frontierData[i - 1].emv);
      expect(r.frontierData[i].capex).toBeGreaterThanOrEqual(r.frontierData[i - 1].capex);
    }
    expect(r.frontierData[r.frontierData.length - 1].emv).toBeCloseTo(r.totalEmv, 6);
  });

  it('attaches the risk summary of the picked set', () => {
    const r = optimizePortfolio({ projects, capexLimit: 450 });
    expect(r.risk.emv).toBeCloseTo(250, 6);
    expect(r.risk.probLoss).toBe(0); // deterministic inputs, positive EMV
  });
});
