// Waterflood Efficiency surveillance engine (client-side, pure functions).
//
// This replaces the former server "waterflood-engine" compute, which fabricated
// key analytics with Math.random() (pattern lags, injector recommendations) and
// used a placeholder pressure for the Hall plot. Those non-physical outputs are
// intentionally NOT reproduced here; they are gated in the UI until they can be
// derived from real data (P2). Everything this engine returns is a defensible,
// deterministic computation from the input rate history.
//
// The Voidage Replacement Ratio (VRR) core is UNIFIED with the VRR Monitor app:
// per-day voidage is computed with the same reservoir-barrel physics exported by
// `vrrCalculations.js` (only FREE produced gas adds voidage; solution gas is
// already carried in Bo). This keeps a single source of truth for waterflood
// pressure-maintenance surveillance across the Suite.
//
// Field units: oil (STB/d), water (bbl/d), inj (bbl/d), gas (Mscf/d);
// Bo, Bw in RB/STB(bbl); Bg in RB/Mscf; Rs (solution GOR) in scf/STB.

import Papa from 'papaparse';
import { computePeriodVoidage, classifyVRR } from './vrrCalculations';

export const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

// Column schema shown in the app's "Schema Help" dialog and used to validate input.
export const WATERFLOOD_SCHEMA = {
  required_columns: [
    { name: 'date', note: 'Date of record in YYYY-MM-DD format.' },
    { name: 'well', note: 'Unique identifier for the well.' },
  ],
  optional_columns: [
    { name: 'oil_bbl', note: 'Daily oil production (STB/d). Non-zero marks a PRODUCER.' },
    { name: 'water_bbl', note: 'Daily water production (bbl/d). Non-zero marks a PRODUCER.' },
    { name: 'gas_mcf', note: 'Daily gas production (Mscf/d). Feeds free-gas voidage when Bg & Rs are set.' },
    { name: 'inj_bbl', note: 'Daily water injection (bbl/d). Non-zero marks an INJECTOR.' },
  ],
  notes: [
    'The CSV must contain a header row.',
    'A well is an INJECTOR if it ever reports a non-zero `inj_bbl`.',
    'A well is a PRODUCER if it ever reports non-zero `oil_bbl` or `water_bbl`.',
    'Blank cells are treated as zero. Negative rates are zeroed and counted under data quality.',
    'Duplicate (date, well) rows are de-duplicated, keeping the first occurrence.',
    'VRR is computed in reservoir barrels. Set Bg (RB/Mscf) and Rs (scf/STB) to include free-gas voidage; leave Bg blank/0 to use liquid voidage only.',
  ],
};

// Robust CSV parse via papaparse (handles quoted fields, blank cells, trailing
// commas) — the old naive split(',') broke on all three.
export function parseWaterfloodCSV(csvText) {
  const parsed = Papa.parse((csvText || '').trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return Array.isArray(parsed.data) ? parsed.data : [];
}

// Trailing simple moving average (window in samples). Mirrors the daily cadence
// of the input series; window <= 1 returns a copy unchanged.
export function movingAverage(data, windowSize) {
  const w = Math.max(1, Math.floor(num(windowSize, 1)));
  if (w <= 1) return data.slice();
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - w + 1);
    const window = data.slice(start, i + 1);
    out.push(window.reduce((a, b) => a + b, 0) / window.length);
  }
  return out;
}

