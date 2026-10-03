// The series of a Material Balance run, built once for the screen and the
// report (MBAL-U1, reviewer lens RL12: the Plots tab and the PDF draw from
// one builder, so a point on the page is a point on the screen).
//
// Everything here is read from the stored result (rb_results.plot_data and
// its scalar columns) and the config the run was made on. Nothing is
// recalculated that the engine calculated: the fitted line is the engine's
// own slope and intercept, drawn in the space the engine regressed in.
//
// That space depends on the run (packages/engines/engines/mbal/mbalEngine.ts):
//   no aquifer            F against Et                slope = N or G
//   Fetkovich or          F - We against Et           slope = N or G
//   Carter-Tracy          (We marched from the aquifer parameters)
//   pot aquifer, oil      F/Em against dp/Em          intercept = N
//                         Em = Eo + m Eg
//   pot aquifer, gas      F/Eg against dp/Eg          intercept = G
//
// Until this module the Plots tab drew the engine's slope and intercept on
// F against Et whatever the run was, which is the right line only for the
// first row of that table.
//
// All values are in engine units (psia, RB, STB, scf); the caller converts
// for display (lib/mbalUnits.js). Pure: no React.
import { ramagostCorrectedPz } from './pzRamagost';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const at = (arr, i) => (Array.isArray(arr) && arr[i] != null ? arr[i] : null);
const dayMs = (iso) => {
  if (!iso) return null;
  const t = Date.parse(String(iso).length <= 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? t : null;
};

/** The point categories of a regression plot, and the words for each. */
export const POINT_STATUS = Object.freeze({
  fit: 'In the fit',
  initial: 'Initial state (no production yet)',
  excluded: 'Excluded by the analyst',
  no_expansion: 'Left out by the engine (no expansion above zero)',
});

/**
 * One row per timestep of the run, zipped out of plot_data.
 * @param {object} plotData rb_results.plot_data
 * @param {{productionData?: object[]}} [o] the Data tab rows, for the dates
 *   of a result stored before the run echoed them
 */
export function buildRunRows(plotData, { productionData } = {}) {
  if (!plotData) return [];
  const n = plotData.timestep_index?.length ?? 0;
  const hm = plotData.history_match ?? null;
  const byIndex = new Map((productionData ?? []).map((r) => [r.timestep_index, r]));
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const timestep = plotData.timestep_index[i];
    const date = at(plotData.observation_date, i) ?? at(hm?.observation_date, i) ?? byIndex.get(timestep)?.observation_date ?? null;
    rows.push({
      timestep_index: timestep,
      date,
      t_ms: dayMs(date),
      pressure: at(plotData.pressure, i),
      delta_p: at(plotData.delta_p, i),
      F: at(plotData.F, i),
      Et: at(plotData.Et, i),
      Eo: at(plotData.Eo, i),
      Eg_rb_mscf: at(plotData.Eg_rb_mscf, i),
      Eg_oil: at(plotData.Eg_oil, i),
      Efw: at(plotData.Efw, i),
      We: at(plotData.We, i),
      Bw: at(plotData.Bw, i),
      Bo: at(plotData.Bo, i),
      Rs: at(plotData.Rs, i),
      Bg_rb_mscf: at(plotData.Bg_rb_mscf, i),
      z: at(plotData.z, i),
      p_over_z: at(plotData.p_over_z, i),
      cum_oil_stb: at(plotData.cum_oil_stb, i),
      cum_gas_scf: at(plotData.cum_gas_scf, i),
      cum_water_stb: at(plotData.cum_water_stb, i),
      cum_water_inj_stb: at(plotData.cum_water_inj_stb, i) ?? byIndex.get(timestep)?.cum_water_inj_stb ?? null,
      cum_gas_inj_scf: at(plotData.cum_gas_inj_scf, i) ?? byIndex.get(timestep)?.cum_gas_inj_scf ?? null,
      ddi: at(plotData.ddi, i),
      gdi: at(plotData.gdi, i),
      wdi: at(plotData.wdi, i),
      // Rock and connate water expansion. Since engines #167 it is `cdi` on
      // both fluid systems; oil results stored before that have it under
      // `sdi` with `cdi` null, so fall back per row.
      cdi: at(plotData.cdi, i) ?? at(plotData.sdi, i),
      // MBAL-U2-002: injection netted out of F and its two drive indices
      // (null on a result stored before the engine read injection)
      winj_bw_rb: at(plotData.winj_bw_rb, i),
      ginj_bg_rb: at(plotData.ginj_bg_rb, i),
      winj_di: at(plotData.winj_di, i),
      ginj_di: at(plotData.ginj_di, i),
      drive_index_sum: at(plotData.drive_index_sum, i),
      point_in_fit: plotData.point_in_fit?.[i] === true,
      simulated_pressure: at(hm?.simulated_pressure_psia, i),
      residual: at(hm?.residual_psi, i),
      hm_in_fit: hm ? hm.point_in_fit?.[i] === true : null,
    });
  }
  return rows;
}

