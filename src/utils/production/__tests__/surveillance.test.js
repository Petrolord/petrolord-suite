// Gates for the P2 surveillance analytics (utils/production/surveillance).
// Fixtures are hand-built ledgers with known answers; the decline gate
// checks the canonical Arps engine round-trips a synthetic exponential.
import {
  derivePoint, buildWellSeries, buildFieldSeries, seriesCadenceDays,
  movingAverage, decimate, detectExceptions, DEFAULT_SURVEILLANCE_SETTINGS,
  summarizeDeferments, computeKpis, rateSeriesForFit, fitWellDecline,
  annualEffectiveDecline,
} from '../surveillance';

const P1 = { id: 'w1', name: 'P-1', well_type: 'producer' };
const P2 = { id: 'w2', name: 'P-2', well_type: 'producer' };
const I1 = { id: 'w3', name: 'I-1', well_type: 'injector' };

const iso = (dayIndex) => {
  const d = new Date(Date.UTC(2025, 0, 1) + dayIndex * 86400000);
  return d.toISOString().slice(0, 10);
};

const row = (well, date, v = {}) => ({
  prod_date: date,
  oil_stb: v.oil ?? 0,
  water_stb: v.water ?? 0,
  gas_mscf: v.gas ?? 0,
  winj_stb: v.winj ?? 0,
  ginj_mscf: v.ginj ?? 0,
  hours_on: v.hours ?? null,
  well,
});

// Daily ledger: `days` entries ending at iso(endIdx), value from fn(i).
const dailyRows = (well, endIdx, days, fn) => {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const idx = endIdx - days + 1 + i;
    out.push(row(well, iso(idx), fn(idx, i)));
  }
  return out;
};

describe('derivePoint', () => {
  it('derives watercut, GOR and liquid', () => {
    const p = derivePoint(row(P1, iso(0), { oil: 800, water: 200, gas: 400 }));
    expect(p.liquid).toBe(1000);
    expect(p.watercut).toBeCloseTo(0.2);
    expect(p.gor).toBeCloseTo(500); // 400 Mscf * 1000 / 800 stb
  });

  it('producing-day rates scale by hours on', () => {
    const p = derivePoint(row(P1, iso(0), { oil: 500, hours: 12 }));
    expect(p.oilPd).toBeCloseTo(1000);
  });

  it('zero hours means shut in: producing-day rate is null, not Infinity', () => {
    const p = derivePoint(row(P1, iso(0), { oil: 0, hours: 0 }));
    expect(p.oilPd).toBeNull();
  });

  it('missing hours falls back to the calendar-day volume', () => {
    const p = derivePoint(row(P1, iso(0), { oil: 500 }));
    expect(p.oilPd).toBe(500);
  });

  it('null ratios when the denominators are zero', () => {
    const p = derivePoint(row(P1, iso(0), { gas: 100 }));
    expect(p.watercut).toBeNull();
    expect(p.gor).toBeNull();
  });
});

describe('buildWellSeries / buildFieldSeries', () => {
  const rows = [
    row(P2, iso(1), { oil: 300 }),
    row(P1, iso(1), { oil: 900, water: 100, gas: 450 }),
    row(P1, iso(0), { oil: 1000, water: 100, gas: 500 }),
    row(I1, iso(1), { winj: 2000, hours: 24 }),
  ];

  it('groups by well, name-sorted, dates ascending', () => {
    const series = buildWellSeries(rows);
    expect(series.map((s) => s.well.name)).toEqual(['I-1', 'P-1', 'P-2']);
    const p1 = series.find((s) => s.well.id === 'w1');
    expect(p1.points.map((p) => p.date)).toEqual([iso(0), iso(1)]);
  });

  it('field series sums streams per date with derived ratios', () => {
    const field = buildFieldSeries(rows);
    expect(field).toHaveLength(2);
    const d1 = field[1];
    expect(d1.date).toBe(iso(1));
    expect(d1.oil).toBe(1200);
    expect(d1.winj).toBe(2000);
    expect(d1.watercut).toBeCloseTo(100 / 1300);
    expect(d1.gor).toBeCloseTo((450 * 1000) / 1200);
  });

  it('wellsOn counts wells with volume, excluding zero-hour rows', () => {
    const field = buildFieldSeries([
      row(P1, iso(0), { oil: 500, hours: 24 }),
      row(P2, iso(0), { oil: 0, hours: 0 }),
      row(I1, iso(0), { winj: 1000 }), // injection only: not "producing"
    ]);
    expect(field[0].wellsOn).toBe(1);
  });
});

