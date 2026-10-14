/**
 * The tornado readout (video programme, 2026-10-14). Rows shaped as the
 * batch engine writes them (epe-cash-flow-engine-batch sweepResults).
 */
import { usd3, npvPair, formatInput, niceTicks, tornadoTable, tornadoSentence } from '../epeTornado';

const BASE = 1980235.48;
const ROWS = [
  { variable: '__production_multiplier', variable_label: 'Production', base_value: 724000, low_value: 579200, high_value: 868800, low_factor: 0.8, high_factor: 1.2, base_npv: BASE, low_npv: BASE - 3017000, high_npv: BASE + 3010000, delta_low_npv: -3017000, delta_high_npv: 3010000 },
  { variable: 'oil_price_usd_bbl', variable_label: 'Oil Price', base_value: 75, low_value: 60, high_value: 90, low_factor: 0.8, high_factor: 1.2, base_npv: BASE, delta_low_npv: -2730000, delta_high_npv: 2560000 },
  { variable: '__capex_multiplier', variable_label: 'CAPEX', base_value: 12400000, low_value: 9920000, high_value: 14880000, low_factor: 0.8, high_factor: 1.2, base_npv: BASE, low_npv: BASE + 1170000, high_npv: BASE - 1180000, delta_low_npv: 1170000, delta_high_npv: -1180000 },
  { variable: 'schedule_shift_years', variable_label: 'First Oil Delay (+1 yr)', base_value: 0, low_value: 0, high_value: 1, low_factor: 1, high_factor: 1, base_npv: BASE, low_npv: BASE, high_npv: BASE + 300000, delta_low_npv: 0, delta_high_npv: 300000 },
  { variable: 'pia_cit_rate_pct', variable_label: 'CIT Rate', base_value: 30, low_value: 24, high_value: 36, low_factor: 0.8, high_factor: 1.2, base_npv: BASE, delta_low_npv: 1050000, delta_high_npv: -1050000 },
];

describe('epeTornado', () => {
  it('money to three significant figures like the headline', () => {
    expect(usd3(BASE)).toBe('$1.98M');
    expect(usd3(-459223.89)).toBe('-$459K');
    expect(usd3(0.2)).toBe('$0');
    expect(usd3(undefined)).toBe('n/a');
  });
  it('NPV at low and high: the engine values, or base plus delta for older rows', () => {
    expect(npvPair(ROWS[0], BASE)).toEqual({ low: BASE - 3017000, high: BASE + 3010000, swing: 6027000 });
    const p = npvPair(ROWS[1], BASE);
    expect(p.low).toBeCloseTo(BASE - 2730000, 6);
    expect(p.high).toBeCloseTo(BASE + 2560000, 6);
    expect(p.swing).toBeCloseTo(5290000, 6);
  });
  it('inputs in each variable unit', () => {
    expect(formatInput(ROWS[1], 'low')).toBe('$60.0/bbl');
    expect(formatInput(ROWS[1], 'high')).toBe('$90.0/bbl');
    expect(formatInput(ROWS[0], 'low')).toBe('0.579 MMboe (x0.80)');
    expect(formatInput(ROWS[2], 'high')).toBe('$14.9M (x1.20)');
    expect(formatInput(ROWS[3], 'low')).toBe('on time');
    expect(formatInput(ROWS[3], 'high')).toBe('+1 yr');
    expect(formatInput(ROWS[4], 'low')).toBe('24.0%');
    expect(formatInput({ variable: 'gas_price_usd_mscf', low_value: 3.6 }, 'low')).toBe('$3.60/Mscf');
    expect(formatInput({ variable: 'mystery', low_value: 12345 }, 'low')).toBe('12.3K');
  });
  it('ticks are symmetric and evenly spaced (negative control: the padded domain was not)', () => {
    const { ticks, domain, step } = niceTicks(3017000);
    expect(step).toBe(1000000);
    expect(ticks).toEqual([-4e6, -3e6, -2e6, -1e6, 0, 1e6, 2e6, 3e6, 4e6]);
    expect(domain).toEqual([-4e6, 4e6]);
    const diffs = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(new Set(diffs).size).toBe(1);
    expect(niceTicks(0).ticks).toContain(0);
  });
  it('table keeps the engine order and the sentence names the two biggest drivers', () => {
    const t = tornadoTable(ROWS, BASE);
    expect(t.map((r) => r.label)).toEqual(['Production', 'Oil Price', 'CAPEX', 'First Oil Delay (+1 yr)', 'CIT Rate']);
    expect(usd3(t[2].npvLow)).toBe('$3.15M');
    expect(tornadoSentence(ROWS, BASE)).toBe('Production and Oil Price move NPV the most: Production from -$1.04M to $4.99M, Oil Price from -$750K to $4.54M.');
    expect(tornadoSentence([], BASE)).toBeNull();
  });
});