/** True when every timestep has a date, so a time axis can be a calendar. */
export const rowsHaveDates = (rows) => rows.length > 0 && rows.every((r) => r.t_ms != null);

/** The X of a row on a plot against time: the date, or the timestep number. */
export const timeOf = (row, dated) => (dated ? row.t_ms : row.timestep_index);

/** The gas cap ratio the run used: the matched value on a history match that fitted it. */
export function gasCapRatioOf(result, runConfig) {
  const matched = result?.plot_data?.history_match?.matched_parameters?.find((p) => p.key === 'gas_cap_m');
  if (finite(matched?.matched_value)) return matched.matched_value;
  const m = Number(runConfig?.gas_cap_ratio_m);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

/**
 * Which regression the run made and in which space.
 * @returns {{kind: 'plain'|'net'|'pot', isGas: boolean, aquifer: string, m: number,
 *   title: string, xName: string, yName: string, inPlaceFrom: 'slope'|'intercept', method: string}}
 */
export function regressionVariant({ caseData, runConfig, result }) {
  const isGas = caseData?.fluid_system === 'gas';
  const aquifer = runConfig?.aquifer_model ?? (caseData?.has_aquifer ? 'pot' : 'none');
  const solver = result?.plot_data?.solver_method_used ?? (aquifer === 'pot' ? 'pot_aquifer_plot' : 'havlena_odeh');
  const m = isGas ? 0 : gasCapRatioOf(result, runConfig);
  const symbol = isGas ? 'G' : 'N';
  if (solver === 'pot_aquifer_plot') {
    const em = isGas ? 'Eg' : (m > 0 ? '(Eo + m Eg)' : 'Eo');
    return {
      kind: 'pot', isGas, aquifer, m, inPlaceFrom: 'intercept',
      title: `Pot aquifer plot: F/${em} against dp/${em}`,
      xName: `dp/${em}`, yName: `F/${em}`,
      method: `Pot aquifer plot (Pletcher 2002, Eq. 13): F/${em} against (pi - p)/${em}, ordinary least squares. The intercept is ${symbol} and the slope gives the aquifer water in place W.`,
    };
  }
  if (aquifer === 'fetkovich' || aquifer === 'carter_tracy') {
    const name = aquifer === 'fetkovich' ? 'Fetkovich' : 'Carter-Tracy';
    return {
      kind: 'net', isGas, aquifer, m, inPlaceFrom: 'slope',
      title: 'Havlena-Odeh: F - We against Et',
      xName: 'Et', yName: 'F - We',
      method: `Havlena-Odeh (1963): F - We against Et, ordinary least squares with a free intercept. We is marched from the ${name} aquifer parameters, so it is an input of the fit. The slope is ${symbol}.`,
    };
  }
  return {
    kind: 'plain', isGas, aquifer, m, inPlaceFrom: 'slope',
    title: 'Havlena-Odeh: F against Et',
    xName: 'Et', yName: 'F',
    method: `Havlena-Odeh (1963): F against Et, ordinary least squares with a free intercept. The slope is ${symbol}.`,
  };
}

/**
 * The regression plot of the run: its points in the space the engine
 * regressed in, each with its status, and the engine's fitted line.
 * @returns {{variant: object, points: Array<{timestep_index: number, x: ?number, y: ?number, status: string}>,
 *   inFit: Array<[number, number]>, notInFit: Array<[number, number]>, line: Array<[number, number]>,
 *   slope: ?number, intercept: ?number, r2: ?number, n: ?number, inPlace: ?number,
 *   counts: {fit: number, initial: number, excluded: number, no_expansion: number}}}
 */
export function regressionSeries({ rows, result, runConfig, caseData }) {
  const variant = regressionVariant({ caseData, runConfig, result });
  const excluded = new Set(runConfig?.excluded_timesteps ?? []);
  const points = rows.map((r) => {
    let x = null;
    let y = null;
    let expands = false;
    if (variant.kind === 'pot') {
      // Eg of a gas case is stored per Mscf; the engine regresses per scf
      const em = variant.isGas
        ? (finite(r.Eg_rb_mscf) ? r.Eg_rb_mscf / 1000 : null)
        : (finite(r.Eo) ? r.Eo + variant.m * (finite(r.Eg_oil) ? r.Eg_oil : 0) : null);
      expands = finite(em) && em > 0;
      if (expands && finite(r.F) && finite(r.delta_p)) { x = r.delta_p / em; y = r.F / em; }
    } else {
      expands = finite(r.Et) && r.Et > 0;
      const we = variant.kind === 'net' ? (finite(r.We) ? r.We : 0) : 0;
      if (finite(r.Et) && finite(r.F)) { x = r.Et; y = r.F - we; }
    }
    let status;
    if (r.timestep_index === 0) status = 'initial';
    else if (excluded.has(r.timestep_index) || !r.point_in_fit) status = 'excluded';
    else if (!expands) status = 'no_expansion';
    else status = 'fit';
    return { timestep_index: r.timestep_index, x, y, status };
  });
  const drawable = points.filter((p) => finite(p.x) && finite(p.y));
  const inFit = drawable.filter((p) => p.status === 'fit').map((p) => [p.x, p.y]);
  const notInFit = drawable.filter((p) => p.status !== 'fit').map((p) => [p.x, p.y]);
  const slope = finite(result?.regression_slope) ? result.regression_slope : null;
  const intercept = finite(result?.regression_intercept) ? result.regression_intercept : null;
  let line = [];
  if (slope != null && intercept != null && inFit.length >= 2) {
    const xMax = Math.max(...inFit.map((p) => p[0]));
    line = [[0, intercept], [xMax * 1.05, slope * xMax * 1.05 + intercept]];
  }
  const counts = { fit: 0, initial: 0, excluded: 0, no_expansion: 0 };
  for (const p of points) counts[p.status] += 1;
  return {
    variant, points, inFit, notInFit, line, slope, intercept,
    r2: finite(result?.r_squared) ? result.r_squared : null,
    n: finite(result?.n_data_points) ? result.n_data_points : null,
    inPlace: variant.inPlaceFrom === 'intercept' ? intercept : slope,
    counts,
  };
}

/** Ordinary least squares y = a + b x over [x, y] pairs. */
function leastSquares(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy), n };
}

