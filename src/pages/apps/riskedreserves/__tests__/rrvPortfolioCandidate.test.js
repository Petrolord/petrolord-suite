/**
 * Risked Reserves Valuation as a SENDER to Capital Portfolio Studio (U2-009):
 * the `rrv-portfolio-candidate-1` contract, read by the valuation's id.
 *
 * Owner decisions 2026-10-03: the portfolio's NPV slot takes the SUCCESS-CASE
 * MEAN value (a mean, never a P50), the budget line is the well cost (the
 * development cost travels as information), and no risk score is sent.
 *
 * Every value is the valuation engine's (valueProspect). The test holds the
 * success-case mean value against an independent quadrature of the
 * lognormal, and the EMV it implies against the engine's EMV.
 */
import {
  RRV_PORTFOLIO_SCHEMA, buildRrvPortfolioCandidate, rrvCandidateFingerprint,
} from '../services/rrvPortfolioCandidate';
import { getRrvPortfolioCandidate, listRrvPortfolioCandidates } from '../services/rrvPortfolioService';
import { savedValuationRow, colleagueSharedRow, ekeneNorthValuation } from '../services/rrvPortfolioFixtures';
import { applyEpeCase, setInput } from '../services/rrvStore';
import { buildEpeUnitValue } from '@/pages/apps/epe/epeUnitValue';
import { RRV_EPE_RUNS } from '../services/rrvFixtures';

const BUILD = 'Petrolord Suite 4.0.0 (abc1234)';
const send = (over = {}) => buildRrvPortfolioCandidate({ row: savedValuationRow(), userId: 'dev-user', build: BUILD, ...over });

// An independent oracle: E[(uV - D) 1{V >= MEFS}] for V lognormal fitted to
// P90 and P10 (exceedance convention), by the midpoint rule over z.
function valueIfDiscovery({ p90, p10, mefs, unitValue, devCost }) {
  const z90 = 1.2815515655446004;
  const mu = (Math.log(p90) + Math.log(p10)) / 2;
  const sigma = (Math.log(p10) - Math.log(p90)) / (2 * z90);
  // from the MEFS up, so the step at the MEFS falls on the edge of the range
  const lo = mefs > 0 ? (Math.log(mefs) - mu) / sigma : -12; const hi = 12;
  const n = 200000; const dz = (hi - lo) / n;
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const z = lo + (i + 0.5) * dz;
    s += (unitValue * Math.exp(mu + sigma * z) - devCost) * Math.exp(-z * z / 2) * dz;
  }
  return s / Math.sqrt(2 * Math.PI);
}