describe('cadence, moving average, decimation', () => {
  it('cadence: daily 1, monthly ~30', () => {
    const daily = dailyRows(P1, 9, 10, () => ({ oil: 100 }));
    expect(seriesCadenceDays(buildWellSeries(daily)[0].points)).toBe(1);
    const monthly = ['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01']
      .map((d) => row(P1, d, { oil: 100 }));
    expect(seriesCadenceDays(buildWellSeries(monthly)[0].points)).toBeGreaterThanOrEqual(28);
  });

  it('moving average is a trailing date window', () => {
    const pts = buildWellSeries(dailyRows(P1, 9, 10, (idx) => ({ oil: idx < 5 ? 100 : 200 })))[0].points;
    const ma = movingAverage(pts, 'oil', 5);
    expect(ma[4]).toBeCloseTo(100);
    expect(ma[9]).toBeCloseTo(200);
    expect(ma[6]).toBeCloseTo((100 * 3 + 200 * 2) / 5); // days 2-6
  });

  it('decimate keeps short series intact and always keeps the last point', () => {
    const pts = buildWellSeries(dailyRows(P1, 999, 1000, () => ({ oil: 100 })))[0].points;
    expect(decimate(pts, 2000)).toHaveLength(1000);
    const dec = decimate(pts, 100);
    expect(dec.length).toBeLessThanOrEqual(101);
    expect(dec[dec.length - 1].date).toBe(iso(999));
  });
});

describe('detectExceptions', () => {
  const steady = (well, oil) => dailyRows(well, 59, 60, () => ({ oil, water: oil / 4, gas: oil / 2, hours: 24 }));

  it('is empty on a steady well', () => {
    const { exceptions } = detectExceptions(buildWellSeries(steady(P1, 1000)));
    expect(exceptions).toEqual([]);
  });

  it('flags a rate drop as medium, and a severe one as high', () => {
    const medium = dailyRows(P1, 59, 60, (idx) => ({ oil: idx >= 53 ? 700 : 1000, hours: 24 }));
    let res = detectExceptions(buildWellSeries(medium));
    expect(res.exceptions).toHaveLength(1);
    expect(res.exceptions[0]).toMatchObject({ type: 'rate_drop', severity: 'medium', wellName: 'P-1' });

    const severe = dailyRows(P1, 59, 60, (idx) => ({ oil: idx >= 53 ? 400 : 1000, hours: 24 }));
    res = detectExceptions(buildWellSeries(severe));
    expect(res.exceptions[0]).toMatchObject({ type: 'rate_drop', severity: 'high' });
  });

  it('flags a shut-in (rows present, zero rate) as high', () => {
    const rows = dailyRows(P1, 59, 60, (idx) => ({ oil: idx >= 53 ? 0 : 1000, hours: idx >= 53 ? 0 : 24 }));
    const { exceptions } = detectExceptions(buildWellSeries(rows));
    expect(exceptions[0]).toMatchObject({ type: 'shut_in', severity: 'high' });
  });

  it('flags watercut and GOR rises against the well baseline', () => {
    const wc = dailyRows(P1, 59, 60, (idx) => ({
      oil: 1000, water: idx >= 53 ? 900 : 400, gas: 500, hours: 24,
    })); // wc 0.286 -> 0.474: +19 pts
    let res = detectExceptions(buildWellSeries(wc));
    expect(res.exceptions.map((e) => e.type)).toContain('watercut_rise');

    const gor = dailyRows(P1, 59, 60, (idx) => ({
      oil: 1000, gas: idx >= 53 ? 800 : 500, hours: 24,
    })); // GOR 500 -> 800: +60% => high at the 30% threshold
    res = detectExceptions(buildWellSeries(gor));
    expect(res.exceptions[0]).toMatchObject({ type: 'gor_rise', severity: 'high' });
  });

  it('flags downtime from hours on stream', () => {
    const rows = dailyRows(P1, 59, 60, (idx) => ({ oil: 1000, hours: idx >= 53 ? 8 : 24 }));
    const { exceptions } = detectExceptions(buildWellSeries(rows));
    expect(exceptions.map((e) => e.type)).toContain('downtime');
  });

  it('flags stale wells against the field frontier and skips their other checks', () => {
    const rows = [
      ...steady(P1, 1000),
      ...dailyRows(P2, 39, 40, () => ({ oil: 500, hours: 24 })), // dies 20 days early
    ];
    const { asOf, exceptions } = detectExceptions(buildWellSeries(rows));
    expect(asOf).toBe(iso(59));
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({ type: 'stale_data', wellName: 'P-2', severity: 'medium' });
  });

  it('widens windows on a monthly ledger instead of comparing single days', () => {
    const months = [];
    for (let m = 0; m < 12; m += 1) {
      const date = `2025-${String(m + 1).padStart(2, '0')}-01`;
      months.push(row(P1, date, { oil: m >= 10 ? 400 : 1000 }));
    }
    const { exceptions } = detectExceptions(buildWellSeries(months));
    expect(exceptions.map((e) => e.type)).toContain('rate_drop');
  });

  it('skips ratio/drop checks below the minimum-rate floor', () => {
    const rows = dailyRows(P1, 59, 60, (idx) => ({ oil: idx >= 53 ? 1 : 3, hours: 24 }));
    const { exceptions } = detectExceptions(buildWellSeries(rows));
    expect(exceptions.filter((e) => e.type === 'rate_drop')).toEqual([]);
  });

  it('watches injection on injectors', () => {
    const rows = dailyRows(I1, 59, 60, (idx) => ({ winj: idx >= 53 ? 1000 : 2500, hours: 24 }));
    const { exceptions } = detectExceptions(buildWellSeries(rows));
    expect(exceptions[0]).toMatchObject({ type: 'injection_drop', severity: 'high' });
  });

  it('orders high severity first', () => {
    const rows = [
      ...dailyRows(P1, 59, 60, (idx) => ({ oil: idx >= 53 ? 700 : 1000, hours: 24 })), // medium
      ...dailyRows(P2, 59, 60, (idx) => ({ oil: idx >= 53 ? 0 : 1000, hours: 24 })),   // high shut-in
    ];
    const { exceptions } = detectExceptions(buildWellSeries(rows));
    expect(exceptions[0].wellName).toBe('P-2');
    expect(exceptions[0].severity).toBe('high');
  });

  it('honors custom thresholds', () => {
    const rows = dailyRows(P1, 59, 60, (idx) => ({ oil: idx >= 53 ? 900 : 1000, hours: 24 })); // 10% drop
    expect(detectExceptions(buildWellSeries(rows)).exceptions).toEqual([]);
    const tight = detectExceptions(buildWellSeries(rows), { ...DEFAULT_SURVEILLANCE_SETTINGS, rateDropPct: 5 });
    expect(tight.exceptions.map((e) => e.type)).toContain('rate_drop');
  });
});

