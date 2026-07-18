/**
 * MB6 — forecast adapter + MBAL reconciliation helpers.
 * p/z numbers below are Pletcher SPE 75354 Tables 2/3 values (the same
 * dataset the engine's CASE 1 benchmark uses), so the gas reconciliation is
 * checked against book data rather than invented fixtures.
 */
import {
  ratesFromCumulative,
  pOverZAt,
  reconcileWithMbal,
  forecastBeyondHistory,
  OIL_RF_BANDS,
} from '../mbalForecast';
import { generateForecast } from '@/utils/declineCurve/dcaEngine';

describe('forecastBeyondHistory (re-anchored on the canonical dcaEngine)', () => {
  // Exponential: qi 1000 bbl/d, Di 0.001/day, anchored 2020-01-01, history
  // through 2021-01-01 (366 days, leap year).
  const fit = {
    parameters: { qi: 1000, Di: 0.001, b: 0, modelType: 'Exponential' },
    t0: '2020-01-01',
  };

  it('excludes the history window from remaining reserves', () => {
    const r = forecastBeyondHistory(
      fit,
      '2021-01-01',
      { economicLimit: 10, horizonYears: 30 },
      generateForecast,
    );
    expect(r).toBeTruthy();
    // Rate at history end: 1000·exp(-0.366) ≈ 693 bbl/d.
    expect(r.rateAtHistoryEnd).toBeGreaterThan(680);
    expect(r.rateAtHistoryEnd).toBeLessThan(700);
    expect(r.points[0] && new Date(r.points[0].date).getTime()).toBeGreaterThan(
      new Date('2021-01-01').getTime(),
    );
    // Analytic remaining: (q_end − q_limit)/Di ≈ (693 − 10)/0.001 ≈ 683,000 bbl
    // (daily-step summation lands within a percent).
    expect(r.remaining).toBeGreaterThan(0.97 * 683000);
    expect(r.remaining).toBeLessThan(1.03 * 683000);
    expect(r.reachedLimit).toBe(true);
    expect(r.timeToLimitYearsFromNow).toBeGreaterThan(0);
  });

  it('returns null for unusable fits', () => {
    expect(
      forecastBeyondHistory(
        { parameters: { qi: 0, Di: 0, b: 0, modelType: 'None' }, t0: '2020-01-01' },
        '2021-01-01',
        { economicLimit: 10 },
        generateForecast,
      ),
    ).toBeNull();
  });
});

describe('ratesFromCumulative', () => {
  const rows = [
    { observation_date: '2020-01-01', cum_oil_stb: 0 },
    { observation_date: '2020-01-11', cum_oil_stb: 1000 },
    { observation_date: '2020-01-31', cum_oil_stb: 3000 },
    { observation_date: '2020-02-10', cum_oil_stb: 3500 },
  ];

  it('builds midpoint-dated daily rates from cumulative volumes', () => {
    const rates = ratesFromCumulative(rows, 'oil');
    expect(rates).toHaveLength(3);
    expect(rates[0]).toEqual({ date: '2020-01-06', rate: 100 });
    expect(rates[1].rate).toBe(100);
    expect(rates[2].rate).toBe(50);
  });

  it('returns null for undated rows or too little history', () => {
    expect(ratesFromCumulative([{ cum_oil_stb: 0 }, { cum_oil_stb: 5 }], 'oil')).toBeNull();
    expect(ratesFromCumulative(rows.slice(0, 2), 'oil')).toBeNull();
  });

  it('skips negative increments (data glitches) instead of emitting negative rates', () => {
    const glitched = [
      ...rows,
      { observation_date: '2020-02-20', cum_oil_stb: 3400 },
      { observation_date: '2020-03-01', cum_oil_stb: 3900 },
    ];
    const rates = ratesFromCumulative(glitched, 'oil');
    expect(rates.every((r) => r.rate >= 0)).toBe(true);
    expect(rates).toHaveLength(4);
  });

  it('reads gas cumulatives when phase is gas', () => {
    const gasRows = rows.map((r, i) => ({
      observation_date: r.observation_date,
      cum_gas_scf: i * 1e6,
    }));
    const rates = ratesFromCumulative(gasRows, 'gas');
    expect(rates[0].rate).toBeCloseTo(1e6 / 10, 6);
  });
});

