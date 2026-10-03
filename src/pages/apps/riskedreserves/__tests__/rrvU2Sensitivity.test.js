/**
 * Risked Reserves Valuation U2-003: the sensitivity of the EMV (the tornado).
 * One input at a time is moved to a stated low and high case, the others
 * held, and the valuation engine is asked again. The gates call the shipped
 * function and hold it against a hand calculation.
 *
 * WORKED HAND CALCULATION. Pg 0.25, P90 10, P10 60 MMboe, MEFS 10, value per
 * barrel 8 $/boe, development 100 $MM, well 25 $MM. The lognormal through 10
 * and 60 puts 90% above the MEFS of 10 (it is the P90), so
 *   development term = Pg x D x P(V >= MEFS) = 0.25 x 100 x 0.9 = 22.5 $MM
 *   EMV = 13.5594 $MM (the engine), so
 *   barrels term = EMV + 22.5 + 25 = 61.0594 $MM.
 * Each term is linear in its own input, so with a swing of 25%:
 *   well cost       EMV -/+ 0.25 x 25      = 19.809 (low cost), 7.309 (high cost)
 *   development     EMV -/+ 0.25 x 22.5    = 19.184 (low),      7.934 (high)
 *   value per bbl   EMV -/+ 0.25 x 61.0594 = -1.705 (low),      28.824 (high)
 *   Pg              (EMV + 25) x 0.75 - 25 = 3.920 (low), x 1.25 - 25 = 23.199 (high)
 * and a chance factor of 0.5 moved by 0.1 moves Pg by 0.1 / 0.5 = 20%:
 *   charge 0.4      38.5594 x 0.8 - 25 = 5.848; charge 0.6   38.5594 x 1.2 - 25 = 21.271.
 */
import { valueProspect } from '@/utils/prospectValuation';
import { emvSensitivity, SENS_DEFAULTS } from '../services/rrvMath';

const E = { pg: 0.25, p90: 10, p50: 25, p10: 60, mefs: 10, unitValue: 8, devCost: 100, wellCost: 25 };
const FACTORS = { trap: 1, reservoir: 1, charge: 0.5, seal: 0.5 }; // product 0.25