describe('summarizeDeferments', () => {
  const defs = [
    { category: 'surface_facility', start_date: iso(0), end_date: iso(4), oil_deferred_stb: 5000, water_deferred_stb: 0, gas_deferred_mscf: 2000, well: P1 },
    { category: 'well', start_date: iso(10), end_date: iso(10), oil_deferred_stb: 800, water_deferred_stb: 100, gas_deferred_mscf: 300, well: P2 },
    { category: 'surface_facility', start_date: iso(20), end_date: null, oil_deferred_stb: 1200, water_deferred_stb: 0, gas_deferred_mscf: 0, well: P1 },
  ];

  it('rolls up by category, open events accruing to asOf', () => {
    const s = summarizeDeferments(defs, iso(24));
    expect(s.openCount).toBe(1);
    expect(s.byCategory[0].category).toBe('surface_facility'); // 6200 stb beats 800
    expect(s.byCategory[0].events).toBe(2);
    expect(s.byCategory[0].days).toBe(5 + 5); // closed 5d + open 20th-24th
    expect(s.totals.oil).toBe(7000);
    expect(s.totals.events).toBe(3);
  });
});

describe('computeKpis', () => {
  it('averages the trailing window and reports uptime honestly', () => {
    const rows = [
      ...dailyRows(P1, 29, 30, () => ({ oil: 1000, water: 250, gas: 500, hours: 24 })),
      ...dailyRows(P2, 29, 30, () => ({ oil: 500, water: 250, gas: 250, hours: 12 })),
      ...dailyRows(I1, 29, 30, () => ({ winj: 3000, hours: 24 })),
    ];
    const wellSeries = buildWellSeries(rows);
    const kpis = computeKpis(wellSeries, buildFieldSeries(rows), { windowDays: 7 });
    expect(kpis.asOf).toBe(iso(29));
    expect(kpis.oil).toBeCloseTo(1500);
    expect(kpis.winj).toBeCloseTo(3000);
    expect(kpis.watercut).toBeCloseTo(500 / 2000);
    expect(kpis.gor).toBeCloseTo(750 * 1000 / 1500);
    expect(kpis.uptimePct).toBeCloseTo(75); // (24 + 12) / 48, injector excluded
    expect(kpis.wellCount).toBe(3);
    expect(kpis.producerCount).toBe(2);
  });

  it('returns null with no data', () => {
    expect(computeKpis([], [])).toBeNull();
  });
});