/**
 * The oil in place the run reports. On a history match the headline is the
 * matched value and the regression of the forward run has its own.
 */
export function inPlaceOf(result, isGas) {
  const headline = isGas ? result?.estimated_ogip_scf : result?.estimated_ooip_stb;
  return finite(headline) ? headline : null;
}

/** Campbell plot (oil): F/Et against F, with the run's oil in place as the level. */
export function campbellSeries({ rows, result }) {
  const pts = rows.filter((r) => finite(r.Et) && r.Et > 0 && finite(r.F) && r.F > 0)
    .map((r) => ({ timestep_index: r.timestep_index, x: r.F, y: r.F / r.Et, inFit: r.point_in_fit }));
  return {
    points: pts,
    inFit: pts.filter((p) => p.inFit).map((p) => [p.x, p.y]),
    notInFit: pts.filter((p) => !p.inFit).map((p) => [p.x, p.y]),
    level: inPlaceOf(result, false),
  };
}

/** Cole plot (gas): F/Eg against Gp, with the run's gas in place as the level. */
export function coleSeries({ rows, result }) {
  const pts = rows.filter((r) => finite(r.Eg_rb_mscf) && r.Eg_rb_mscf > 0 && finite(r.F) && finite(r.cum_gas_scf))
    // Eg is per Mscf, so F/Eg is in Mscf: times 1000 for scf
    .map((r) => ({ timestep_index: r.timestep_index, x: r.cum_gas_scf, y: (r.F / r.Eg_rb_mscf) * 1000, inFit: r.point_in_fit }));
  return {
    points: pts,
    inFit: pts.filter((p) => p.inFit).map((p) => [p.x, p.y]),
    notInFit: pts.filter((p) => !p.inFit).map((p) => [p.x, p.y]),
    level: inPlaceOf(result, true),
  };
}

