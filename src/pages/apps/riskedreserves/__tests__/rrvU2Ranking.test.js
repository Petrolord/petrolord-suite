/**
 * Risked Reserves Valuation U2-008: ranking the user's and shared
 * valuations by EMV, risked volume and commercial chance, with the basis of
 * each row stated, and the CSV with its provenance header. The numbers are
 * the engine's; the gate checks the order against the engine's own results.
 */
import { valueProspect } from '@/utils/prospectValuation';
import { blankProspect, setInput, engineInput, fromRcpProspect, applyEpeCase, inputProblem } from '../services/rrvStore';
import { rankValuations, rankingCsv, basisOf, RANK_KEYS } from '../services/rrvRanking';
import { rrvUnits } from '../services/rrvUnits';
import { RRV_SEED_PROSPECTS } from '../services/rrvFixtures';

const entry = (p, extra = {}) => { const problem = inputProblem(p); return { p, v: problem ? null : valueProspect(engineInput(p)), problem, ...extra }; };
// three prospects whose order differs by key: A has the best EMV, B the largest risked volume, C the best chance
const A = { ...setInput(setInput(blankProspect(1), 'pg', 0.3), 'p10', 90), name: 'A big value' };
const B = { ...setInput(setInput(setInput(setInput(blankProspect(2), 'pg', 0.2), 'p90', 30), 'p50', 70), 'p10', 200), name: 'B big volume' };
const C = { ...setInput(setInput(setInput(blankProspect(3), 'pg', 0.6), 'p90', 25), 'p10', 45), name: 'C safe' };
const bad = { ...setInput(blankProspect(4), 'pg', ''), name: 'D unfinished' };
const entries = [entry(A), entry(B), entry(C), entry(bad)];

test('each key orders by the engine\'s own number, largest first; the unfinished one is listed as not ranked', () => {
  for (const by of Object.keys(RANK_KEYS)) {
    const r = rankValuations(entries, by);
    const vals = r.rows.map((x) => x[by === 'riskedMean' ? 'riskedMean' : by]);
    expect([...vals].sort((a, b) => b - a)).toEqual(vals);
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(r.unranked).toEqual([{ name: 'D unfinished', problem: 'Enter Pg, the geological chance of success (0 to 1).', shared: false }]);
  }
  // the three keys disagree on these three, so the ranking is not one number in three costumes
  expect(rankValuations(entries, 'emv').rows[0].name).not.toBe(rankValuations(entries, 'pc').rows[0].name);
  expect(rankValuations(entries, 'riskedMean').rows[0].name).toBe('B big volume');
  expect(rankValuations(entries, 'pc').rows[0].name).toBe('C safe');
  // the numbers are the engine's
  const row = rankValuations(entries, 'emv').rows.find((x) => x.name === 'C safe');
  expect(row.emv).toBe(valueProspect(engineInput(C)).emv);
  expect(row.emvPerWellDollar).toBeCloseTo(row.emv / 25, 12);
});

test('shared valuations rank beside the user\'s and say whose they are; an unknown key falls back to EMV', () => {
  const r = rankValuations([entry(A), entry({ ...C, id: 'shared-c' }, { shared: true, owner: 'Ada Colleague' })], 'nonsense');
  expect(r.by).toBe('emv');
  expect(r.rows.find((x) => x.shared)).toMatchObject({ owner: 'Ada Colleague' });
  expect(r.rows.find((x) => !x.shared).owner).toBe('you');
});

test('the basis of each row: volumes, value of a discovery, MEFS', async () => {
  expect(basisOf(A)).toBe('volumes typed here; value: economic model; MEFS derived');
  const north = fromRcpProspect({ id: 'p1', ...RRV_SEED_PROSPECTS[0] });
  expect(basisOf(setInput(north, 'mefs', 20), { state: 'changed' })).toBe('volumes from ReservoirCalc Pro "Ekene North", changed there since; value: economic model; MEFS typed');
  const contract = { schema: 'epe-unit-value-1', runName: 'Base deck, 10%', unitValue: 12, devCost: 300, runId: 'r1', fingerprint: 'x' };
  expect(basisOf(applyEpeCase(north, contract), null, { state: 'changed' })).toBe('volumes from ReservoirCalc Pro "Ekene North"; value from Petroleum Economics Studio run "Base deck, 10%" (changed since); MEFS derived');
  const inPlace = fromRcpProspect({ id: 'p2', ...RRV_SEED_PROSPECTS[0], inputs: { ...RRV_SEED_PROSPECTS[0].inputs, basis: 'in-place' } });
  expect(basisOf(inPlace)).toMatch(/^volumes from ReservoirCalc Pro "Ekene North" \(IN PLACE\)/);
});

test('the CSV opens with its provenance, ranks in order, and converts volumes only', () => {
  const ranked = rankValuations(entries, 'riskedMean');
  const csv = rankingCsv(ranked, { build: 'Petrolord Suite 4.0.0 (abc1234)', generatedAt: new Date('2026-10-02T15:00:00Z'), units: rrvUnits('10^6 m3'), includeShared: true, savedWhere: 'Petrolord account' }).split('\n');
  expect(csv.slice(0, 9)).toEqual([
    '# Risked Reserves Valuation, ranking, Petrolord Suite',
    '# Build: Petrolord Suite 4.0.0 (abc1234)',
    '# Generated: 2026-10-02 15:00 UTC',
    '# Ranked by: risked mean volume (Pg x success-case mean), largest first',
    '# Units: volumes 10^6 m3 oe (oil equivalent, gas at 6 Mscf per boe); money $MM',
    '# Percentiles: P90 is the low case and P10 the high case: the volume exceeded with 90 and 10 percent probability (exceedance convention, SPE PRMS)',
    '# Each prospect is valued on its own; the ranking assumes nothing about dependence between prospects',
    '# Rows: your valuations and those colleagues shared with you (marked shared)',
    '# Saved: Petrolord account',
  ]);
  expect(csv[9]).toBe('# Not ranked: D unfinished: Enter Pg, the geological chance of success (0 to 1).');
  expect(csv[10]).toBe('rank,prospect,owner,pg,pc,risked_mean_mm_m3_oe,success_mean_mm_m3_oe,emv_musd,well_cost_musd,emv_per_well_dollar,basis,saved');
  const first = csv[11].split(',');
  expect(first.slice(0, 3)).toEqual(['1', 'B big volume', 'you']);
  // one pinned conversion: the risked mean in million cubic metres
  expect(Number(first[5])).toBeCloseTo(ranked.rows[0].riskedMean * 0.158987294928, 3);
  // money does not convert
  expect(Number(first[7])).toBeCloseTo(ranked.rows[0].emv, 3);
  expect(csv).toHaveLength(14);
});
