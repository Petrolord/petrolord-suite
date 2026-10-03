// Decline Curve Analysis: the project model (DCA-U1, Reservoir round).
//
// Pure: no React, no database. The studio context holds the state; this
// module says what the state means.
//
// 1. Fits belong to a well. Before DCA-U1 the fit, the forecast and the fit
//    window were held once per PROJECT and per stream, so opening a second
//    well showed the first well's fit and forecast over the second well's
//    data, and a scenario saved on the second well carried the first well's
//    numbers under the second well's name (DCA-U1-001). Each well now holds
//    its own analysis: `well.analysis = { fitWindow, streams: { oil, gas,
//    water } }`, every stream with its own fit, forecast and settings.
//    A project saved before that (payload version 1) opens with its one
//    analysis attached to the well it was fitted on (the well whose data
//    holds the fit's start date), else to the first well, the one the app
//    opened it on.
//
// 2. A fit and a forecast state what they were made on. A fit keeps a
//    snapshot (`fit.basis`) of the data digest, the fit window, the model
//    choice, the b limits and the excluded points; a forecast keeps the
//    fit it was run on and its settings. When any of them changes the
//    result is out of date, says why, loses its status words and is not
//    reported or sent (DCA-U1-003, RL8). Putting the input back restores it.
//
// 3. The data the fit used is counted: imported rows, rows with a rate for
//    the stream, rates at or below zero (left out by the engine), rows
//    outside the fit window, rows the user excluded with a reason, and the
//    rows used (RL5).

import { getStreamRate } from './csvParser';
import { normaliseTerminalDecline } from './declineInput';

export const DCA_PAYLOAD_VERSION = 2;
export const STREAMS = Object.freeze(['oil', 'gas', 'water']);


export const DEFAULT_MC_SEED = 42;
export const DEFAULT_ECON_LIMIT_UNCERTAINTY = 0.2;

const DEFAULT_LIMITS = Object.freeze({ oil: 10, gas: 100, water: 0 });

/** The settings a new stream starts with. */
export function defaultStream(stream) {
  return {
    fitResults: null,
    modelType: 'Auto',
    constraints: { minB: 0, maxB: 1.0 },
    forecastConfig: {
      economicLimit: DEFAULT_LIMITS[stream] ?? 0,
      durationDays: 3653, // ten years of 365.25 days
      facilityLimit: 0,
      stopAtLimit: stream !== 'water',
      mcSeed: DEFAULT_MC_SEED,
      economicLimitUncertainty: DEFAULT_ECON_LIMIT_UNCERTAINTY,
      // DCA U2-001: no default terminal decline (owner's default); the
      // analyst sets one as {value, unit, basis}
      terminalDecline: null,
    },
    forecastResults: null,
    excluded: [],
  };
}

export function defaultStreams() {
  return { oil: defaultStream('oil'), gas: defaultStream('gas'), water: defaultStream('water') };
}

const EMPTY_WINDOW = Object.freeze({ startDate: null, endDate: null });

/** A well's analysis, with every stream present (an older well lacks some keys). */
export function analysisOf(well) {
  const a = well?.analysis || {};
  const streams = {};
  for (const s of STREAMS) {
    const base = defaultStream(s);
    const got = a.streams?.[s] || {};
    streams[s] = {
      ...base,
      ...got,
      constraints: { ...base.constraints, ...(got.constraints || {}) },
      forecastConfig: { ...base.forecastConfig, ...(got.forecastConfig || {}) },
      excluded: Array.isArray(got.excluded) ? got.excluded : [],
    };
  }
  return { fitWindow: a.fitWindow || { ...EMPTY_WINDOW }, streams, carried: a.carried || null };
}

const dayKey = (d) => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

/** Whether a well's data holds a row on the day of `iso`. */
const holdsDay = (well, iso) => {
  const k = dayKey(iso);
  return !!k && (well?.data || []).some((p) => dayKey(p.date) === k);
};

/**
 * Open a saved payload on the per-well model. Version 1 (one analysis per
 * project) is moved onto the well it was fitted on. Returns a new object;
 * the input is not changed.
 */