/**
 * p/z plot (gas): p/z against Gp, the least-squares line through the points
 * of the fit taken to p/z = 0 (the apparent gas in place), and the
 * Ramagost-Farshad points corrected for rock and water compressibility.
 */
export function pzSeries({ rows, result, runConfig, caseData }) {
  const base = rows.filter((r) => finite(r.p_over_z) && finite(r.cum_gas_scf));
  // the initial state is a point of a p/z line (p/z at Gp = 0), unlike the
  // F against Et fit where it carries no information
  const used = base.filter((r) => r.timestep_index === 0 || r.point_in_fit);
  const fit = leastSquares(used.map((r) => [r.cum_gas_scf, r.p_over_z]));
  const apparent = fit && fit.slope < 0 ? -fit.intercept / fit.slope : null;
  const cf = Number(runConfig?.formation_compressibility_psi);
  const cw = Number(runConfig?.water_compressibility_psi);
  const corrected = ramagostCorrectedPz({
    pOverZ: base.map((r) => r.p_over_z),
    pressure: base.map((r) => r.pressure),
    pi: caseData?.initial_pressure_psia,
    swi: caseData?.initial_water_saturation,
    cw: Number.isFinite(cw) ? cw : 3e-6,
    cf: Number.isFinite(cf) ? cf : 6e-6,
  });
  const ramagost = corrected ? base.map((r, i) => [r.cum_gas_scf, corrected[i]]).filter((p) => finite(p[1])) : [];
  const ramagostFit = corrected
    ? leastSquares(base.map((r, i) => ({ r, v: corrected[i] })).filter(({ r, v }) => finite(v) && (r.timestep_index === 0 || r.point_in_fit)).map(({ r, v }) => [r.cum_gas_scf, v]))
    : null;
  return {
    points: base.map((r) => ({ timestep_index: r.timestep_index, x: r.cum_gas_scf, y: r.p_over_z, inFit: r.timestep_index === 0 || r.point_in_fit })),
    inFit: used.map((r) => [r.cum_gas_scf, r.p_over_z]),
    notInFit: base.filter((r) => !(r.timestep_index === 0 || r.point_in_fit)).map((r) => [r.cum_gas_scf, r.p_over_z]),
    fit,
    line: fit && apparent != null ? [[0, fit.intercept], [apparent, 0]] : [],
    apparentOgip: apparent,
    ramagost,
    ramagostOgip: ramagostFit && ramagostFit.slope < 0 ? -ramagostFit.intercept / ramagostFit.slope : null,
    ogip: inPlaceOf(result, true),
  };
}

/** The two injection drive indices (MBAL-U2-002), shown only on a run that has injection. */
export const INJECTION_DRIVE_DEFS = Object.freeze([
  { key: 'winj_di', short: 'WIDI', label: 'Water injection (WIDI)', numerator: 'Winj Bw' },
  { key: 'ginj_di', short: 'GIDI', label: 'Gas injection (GIDI)', numerator: 'Ginj Bginj' },
]);

/** True when the run netted injection out of F (the engine stored a non-zero injected volume). */
export const runHasInjection = (rows) => rows.some((r) => (finite(r.winj_bw_rb) && r.winj_bw_rb !== 0) || (finite(r.ginj_bg_rb) && r.ginj_bg_rb !== 0));

