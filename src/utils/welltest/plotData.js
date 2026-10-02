/**
 * The plotted series of the Well Test Analysis Studio, built once and drawn
 * twice: the Recharts cards on the tabs and the vector plots in the PDF
 * report read the SAME arrays from these builders (tester round 2,
 * 2026-10-02). Nothing is recomputed for the report. The builders convert
 * oilfield state to the display unit system and decide nothing else.
 */
import { evaluateModelTest } from './models/modelCatalog.js';
import { hornerTime } from './superposition.js';
import { rateStepsFromHistory } from './superposition.js';
import { fromOilfield, unitLabel } from './units.js';

const num = (v) => {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Every k-th row so a dense gauge record plots as at most `max` points; ends kept. */
export function thinRows(rows, max = 600) {
  if (!Array.isArray(rows) || rows.length <= max) return rows || [];
  const step = (rows.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(rows[Math.round(i * step)]);
  return out;
}

/**
 * Test overview: the whole gauge record (pressure, and temperature when the
 * file carried it) with the rate steps, on one test clock that starts at the
 * first flow period. The gauge clock is shifted so the shut-in (buildup,
 * falloff) or the start of flow (drawdown, injection) lands where the rate
 * history puts it.
 */
export function buildOverviewData({ gaugeRows = [], rateRows = [], config, reservoir, unitSystem = 'oilfield', maxPoints = 600 }) {
  const isGas = reservoir?.fluid === 'gas';
  const rateKind = isGas ? 'gasRate' : 'oilRate';
  const empty = {
    pressure: [], temperature: [], rate: [], hasTemperature: false, rateDerived: false, rateKind,
    xLabel: 'Test time (hr)', clockNote: '',
  };
  const rows = (gaugeRows || [])
    .map((r) => ({ t: num(r.t), p: num(r.p), T: num(r.T) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.p))
    .sort((a, b) => a.t - b.t);
  if (!rows.length || !config) return empty;

  const isBuildup = config.family === 'buildup';
  let steps = rateStepsFromHistory((rateRows || []).map((r) => ({ t: num(r.t), q: num(r.q) })));
  let rateDerived = false;
  if (!steps.length && reservoir && reservoir.q > 0) {
    rateDerived = true;
    steps = isBuildup ? [{ start: 0, q: reservoir.q }, { start: config.tp, q: 0 }] : [{ start: 0, q: reservoir.q }];
  }
  // where the analysed period starts on the test clock
  let anchor = 0;
  if (isBuildup) {
    const shut = [...steps].reverse().find((s) => s.q === 0 && s.start > 0);
    anchor = shut ? shut.start : (Number.isFinite(config.tp) ? config.tp : 0);
  } else {
    const first = steps.find((s) => s.q !== 0);
    anchor = first ? first.start : 0;
  }
  const shift = anchor - (Number.isFinite(config.testStartTime) ? config.testStartTime : 0);
  const thin = thinRows(rows, maxPoints);
  const tt = (t) => Number((t + shift).toPrecision(8));
  const pressure = thin.map((r) => ({ t: tt(r.t), p: Number(fromOilfield('pressure', r.p, unitSystem).toFixed(2)) }));
  const temperature = thin
    .filter((r) => Number.isFinite(r.T))
    .map((r) => ({ t: tt(r.t), T: Number(fromOilfield('temperature', r.T, unitSystem).toFixed(2)) }));
  const tEnd = Math.max(pressure[pressure.length - 1].t, steps.length ? steps[steps.length - 1].start : 0);
  const rate = [];
  steps.forEach((s, i) => {
    const next = steps[i + 1];
    const q = Number(fromOilfield(rateKind, Math.abs(s.q), unitSystem).toFixed(2));
    rate.push({ t: s.start, q });
    rate.push({ t: next ? next.start : tEnd, q });
  });
  return {
    pressure,
    temperature,
    rate,
    hasTemperature: temperature.length > 1,
    rateDerived,
    rateKind,
    shift,
    anchor,
    xLabel: 'Test time (hr)',
    clockNote: isBuildup
      ? `Shut-in at ${Number(anchor.toPrecision(6))} hr on the test clock.`
      : `Flow starts at ${Number(anchor.toPrecision(6))} hr on the test clock.`,
    pressureUnit: unitLabel('pressure', unitSystem),
    temperatureUnit: unitLabel('temperature', unitSystem),
    rateUnit: unitLabel(rateKind, unitSystem),
  };
}

/** Log-log diagnostic: pressure change and Bourdet derivative, with the model overlay, in display units. */
export function buildLoglogData({ loglog = [], modelSeries = null, dpKind = 'pressure', unitSystem = 'oilfield' }) {
  const u = (v) => fromOilfield(dpKind, v, unitSystem);
  return {
    points: loglog.map((p) => ({ ...p, dp: u(p.dp), derivative: u(p.derivative) })),
    model: modelSeries
      ? modelSeries.map((m) => ({ ...m, modelDp: u(m.modelDp), modelDerivative: u(m.modelDerivative) }))
      : null,
    unit: unitLabel(dpKind, unitSystem),
  };
}

/**
 * Horner (buildup, falloff) or MDH (drawdown, injection) semilog plot: the
 * gauge pressures, the fitted straight line converted back from analysis
 * space, and the window the line was fitted on.
 */
export function buildSemilogData({ prepared, config, semilogResult, unitSystem = 'oilfield' }) {
  const isBuildup = config?.family === 'buildup';
  const tp = config?.tp;
  const pts = prepared?.points || [];
  const wMin = semilogResult?.windowMin;
  const wMax = semilogResult?.windowMax;
  const points = pts
    .map((p) => {
      const x = isBuildup ? hornerTime(tp, p.time) : p.time;
      if (!(x > 0)) return null;
      // the straight line lives in analysis space (m(p), mirrored); convert
      // each fitted value back to gauge psi so it overlays the gauge data
      const fittedA = semilogResult
        ? (isBuildup
          ? semilogResult.pStarA - semilogResult.m * Math.log10(x)
          : semilogResult.p1hrA - semilogResult.m * Math.log10(x))
        : null;
      const fitted = fittedA != null ? prepared.fromAnalysis(fittedA) : null;
      return {
        x,
        time: p.time,
        pressure: Number(fromOilfield('pressure', p.p, unitSystem).toFixed(2)),
        fitted: fitted != null && Number.isFinite(fitted) ? Number(fromOilfield('pressure', fitted, unitSystem).toFixed(2)) : null,
        inWindow: Number.isFinite(wMin) && Number.isFinite(wMax) ? p.time >= wMin && p.time <= wMax : false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);
  const inWin = points.filter((p) => p.inWindow);
  return {
    points,
    isBuildup,
    xLabel: isBuildup ? 'Horner time ratio (tp + dt)/dt' : 'Elapsed time (hr)',
    name: isBuildup ? 'Horner' : 'MDH',
    // the fit window on the plot abscissa and in elapsed hours
    window: inWin.length
      ? { xMin: Math.min(...inWin.map((p) => p.x)), xMax: Math.max(...inWin.map((p) => p.x)), tMin: wMin, tMax: wMax, n: inWin.length }
      : null,
    pressureUnit: unitLabel('pressure', unitSystem),
  };
}

/** sqrt(t) plot: pressure change against the square root of elapsed time, with the fitted line. */
export function buildSqrtData({ prepared, sqrtResult, dpKind = 'pressure', unitSystem = 'oilfield' }) {
  return (prepared?.points || []).map((p) => ({
    x: Number(Math.sqrt(p.time).toPrecision(4)),
    dp: Number(fromOilfield(dpKind, p.dp, unitSystem).toFixed(2)),
    fitted: sqrtResult
      ? Number(fromOilfield(dpKind, sqrtResult.intercept + sqrtResult.slope * Math.sqrt(p.time), unitSystem).toFixed(2))
      : null,
  }));
}

/**
 * History match: the gauge pressure and the model pressure at the same
 * times. The model works in analysis space (m(p) for gas, mirrored for
 * injection and falloff), so its dp is converted back to gauge pressure
 * through the prepared-data transform.
 *
 * When the gauge record also holds the period before a shut-in, that period
 * is included: the model is the same catalog model as a constant-rate
 * drawdown (or injection) at rate q for tp from pi. Times are elapsed hours
 * from the shut-in, negative before it.
 */
export function buildHistoryMatch({ prepared, matchParams, model, reservoir, config, unitSystem = 'oilfield' }) {
  const pts = prepared?.points || [];
  if (!pts.length) return { points: [], hasModel: false, hasPrior: false };
  const uP = (v) => Number(fromOilfield('pressure', v, unitSystem).toFixed(2));
  let modelP = null;
  let priorModel = null;
  const prior = config?.family === 'buildup' ? (prepared.preTest || []).filter((r) => config.tp + r.time > 0) : [];
  if (matchParams && reservoir && config && model) {
    try {
      const times = pts.map((p) => p.time);
      const series = evaluateModelTest({
        testType: config.family, model, params: matchParams, reservoir, tp: config.tp, times, dts: times,
      });
      modelP = series.map((s) => prepared.dpToGauge(s.dp));
      if (prior.length && typeof prepared.priorToGauge === 'function') {
        const flowTimes = prior.map((r) => config.tp + r.time);
        const flow = evaluateModelTest({ testType: 'drawdown', model, params: matchParams, reservoir, times: flowTimes });
        priorModel = flow.map((s) => prepared.priorToGauge(s.dp));
      }
    } catch (e) {
      console.error(e);
    }
  }
  const before = prior.map((r, i) => ({
    time: Number(r.time.toPrecision(4)),
    observed: uP(r.p),
    model: priorModel && Number.isFinite(priorModel[i]) ? uP(priorModel[i]) : null,
    prior: true,
  }));
  const after = pts.map((p, i) => ({
    time: Number(p.time.toPrecision(4)),
    observed: uP(p.p),
    model: modelP && Number.isFinite(modelP[i]) ? uP(modelP[i]) : null,
  }));
  return {
    points: [...before, ...after],
    hasModel: !!modelP,
    hasPrior: before.length > 0,
    pressureUnit: unitLabel('pressure', unitSystem),
  };
}

// ---- rate transient analysis ------------------------------------------------

const rtaNorm = (isGas, unitSystem) => {
  const normKind = isGas ? 'pseudoPressure' : 'pressure';
  const rateKind = isGas ? 'gasRate' : 'oilRate';
  return {
    normKind,
    rateKind,
    unit: `${unitLabel(normKind, unitSystem)} per ${unitLabel(rateKind, unitSystem)}`,
    // normalized drawdown per rate: (psi or psi2/cp) / (STB/D or Mscf/D)
    u: (v) => fromOilfield(normKind, v, unitSystem) / fromOilfield(rateKind, 1, unitSystem),
  };
};

/** Rate-normalized pressure and its derivative against material-balance time. */
export function buildRtaLoglogData({ rtaResult, unitSystem = 'oilfield' }) {
  const n = rtaNorm(!!rtaResult?.isGas, unitSystem);
  return {
    points: (rtaResult?.loglogRta || []).map((p) => ({
      x: p.x,
      y: p.y > 0 ? n.u(p.y) : null,
      derivative: p.derivative > 0 ? n.u(p.derivative) : null,
    })),
    unit: n.unit,
  };
}

/** Flowing material balance: normalized pressure against material-balance (pseudo-)time, with the regression line. */
export function buildFmbData({ rtaResult, reservoir, unitSystem = 'oilfield' }) {
  const fmbResult = rtaResult?.fmb;
  const isGas = !!rtaResult?.isGas;
  const n = rtaNorm(isGas, unitSystem);
  if (!fmbResult || !reservoir) return { points: [], unit: n.unit, isGas };
  // gas plots against material-balance pseudo-time; oil against te
  const xs = isGas ? fmbResult.tca : rtaResult.rowsTe.map((r) => r.te);
  const pts = isGas
    ? rtaResult.rowsTe.filter((r) => r.q > 0 && r.pwf > 0 && r.pwf < reservoir.pi)
    : rtaResult.rowsTe.filter((r) => r.te > 0);
  const paOf = isGas ? reservoir.mOfP : (v) => v;
  const paI = paOf(reservoir.pi);
  return {
    points: pts.map((r, i) => ({
      x: xs[i],
      observed: n.u((paI - paOf(r.pwf)) / r.q),
      line: n.u(fmbResult.intercept + fmbResult.slope * xs[i]),
    })),
    unit: n.unit,
    isGas,
    xLabel: isGas ? 'Material-balance pseudo-time tca (days)' : 'Material-balance time te (days)',
  };
}