describe('the contract', () => {
  test('a saved valuation publishes the prospect, its id, its chances, values, units and provenance', () => {
    const r = send();
    expect(r.ok).toBe(true);
    const c = r.contract;
    expect(c).toMatchObject({
      schema: RRV_PORTFOLIO_SCHEMA, app: 'Risked Reserves Valuation', table: 'rrv_valuations',
      valuationId: 'valuation-1', prospectName: 'Ekene North', prospectKey: 'rcp-prospect-1',
      valuationSavedAt: '2026-10-02T15:01:00.000Z', valuationCreatedAt: '2026-10-02T15:01:00.000Z',
      ownerId: 'dev-user', sharedFromColleague: false, sentBuild: BUILD,
      units: { money: '$MM', volume: 'MMboe', unitValue: '$/boe', boe: '6 Mscf per boe' },
      volumes: { from: 'ReservoirCalc Pro', recordId: 'prospect-1', recordName: 'Ekene North', recordUpdatedAt: '2026-10-02T14:05:00.000Z', basis: 'recoverable' },
      economics: { valueBasis: 'model', mefsBasis: 'typed', epe: null },
      ident: { company: 'Harness Energy', licence: 'OML 143', play: 'Agbada stacked sands', analyst: 'A. Analyst' },
    });
    expect(c.pg).toBeCloseTo(0.32, 12);
    expect(c.mefsMMboe).toBe(15);
    expect(c.wellCostMM).toBe(25);
    expect(c.economics.model).toEqual(expect.objectContaining({ price: expect.any(Number) }));
    expect(c.basis.successMeanValue).toMatch(/mean of the success case/);
    expect(c.basis.successMeanValue).toMatch(/neither a median nor a P50/);
    expect(c.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  test('the success-case mean value is the quadrature of the success case, after the well, and its EMV is the engine EMV', () => {
    const c = send().contract;
    const p = ekeneNorthValuation();
    const vid = valueIfDiscovery({ p90: 12, p10: 75, mefs: 15, unitValue: c.unitValuePerBoe, devCost: c.devCostMM });
    // the engine's normal tail is a rational approximation (about 1e-7):
    // agreement to 1e-4 $MM on a value of about 400 $MM
    expect(Math.abs(c.valueIfDiscoveryMM - vid)).toBeLessThan(1e-4);
    expect(Math.abs(c.successMeanValueMM - (vid - 25))).toBeLessThan(1e-4);
    // EMV = Pg x (value given a discovery, after the well) - (1 - Pg) x well
    expect(c.pg * c.successMeanValueMM - (1 - c.pg) * c.wellCostMM).toBeCloseTo(c.emvMM, 9);
    expect(c.unitValuePerBoe).toBe(Number(p.unitValue));
    expect(c.devCostMM).toBe(Number(p.devCost));
    // the commercial chance and the risked volume ride along, from the engine
    expect(c.pc).toBeGreaterThan(0);
    expect(c.pc).toBeLessThan(c.pg);
    expect(c.riskedMeanMMboe).toBeCloseTo(c.pg * c.successMeanMMboe, 12);
  });

  test('negative control: the commercial-case value is not the success-case mean value', () => {
    const c = send().contract;
    // NPV if commercial is the mean of the commercial case only; put in the
    // slot it would not reproduce the EMV
    expect(Math.abs(c.pg * (c.npvIfCommercialMM - c.wellCostMM) - (1 - c.pg) * c.wellCostMM - c.emvMM)).toBeGreaterThan(1);
  });

  test('a Petroleum Economics Studio run that fed the economics travels as provenance', () => {
    const run = RRV_EPE_RUNS[0];
    const epe = buildEpeUnitValue({ run: run.run, caseName: run.caseName, kpis: run.kpis, config: run.config, resultsAt: run.resultsAt, build: 'harness' }).contract;
    const p = applyEpeCase(ekeneNorthValuation(), epe, { now: new Date('2026-10-02T16:00:00Z'), build: 'harness' });
    const c = send({ row: savedValuationRow({ valuation: p }) }).contract;
    expect(c.economics.valueBasis).toBe('epe');
    expect(c.economics.epe).toEqual({
      runId: epe.runId, runName: epe.runName, caseName: epe.caseName, priceDeckName: epe.priceDeckName, discountRatePct: epe.discountRatePct,
      pvBasis: epe.pvBasis, resultsAt: epe.resultsAt, engineVersion: epe.engineVersion, fingerprint: epe.fingerprint, receivedAt: '2026-10-02T16:00:00.000Z',
    });
    expect(c.economics.model).toBeNull();
    expect(c.unitValuePerBoe).toBeCloseTo(epe.unitValue, 12);
  });

  test('a colleague\'s shared valuation is sent as read-only provenance', () => {
    const c = send({ row: colleagueSharedRow() }).contract;
    expect(c.sharedFromColleague).toBe(true);
    expect(c.ownerId).toBe('user-colleague');
    expect(c.prospectName).toBe('Ada Deep (shared)');
    expect(c.ident.analyst).toBe('Ada Colleague');
    expect(c.pg).toBeCloseTo(0.168, 12);
  });

  test('refusals: not saved, cannot be valued', () => {
    expect(buildRrvPortfolioCandidate({ row: null })).toEqual({ ok: false, reason: expect.stringMatching(/not saved/) });
    const bad = setInput(ekeneNorthValuation(), 'p10', 5);
    const r = send({ row: savedValuationRow({ valuation: bad }) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot be valued yet: Volumes need/);
  });
});

describe('the fingerprint', () => {
  test('moves with what the valuation says, never with who sends it, when, or a re-save', () => {
    const a = send().contract;
    expect(rrvCandidateFingerprint(a)).toBe(a.fingerprint);
    expect(send({ build: 'another build' }).contract.fingerprint).toBe(a.fingerprint);
    expect(send({ userId: 'someone-else' }).contract.fingerprint).toBe(a.fingerprint);
    expect(send({ row: savedValuationRow({ updatedAt: '2026-10-05T10:00:00.000Z' }) }).contract.fingerprint).toBe(a.fingerprint);
    const moved = send({ row: savedValuationRow({ valuation: setInput(ekeneNorthValuation(), 'wellCost', 30) }) }).contract;
    expect(moved.fingerprint).not.toBe(a.fingerprint);
  });
});

describe('read by id', () => {
  const client = (rows, { user = 'dev-user', error = null } = {}) => ({
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from: (t) => {
      expect(t).toBe('rrv_valuations');
      const st = { id: null };
      const q = {
        select: () => q,
        eq: (k, v) => { st.id = v; return q; },
        order: () => q,
        limit: () => Promise.resolve(error ? { data: null, error } : { data: rows.filter((r) => st.id === null || r.id === st.id), error: null }),
      };
      return q;
    },
  });

  test('one valuation by id: its contract, or null when it is gone or unreadable', async () => {
    const rows = [savedValuationRow(), colleagueSharedRow()];
    const got = await getRrvPortfolioCandidate(client(rows), 'valuation-1', { build: BUILD });
    expect(got).toMatchObject({ valuationId: 'valuation-1', name: 'Ekene North', ok: true });
    expect(got.contract.fingerprint).toBe(send().contract.fingerprint);
    expect(await getRrvPortfolioCandidate(client(rows), 'nope')).toBeNull();
    const shared = await getRrvPortfolioCandidate(client(rows), 'valuation-shared');
    expect(shared.contract.sharedFromColleague).toBe(true);
  });

  test('the list: own and shared, each a contract or a refusal', async () => {
    const list = await listRrvPortfolioCandidates(client([savedValuationRow(), colleagueSharedRow()]), { build: BUILD });
    expect(list.map((x) => [x.name, x.ok, x.contract?.sharedFromColleague])).toEqual([['Ekene North', true, false], ['Ada Deep (shared)', true, true]]);
  });

  test('a database without the table says so in words', async () => {
    const e = { code: '42P01', message: 'relation "public.rrv_valuations" does not exist' };
    await expect(getRrvPortfolioCandidate(client([], { error: e }), 'valuation-1')).rejects.toThrow(/cannot be read on this database yet/);
  });
});