/** The drive index names of a fluid system, in stacking order; the injection indices last when the run has them. */
export function driveIndexDefs(isGas, { injection = false } = {}) {
  const natural = isGas
    ? [
      { key: 'gdi', label: 'Gas expansion (GDI)', numerator: 'G Eg' },
      { key: 'cdi', label: 'Rock and connate water (CDI)', numerator: 'G Efw' },
      { key: 'wdi', label: 'Water drive (WDI)', numerator: 'We - Wp Bw' },
    ]
    : [
      { key: 'ddi', label: 'Depletion (DDI)', numerator: 'N Eo' },
      { key: 'gdi', label: 'Gas cap (GDI)', numerator: 'N m Eg' },
      { key: 'cdi', label: 'Rock and connate water (CDI)', numerator: 'N Efw' },
      { key: 'wdi', label: 'Water drive (WDI)', numerator: 'We - Wp Bw' },
    ];
  return injection ? [...natural, ...INJECTION_DRIVE_DEFS] : natural;
}

/** Drive indices of every timestep after the initial state. */
export function driveIndexSeries({ rows, isGas }) {
  const dated = rowsHaveDates(rows);
  const injection = runHasInjection(rows);
  const defs = driveIndexDefs(isGas, { injection });
  const steps = rows.filter((r) => r.timestep_index > 0 && finite(r.drive_index_sum));
  return {
    dated,
    defs,
    injection,
    steps: steps.map((r) => ({
      timestep_index: r.timestep_index, date: r.date, x: timeOf(r, dated), pressure: r.pressure,
      ...Object.fromEntries(defs.map((d) => [d.key, finite(r[d.key]) ? r[d.key] : 0])),
      sum: r.drive_index_sum,
    })),
  };
}

/** Pressure against time: measured, and the simulated pressures of a history match. */
export function pressureSeries({ rows }) {
  const dated = rowsHaveDates(rows);
  const measured = rows.filter((r) => finite(r.pressure));
  const simulated = rows.filter((r) => finite(r.simulated_pressure));
  return {
    dated,
    measured: measured.map((r) => [timeOf(r, dated), r.pressure]),
    measuredInFit: measured.filter((r) => (r.hm_in_fit == null ? r.point_in_fit : r.hm_in_fit)).map((r) => [timeOf(r, dated), r.pressure]),
    measuredOut: measured.filter((r) => !(r.hm_in_fit == null ? r.point_in_fit : r.hm_in_fit)).map((r) => [timeOf(r, dated), r.pressure]),
    simulated: simulated.map((r) => [timeOf(r, dated), r.simulated_pressure]),
    hasSimulation: simulated.length > 0,
  };
}

/** Cumulative water influx against time. */
export function influxSeries({ rows }) {
  const dated = rowsHaveDates(rows);
  const pts = rows.filter((r) => finite(r.We));
  return {
    dated,
    influx: pts.map((r) => [timeOf(r, dated), r.We]),
    // water produced, in reservoir volume, when the run stored Bw
    produced: pts.filter((r) => finite(r.cum_water_stb) && finite(r.Bw)).map((r) => [timeOf(r, dated), r.cum_water_stb * r.Bw]),
    any: pts.some((r) => r.We !== 0),
  };
}

/**
 * Every series of a run in one object, for the Plots tab and the report.
 * @param {{result: object, runConfig: object, caseData: object}} a
 */
export function buildMbalSeries({ result, runConfig, caseData }) {
  const isGas = caseData?.fluid_system === 'gas';
  const rows = buildRunRows(result?.plot_data, { productionData: caseData?.production_data });
  return {
    isGas,
    rows,
    regression: regressionSeries({ rows, result, runConfig, caseData }),
    campbell: isGas ? null : campbellSeries({ rows, result }),
    cole: isGas ? coleSeries({ rows, result }) : null,
    pz: isGas ? pzSeries({ rows, result, runConfig, caseData }) : null,
    drive: driveIndexSeries({ rows, isGas }),
    pressure: pressureSeries({ rows }),
    influx: influxSeries({ rows }),
  };
}