function toDateKey(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

// De-duplicate, sanitize and normalize raw rows into a clean, date-sorted set.
// Returns { rows, dataQuality } where dataQuality feeds the Data Quality panel.
export function cleanRows(rawRows, config = {}) {
  const dataQuality = {
    issues: [],
    duplicates_removed: 0,
    negatives_zeroed: 0,
    rows_in: rawRows.length,
    rows_out: 0,
  };

  const startKey = toDateKey(config.start_date);
  const endKey = toDateKey(config.end_date);

  const seen = new Map();
  let outOfRange = 0;
  let invalid = 0;

  rawRows.forEach((r) => {
    const dateKey = toDateKey(r.date);
    const well = (r.well ?? '').toString().trim();
    if (!dateKey || !well) {
      invalid++;
      return;
    }
    if ((startKey && dateKey < startKey) || (endKey && dateKey > endKey)) {
      outOfRange++;
      return;
    }
    const key = `${dateKey}|${well}`;
    if (seen.has(key)) {
      dataQuality.duplicates_removed++;
      return;
    }

    let oil = num(r.oil_bbl);
    let water = num(r.water_bbl);
    let gas = num(r.gas_mcf);
    let inj = num(r.inj_bbl);
    let negativeInRow = false;
    if (oil < 0) { oil = 0; negativeInRow = true; }
    if (water < 0) { water = 0; negativeInRow = true; }
    if (gas < 0) { gas = 0; negativeInRow = true; }
    if (inj < 0) { inj = 0; negativeInRow = true; }
    if (negativeInRow) dataQuality.negatives_zeroed++;

    seen.set(key, { dateKey, well, oil, water, gas, inj });
  });

  const rows = Array.from(seen.values()).sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0
  );
  dataQuality.rows_out = rows.length;
  if (invalid > 0) dataQuality.issues.push(`${invalid} row(s) dropped for missing/invalid date or well.`);
  if (outOfRange > 0) dataQuality.issues.push(`${outOfRange} row(s) outside the selected date range were excluded.`);

  return { rows, dataQuality };
}

// Classify each well as injector / producer / unknown from its full history.
// Injection status wins (a converted producer that is now injecting is treated
// as an injector for surveillance).
export function classifyWells(rows) {
  const wells = new Map();
  rows.forEach((r) => {
    if (!wells.has(r.well)) wells.set(r.well, { well: r.well, type: 'unknown', data: [] });
    const w = wells.get(r.well);
    w.data.push(r);
    if (r.inj > 0) w.type = 'injector';
    else if ((r.oil > 0 || r.water > 0) && w.type !== 'injector') w.type = 'producer';
  });
  const injectors = [];
  const producers = [];
  wells.forEach((w) => {
    if (w.type === 'injector') injectors.push(w.well);
    else if (w.type === 'producer') producers.push(w.well);
  });
  return { wells, injectors, producers };
}

// Aggregate clean rows into a field-level daily series with smoothed variants.
export function aggregateDaily(rows, config = {}) {
  const byDate = new Map();
  rows.forEach((r) => {
    if (!byDate.has(r.dateKey)) {
      byDate.set(r.dateKey, { date: r.dateKey, oil_bpd: 0, water_bpd: 0, gas_mscf: 0, inj_bpd: 0 });
    }
    const d = byDate.get(r.dateKey);
    d.oil_bpd += r.oil;
    d.water_bpd += r.water;
    d.gas_mscf += r.gas;
    d.inj_bpd += r.inj;
  });

  const daily = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  daily.forEach((d) => {
    const liquid = d.oil_bpd + d.water_bpd;
    d.wc_pct = liquid > 0 ? (d.water_bpd / liquid) * 100 : 0;
  });

  const smooth = num(config.smooth_window_days, 1);
  return {
    date: daily.map((d) => d.date),
    oil_bpd: daily.map((d) => d.oil_bpd),
    water_bpd: daily.map((d) => d.water_bpd),
    gas_mscf: daily.map((d) => d.gas_mscf),
    inj_bpd: daily.map((d) => d.inj_bpd),
    wc_pct: daily.map((d) => d.wc_pct),
    oil_bpd_s: movingAverage(daily.map((d) => d.oil_bpd), smooth),
    water_bpd_s: movingAverage(daily.map((d) => d.water_bpd), smooth),
    inj_bpd_s: movingAverage(daily.map((d) => d.inj_bpd), smooth),
    wc_pct_s: movingAverage(daily.map((d) => d.wc_pct), smooth),
    _daily: daily,
  };
}

// Resolve the PVT/FVF set used for reservoir-barrel voidage from the config.
function resolveFvf(config = {}) {
  return {
    Bo: num(config.bo, 1.0),
    Bw: num(config.bw, 1.0),
    Bg: num(config.bg, 0), // RB/Mscf; 0 => free-gas voidage excluded
    Rs: num(config.rs, 0), // scf/STB
  };
}