export function migrateDcaPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const wells = { ...(payload.wells || {}) };
  if ((payload.payloadVersion || 1) >= DCA_PAYLOAD_VERSION) {
    for (const id of Object.keys(wells)) wells[id] = { ...wells[id], analysis: analysisOf(wells[id]) };
    return { ...payload, wells };
  }
  const legacy = payload.streamState || null;
  const ids = Object.keys(wells);
  let owner = null;
  if (legacy && ids.length) {
    // the well the fit was most likely made on: its data holds the fit's
    // start date, and the saved window is its data range (an import set the
    // window to the imported well's range); a tie goes to the first well
    const t0s = STREAMS.map((s) => legacy[s]?.fitResults?.t0).filter(Boolean);
    const win = payload.fitWindow || {};
    const score = (w) => {
      const days = (w?.data || []).map((p) => dayKey(p.date)).filter(Boolean).sort();
      return (t0s.some((t0) => holdsDay(w, t0)) ? 1 : 0)
        + (days.length && dayKey(win.startDate) === days[0] ? 2 : 0)
        + (days.length && dayKey(win.endDate) === days[days.length - 1] ? 2 : 0);
    };
    owner = ids.reduce((best, id) => (score(wells[id]) > score(wells[best]) ? id : best), ids[0]);
  }
  for (const id of ids) {
    const w = wells[id];
    if (w.analysis) { wells[id] = { ...w, analysis: analysisOf(w) }; continue; }
    if (id === owner) {
      const streams = {};
      for (const s of STREAMS) streams[s] = { ...(legacy?.[s] || {}) };
      wells[id] = {
        ...w,
        analysis: analysisOf({
          analysis: {
            fitWindow: payload.fitWindow || { ...EMPTY_WINDOW },
            streams,
            carried: 'This analysis was saved before fits were kept per well. It was opened on this well, the well its fit starts on.',
          },
        }),
      };
    } else {
      wells[id] = { ...w, analysis: analysisOf({ analysis: { fitWindow: payload.fitWindow || { ...EMPTY_WINDOW } } }) };
    }
  }
  const { streamState: _s, fitWindow: _w, ...rest } = payload;
  return { ...rest, wells, payloadVersion: DCA_PAYLOAD_VERSION };
}

// ---- fingerprints ---------------------------------------------------------

const stable = (v) => {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return JSON.stringify(v);
};

