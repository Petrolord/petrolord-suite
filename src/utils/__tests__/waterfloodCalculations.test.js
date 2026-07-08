/**
 * Physics / correctness checklist for the client-side Waterflood engine.
 * These are physical assertions and unification checks, not golden snapshots.
 */
import {
  parseWaterfloodCSV,
  cleanRows,
  classifyWells,
  aggregateDaily,
  computeFieldVRR,
  computeKPIs,
  analyzeWaterflood,
  sampleWaterfloodRows,
  sampleWaterfloodCSV,
} from '../waterfloodCalculations';
import { computePeriodVoidage } from '../vrrCalculations';

const CONFIG = { bo: 1.2, bw: 1.0, bg: 0.9, rs: 500, smooth_window_days: 5, vrr_window_days: 30, target_vrr: 1.0 };

describe('CSV parsing + cleaning', () => {
  test('parses quoted fields, blank cells and trailing commas robustly', () => {
    const csv = 'date,well,oil_bbl,water_bbl,gas_mcf,inj_bbl\n2024-01-01,"P 1",50,20,10,\n2024-01-01,I1,,,,1000\n';
    const rows = parseWaterfloodCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].well).toBe('P 1');
    expect(rows[1].inj_bbl).toBe('1000');
  });

  test('de-duplicates (date, well), zeroes negatives, drops invalid rows', () => {
    const raw = [
      { date: '2024-01-01', well: 'P1', oil_bbl: 50, water_bbl: 20 },
      { date: '2024-01-01', well: 'P1', oil_bbl: 999, water_bbl: 999 }, // duplicate -> dropped
      { date: '2024-01-01', well: 'P2', oil_bbl: -5, water_bbl: 10 }, // negative oil -> zeroed
      { date: 'not-a-date', well: 'P3', oil_bbl: 1 }, // invalid -> dropped
      { date: '2024-01-02', well: '', oil_bbl: 1 }, // no well -> dropped
    ];
    const { rows, dataQuality } = cleanRows(raw);
    expect(dataQuality.duplicates_removed).toBe(1);
    expect(dataQuality.negatives_zeroed).toBe(1);
    expect(rows).toHaveLength(2);
    const p2 = rows.find((r) => r.well === 'P2');
    expect(p2.oil).toBe(0);
  });

  test('date-range config excludes out-of-range rows', () => {
    const raw = [
      { date: '2023-12-31', well: 'P1', oil_bbl: 10 },
      { date: '2024-01-05', well: 'P1', oil_bbl: 10 },
      { date: '2024-02-01', well: 'P1', oil_bbl: 10 },
    ];
    const { rows } = cleanRows(raw, { start_date: '2024-01-01', end_date: '2024-01-31' });
    expect(rows).toHaveLength(1);
    expect(rows[0].dateKey).toBe('2024-01-05');
  });
});

describe('well classification', () => {
  test('classifies injectors vs producers on the sample (regression: injectors were empty)', () => {
    const { rows } = cleanRows(sampleWaterfloodRows());
    const { injectors, producers } = classifyWells(rows);
    expect(injectors.sort()).toEqual(['INJ-1', 'INJ-2']);
    expect(producers.sort()).toEqual(['PROD-1', 'PROD-2']);
  });

  test('injection status wins over production for a converted well', () => {
    const rows = [
      { dateKey: '2024-01-01', well: 'W1', oil: 10, water: 5, gas: 0, inj: 0 },
      { dateKey: '2024-02-01', well: 'W1', oil: 0, water: 0, gas: 0, inj: 500 },
    ];
    const { injectors, producers } = classifyWells(rows);
    expect(injectors).toEqual(['W1']);
    expect(producers).toEqual([]);
  });
});

