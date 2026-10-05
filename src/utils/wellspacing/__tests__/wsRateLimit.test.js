/**
 * WS-U2-001: the rate-limited profile. Each case's decline is capped at the
 * deliverable (pseudosteady) rate of the Step 1 check; the well produces at
 * that rate until the decline from it leaves exactly the rest of the EUR.
 * Gates call the engine (wellProfile, runSpacingCases) and hold it to a
 * closed form written here from the definition, with a negative control.
 */
import * as npvModule from '@/utils/npvCalculations';
import { DAYS_PER_YEAR } from '@/lib/units/registry';

jest.mock('@/utils/npvCalculations', () => {
  const actual = jest.requireActual('@/utils/npvCalculations');
  return { ...actual, calculateEconomics: jest.fn(actual.calculateEconomics) };
});
import { runSpacingCases, wellProfile, spacingEconomicsInputs, deliverableRateStbd } from '@/utils/wellSpacingCalculations';
import { pssRateStbd, LAYOUTS } from '../drainage';
import { SAMPLE_FORM } from '../model';

const SAMPLE = { ...SAMPLE_FORM };

describe('WS-U2-001: the rate limit', () => {
  it('the deliverable rate is the Step 1 pseudosteady rate of the drainage engine', () => {
    const { parameters: p } = runSpacingCases(SAMPLE);
    const q = pssRateStbd({ kMd: 5, hFt: 60, pAvgPsia: 3500, pwfPsia: 1500, muCp: 1.2, bo: p.bo, areaAcres: 100, CA: LAYOUTS.square.CA, rwFt: 0.354, skin: 2 });
    expect(deliverableRateStbd(100, p)).toBeCloseTo(q, 9);
    expect(q).toBeCloseTo(294.2, 1);
  });

  it('plateau at the deliverable rate, then the decline from it; the EUR is conserved (closed form)', () => {
    const { parameters: p } = runSpacingCases(SAMPLE);
    const prof = wellProfile(100, p);
    const qd = deliverableRateStbd(100, p) * DAYS_PER_YEAR;
    const Dn = -Math.log(1 - 0.15);
    const qi = prof.qiAnnual;
    const tp = (qi - qd) / (Dn * qd);
    expect(prof.rateLimit.binding).toBe(true);
    expect(prof.rateLimit.plateauYears).toBeCloseTo(tp, 12);
    expect(prof.rateLimit.plateauYears).toBeCloseTo(7.51, 2);
    expect(prof.rateLimit.startRateStbd * DAYS_PER_YEAR).toBeCloseTo(qd, 9);
    // inside the plateau: the deliverable rate exactly
    expect(prof.cum(2) - prof.cum(1)).toBeCloseTo(qd, 6);
    // after it: the exponential from qd
    const t = tp + 3;
    expect(prof.cum(t + 1) - prof.cum(t)).toBeCloseTo((qd / Dn) * (Math.exp(-Dn * 3) - Math.exp(-Dn * 4)), 6);
    // to the economic limit the volume is the EUR, as in the unlimited decline
    expect(prof.cum(prof.economicLife)).toBeCloseTo(prof.eurPerWellBbl, 4);
    expect(prof.economicLife).toBeCloseTo(tp + Math.log(qd / (10 * DAYS_PER_YEAR)) / Dn, 10);
  });

  it('NEGATIVE CONTROL: clipping the rate at qd without the plateau loses oil, which the EUR gate catches', () => {
    const { parameters: p } = runSpacingCases(SAMPLE);
    const prof = wellProfile(100, p);
    const qd = prof.rateLimit.startRateStbd * DAYS_PER_YEAR;
    const Dn = -Math.log(1 - 0.15);
    // min(qd, qi e^{-Dn t}) integrated to the same limit
    const tc = Math.log(prof.qiAnnual / qd) / Dn;
    const clipped = qd * tc + (qd - 10 * DAYS_PER_YEAR) / Dn;
    expect(Math.abs(clipped - prof.eurPerWellBbl) / prof.eurPerWellBbl).toBeGreaterThan(0.1);
  });

  it('a case below the limit is unchanged; the switch off gives the Step 1 numbers back', () => {
    const on = runSpacingCases(SAMPLE);
    const off = runSpacingCases({ ...SAMPLE, rateLimit: 'off' });
    const r40on = on.spacingResults.find((r) => r.spacing === 40);
    const r40off = off.spacingResults.find((r) => r.spacing === 40);
    expect(r40on.rateLimit.binding).toBe(false);
    expect(r40on.npv).toBe(r40off.npv);
    expect(r40on.npv).toBeCloseTo(1885.787, 2);
    const r100on = on.spacingResults.find((r) => r.spacing === 100);
    const r100off = off.spacingResults.find((r) => r.spacing === 100);
    // Step 1 printed 2,316.6 at 100 acres; the rate limit moves it to 1,892.6
    expect(r100off.npv).toBeCloseTo(2316.6, 1);
    expect(r100on.npv).toBeCloseTo(1892.6, 1);
    // both sides are carried either way, and agree with each other
    expect(r100on.rateLimit.npvUnlimited).toBe(r100off.npv);
    expect(r100off.rateLimit.npvLimited).toBe(r100on.npv);
    expect(r100on.rateLimit.npvLimited - r100on.rateLimit.npvUnlimited).toBeLessThan(0);
  });

  it('the rate-limited NPV is calculateEconomics on the rate-limited profile (one more canonical run only where the limit binds)', () => {
    npvModule.calculateEconomics.mockClear();
    const res = runSpacingCases(SAMPLE);
    const binding = res.spacingResults.filter((r) => r.rateLimit.binding).length;
    expect(binding).toBe(12);
    expect(npvModule.calculateEconomics).toHaveBeenCalledTimes(res.spacingResults.length + binding);
    const r = res.spacingResults.find((x) => x.spacing === 160);
    const { metrics } = npvModule.calculateEconomics(spacingEconomicsInputs(160, res.parameters), { skipIrr: true });
    expect(r.npv).toBe(metrics.npv);
    const yearly = spacingEconomicsInputs(160, res.parameters).production.oil;
    const qd = deliverableRateStbd(160, res.parameters) * DAYS_PER_YEAR;
    // the first years are the plateau: 31 wells at qd
    expect(yearly[0]).toBeCloseTo(31 * qd, 3);
    expect(yearly[10]).toBeCloseTo(31 * qd, 3);
  });

  it('blank drainage inputs: the limit is on but not applied, and the case says so', () => {
    const res = runSpacingCases({ ...SAMPLE, permeability: '' });
    for (const r of res.spacingResults) {
      expect(r.rateLimit.computed).toBe(false);
      expect(r.rateLimit.binding).toBe(false);
      expect(r.npv).toBe(r.rateLimit.npvUnlimited);
    }
  });

  it('a deliverable rate below the economic limit produces nothing and keeps the capex', () => {
    const res = runSpacingCases({ ...SAMPLE, permeability: '0.05' });
    const r = res.spacingResults.find((x) => x.spacing === 160);
    expect(r.rateLimit.belowLimit).toBe(true);
    expect(r.producedPerWell).toBe(0);
    expect(r.npv).toBeCloseTo(-(31 * 5) / 1.1 ** 0.5, 6);
  });
});