// Field-level VRR series in reservoir barrels, using the SAME per-period voidage
// physics as the VRR Monitor (vrrCalculations.computePeriodVoidage). Produces
// instantaneous (daily), rolling-window and running-cumulative VRR.
export function computeFieldVRR(daily, config = {}) {
  const fvf = resolveFvf(config);
  const windowDays = Math.max(1, Math.floor(num(config.vrr_window_days, 30)));

  const producedVoidage = [];
  const injectedVoidage = [];
  const vrr_daily = [];

  daily.forEach((d) => {
    // Map a field-day onto the shared voidage period: producers -> Np/Wp/Gp,
    // water injection -> Wi. Gas injection (Gi) is not part of the schema.
    const period = { Np: d.oil_bpd, Wp: d.water_bpd, Gp: d.gas_mscf, Wi: d.inj_bpd, Gi: 0 };
    const v = computePeriodVoidage(period, fvf);
    producedVoidage.push(v.producedVoidage);
    injectedVoidage.push(v.injectedVoidage);
    vrr_daily.push(v.producedVoidage > 0 ? v.injectedVoidage / v.producedVoidage : 0);
  });

  const vrr_rolling = [];
  const vrr_cum = [];
  let cumProd = 0;
  let cumInj = 0;
  for (let i = 0; i < daily.length; i++) {
    const start = Math.max(0, i - windowDays + 1);
    let winProd = 0;
    let winInj = 0;
    for (let j = start; j <= i; j++) {
      winProd += producedVoidage[j];
      winInj += injectedVoidage[j];
    }
    vrr_rolling.push(winProd > 0 ? winInj / winProd : 0);

    cumProd += producedVoidage[i];
    cumInj += injectedVoidage[i];
    vrr_cum.push(cumProd > 0 ? cumInj / cumProd : 0);
  }

  return {
    date: daily.map((d) => d.date),
    vrr_daily,
    vrr_rolling,
    vrr_cum,
    produced_voidage_rb: producedVoidage,
    injected_voidage_rb: injectedVoidage,
    cum_produced_voidage_rb: cumProd,
    cum_injected_voidage_rb: cumInj,
  };
}

// Roll-up KPIs. VRR figures are reservoir-barrel voidage ratios (see computeFieldVRR).
export function computeKPIs(daily, vrr) {
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const total_oil_bbl = sum(daily.map((d) => d.oil_bpd));
  const total_water_bbl = sum(daily.map((d) => d.water_bpd));
  const total_injected_bbl = sum(daily.map((d) => d.inj_bpd));
  const liquid = total_oil_bbl + total_water_bbl;
  return {
    avg_water_cut_pct: liquid > 0 ? (total_water_bbl / liquid) * 100 : 0,
    vrr_avg: vrr.vrr_cum.length ? vrr.vrr_cum[vrr.vrr_cum.length - 1] : 0, // cumulative RB VRR
    vrr_rolling: vrr.vrr_rolling.length ? vrr.vrr_rolling[vrr.vrr_rolling.length - 1] : 0,
    total_injected_bbl,
    total_oil_bbl,
    total_water_bbl,
  };
}

// Deterministic, defensible surveillance alerts. Anything requiring cross-well
// timing (pattern breakthrough) or pressure (injectivity) is deferred to a later
// phase rather than guessed here.
export function buildAlerts(kpis, config = {}) {
  const alerts = { high_watercut: [], poor_vrr: [], injectivity_issue: [], breakthrough: [] };
  const target = num(config.target_vrr, 1.0);

  if (kpis.avg_water_cut_pct > 80) {
    alerts.high_watercut.push(`Field average water cut is high at ${kpis.avg_water_cut_pct.toFixed(1)}%.`);
  }
  const vrr = kpis.vrr_rolling;
  if (Number.isFinite(vrr) && vrr > 0) {
    const band = classifyVRR(vrr);
    if (vrr < 0.9 * target) {
      alerts.poor_vrr.push(`Latest rolling VRR is ${vrr.toFixed(2)} (target ${target.toFixed(2)}). ${band.label}`);
    } else if (vrr > 1.1 * target) {
      alerts.poor_vrr.push(`Latest rolling VRR is ${vrr.toFixed(2)} (target ${target.toFixed(2)}). ${band.label}`);
    }
  }
  return alerts;
}