describe('VRR physics (reservoir barrels) + unification with vrrCalculations', () => {
  test('daily field VRR equals the shared computePeriodVoidage ratio', () => {
    const daily = [{ date: '2024-01-01', oil_bpd: 100, water_bpd: 50, gas_mscf: 80, inj_bpd: 300 }];
    const vrr = computeFieldVRR(daily, CONFIG);
    const shared = computePeriodVoidage(
      { Np: 100, Wp: 50, Gp: 80, Wi: 300, Gi: 0 },
      { Bo: 1.2, Bw: 1.0, Bg: 0.9, Rs: 500 }
    );
    const expected = shared.injectedVoidage / shared.producedVoidage;
    expect(vrr.vrr_daily[0]).toBeCloseTo(expected, 9);
    // Injected voidage = Wi*Bw = 300; produced = 100*1.2 + 50*1.0 + freeGas*0.9.
    expect(vrr.injected_voidage_rb[0]).toBeCloseTo(300, 6);
  });

  test('only FREE gas adds voidage: solution gas (Rs*Np) is excluded', () => {
    const daily = [{ date: '2024-01-01', oil_bpd: 100, water_bpd: 0, gas_mscf: 40, inj_bpd: 0 }];
    // Rs*Np/1000 = 500*100/1000 = 50 Mscf solution gas > 40 produced -> no free gas.
    const withRs = computeFieldVRR(daily, { ...CONFIG });
    const noRs = computeFieldVRR(daily, { ...CONFIG, rs: 0 });
    expect(withRs.produced_voidage_rb[0]).toBeCloseTo(100 * 1.2, 6); // liquid only
    expect(noRs.produced_voidage_rb[0]).toBeGreaterThan(withRs.produced_voidage_rb[0]); // all gas free
  });

  test('Bg=0 collapses to liquid-only voidage (graceful default)', () => {
    const daily = [{ date: '2024-01-01', oil_bpd: 100, water_bpd: 20, gas_mscf: 500, inj_bpd: 0 }];
    const vrr = computeFieldVRR(daily, { bo: 1.25, bw: 1.02, bg: 0, rs: 0 });
    expect(vrr.produced_voidage_rb[0]).toBeCloseTo(100 * 1.25 + 20 * 1.02, 6);
  });

  test('cumulative VRR matches ratio of cumulative injected/produced voidage', () => {
    const daily = [
      { date: '2024-01-01', oil_bpd: 100, water_bpd: 10, gas_mscf: 0, inj_bpd: 80 },
      { date: '2024-01-02', oil_bpd: 90, water_bpd: 20, gas_mscf: 0, inj_bpd: 160 },
    ];
    const vrr = computeFieldVRR(daily, { bo: 1.2, bw: 1.0, bg: 0, rs: 0 });
    const prod = 100 * 1.2 + 10 + (90 * 1.2 + 20);
    const inj = 80 + 160;
    expect(vrr.vrr_cum[vrr.vrr_cum.length - 1]).toBeCloseTo(inj / prod, 9);
  });
});

describe('end-to-end analysis on the sample', () => {
  const result = analyzeWaterflood(sampleWaterfloodRows(), CONFIG);

  test('returns the panel-facing shape', () => {
    expect(result).toHaveProperty('data_quality');
    expect(result).toHaveProperty('daily_series.wc_pct_s');
    expect(result).toHaveProperty('vrr_series.vrr_rolling');
    expect(result).toHaveProperty('kpis.vrr_avg');
    expect(result.daily_series.date).toHaveLength(90);
  });

  test('KPIs are physical and finite', () => {
    const k = result.kpis;
    expect(k.total_oil_bbl).toBeGreaterThan(0);
    expect(k.total_injected_bbl).toBeGreaterThan(0);
    expect(k.avg_water_cut_pct).toBeGreaterThan(0);
    expect(k.avg_water_cut_pct).toBeLessThanOrEqual(100);
    expect(Number.isFinite(k.vrr_avg)).toBe(true);
    expect(Number.isFinite(k.vrr_rolling)).toBe(true);
  });

  test('sample is designed so water cut rises and injection ramps up', () => {
    const wc = result.daily_series.wc_pct;
    expect(wc[wc.length - 1]).toBeGreaterThan(wc[0]);
    const inj = result.daily_series.inj_bpd;
    expect(inj[inj.length - 1]).toBeGreaterThan(inj[0]);
  });

  test('no fabricated analytics leak into the result', () => {
    // The engine must not emit pattern_lags / recommendations / hall_plots — these
    // were the Math.random()/placeholder-pressure outputs, now gated in the UI.
    expect(result).not.toHaveProperty('pattern_lags');
    expect(result).not.toHaveProperty('recommendations');
    expect(result).not.toHaveProperty('hall_plots');
  });

  test('sample CSV round-trips through the parser back into the same analysis', () => {
    const fromCsv = analyzeWaterflood(parseWaterfloodCSV(sampleWaterfloodCSV()), CONFIG);
    expect(fromCsv.kpis.total_oil_bbl).toBeCloseTo(result.kpis.total_oil_bbl, 6);
    expect(fromCsv.vrr_series.vrr_cum[89]).toBeCloseTo(result.vrr_series.vrr_cum[89], 6);
  });
});
