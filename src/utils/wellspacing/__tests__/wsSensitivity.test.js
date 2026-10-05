/**
 * WS-U2-007: the sensitivity tornado through the canonical sweep
 * (runSensitivityAnalysis of the screening engine) on each case's own
 * calculateEconomics inputs; no NPV maths in the app. Gates: the base of
 * every case is the case table's NPV (one engine, two doors); the sweep is
 * the engine's on the case arrays; with only royalty on revenue, NPV is
 * linear in the oil price, so the up and down swings of price are equal
 * and opposite (to rounding) and match a direct calculateEconomics run.
 * Negative control: a sweep run on another spacing's arrays misses the base.
 */
import { calculateEconomics, runSensitivityAnalysis } from '@/utils/npvCalculations';
import { runSpacingCases, spacingEconomicsInputs } from '@/utils/wellSpacingCalculations';
import { spacingSensitivities, caseSensitivity, tornadoCaseOf } from '../sensitivity';
import { buildWellSpacingReportModel } from '../reportModel';
import { defaultInputs, SAMPLE_FORM } from '../model';

const SAMPLE = { ...SAMPLE_FORM };

describe('WS-U2-007: the tornado per case', () => {
  it('the base is the case NPV; the bars are the canonical sweep of the case arrays', () => {
    const res = runSpacingCases(SAMPLE);
    const all = spacingSensitivities(res);
    expect(all.length).toBe(15);
    for (const s of all) {
      const row = res.spacingResults.find((r) => r.spacing === s.spacing);
      expect(s.base).toBeCloseTo(row.npv, 9);
    }
    const s100 = caseSensitivity(100, res.parameters);
    const canon = runSensitivityAnalysis(spacingEconomicsInputs(100, res.parameters));
    expect(s100.bars.find((b) => b.name === 'Capex').high).toBe(canon.find((c) => c.name === 'CAPEX').highParamNPV);
    // the oil price up 30 percent, run directly on the engine
    const e = spacingEconomicsInputs(100, res.parameters);
    const up = calculateEconomics({ ...e, price: { ...e.price, oil: e.price.oil.map((v) => v * 1.3) } }).metrics.npv;
    const price = s100.bars.find((b) => b.name === 'Oil price');
    expect(price.high).toBeCloseTo(up, 9);
    expect((price.high - s100.base) + (price.low - s100.base)).toBeCloseTo(0, 6);
    // ordered by swing
    for (let i = 1; i < s100.bars.length; i += 1) expect(s100.bars[i].swing).toBeLessThanOrEqual(s100.bars[i - 1].swing);
  });

  it('NEGATIVE CONTROL: the sweep of another spacing\'s arrays misses this case\'s base', () => {
    const res = runSpacingCases(SAMPLE);
    const wrong = runSensitivityAnalysis(spacingEconomicsInputs(80, res.parameters))[0].baseNPV;
    expect(Math.abs(wrong - res.spacingResults.find((r) => r.spacing === 100).npv)).toBeGreaterThan(1);
  });

  it('the figure draws the case chosen to send, else the middle case; the report prints every case', () => {
    const res = runSpacingCases(SAMPLE);
    expect(tornadoCaseOf(res, '80')).toEqual({ spacing: 80, why: 'the case chosen to send' });
    expect(tornadoCaseOf(res, '').spacing).toBe(90);
    const inputs = defaultInputs('oilfield', { sample: true });
    const m = buildWellSpacingReportModel(inputs, { results: runSpacingCases(inputs.form) });
    expect(m.sensitivity.rows.length).toBe(15);
    expect(m.sensitivity.head).toContain('Oil price -30% (US$ MM)');
    const fig = m.figures.find((f) => f.id === 'tornado');
    expect(fig.title).toMatch(/90 acres\/well/);
    expect(fig.panels[0].spec.series.map((s) => s.name)).toEqual(['Input 30 percent down', 'Input 30 percent up']);
  });
});
