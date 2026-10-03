/**
 * Capital Portfolio Studio's intake of a Risked Reserves valuation (U2-009).
 *
 * Owner decisions 2026-10-03: the NPV slot (`npv_p50`, the one the optimizer
 * reads) takes the success-case MEAN value; the budget line (`capex`) is the
 * well cost, the development cost is information; the risk score is left
 * blank. The mapping is held against the valuation's own EMV through the
 * optimizer's own projectEmv, with a negative control for each swap.
 *
 * And existing projects: the optimizer never reads the risk score, so a blank
 * one changes nothing, and a saved portfolio computes exactly what main
 * computed (results.json, written from main fb9da7ccd before this change).
 */
import { optimizePortfolio, projectEmv } from '@/utils/portfolioOptimizer';
import {
  RRV_SOURCE_TYPE, rrvIntakeProject, readRrvLink, rrvEditedFields, rrvLinkState, refreshRrvProject, isRrvProject,
} from '../rrvIntake';
import { buildRrvPortfolioCandidate } from '@/pages/apps/riskedreserves/services/rrvPortfolioCandidate';
import { savedValuationRow, colleagueSharedRow, ekeneNorthValuation } from '@/pages/apps/riskedreserves/services/rrvPortfolioFixtures';
import { setInput } from '@/pages/apps/riskedreserves/services/rrvStore';
import FIXTURE from './__fixtures__/existingPortfolio.json';
import GOLDEN from './__fixtures__/existingPortfolio.results.json';

const candidate = (row = savedValuationRow()) => buildRrvPortfolioCandidate({ row, userId: 'dev-user', build: 'test build' }).contract;
const intake = (c = candidate()) => rrvIntakeProject(c);

