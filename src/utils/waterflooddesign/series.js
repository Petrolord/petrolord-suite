/**
 * The series of the Waterflood Design Studio charts (WF-U1, RL6 and RL12):
 * one builder each, used by the screen charts and the report figures, so
 * the PDF draws the points the screen shows. Values are in engine
 * (oilfield) units unless a units helper `u` is given. Pure.
 */

/** Relative permeability curves of the displacement. */
export function krSeries(displacement) {
  const c = displacement?.curves || [];
  return { krw: c.map((p) => [p.Sw, p.krw]), kro: c.map((p) => [p.Sw, p.kro]) };
}

/** Fractional flow and the Welge tangent from (Swc, 0) up to the average saturation behind the front. */
export function fwSeries(displacement) {
  const c = displacement?.curves || [];
  const bl = displacement?.bl || {};
  const Swc = c[0]?.Sw;
  const fw = c.map((p) => [p.Sw, p.fw]);
  const tangent = [];
  if (Number.isFinite(bl.fwPrimeF) && Number.isFinite(Swc) && Number.isFinite(bl.SwAvgBt)) {
    tangent.push([Swc, 0], [bl.SwAvgBt, Math.min(1, bl.fwPrimeF * (bl.SwAvgBt - Swc))]);
  }
  return { fw, tangent, Swf: bl.Swf ?? null, fwf: bl.fwf ?? null, SwAvgBt: bl.SwAvgBt ?? null };
}

/** Displacement efficiency against pore volumes injected (to 8 PV, as on screen). */
export function recoverySeries(displacement, maxQi = 8) {
  return (displacement?.recovery || []).filter((r) => r.Qi <= maxQi).map((r) => [r.Qi, r.ED]);
}

/** The pattern forecast against time in years. */
export function patternSeries(patternResult, u = null) {
  const s = patternResult?.series || [];
  const show = (k, v) => (u ? u.show(k, v) : v);
  return {
    qo: s.map((p) => [p.t_days / 365.25, show('oilRate', p.qo_stbd)]),
    qw: s.map((p) => [p.t_days / 365.25, show('oilRate', p.qw_stbd)]),
    wor: s.filter((p) => Number.isFinite(p.WOR)).map((p) => [p.t_days / 365.25, p.WOR]),
    np: s.map((p) => [p.t_days / 365.25, show('oilVolumeK', p.Np_stb / 1000)]),
    ea: s.map((p) => [p.t_days / 365.25, p.EA]),
  };
}

/** Annual rows of the forecast (the injection plan and its response): volumes per year, cumulative oil, WOR and EA at year end. */
export function annualForecastRows(patternResult) {
  const s = patternResult?.series || [];
  const years = [];
  let prevT = 0;
  for (const p of s) {
    const y = Math.floor((p.t_days - 0.01) / 365.25);
    const dt = p.t_days - prevT;
    prevT = p.t_days;
    if (!years[y]) years[y] = { year: y + 1, oil: 0, water: 0, injected: 0, np: 0, wor: null, ea: null };
    const r = years[y];
    r.oil += p.qo_stbd * dt;
    r.water += p.qw_stbd * dt;
    r.np = p.Np_stb;
    r.wor = p.WOR;
    r.ea = p.EA;
  }
  // injection in RB at the constant rate over the days of each year in the series
  let prevW = 0;
  const lastOf = new Map();
  s.forEach((p) => lastOf.set(Math.floor((p.t_days - 0.01) / 365.25), p.Wi_bbl));
  for (const r of years) {
    if (!r) continue;
    const w = lastOf.get(r.year - 1) ?? prevW;
    r.injected = w - prevW;
    prevW = w;
  }
  return years.filter(Boolean);
}

/** Dykstra-Parsons coverage against WOR (reservoir), as on screen. */
export function dpSeries(layeredResult) {
  return (layeredResult?.dykstraParsons || []).filter((x) => Number.isFinite(x.WOR)).map((x) => [x.WOR, x.coverage]);
}

const ms = (d) => Date.parse(`${d}T00:00:00Z`);

/** Field rates on a calendar axis (ms), unsmoothed. */
export function surveillanceRateSeries(result, u = null) {
  const d = result?.daily_series;
  if (!d?.date?.length) return { inj: [], oil: [], water: [] };
  const show = (k, v) => (u ? u.show(k, v) : v);
  return {
    inj: d.date.map((t, i) => [ms(t), show('waterRate', d.inj_bpd[i])]),
    oil: d.date.map((t, i) => [ms(t), show('oilRate', d.oil_bpd[i])]),
    water: d.date.map((t, i) => [ms(t), show('waterRate', d.water_bpd[i])]),
  };
}

/** Rolling and cumulative VRR on a calendar axis. */
export function vrrSeries(result) {
  const v = result?.vrr_series;
  if (!v?.date?.length) return { rolling: [], cum: [] };
  return {
    rolling: v.date.map((t, i) => [ms(t), v.vrr_rolling[i]]),
    cum: v.date.map((t, i) => [ms(t), v.vrr_cum[i]]),
  };
}

/** Per-well summary of the history: dates, days, volumes (rate x days to the next row of the well). */
export function wellSummaryRows(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const t = ms(String(r.date).slice(0, 10));
    if (!Number.isFinite(t) || !r.well) continue;
    if (!by.has(r.well)) by.set(r.well, []);
    by.get(r.well).push({ t, r });
  }
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const out = [];
  for (const [well, list] of by) {
    list.sort((a, b) => a.t - b.t);
    let oil = 0; let water = 0; let inj = 0; let days = 0;
    list.forEach((x, i) => {
      const next = list[i + 1];
      const prev = list[i - 1];
      const w = next ? Math.max(1, Math.round((next.t - x.t) / 86400000)) : prev ? Math.max(1, Math.round((x.t - prev.t) / 86400000)) : 1;
      oil += num(x.r.oil_bbl) * w; water += num(x.r.water_bbl) * w; inj += num(x.r.inj_bbl) * w; days += w;
    });
    out.push({
      well, type: inj > 0 ? 'injector' : (oil > 0 || water > 0 ? 'producer' : 'no rates'),
      first: new Date(list[0].t).toISOString().slice(0, 10), last: new Date(list[list.length - 1].t).toISOString().slice(0, 10),
      rows: list.length, days, oil, water, inj,
    });
  }
  return out.sort((a, b) => a.well.localeCompare(b.well));
}