/** FNV-1a of a value's stable text: 8 hex characters. */
export function fingerprint(value) {
  const text = stable(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** A digest of one stream of the data: the dates and the rates. */
export function dataDigest(data, stream) {
  return fingerprint((data || []).map((p) => [dayKey(p.date), getStreamRate(p, stream)]));
}

// ---- the data the fit uses -------------------------------------------------

const inWindow = (t, w) => {
  const a = w?.startDate ? new Date(w.startDate).getTime() : -Infinity;
  const b = w?.endDate ? new Date(w.endDate).getTime() : Infinity;
  return t >= a && t <= b;
};

/**
 * The points a fit is handed, and the account of every row left out.
 * @param {Array} data the well's production rows
 * @param {string} stream
 * @param {{startDate, endDate}} window
 * @param {Array<{date: string, reason: string}>} excluded the user's exclusions
 * @returns {{points: Array<{date, rate}>, rows: Array<{date, rate, status, reason}>, summary: object}}
 */
export function prepareFitData(data, stream, window, excluded = []) {
  const ex = new Map((excluded || []).map((e) => [dayKey(e.date), e.reason || 'excluded by the analyst']));
  const rows = [];
  const points = [];
  const summary = { imported: (data || []).length, withRate: 0, nonPositive: 0, outsideWindow: 0, excludedByUser: 0, used: 0 };
  for (const p of data || []) {
    const t = new Date(p.date).getTime();
    const rate = getStreamRate(p, stream);
    const date = p.date;
    if (rate == null || !Number.isFinite(Number(rate)) || !Number.isFinite(t)) {
      rows.push({ date, rate: null, status: 'no-rate', reason: `no ${stream} rate on this row` });
      continue;
    }
    summary.withRate += 1;
    const q = Number(rate);
    if (!inWindow(t, window)) {
      summary.outsideWindow += 1;
      rows.push({ date, rate: q, status: 'outside', reason: 'outside the fit window' });
      continue;
    }
    if (ex.has(dayKey(date))) {
      summary.excludedByUser += 1;
      rows.push({ date, rate: q, status: 'excluded', reason: ex.get(dayKey(date)) });
      continue;
    }
    if (!(q > 0)) {
      summary.nonPositive += 1;
      rows.push({ date, rate: q, status: 'non-positive', reason: 'rate at or below zero (shut in or a data gap); the Arps fit cannot use it' });
      continue;
    }
    summary.used += 1;
    rows.push({ date, rate: q, status: 'used', reason: '' });
    points.push({ date, rate: q });
  }
  return { points, rows, summary };
}

// ---- what a fit and a forecast were made on --------------------------------

const windowKey = (w) => ({ startDate: dayKey(w?.startDate), endDate: dayKey(w?.endDate) });
const excludedKey = (excluded) => (excluded || []).map((e) => dayKey(e.date)).filter(Boolean).sort();

/** The snapshot a fit is stored with. */
export function fitBasisOf({ data, stream, window, modelType, constraints, excluded }) {
  return {
    dataDigest: dataDigest(data, stream),
    window: windowKey(window),
    modelType: modelType || 'Auto',
    constraints: { minB: constraints?.minB ?? null, maxB: constraints?.maxB ?? null },
    excluded: excludedKey(excluded),
  };
}

/** The key of a fit: what a forecast was run on. */
export const fitKeyOf = (fit) => (fit ? fingerprint({ qi: fit.qi, Di: fit.Di, b: fit.b, t0: fit.t0, modelType: fit.modelType }) : null);

/** The forecast settings that change a forecast. */
export function forecastConfigKey(config) {
  const c = config || {};
  return fingerprint({
    economicLimit: c.economicLimit ?? null,
    durationDays: c.durationDays ?? null,
    facilityLimit: c.facilityLimit ?? null,
    stopAtLimit: !!c.stopAtLimit,
    probabilisticMode: !!c.probabilisticMode,
    mcSeed: c.probabilisticMode ? (c.mcSeed ?? null) : null,
    economicLimitUncertainty: c.probabilisticMode ? (c.economicLimitUncertainty ?? null) : null,
    // DCA U2-001: present only when set, so a forecast saved before it
    // existed (or with none) keeps its key and stays current
    terminalDecline: normaliseTerminalDecline(c.terminalDecline) || undefined,
  });
}

/** The snapshot a forecast is stored with. */
export function forecastBasisOf(fit, config, data, stream) {
  return { fitKey: fitKeyOf(fit), configKey: forecastConfigKey(config), dataDigest: dataDigest(data, stream) };
}

/**
 * Is the fit and the forecast of one stream of a well still what the
 * inputs say?
 * @returns {{fit: 'none'|'current'|'stale'|'unrecorded', fitReasons: string[],
 *   forecast: 'none'|'current'|'stale'|'unrecorded', forecastReasons: string[], reportable: boolean}}
 */
export function analysisStatus(well, stream) {
  const a = analysisOf(well);
  const s = a.streams[stream];
  const fit = s.fitResults;
  const fc = s.forecastResults;
  const out = { fit: 'none', fitReasons: [], forecast: 'none', forecastReasons: [], reportable: false };
  if (fit) {
    if (!fit.basis) {
      out.fit = 'unrecorded';
      out.fitReasons.push('this fit was saved by an earlier release, which did not record what it was made on; fit again to confirm it');
    } else {
      const now = fitBasisOf({ data: well?.data, stream, window: a.fitWindow, modelType: s.modelType, constraints: s.constraints, excluded: s.excluded });
      const b = fit.basis;
      if (b.dataDigest !== now.dataDigest) out.fitReasons.push('the production data changed');
      if (stable(b.window) !== stable(now.window)) out.fitReasons.push('the fit window changed');
      if (b.modelType !== now.modelType) out.fitReasons.push('the model choice changed');
      if (stable(b.constraints) !== stable(now.constraints)) out.fitReasons.push('the b limits changed');
      if (stable(b.excluded) !== stable(now.excluded)) out.fitReasons.push('points were excluded or restored');
      out.fit = out.fitReasons.length ? 'stale' : 'current';
    }
  }
  if (fc) {
    if (!fc.basis) {
      out.forecast = 'unrecorded';
      out.forecastReasons.push('this forecast was saved by an earlier release, which did not record the fit it was run on; run it again to confirm it');
    } else {
      if (fc.basis.fitKey !== fitKeyOf(fit)) out.forecastReasons.push('the fit changed since this forecast was run');
      if (fc.basis.configKey !== forecastConfigKey(s.forecastConfig)) out.forecastReasons.push('the forecast settings changed');
      if (fc.basis.dataDigest && fc.basis.dataDigest !== dataDigest(well?.data, stream)) out.forecastReasons.push('the production data changed');
      if (out.fit !== 'current' && out.fit !== 'none') out.forecastReasons.push('the fit it was run on is out of date');
      out.forecast = out.forecastReasons.length ? 'stale' : 'current';
    }
  }
  out.reportable = out.fit === 'current' && out.forecast === 'current';
  return out;
}

/** One sentence for a stale result, or null. */
export function staleText(status, what = 'fit') {
  const reasons = what === 'fit' ? status.fitReasons : status.forecastReasons;
  const state = what === 'fit' ? status.fit : status.forecast;
  if (state === 'current' || state === 'none') return null;
  const head = what === 'fit' ? 'This fit is out of date' : 'This forecast is out of date';
  if (state === 'unrecorded') return `${head}: ${reasons[0]}.`;
  return `${head}: ${reasons.join(', ')}. ${what === 'fit' ? 'Fit again' : 'Run the forecast again'} to bring it up to date.`;
}