// Pletcher Tables 2/3: pressure and p/z (p/z computed as p divided by z).
const PLETCHER_PLOT = {
  pressure: [6411, 5947, 5509, 5093, 4697, 4319, 3957, 3610, 3276, 2953, 2638],
  p_over_z: [
    6411 / 1.1192, 5947 / 1.0890, 5509 / 1.0618, 5093 / 1.0374, 4697 / 1.0156,
    4319 / 0.9966, 3957 / 0.9801, 3610 / 0.9663, 3276 / 0.9551, 2953 / 0.9467,
    2638 / 0.9409,
  ],
};

describe('pOverZAt', () => {
  it('returns exact values at observed pressures and interpolates between', () => {
    expect(pOverZAt(PLETCHER_PLOT, 6411)).toBeCloseTo(6411 / 1.1192, 6);
    expect(pOverZAt(PLETCHER_PLOT, 2638)).toBeCloseTo(2638 / 0.9409, 6);
    const mid = pOverZAt(PLETCHER_PLOT, (5947 + 5509) / 2);
    expect(mid).toBeGreaterThan(5509 / 1.0618);
    expect(mid).toBeLessThan(5947 / 1.089);
  });

  it('extrapolates below the observed range from the bottom pair', () => {
    const v = pOverZAt(PLETCHER_PLOT, 1000);
    // Bottom-pair slope is about 1.0 (p/z per psi) on this dataset.
    expect(v).toBeGreaterThan(1000);
    expect(v).toBeLessThan(1400);
  });

  it('returns null without a p/z series (oil runs)', () => {
    expect(pOverZAt({ pressure: [1, 2] }, 500)).toBeNull();
  });
});

describe('reconcileWithMbal gas p/z path', () => {
  const base = {
    fluidSystem: 'gas',
    inPlace: 100.8e9,
    producedToDate: 54.75e9,
    dcaRemaining: 20e9,
    driveMechanism: 'gas_expansion_drive',
    plotData: PLETCHER_PLOT,
    initialPressure: 6411,
  };

  it('computes the p/z recoverable at abandonment and the remaining volume', () => {
    const r = reconcileWithMbal({ ...base, abandonmentPressure: 1000 });
    expect(r.kind).toBe('gas_pz');
    // (p/z)_ab about 1160 of (p/z)_i 5728: about 80% recovery.
    expect(r.mbalRecoverable / base.inPlace).toBeGreaterThan(0.75);
    expect(r.mbalRecoverable / base.inPlace).toBeLessThan(0.85);
    expect(r.mbalRemaining).toBeCloseTo(r.mbalRecoverable - 54.75e9, 0);
    expect(r.deltaFraction).toBeCloseTo((20e9 - r.mbalRemaining) / r.mbalRemaining, 8);
    expect(r.note).toBeNull();
  });

  it('flags water-drive cases (straight p/z is a bound there)', () => {
    const r = reconcileWithMbal({
      ...base,
      driveMechanism: 'moderate_water_drive',
      abandonmentPressure: 1000,
    });
    expect(r.note).toMatch(/water drive/i);
  });

  it('asks for an abandonment pressure when missing', () => {
    expect(reconcileWithMbal(base).kind).toBe('unavailable');
  });
});

describe('reconcileWithMbal oil implied-RF path', () => {
  it('compares implied RF against the drive-mechanism band', () => {
    // Dake 9.2 numbers: N 312 MM, produced 74.55 MM by year 10.
    const low = reconcileWithMbal({
      fluidSystem: 'oil',
      inPlace: 312e6,
      producedToDate: 74.55e6,
      dcaRemaining: 30e6,
      driveMechanism: 'strong_water_drive',
    });
    expect(low.kind).toBe('oil_rf');
    expect(low.impliedRF).toBeCloseTo((74.55e6 + 30e6) / 312e6, 8);
    expect(low.band).toBe(OIL_RF_BANDS.strong_water_drive);
    expect(low.withinBand).toBe(false); // 33.5% is under the 35% floor

    const ok = reconcileWithMbal({
      fluidSystem: 'oil',
      inPlace: 312e6,
      producedToDate: 74.55e6,
      dcaRemaining: 60e6,
      driveMechanism: 'strong_water_drive',
    });
    expect(ok.withinBand).toBe(true);
  });

  it('degrades gracefully for unknown mechanisms and missing inputs', () => {
    const r = reconcileWithMbal({
      fluidSystem: 'oil',
      inPlace: 100e6,
      producedToDate: 10e6,
      dcaRemaining: 5e6,
      driveMechanism: 'exotic_unknown',
    });
    expect(r.band).toBeNull();
    expect(r.withinBand).toBeNull();
    expect(reconcileWithMbal({ fluidSystem: 'oil', inPlace: 0, dcaRemaining: 5 }).kind).toBe('unavailable');
  });
});