describe('WS-U2-001 in the report (RL1, RL3, RL8, RL12)', () => {
  // the report kit reads back through poppler in the report test; here the model rows
  const { buildWellSpacingReportModel } = jest.requireActual('../reportModel');
  const { defaultInputs } = jest.requireActual('../model');
  it('before and after per case, both canonical, with the switch stated; the input row names the switch', () => {
    const inputs = defaultInputs('oilfield', { sample: true });
    const results = runSpacingCases(inputs.form);
    const m = buildWellSpacingReportModel(inputs, { results });
    const r100 = m.rateLimit.rows.find((r) => r[0] === '100');
    expect(r100.slice(1)).toEqual(['653.4', '294.2', '294.2', '7.51', '1,411.5', '1,381.5', '2,316.6', '1,892.6', '-424.0']);
    expect(m.rateLimit.rows.find((r) => r[0] === '40')[4]).toBe('none');
    expect(m.rateLimit.note).toMatch(/The rate limit is ON/);
    expect(m.identification.find(([k]) => k === 'Model')[1]).toMatch(/Rate limit on/);
    const row = m.inputs.rows.find((r) => r.key === 'rateLimit');
    expect(row.label).toBe('Rate limit [case]');
    expect(row.value).toMatch(/^On: each well capped/);
    expect(row.source).toMatch(/Assumed default on/);
    expect(m.inputs.rows.find((r) => r.key === 'permeability').label).toBe('Permeability [case, through the rate limit]');
    expect(m.limits.flags.join(' ')).toMatch(/the rate limit caps those cases \(a plateau of up to 16.1 years\)/);
    // the case table carries the rate-limited NPV
    expect(m.cases.rows.find((r) => r[0] === '100')[7]).toBe('1,892.6');
    // the NPV figure draws the other side where the limit binds
    expect(m.figures.find((f) => f.id === 'npv').panels[0].spec.series.map((s) => s.name)).toEqual(['NPV', 'NPV, unlimited decline', 'Capex']);
  });
  it('switched off: the case table is the unlimited decline and the flag says the limit is off', () => {
    const inputs = defaultInputs('oilfield', { sample: true });
    inputs.form.rateLimit = 'off';
    const results = runSpacingCases(inputs.form);
    const m = buildWellSpacingReportModel(inputs, { results });
    expect(m.cases.rows.find((r) => r[0] === '100')[7]).toBe('2,316.6');
    expect(m.rateLimit.note).toMatch(/The rate limit is OFF/);
    expect(m.limits.flags.join(' ')).toMatch(/the rate limit is off, so the economics of those cases assume a rate/);
    expect(m.inputs.rows.find((r) => r.key === 'rateLimit').source).toMatch(/Chosen by the user/);
  });
});
