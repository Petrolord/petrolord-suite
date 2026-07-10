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
  crossCorrelatePair,
  recommendInjection,
  computeHallPlots,
  buildWellSeries,
  computeChanDiagnostics,
  classifyChan,
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

  test('analytics are deterministic (no Math.random fabrication)', () => {
    // The former engine used Math.random() for pattern lags & recommendations.
    // Re-running must give byte-identical results.
    const again = analyzeWaterflood(sampleWaterfloodRows(), CONFIG);
    expect(again.pattern_lags).toEqual(result.pattern_lags);
    expect(again.recommendations).toEqual(result.recommendations);
    expect(again.hall_plots.map((h) => h.slope_ratio)).toEqual(result.hall_plots.map((h) => h.slope_ratio));
  });

  test('sample CSV round-trips through the parser back into the same analysis', () => {
    const fromCsv = analyzeWaterflood(parseWaterfloodCSV(sampleWaterfloodCSV()), CONFIG);
    expect(fromCsv.kpis.total_oil_bbl).toBeCloseTo(result.kpis.total_oil_bbl, 6);
    expect(fromCsv.vrr_series.vrr_cum[89]).toBeCloseTo(result.vrr_series.vrr_cum[89], 6);
  });
});

describe('P2 — pattern-response cross-correlation', () => {
  test('recovers a known injected lag from a detrended signal', () => {
    // Injector = ramp + ripple; producer = decline + the same ripple shifted +7 days.
    const N = 80;
    const period = 20;
    const inj = [];
    const prod = [];
    for (let t = 0; t < N; t++) {
      inj.push(500 + 4 * t + 40 * Math.sin((2 * Math.PI * t) / period));
      prod.push(900 - 3 * t + 25 * Math.sin((2 * Math.PI * (t - 7)) / period));
    }
    const r = crossCorrelatePair(inj, prod, { maxLagDays: 15, minOverlap: 20, minCorr: 0.3 });
    expect(r).not.toBeNull();
    expect(r.lag_days).toBeGreaterThanOrEqual(6);
    expect(r.lag_days).toBeLessThanOrEqual(8);
    expect(r.corr).toBeGreaterThan(0.8);
  });

  test('returns null when the producer signal is unrelated noise-free constant', () => {
    const inj = Array.from({ length: 60 }, (_, t) => 500 + 3 * t + 30 * Math.sin(t / 3));
    const prod = Array.from({ length: 60 }, () => 400); // constant -> no variance
    expect(crossCorrelatePair(inj, prod, { minOverlap: 20 })).toBeNull();
  });

  test('on the sample, the strongest pairs are the truly connected ones with correct lags', () => {
    const r = analyzeWaterflood(sampleWaterfloodRows(), CONFIG);
    const top = r.pattern_lags[0];
    expect(['INJ-1', 'INJ-2']).toContain(top.injector);
    const byPair = Object.fromEntries(r.pattern_lags.map((p) => [`${p.injector}|${p.producer}`, p]));
    expect(byPair['INJ-1|PROD-1'].lag_days).toBeGreaterThanOrEqual(9);
    expect(byPair['INJ-1|PROD-1'].lag_days).toBeLessThanOrEqual(11);
    expect(byPair['INJ-2|PROD-2'].lag_days).toBeGreaterThanOrEqual(5);
    expect(byPair['INJ-2|PROD-2'].lag_days).toBeLessThanOrEqual(7);
  });
});

describe('P2 — VRR-balanced injection recommendations', () => {
  test('scales injection toward the target VRR (no wall-clock dependence)', () => {
    const { rows } = cleanRows(sampleWaterfloodRows());
    const { wells, injectors } = classifyWells(rows);
    const wellIndex = Array.from(wells.values());
    // Recent field VRR on the sample is slightly above 1.0, so a target of 0.8
    // must recommend LOWER injection, and a target of 1.3 must recommend HIGHER.
    const down = recommendInjection(rows, wellIndex, injectors, { ...CONFIG, target_vrr: 0.8 });
    const up = recommendInjection(rows, wellIndex, injectors, { ...CONFIG, target_vrr: 1.3 });
    expect(down.recommendations.every((x) => x.delta_bpd < 0)).toBe(true);
    expect(up.recommendations.every((x) => x.delta_bpd > 0)).toBe(true);
    // Applying the suggested rates should move recent VRR onto target.
    expect(down.scale).toBeCloseTo(0.8 / down.currentVRR, 6);
  });
});