describe('the tornado, against the hand calculation', () => {
  const s = emvSensitivity(E, { pgFactors: FACTORS });
  const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));

  test('the base is the engine EMV', () => {
    expect(s.base).toBe(valueProspect(E).emv);
    expect(s.base).toBeCloseTo(13.559, 3);
    expect(s.swing).toBe(SENS_DEFAULTS.swing);
    expect(s.swing).toBe(25);
  });

  test('well cost, development cost, value per barrel and Pg: the hand numbers', () => {
    expect([by.wellCost.low.input, by.wellCost.high.input]).toEqual([18.75, 31.25]);
    expect(by.wellCost.low.emv).toBeCloseTo(19.809, 3);
    expect(by.wellCost.high.emv).toBeCloseTo(7.309, 3);
    expect(by.devCost.low.emv).toBeCloseTo(19.184, 3);
    expect(by.devCost.high.emv).toBeCloseTo(7.934, 3);
    expect(by.unitValue.low.emv).toBeCloseTo(-1.705, 3);
    expect(by.unitValue.high.emv).toBeCloseTo(28.824, 3);
    expect([by.pg.low.input, by.pg.high.input]).toEqual([0.1875, 0.3125]);
    expect(by.pg.low.emv).toBeCloseTo(3.920, 3);
    expect(by.pg.high.emv).toBeCloseTo(23.199, 3);
  });

  test('each chance factor moves Pg in proportion: charge 0.5 by 0.1 is Pg by 20%', () => {
    expect([by['factor.charge'].low.input, by['factor.charge'].high.input]).toEqual([0.4, 0.6]);
    expect(by['factor.charge'].low.emv).toBeCloseTo(5.848, 3);
    expect(by['factor.charge'].high.emv).toBeCloseTo(21.271, 3);
    // a factor already at 1 cannot go higher: its high case is the base
    expect(by['factor.trap'].high.input).toBe(1);
    expect(by['factor.trap'].high.emv).toBeCloseTo(s.base, 12);
    expect(by['factor.trap'].low.emv).toBeCloseTo(38.5594 * 0.9 - 25, 3);
  });

  test('volumes and the MEFS: every case is the engine asked again with that one input moved', () => {
    expect(by.volumes.low.emv).toBe(valueProspect({ ...E, p90: 7.5, p50: 18.75, p10: 45 }).emv);
    expect(by.volumes.high.emv).toBe(valueProspect({ ...E, p90: 12.5, p50: 31.25, p10: 75 }).emv);
    expect(by.mefs.low.emv).toBe(valueProspect({ ...E, mefs: 7.5 }).emv);
    expect(by.mefs.high.emv).toBe(valueProspect({ ...E, mefs: 12.5 }).emv);
    // at these economics a discovery of 10 MMboe loses money, so a HIGHER MEFS is worth more
    expect(by.mefs.high.emv).toBeGreaterThan(s.base);
    expect(by.volumes.high.emv).toBeGreaterThan(by.volumes.low.emv);
  });

  test('the rows are ordered by swing, largest first, and the swing is the gap between the two cases', () => {
    for (const r of s.rows) expect(r.range).toBeCloseTo(Math.abs(r.high.emv - r.low.emv), 12);
    const ranges = s.rows.map((r) => r.range);
    expect([...ranges].sort((a, b) => b - a)).toEqual(ranges);
    expect(s.rows[0].key).toBe('unitValue'); // 30.5 $MM between its two cases
    expect(s.rows.map((r) => r.key).sort()).toEqual(['devCost', 'factor.charge', 'factor.reservoir', 'factor.seal', 'factor.trap', 'mefs', 'pg', 'unitValue', 'volumes', 'wellCost']);
  });

  test('negative control: a tornado that forgot the dry hole (scaled the EMV itself) is not this one', () => {
    expect(Math.abs(by.pg.low.emv - s.base * 0.75)).toBeGreaterThan(6);
    expect(Math.abs(by.wellCost.high.emv - s.base * 0.75)).toBeGreaterThan(2);
  });
});

describe('the stated ranges', () => {
  test('the swing and the factor step are the caller\'s; Pg and the factors stay inside 0 to 1', () => {
    const s = emvSensitivity({ ...E, pg: 0.9 }, { swing: 50, factorSwing: 0.2, pgFactors: { trap: 0.9, seal: 1 } });
    const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
    expect(by.pg.high.input).toBe(1);
    expect(by.pg.low.input).toBeCloseTo(0.45, 12);
    expect(by['factor.trap'].low.input).toBeCloseTo(0.7, 12);
    expect(by['factor.trap'].high.input).toBe(1);
    expect(by.wellCost.low.input).toBe(12.5);
    expect(s).toMatchObject({ swing: 50, factorSwing: 0.2 });
  });

  test('no chance factors, or a Pg that is not their product: the factor bars are left out and the reason is given', () => {
    expect(emvSensitivity(E).rows.some((r) => r.key.startsWith('factor.'))).toBe(false);
    expect(emvSensitivity(E).factorsNote).toMatch(/no chance factors/);
    const off = emvSensitivity(E, { pgFactors: { trap: 0.9, seal: 0.9 } });
    expect(off.rows.some((r) => r.key.startsWith('factor.'))).toBe(false);
    expect(off.factorsNote).toMatch(/Pg used is not the product of the chance factors/);
  });

  test('a zero input has no percentage swing and says so; a bad swing falls back to the default', () => {
    const s = emvSensitivity({ ...E, mefs: 0, devCost: 0 });
    const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
    expect(by.mefs).toBeUndefined();
    expect(by.devCost).toBeUndefined();
    expect(s.leftOut).toEqual(['development cost', 'MEFS']);
    expect(emvSensitivity(E, { swing: -5 }).swing).toBe(25);
    expect(emvSensitivity(E, { swing: 250 }).swing).toBe(25);
  });
});