describe('the mapping', () => {
  test('the slots: success-case mean in npv_p50, well cost as the budget line and the dry-hole loss, Pg as pos, no risk score', () => {
    const c = candidate();
    const p = intake(c);
    expect(p).toMatchObject({
      name: 'Ekene North',
      capex: c.wellCostMM,
      npv_p50: c.successMeanValueMM,
      pos: c.pg,
      fail_cost: c.wellCostMM,
      npv_p90: c.p90SizeValueMM,
      npv_p10: c.p10SizeValueMM,
      npv_stddev: null,
      risk_score: null,
      source_type: RRV_SOURCE_TYPE,
      source_ref: 'valuation-1',
    });
    expect(isRrvProject(p)).toBe(true);
  });

  test('the portfolio EMV of the intake is the valuation\'s EMV', () => {
    for (const row of [savedValuationRow(), colleagueSharedRow(), savedValuationRow({ valuation: setInput(ekeneNorthValuation(), 'pg', 0.05) })]) {
      const c = candidate(row);
      expect(projectEmv(intake(c))).toBeCloseTo(c.emvMM, 9);
    }
  });

  test('negative control: each swapped field fails the same check', () => {
    const c = candidate();
    const good = intake(c);
    const swaps = {
      'Pc in the pos slot': { ...good, pos: c.pc },
      'NPV if commercial in the NPV slot': { ...good, npv_p50: c.npvIfCommercialMM },
      'value before the well in the NPV slot': { ...good, npv_p50: c.valueIfDiscoveryMM },
      'development cost as the dry-hole loss': { ...good, fail_cost: c.devCostMM },
    };
    for (const [what, p] of Object.entries(swaps)) {
      expect({ what, off: Math.abs(projectEmv(p) - c.emvMM) > 0.5 }).toEqual({ what, off: true });
    }
    // the budget line: the development cost would put a 25 $MM well at the price of the field
    expect(good.capex).toBe(c.wellCostMM);
    expect(good.capex).not.toBe(c.devCostMM);
  });

  test('the project keeps a short human label, the valuation id and its version; never the contract', () => {
    const c = candidate();
    const row = JSON.parse(JSON.stringify({ id: 'pp-new', ...intake(c) }));
    expect(row.source_label).toBe(`Risked Reserves: Ekene North, saved 2026-10-02 15:01 UTC (version ${c.fingerprint})`);
    expect(row.source_label).not.toMatch(/[{}"]/);
    expect(row.source_label.length).toBeLessThan(120);
    expect(row.source_ref).toBe('valuation-1');
    expect(readRrvLink(row)).toEqual({ valuationId: 'valuation-1', fingerprint: c.fingerprint, label: row.source_label });
    // a project from another source has no link
    expect(readRrvLink(FIXTURE.projects[2])).toBeNull();
    expect(readRrvLink({ source_type: 'rrv', source_ref: 'v', source_label: 'typed by hand' })).toMatchObject({ valuationId: 'v', fingerprint: null });
  });
});

describe('the live schema (read 2026-10-03 by the programme lead)', () => {
  // NOT NULL in the live portfolio_projects; risk_score and source_label are nullable
  const NOT_NULL = ['capex', 'npv_p50', 'npv_p90', 'npv_p10'];
  test('the intake fills every NOT NULL column with a finite number', () => {
    for (const row of [savedValuationRow(), colleagueSharedRow(), savedValuationRow({ valuation: setInput(ekeneNorthValuation(), 'mefs', 5) })]) {
      const p = intake(candidate(row));
      for (const k of NOT_NULL) expect({ k, ok: Number.isFinite(p[k]) }).toEqual({ k, ok: true });
    }
  });
  test('negative control: a payload with a blank P90 fails the same check', () => {
    const p = { ...intake(), npv_p90: null };
    expect(NOT_NULL.every((k) => Number.isFinite(p[k]))).toBe(false);
  });
});

describe('edited after intake, and the source changed since', () => {
  const now = (row) => ({ ok: true, contract: candidate(row) });

  test('a value typed over in the portfolio is marked against the valuation read by id, while it is the version received', () => {
    const c = candidate();
    const p = intake(c);
    expect(rrvEditedFields(p, c)).toEqual([]);
    expect(rrvEditedFields({ ...p, capex: 30, pos: 0.4 }, c).map((e) => e.field)).toEqual(['capex', 'pos']);
    expect(rrvEditedFields({ ...p, npv_p90: 0 }, c)).toEqual([expect.objectContaining({ field: 'npv_p90', received: c.p90SizeValueMM, now: 0 })]);
    // once the valuation has changed, the received values are not readable: unknown
    const c2 = candidate(savedValuationRow({ valuation: setInput(ekeneNorthValuation(), 'wellCost', 30) }));
    expect(rrvEditedFields({ ...p, capex: 30 }, c2)).toBeNull();
    expect(rrvEditedFields(p, null)).toBeNull();
  });

  test('the valuation as it is now: current, changed (with what differs), missing, refused, unknown', () => {
    const p = intake();
    expect(rrvLinkState(p, undefined).state).toBe('unknown');
    expect(rrvLinkState(p, null).state).toBe('missing');
    expect(rrvLinkState(p, { ok: false, reason: 'Volumes need 0 < P90 < P10' })).toMatchObject({ state: 'refused', reason: 'Volumes need 0 < P90 < P10' });
    expect(rrvLinkState(p, now(savedValuationRow({ updatedAt: '2026-10-09T00:00:00.000Z' }))).state).toBe('current');
    const moved = rrvLinkState(p, now(savedValuationRow({ valuation: setInput(ekeneNorthValuation(), 'wellCost', 30) })));
    expect(moved.state).toBe('changed');
    expect(moved.changes.map((x) => x.key)).toEqual(expect.arrayContaining(['wellCostMM', 'successMeanValueMM']));
    expect(moved.changes.find((x) => x.key === 'wellCostMM')).toMatchObject({ here: 25, there: 30 });
  });

  test('Refresh takes every value and the new version from the valuation, and keeps the portfolio\'s name', () => {
    const p = { ...intake(), capex: 30, name: 'Ekene North (portfolio)' };
    const c2 = candidate(savedValuationRow({ valuation: setInput(ekeneNorthValuation(), 'pg', 0.4) }));
    const next = refreshRrvProject(p, c2);
    expect(next.pos).toBe(c2.pg);
    expect(next.npv_p50).toBe(c2.successMeanValueMM);
    expect(next.capex).toBe(c2.wellCostMM);
    expect(next.name).toBe('Ekene North (portfolio)');
    expect(readRrvLink({ ...p, ...next }).fingerprint).toBe(c2.fingerprint);
    expect(rrvEditedFields({ ...p, ...next }, c2)).toEqual([]);
  });
});

describe('existing projects open and compute exactly as before', () => {
  test('the saved portfolio gives what main gave, every field', () => {
    for (const pf of FIXTURE.portfolios) {
      for (const rho of [0, 0.45]) {
        expect(optimizePortfolio({ projects: FIXTURE.projects, capexLimit: pf.capex_limit, correlation: rho })).toEqual(GOLDEN[`${pf.id}@${rho}`]);
      }
    }
    for (const p of FIXTURE.projects) expect(projectEmv(p)).toBe(GOLDEN.emv[p.id]);
  });

  test('the optimizer does not read the risk score: blank, 1 or 10 give the same answer', () => {
    const run = (score) => optimizePortfolio({ projects: FIXTURE.projects.map((p) => ({ ...p, risk_score: score })), capexLimit: 300, correlation: 0.45, iterations: 2000 });
    const base = run(5);
    for (const s of [null, undefined, '', 1, 10]) {
      const r = run(s);
      expect(r.totalEmv).toBe(base.totalEmv);
      expect(r.optimalProjects.map((p) => p.id)).toEqual(base.optimalProjects.map((p) => p.id));
      expect(r.risk).toEqual(base.risk);
      expect(r.frontierData).toEqual(base.frontierData);
    }
  });

  test('a portfolio with the Risked Reserves candidate added funds it on its EMV and leaves the others\' values alone', () => {
    const c = candidate();
    const withRrv = [...FIXTURE.projects, { id: 'pp-rrv', ...intake(c) }];
    const r = optimizePortfolio({ projects: withRrv, capexLimit: 520, correlation: 0 });
    const before = GOLDEN['pf-stretch@0'];
    // the candidate's EMV is the valuation's; the existing projects' EMVs are untouched
    for (const p of FIXTURE.projects) expect(projectEmv(p)).toBe(GOLDEN.emv[p.id]);
    expect(projectEmv(withRrv[withRrv.length - 1])).toBeCloseTo(c.emvMM, 9);
    expect(r.totalEmv).toBeGreaterThanOrEqual(before.totalEmv - 1e-9);
  });
});