describe('P2 — Hall plot from measured pressure', () => {
  const { rows } = cleanRows(sampleWaterfloodRows());
  const { wells, injectors } = classifyWells(rows);
  const wellSeries = buildWellSeries(rows, Array.from(wells.values()));

  test('flags declining injectivity where p/q rises (INJ-1), not where steady (INJ-2)', () => {
    const hall = computeHallPlots(wellSeries, injectors, CONFIG);
    const flagged = hall.injectivity_alerts.map((a) => a.injector);
    expect(flagged).toContain('INJ-1');
    expect(flagged).not.toContain('INJ-2');
    const inj1 = hall.hall_plots.find((h) => h.injector === 'INJ-1');
    expect(inj1.slope_ratio).toBeGreaterThan(1.2);
  });

  test('Hall is withheld (capability off) when no pressure column is present', () => {
    const noPressure = sampleWaterfloodRows().map(({ whp_psi, ...rest }) => rest);
    const r = analyzeWaterflood(noPressure, CONFIG);
    expect(r.hall_plots).toHaveLength(0);
    expect(r.capabilities.hall.available).toBe(false);
    expect(r.capabilities.hall.reason).toMatch(/whp_psi/);
  });

  test('capabilities report pattern/recommendation availability', () => {
    const r = analyzeWaterflood(sampleWaterfloodRows(), CONFIG);
    expect(r.capabilities.pattern_lags.available).toBe(true);
    expect(r.capabilities.recommendations.available).toBe(true);
    expect(r.capabilities.hall.available).toBe(true);
  });
});

describe('P4 — Chan water-control diagnostics', () => {
  const EMPTY_WS = { series: new Map() };
  const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 24 * 3600 * 1000).toISOString().split('T')[0];

  // Build a field daily series where WOR follows a prescribed function of day.
  const fieldFromWor = (n, worOfT) => Array.from({ length: n }, (_, i) => {
    const oil = 1000;
    const wor = worOfT(i);
    return { date: day(i), oil_bpd: oil, water_bpd: Math.max(0, oil * wor) };
  });

  test('classifyChan thresholds', () => {
    expect(classifyChan(1.0).code).toBe('channeling');
    expect(classifyChan(0.2).code).toBe('transitional');
    expect(classifyChan(-0.5).code).toBe('coning');
    expect(classifyChan(null).code).toBe('indeterminate');
  });

  test('power-law WOR ~ t^2 (rising WOR′) reads as channeling', () => {
    const field = fieldFromWor(60, (t) => 0.001 * (t + 1) * (t + 1));
    const chan = computeChanDiagnostics(field, EMPTY_WS, [], CONFIG);
    expect(chan.available).toBe(true);
    expect(chan.field.lateSlope).toBeGreaterThan(0.4);
    expect(chan.field.classification.code).toBe('channeling');
  });

  test('plateauing WOR (declining WOR′) reads as coning/normal', () => {
    const field = fieldFromWor(60, (t) => 2 * (1 - Math.exp(-(t + 1) / 12)));
    const chan = computeChanDiagnostics(field, EMPTY_WS, [], CONFIG);
    expect(chan.field.lateSlope).toBeLessThanOrEqual(0.0);
    expect(chan.field.classification.code).toBe('coning');
  });

  test('WOR and its derivative are computed correctly on a known ramp', () => {
    const field = fieldFromWor(40, (t) => 0.05 * (t + 1)); // WOR linear -> WOR' ~ 0.05/day
    const chan = computeChanDiagnostics(field, EMPTY_WS, [], { ...CONFIG, chan_smooth: 1 });
    const mid = chan.field.points[20];
    expect(mid.wor).toBeCloseTo(0.05 * (20 + 1), 4); // no smoothing -> raw WOR
    expect(mid.worDeriv).toBeCloseTo(0.05, 3);
  });

  test('on the sample, Chan is available with a rising WOR and finite slope', () => {
    const r = analyzeWaterflood(sampleWaterfloodRows(), CONFIG);
    expect(r.capabilities.chan.available).toBe(true);
    const pts = r.chan.field.points;
    expect(pts[pts.length - 1].wor).toBeGreaterThan(pts[0].wor);
    expect(Number.isFinite(r.chan.field.lateSlope)).toBe(true);
    expect(r.chan.producers.map((p) => p.producer).sort()).toEqual(['PROD-1', 'PROD-2']);
  });

  test('withheld when there is no dual oil+water producing history', () => {
    const field = fieldFromWor(30, () => 0).map((d) => ({ ...d, water_bpd: 0 }));
    const chan = computeChanDiagnostics(field, EMPTY_WS, [], CONFIG);
    expect(chan.available).toBe(false);
  });
});
