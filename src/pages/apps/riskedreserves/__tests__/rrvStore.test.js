import { fromRcpProspect, inputProblem, blankProspect, valuationCsv, DEFAULT_ECONOMICS } from '../services/rrvStore';
import { valueProspect } from '@/utils/prospectValuation';

describe('Risked Reserves store', () => {
  test('an RCP row maps Pg and success-case volumes', () => {
    const p = fromRcpProspect({ id: 'a1', name: 'North', pg_factors: { trap: 0.8, charge: 0.5 }, inputs: { p90: 1, p10: 2 }, risked: { pg: 0.32, success: { p90: 12, p50: 30, p10: 75 } } });
    expect(p).toMatchObject({ id: 'rcp-a1', source: 'rcp', name: 'North', pg: 0.32, p90: 12, p50: 30, p10: 75, ...DEFAULT_ECONOMICS });
  });
  test('Pg falls back to the product of the factors', () => {
    const p = fromRcpProspect({ id: 'b', name: 'B', pg_factors: { trap: 0.8, reservoir: 0.5, charge: 0.5, seal: 1 }, inputs: { p90: 10, p50: 20, p10: 40 }, risked: {} });
    expect(p.pg).toBeCloseTo(0.2, 12);
    expect(p.p90).toBe(10);
  });
  test('stated units convert to MMboe; unstated raw STB is scaled (RCP-T1-003)', () => {
    const gas = fromRcpProspect({ id: 'g', name: 'G', pg_factors: {}, inputs: { unit: 'Bcf', p90: 60, p50: 120, p10: 240 }, risked: { pg: 0.3 } });
    expect(gas).toMatchObject({ p90: 10, p50: 20, p10: 40, volumeNote: expect.stringMatching(/Bcf/) });
    const stb = fromRcpProspect({ id: 's', name: 'S', pg_factors: {}, inputs: { p90: 178.81e6, p50: 225.54e6, p10: 284.03e6 }, risked: { pg: 0.3 } });
    expect(stb).toMatchObject({ p90: 178.81, p50: 225.54, p10: 284.03 });
  });
  test('input problems name the rule', () => {
    expect(inputProblem(blankProspect(1))).toBeNull();
    expect(inputProblem({ ...blankProspect(1), p90: 60, p10: 10 })).toMatch(/P90 is the low case/);
    expect(inputProblem({ ...blankProspect(1), pg: 1.4 })).toMatch(/Pg/);
    expect(inputProblem({ ...blankProspect(1), p50: 5 })).toMatch(/P50/);
    expect(inputProblem({ ...blankProspect(1), wellCost: -1 })).toMatch(/zero or more/);
  });
  test('CSV carries the engine EMV', () => {
    const p = blankProspect(1);
    const v = valueProspect(p);
    const csv = valuationCsv([{ p, v }]).split('\n');
    expect(csv[0]).toMatch(/^prospect,source,pg/);
    expect(csv[1]).toContain(v.emv.toFixed(3));
  });
});
