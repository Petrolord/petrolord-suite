/**
 * The four Economics app defects found by the Ekene demo kit economics build
 * (2026-09-23). The fifth piece, EPE breakeven with the economic limit on,
 * is the engine fix (EPE 3.11.0, engines #244) and is gated by the vendored
 * engine suite.
 */
import {
  payloadEscalators, followsInflation, simpleEscalators, ESCALATOR_KEYS,
} from '@/pages/apps/epe/epeEscalation';
import { epeIrrReason } from '@/pages/apps/epe/epeIrrReason';
import { irrText } from '@/components/fiscaldesigner/fiscalResultText';
import { irrReason } from '@/utils/fdp/planEconomics';
import { yearOf, aggregateAnnualProduction, DAYS_PER_MONTH } from '@/utils/breakeven/productionCsv';
import { computeBreakevenOilPrice } from '../../../../../packages/engines/engines/economics/cashflow.ts';

describe('EPE Run Console: simple mode sends what the screen says', () => {
  const config = {
    inflation_rate_pct: 0,
    oil_price_escalator_pct: 3, gas_price_escalator_pct: 3, condensate_price_escalator_pct: 3,
    opex_escalator_pct: 3, capex_escalator_pct: 0,
  };

  test('simple mode: inflation for the four streams, capex nominal, whatever the stream fields hold', () => {
    expect(payloadEscalators(config, false)).toEqual({
      oil_price_escalator_pct: 0, gas_price_escalator_pct: 0, condensate_price_escalator_pct: 0,
      opex_escalator_pct: 0, capex_escalator_pct: 0,
    });
    expect(payloadEscalators({ ...config, inflation_rate_pct: 2.5 }, false).opex_escalator_pct).toBe(2.5);
  });

  test('negative control: per-stream mode sends the fields as set', () => {
    expect(payloadEscalators({ ...config, capex_escalator_pct: 1 }, true)).toEqual({
      oil_price_escalator_pct: 3, gas_price_escalator_pct: 3, condensate_price_escalator_pct: 3,
      opex_escalator_pct: 3, capex_escalator_pct: 1,
    });
  });

  test('a saved configuration opens per stream only when its escalators differ from its inflation', () => {
    expect(followsInflation({ inflation_rate_pct: 3, ...simpleEscalators(3) })).toBe(true);
    expect(followsInflation(config)).toBe(false);                     // 3 percent streams, 0 inflation
    expect(followsInflation({ ...simpleEscalators(2), inflation_rate_pct: 2, capex_escalator_pct: 1 })).toBe(false);
    // a partial assumption set is judged together with the current form
    expect(followsInflation({ inflation_rate_pct: 3 }, { ...simpleEscalators(3) })).toBe(true);
    expect(ESCALATOR_KEYS).toHaveLength(5);
  });

  test('the console builds its payload through payloadEscalators', () => {
    // eslint-disable-next-line global-require
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'EpeRunConsole.jsx'), 'utf8');
    expect(src).toContain('...payloadEscalators(config, showAdvancedEscalation)');
    expect(src).not.toMatch(/oil_price_escalator_pct: config\.oil_price_escalator_pct/);
  });
});

describe('IRR above the band: a return only when the project makes money', () => {
  test('EPE: negative NPV says the high root is not a return; positive keeps the old reading', () => {
    expect(epeIrrReason({ irr: null, irr_status: 'above-clamp', npv: -2.5e6 })).toMatch(/loses value at the discount rate, so that rate is not a return/);
    expect(epeIrrReason({ irr: null, irr_status: 'above-clamp', npv: 4e6 })).toMatch(/the return is above 1000 percent/);
  });

  test('Fiscal Regime Designer and the FDP planner say the same', () => {
    expect(irrText({ irr: null, irrStatus: 'above-clamp', npv: -1 }).reason).toMatch(/contractor loses value/);
    expect(irrText({ irr: null, irrStatus: 'above-clamp', npv: 1 }).reason).toMatch(/beyond the band searched/);
    expect(irrReason({ irr: null, irrStatus: 'above-clamp', npv: -1 })).toMatch(/plan loses value/);
    expect(irrReason({ irr: null, irrStatus: 'above-clamp', npv: 1 })).toMatch(/above 1000 percent, beyond the band/);
  });
});

describe('Probabilistic Breakeven: the year comes from the date text', () => {
  test('negative control: west of UTC the old parse put the first of January in the previous year', () => {
    // eslint-disable-next-line global-require
    const { execFileSync } = require('child_process');
    const out = execFileSync(process.execPath, ['-e', "process.stdout.write(String(new Date('2025-01-01').getFullYear()))"],
      { env: { ...process.env, TZ: 'America/Los_Angeles' } }).toString();
    expect(out).toBe('2024');
  });

  test('ISO and slash dates never go through Date, so the time zone cannot move them', () => {
    const RealDate = global.Date;
    global.Date = function TrapDate() { throw new Error('Date used'); };
    try {
      expect(yearOf('2025-01-01')).toBe(2025);
      expect(yearOf('2025/01')).toBe(2025);
      expect(yearOf('01/01/2025')).toBe(2025);
      expect(yearOf('15.01.2025')).toBe(2025);
      expect(yearOf(2025)).toBe(2025);
    } finally {
      global.Date = RealDate;
    }
    expect(yearOf('not a date')).toBeNaN();
  });

  test('months aggregate into their own years at the daily rate times the month length', () => {
    const out = aggregateAnnualProduction([
      { date: '2024-12-01', oil_rate_bpd: 100 },
      { date: '2025-01-01', oil_rate_bpd: 200 },
      { date: '2025-02-01', oil_rate_bpd: 300 },
    ]);
    expect(out).toEqual([
      { year: 2024, oil_production_bbl: 100 * DAYS_PER_MONTH },
      { year: 2025, oil_production_bbl: 500 * DAYS_PER_MONTH },
    ]);
  });

  test('refuses a file without the columns, as before', () => {
    expect(() => aggregateAnnualProduction([{ when: '2025-01-01', oil: 1 }])).toThrow(/'date' and 'oil_rate_bpd'/);
    expect(() => aggregateAnnualProduction([])).toThrow(/empty/);
  });
});

describe('EPE breakeven with the economic limit on (vendored engine 3.11.0)', () => {
  test('answers where it used to return null', () => {
    const cfg = {
      fiscal_regime: 'JV', base_year: 2030, oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
      discount_rate_pct: 10, inflation_rate_pct: 0, oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
      condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0, present_value_basis: 'nominal',
      jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50, apply_economic_limit: true,
    };
    const prodRows = [2028, 2029, 2030, 2031, 2032].map((year, i) => ({ year, well1_oil_bbl: [200e3, 180e3, 160e3, 900e3, 700e3][i] }));
    const be = computeBreakevenOilPrice({
      cfg, prodRows, capexRows: [{ year: 2030, amount_usd: 40e6 }],
      opexRows: [2030, 2031, 2032].map((year) => ({ year, total_opex_usd: 3e6 })),
    });
    expect(be).toBeCloseTo(48.416, 2);
  });
});