// Full analysis orchestrator. Returns the exact shape the dashboard panels read:
// { data_quality, daily_series, vrr_series, kpis, alerts, wells }.
export function analyzeWaterflood(rawRows, config = {}) {
  const { rows, dataQuality } = cleanRows(rawRows || [], config);
  const { injectors, producers } = classifyWells(rows);
  if (injectors.length === 0) {
    dataQuality.issues.push('No injector wells detected (no non-zero inj_bbl). VRR reflects production voidage only.');
  }

  const dailySeries = aggregateDaily(rows, config);
  const vrr = computeFieldVRR(dailySeries._daily, config);
  const kpis = computeKPIs(dailySeries._daily, vrr);
  const alerts = buildAlerts(kpis, config);

  // Strip the internal _daily helper before returning to the UI.
  const { _daily, ...daily_series } = dailySeries;

  return {
    data_quality: dataQuality,
    daily_series,
    vrr_series: {
      date: vrr.date,
      vrr_daily: vrr.vrr_daily,
      vrr_rolling: vrr.vrr_rolling,
      vrr_cum: vrr.vrr_cum,
    },
    kpis,
    alerts,
    wells: { injectors, producers },
  };
}

// ---------------------------------------------------------------------------
// Sample data — deterministic (no randomness), physically self-consistent, and
// correctly shaped: injectors carry inj_bbl (the old sample mistakenly put the
// injection volume in gas_mcf and left inj_bbl blank, so nothing classified as
// an injector). Two 5-spot-style patterns over 90 days: injection ramps up,
// producers decline with rising water cut, VRR climbs from under-injection
// toward balance.
export function sampleWaterfloodRows() {
  const rows = [];
  const start = new Date('2024-01-01T00:00:00Z');
  const days = 90;
  // Injection starts below produced voidage (VRR ~0.7, under-injection) and ramps
  // up so cumulative VRR climbs through balance toward ~1.1 by end of history —
  // the canonical pressure-maintenance surveillance story.
  const patterns = [
    { inj: 'INJ-1', prod: 'PROD-1', inj0: 340, injRamp: 3.4, oil0: 320, oilDecl: 1.6, water0: 40, waterRise: 3.2, gor: 0.6 },
    { inj: 'INJ-2', prod: 'PROD-2', inj0: 235, injRamp: 2.6, oil0: 260, oilDecl: 1.2, water0: 30, waterRise: 2.6, gor: 0.5 },
  ];

  for (let t = 0; t < days; t++) {
    const d = new Date(start.getTime() + t * 24 * 3600 * 1000);
    const dateKey = d.toISOString().split('T')[0];
    patterns.forEach((p) => {
      const inj = Math.round(p.inj0 + p.injRamp * t);
      const oil = Math.max(0, Math.round(p.oil0 - p.oilDecl * t));
      const water = Math.round(p.water0 + p.waterRise * t);
      const gas = Math.round(oil * p.gor); // Mscf/d, tracks oil via a fixed producing GOR
      rows.push({ date: dateKey, well: p.inj, oil_bbl: '', water_bbl: '', gas_mcf: '', inj_bbl: inj });
      rows.push({ date: dateKey, well: p.prod, oil_bbl: oil, water_bbl: water, gas_mcf: gas, inj_bbl: '' });
    });
  }
  return rows;
}

export function sampleWaterfloodCSV() {
  const header = 'date,well,oil_bbl,water_bbl,gas_mcf,inj_bbl';
  const lines = sampleWaterfloodRows().map((r) =>
    [r.date, r.well, r.oil_bbl, r.water_bbl, r.gas_mcf, r.inj_bbl].join(',')
  );
  return [header, ...lines].join('\n') + '\n';
}