describe('decline overlay via the canonical Arps engine', () => {
  const exponential = (days) => dailyRows(P1, days - 1, days, (idx) => ({
    oil: 1000 * Math.exp(-0.005 * idx), hours: 24,
  }));

  it('builds a producing-day fit series that skips shut-in days', () => {
    const rows = dailyRows(P1, 9, 10, (idx) => ({ oil: idx === 5 ? 0 : 480, hours: idx === 5 ? 0 : 12 }));
    const pts = buildWellSeries(rows)[0].points;
    const series = rateSeriesForFit(pts, 'oil', 'producing');
    expect(series).toHaveLength(9);
    expect(series[0].rate).toBeCloseTo(960); // 480 stb in 12 h
    const cal = rateSeriesForFit(pts, 'oil', 'calendar');
    expect(cal[0].rate).toBeCloseTo(480);
  });

  it('recovers a synthetic exponential decline', () => {
    const pts = buildWellSeries(exponential(200))[0].points;
    const { fit, forecast, insufficient } = fitWellDecline(pts, { basis: 'calendar', modelType: 'Exponential', forecastDays: 365 });
    expect(insufficient).toBeUndefined();
    expect(fit.parameters.modelType).toBe('Exponential');
    expect(fit.parameters.qi).toBeCloseTo(1000, -1);
    expect(fit.parameters.Di).toBeCloseTo(0.005, 3);
    expect(fit.R2).toBeGreaterThan(0.99);
    expect(forecast.rates.length).toBeGreaterThan(300);
  });

  it('refuses to fit under three points', () => {
    const pts = buildWellSeries(dailyRows(P1, 1, 2, () => ({ oil: 100, hours: 24 })))[0].points;
    expect(fitWellDecline(pts).insufficient).toBe(true);
  });
});

describe('annualEffectiveDecline', () => {
  it('converts a nominal exponential Di to first-year effective decline', () => {
    // Di = 0.001/day -> 1 - exp(-0.365) = 30.58 %
    expect(annualEffectiveDecline(0.001, 0, 'Exponential')).toBeCloseTo(30.58, 2);
  });

  it('handles the harmonic limit (b = 1)', () => {
    // 1 - 1/(1 + 0.365) = 26.74 %
    expect(annualEffectiveDecline(0.001, 1, 'Harmonic')).toBeCloseTo(26.74, 2);
  });

  it('a hyperbolic b sits between the exponential and harmonic limits', () => {
    const hyp = annualEffectiveDecline(0.001, 0.5, 'Hyperbolic');
    expect(hyp).toBeLessThan(annualEffectiveDecline(0.001, 0, 'Exponential'));
    expect(hyp).toBeGreaterThan(annualEffectiveDecline(0.001, 1, 'Harmonic'));
  });

  it('returns null rather than a number for a non-declining fit', () => {
    expect(annualEffectiveDecline(0, 0, 'Exponential')).toBeNull();
    expect(annualEffectiveDecline(NaN, 0, 'Exponential')).toBeNull();
  });
});

describe('observation wells', () => {
  it('are left out of exception surveillance', () => {
    const OBS = { id: 'w9', name: 'OBS-1', well_type: 'observation' };
    // Same hard drop that flags a producer, on an observation well.
    const rows = [
      ...dailyRows(P1, 59, 60, (idx) => ({ oil: idx < 53 ? 1000 : 100 })),
      ...dailyRows(OBS, 59, 60, (idx) => ({ oil: idx < 53 ? 1000 : 100 })),
    ];
    const { exceptions } = detectExceptions(buildWellSeries(rows));
    expect(exceptions.some((e) => e.wellName === 'P-1')).toBe(true);
    expect(exceptions.some((e) => e.wellName === 'OBS-1')).toBe(false);
  });
});
