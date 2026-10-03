// Decline Curve Analysis: the report (DCA-U1-002, PL7 and RL1 to RL12).
//
// DCA had no report. This module builds the one model the Report tab shows
// and the PDF prints, on the shared Report Kit (src/lib/reportKit):
//
//   identification   company, field, licence, well, reservoir, data dates,
//                    the data cut-off, analysis type, analyst, units, build
//   inputs           every value the fit and the forecast read, with its unit
//                    and where it came from, guarded against the engine input
//                    objects (RL1); the decline basis stated (nominal, per day
//                    and per year of 365.25 days, effective beside it)
//   data summary     every imported row counted: used, outside the window,
//                    at or below zero, excluded by the analyst with the reason
//   results          EUR in its parts, produced to date plus remaining to the
//                    economic limit, closing on the total (RL3); time to the
//                    limit; the regression statement with R2, RMSE and the
//                    95 percent intervals (RL8); Monte Carlo percentiles with
//                    the convention stated
//   figures          rate against time (log rate, fit window shaded, the fit,
//                    the forecast, the limit), rate against cumulative,
//                    cumulative against time, the EUR distribution when Monte
//                    Carlo ran; a figure that does not apply says why (RL6)
//   limits           the Arps assumptions, b above 1, extrapolation, the
//                    interval method, and flags on this analysis (RL9)
//
// Every number arrives from the analysis already made: nothing is fitted or
// forecast here. A fit or a forecast that is out of date is refused (RL8).
import { createReport, EMPTY_VALUE, missingInputRows } from '@/lib/reportKit';
import { buildDcaSeries } from './dcaSeries';
import { analysisOf, analysisStatus, staleText, prepareFitData, defaultStream } from './dcaModel';
import { DCA_OILFIELD_UNITS, DCA_DAYS_PER_YEAR } from './dcaUnits';
import { nominalAnnualPct, effectiveFirstYearPct } from './declineDisplay';
import { calculateArpsHyperbolic } from './dcaEngine';
import { createEURHistogram } from '../dcaMonteCarlo';

export const REPORT_TITLE = 'Decline Curve Analysis Report';
export const REPORT_APP_NAME = 'Petrolord Decline Curve Analysis';
const DAY = 86400000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const STREAM_WORD = { oil: 'oil', gas: 'gas', water: 'water' };

/** Full numbers: 91,666 not 9.17e+4 (RL12). */
export const num = (v, digits = 0) => (finite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : EMPTY_VALUE);
/** Four significant figures for a parameter. */
export const sig4 = (v) => (finite(v) ? String(parseFloat(v.toPrecision(4))) : EMPTY_VALUE);
const day = (d) => (d ? String(d).slice(0, 10) : EMPTY_VALUE);
const text = (v) => (v != null && String(v).trim() ? String(v).trim() : '');

export const MODEL_NAMES = Object.freeze({
  Exponential: 'Arps exponential (b = 0)',
  Hyperbolic: 'Arps hyperbolic (0 < b < 1, or above 1 when the limits allow)',
  Harmonic: 'Arps harmonic (b = 1)',
});

/** Identification of a well for the report; blanks print n/a. */
export function identificationOf(well, { organizationName = '' } = {}) {
  const id = well?.identification || {};
  return {
    company: text(id.company) || text(organizationName),
    field: text(id.field),
    licence: text(id.licence),
    reservoir: text(id.reservoir),
    analyst: text(id.analyst),
  };
}

/**
 * The objects the engine was handed for this stream, rebuilt from state, so
 * the completeness guard can hold the inputs table against them (RL1).
 */
export function engineInputsOf(well, stream) {
  const a = analysisOf(well);
  const s = a.streams[stream];
  return {
    fit: {
      data: well?.data || [],
      stream,
      modelType: s.modelType,
      window: { startDate: a.fitWindow.startDate, endDate: a.fitWindow.endDate },
      constraints: { minB: s.constraints.minB, maxB: s.constraints.maxB },
      excluded: s.excluded,
    },
    forecast: {
      fit: s.fitResults ? { qi: s.fitResults.qi, Di: s.fitResults.Di, b: s.fitResults.b, t0: s.fitResults.t0, modelType: s.fitResults.modelType } : null,
      config: {
        economicLimit: s.forecastConfig.economicLimit,
        stopAtLimit: s.forecastConfig.stopAtLimit,
        durationDays: s.forecastConfig.durationDays,
        facilityLimit: s.forecastConfig.facilityLimit,
        probabilisticMode: !!s.forecastConfig.probabilisticMode,
        mcSeed: s.forecastConfig.mcSeed,
        economicLimitUncertainty: s.forecastConfig.economicLimitUncertainty,
      },
      history: well?.data || [],
    },
  };
}

/**
 * The model of the report: rows for every table, the series for every
 * figure, the flags. The Report tab and the PDF print it.
 * @param {{project?: object, well: object, stream: string, u?: object, organizationName?: string,
 *   build?: string, generatedAt?: Date}} a
 * @returns {{ok: boolean, refusal?: string, ...}}
 */
export function collectDcaReportArgs({ project = null, well, stream = 'oil', u = DCA_OILFIELD_UNITS, organizationName = '', build = '', generatedAt = new Date() }) {
  if (!well) return { ok: false, refusal: 'Select a well first: the report is of one well and one stream.' };
  const a = analysisOf(well);
  const s = a.streams[stream];
  const fit = s.fitResults;
  const fc = s.forecastResults;
  const status = analysisStatus(well, stream);
  if (!fit) return { ok: false, refusal: `There is no ${stream} fit on ${well.name}. Fit the model first.` };
  if (status.fit !== 'current') return { ok: false, refusal: `The report was not built. ${staleText(status, 'fit')}` };
  if (!fc) return { ok: false, refusal: 'There is no forecast for this fit. Run the forecast first: the report states remaining reserves and EUR.' };
  if (status.forecast !== 'current') return { ok: false, refusal: `The report was not built. ${staleText(status, 'forecast')}` };

  const rateU = u.rateLabel(stream);
  const volU = u.volumeLabel(stream);
  const rate = (v) => u.rateTo(stream, v);
  const vol = (v) => u.volumeTo(stream, v);
  const id = identificationOf(well, { organizationName });
  const prepared = prepareFitData(well.data, stream, a.fitWindow, s.excluded);
  const dates = (well.data || []).map((p) => day(p.date)).filter((d) => d !== EMPTY_VALUE).sort();
  const usedDates = prepared.rows.filter((r) => r.status === 'used').map((r) => day(r.date)).sort();
  const cfg = s.forecastConfig;
  const defaults = defaultStream(stream).forecastConfig;
  const isMc = !!fc.probabilistic && fc.probabilistic.iterations > 0;
  const declineUnitWord = u.declineUnit;

  // ---- identification (RL4) ----
  const identification = [
    ['Company', id.company || EMPTY_VALUE],
    ['Field', id.field || EMPTY_VALUE],
    ['Licence or block', id.licence || EMPTY_VALUE],
    ['Well', well.name || EMPTY_VALUE],
    ['Reservoir or zone', id.reservoir || EMPTY_VALUE],
    ['Stream', `${STREAM_WORD[stream]}`],
    ['Data dates', dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : EMPTY_VALUE],
    ['Data cut-off', day(fc.historyEndDate)],
    ['Analysis type', `Decline curve analysis, ${fit.modelType} (${s.modelType === 'Auto' ? 'chosen by best fit' : 'chosen by the analyst'})`],
    ['Analyst', id.analyst || EMPTY_VALUE],
    ['Project', project?.name || EMPTY_VALUE],
    ['Fitted', day(fit.fittedAt)],
    ['Software build', build || EMPTY_VALUE],
    ['Sample data', well.sample ? 'Yes: the sample well, not field data' : 'No'],
  ];

  // ---- inputs with unit and source (RL1) ----
  const readBack = well.dataMeta?.readBack;
  const importSource = well.dataMeta?.fileName
    ? `Imported from ${well.dataMeta.fileName}${readBack?.columns?.length ? `; ${readBack.columns.filter((c) => c.key === `${stream}Rate` || (stream === 'oil' && c.key === 'oilRate')).map((c) => `column "${c.fileColumn}" read as ${c.unit} (${c.unitFrom === 'header' ? 'from the header' : c.unitFrom === 'chosen' ? 'chosen at the door' : 'assumed at the door'})`).join('')}` : ''}`
    : (well.sample ? 'Sample data: Ekene-1 primary decline (engines test data, planted exponential 120 bopd, 0.0012 per day)' : 'Entered or imported before the import door recorded its source');
  const chosen = (value, def, words = 'Chosen by the analyst') => (value === def ? `App default (${def === 0 ? 'none' : 'not changed'})` : words);
  const inputs = [
    { key: 'data', label: `Production history, ${STREAM_WORD[stream]} rate`, value: `${prepared.summary.withRate} rows`, unit: rateU, source: importSource, engineKeys: ['fit.data', 'fit.stream', 'forecast.history'] },
    { key: 'model', label: 'Decline model', value: s.modelType === 'Auto' ? `Auto (best of exponential, harmonic, hyperbolic by RMSE): ${fit.modelType}` : fit.modelType, unit: '', source: chosen(s.modelType, 'Auto'), engineKeys: ['fit.modelType', 'forecast.fit.modelType'] },
    { key: 'minB', label: 'b lower limit of the hyperbolic search', value: sig4(s.constraints.minB), unit: '', source: chosen(s.constraints.minB, 0), engineKeys: ['fit.constraints.minB'] },
    { key: 'maxB', label: 'b upper limit of the hyperbolic search', value: sig4(s.constraints.maxB), unit: '', source: chosen(s.constraints.maxB, 1), engineKeys: ['fit.constraints.maxB'] },
    { key: 'windowStart', label: 'Fit window start', value: day(a.fitWindow.startDate), unit: 'date', source: a.fitWindow.startDate && dates[0] === day(a.fitWindow.startDate) ? 'First date of the data (set at import)' : 'Chosen by the analyst', engineKeys: ['fit.window.startDate'] },
    { key: 'windowEnd', label: 'Fit window end', value: day(a.fitWindow.endDate), unit: 'date', source: a.fitWindow.endDate && dates[dates.length - 1] === day(a.fitWindow.endDate) ? 'Last date of the data (set at import)' : 'Chosen by the analyst', engineKeys: ['fit.window.endDate'] },
    { key: 'excluded', label: 'Points excluded by the analyst', value: String(s.excluded.length), unit: '', source: s.excluded.length ? 'Chosen by the analyst, each with a reason (data table)' : 'None excluded', engineKeys: ['fit.excluded'] },
    { key: 'cutoff', label: 'Data cut-off (forecast starts the next day)', value: day(fc.historyEndDate), unit: 'date', source: 'The last date of the data', engineKeys: [] },
    { key: 'qi', label: 'qi, initial rate at the fit start', value: num(rate(fit.qi), 2), unit: rateU, source: `Fitted, at ${day(fit.t0)}`, engineKeys: ['forecast.fit.qi', 'forecast.fit.t0'] },
    { key: 'Di', label: 'Di, initial decline (nominal)', value: `${sig4(fit.Di)} per day; ${num(nominalAnnualPct(fit.Di), 2)} %/yr`, unit: '', source: 'Fitted. Nominal (instantaneous) decline at the fit start; a year is 365.25 days', engineKeys: ['forecast.fit.Di'] },
    { key: 'b', label: 'b, Arps exponent', value: sig4(fit.b), unit: '', source: fit.modelType === 'Hyperbolic' ? 'Fitted (grid search in steps of 0.05)' : `Fixed by the model (${fit.modelType})`, engineKeys: ['forecast.fit.b'] },
    { key: 'econLimit', label: 'Economic limit rate', value: cfg.stopAtLimit && cfg.economicLimit > 0 ? num(rate(cfg.economicLimit), 2) : 'none', unit: cfg.stopAtLimit && cfg.economicLimit > 0 ? rateU : '', source: `${chosen(cfg.economicLimit, defaults.economicLimit)}. A fixed rate below which the well no longer pays; no cost model behind it`, engineKeys: ['forecast.config.economicLimit', 'forecast.config.stopAtLimit'] },
    { key: 'horizon', label: 'Forecast horizon after the data cut-off', value: `${num(cfg.durationDays / DCA_DAYS_PER_YEAR, 2)} years (${num(cfg.durationDays)} days)`, unit: '', source: chosen(cfg.durationDays, defaults.durationDays), engineKeys: ['forecast.config.durationDays'] },
    { key: 'facility', label: 'Facility limit (maximum rate)', value: cfg.facilityLimit > 0 ? num(rate(cfg.facilityLimit), 2) : 'none', unit: cfg.facilityLimit > 0 ? rateU : '', source: chosen(cfg.facilityLimit || 0, 0), engineKeys: ['forecast.config.facilityLimit'] },
    { key: 'mc', label: 'Probabilistic forecast (Monte Carlo)', value: cfg.probabilisticMode ? `on, ${fc.probabilistic?.iterations ?? EMPTY_VALUE} runs` : 'off', unit: '', source: cfg.probabilisticMode ? 'Chosen by the analyst' : 'App default (off)', engineKeys: ['forecast.config.probabilisticMode'] },
    { key: 'seed', label: 'Monte Carlo seed', value: cfg.probabilisticMode ? String(fc.probabilistic?.seed ?? cfg.mcSeed ?? EMPTY_VALUE) : 'not used', unit: '', source: cfg.probabilisticMode ? chosen(cfg.mcSeed, defaults.mcSeed) : 'Not used: the forecast is deterministic', engineKeys: ['forecast.config.mcSeed'] },
    { key: 'limitUnc', label: 'Economic limit uncertainty', value: cfg.probabilisticMode ? `plus or minus ${num((cfg.economicLimitUncertainty ?? 0) * 100)}%` : 'not used', unit: '', source: cfg.probabilisticMode ? chosen(cfg.economicLimitUncertainty, defaults.economicLimitUncertainty) : 'Not used: the forecast is deterministic', engineKeys: ['forecast.config.economicLimitUncertainty'] },
  ];
  const missing = missingInputRows(engineInputsOf(well, stream), inputs);

  // ---- data summary (RL5) ----
  const sum = prepared.summary;
  const dataCounts = [
    ['Rows imported', num(sum.imported)],
    [`Rows with a ${STREAM_WORD[stream]} rate`, num(sum.withRate)],
    ['Outside the fit window', num(sum.outsideWindow)],
    ['At or below zero (left out by the engine)', num(sum.nonPositive)],
    ['Excluded by the analyst', num(sum.excludedByUser)],
    ['Used in the fit', num(sum.used)],
  ];
  const leftOut = prepared.rows.filter((r) => r.status !== 'used' && r.status !== 'outside' && r.status !== 'no-rate');
  const dataRows = prepared.rows.map((r) => [day(r.date), finite(r.rate) ? num(rate(r.rate), 2) : EMPTY_VALUE, r.status === 'used' ? 'used' : r.reason]);
  const importNotes = readBack ? [
    readBack.warnings?.length ? readBack.warnings.join(' ') : null,
    readBack.skipped?.length ? `${readBack.skipped.length} line(s) of the file were left out at import (for example line ${readBack.skipped[0].line}: ${readBack.skipped[0].reason}).` : null,
  ].filter(Boolean).join(' ') : '';

  // ---- results (RL3, RL8) ----
  const produced = fc.produced;
  const remaining = fc.remaining ?? fc.eur;
  const eur = fc.eurTotal;
  const closes = finite(produced) && finite(remaining) && finite(eur) && Math.abs(produced + remaining - eur) <= 1e-6 * Math.max(1, Math.abs(eur));
  const t0 = new Date(fit.t0).getTime();
  const histEnd = new Date(fc.historyEndDate).getTime();
  const tEndDays = (histEnd - t0) / DAY;
  const qAtCutoff = calculateArpsHyperbolic(fit.qi, fit.Di, fit.b, tEndDays);
  const limitDate = fc.limitReached && finite(fc.timeToLimit) ? new Date(histEnd + fc.timeToLimit * DAY).toISOString().slice(0, 10) : null;
  const endReason = fc.limitBeforeToday ? 'The fitted rate is below the economic limit at the data cut-off: nothing remains to the limit'
    : fc.limitReached ? `The forecast reaches the economic limit on ${limitDate}`
      : 'The economic limit is not reached inside the horizon: remaining reserves stop at the horizon';
  const eurRows = [
    [`Produced to the data cut-off (${day(fc.historyEndDate)})`, num(vol(produced)), volU, 'Trapezoids of the rate history from the first row'],
    [fc.limitReached ? 'Remaining, data cut-off to the economic limit' : 'Remaining, data cut-off to the horizon', num(vol(remaining)), volU, 'Daily sum of the fitted forecast after the cut-off'],
    ['EUR (produced + remaining)', num(vol(eur)), volU, closes ? 'Closes on the sum above' : 'DOES NOT CLOSE: report it'],
  ];
  const lifeRows = [
    ['Rate of the fit at the cut-off', `${num(rate(qAtCutoff), 2)} ${rateU}`],
    ['Time from the cut-off to the end of the forecast', `${num(fc.timeToLimit / DCA_DAYS_PER_YEAR, 2)} years (${num(fc.timeToLimit)} days)`],
    ['End of the forecast', endReason],
  ];
  const ci = fit.confidenceIntervals || {};
  const regression = [
    ['Model', MODEL_NAMES[fit.modelType] || fit.modelType],
    ['Method', fit.modelType === 'Exponential' ? 'Least squares of ln q against time' : fit.modelType === 'Harmonic' ? 'Least squares of 1/q against time' : 'Least squares of q^-b against time for each b on a 0.05 grid between the limits; the b with the lowest RMSE on rates'],
    ['Model choice', s.modelType === 'Auto' ? 'Lowest RMSE on rates of the three Arps forms' : 'Fixed by the analyst'],
    ['Points used', num(sum.used)],
    ['R2 (on rates)', finite(fit.R2) ? fit.R2.toFixed(4) : EMPTY_VALUE],
    ['RMSE (on rates)', `${num(rate(fit.RMSE), 2)} ${rateU}`],
    ['qi, 95% interval', ci.hasIntervals ? `${num(rate(fit.qi), 2)} plus or minus ${num(rate(ci.qi), 2)} ${rateU}` : 'not available'],
    ['Di, 95% interval', ci.hasIntervals ? `${num(nominalAnnualPct(fit.Di), 2)} plus or minus ${num(nominalAnnualPct(ci.Di), 2)} %/yr nominal` : 'not available'],
    ['b, interval', ci.hasIntervals && fit.modelType === 'Hyperbolic' ? `${sig4(fit.b)} plus or minus ${sig4(ci.b)} (assumed 10%: b comes from a grid search, not the regression)` : fit.modelType === 'Hyperbolic' ? 'not available' : 'fixed by the model'],
    ['Interval method', ci.hasIntervals ? 'Delta method on the standard errors of the linearised regression, 1.96 sigma' : 'The regression gave no usable intervals (too few points or a poor fit)'],
  ];
  const declineRows = [
    ['Nominal, per day (as fitted)', sig4(fit.Di), '1/d'],
    ['Nominal, per year', num(nominalAnnualPct(fit.Di), 2), '%/yr'],
    ['Nominal, in the display unit', declineUnitWord === '%/yr' ? num(nominalAnnualPct(fit.Di), 2) : sig4(u.declineTo(fit.Di)), declineUnitWord],
    ['Effective, first year', num(effectiveFirstYearPct(fit.Di, fit.b), 2), '%/yr'],
  ];
  const mc = isMc ? {
    rows: [
      ['P90 (low case: 90% chance of at least this)', num(vol(fc.probabilistic.p90)), volU],
      ['P50 (median)', num(vol(fc.probabilistic.p50)), volU],
      ['P10 (high case: 10% chance of at least this)', num(vol(fc.probabilistic.p10)), volU],
      ['Mean', num(vol(fc.probabilistic.mean)), volU],
    ],
    p90View: vol(fc.probabilistic.p90),
    p50View: vol(fc.probabilistic.p50),
    p10View: vol(fc.probabilistic.p10),
    note: `${fc.probabilistic.iterations} runs, seed ${fc.probabilistic.seed ?? 'not recorded'}, economic limit drawn uniformly within plus or minus ${num((fc.probabilistic.economicLimitUncertainty ?? 0) * 100)}%. qi, Di and b are drawn from normal distributions centred on the fit, sigma half the 95% half width. EUR here is from first production (the fit start) to the same end date as the deterministic forecast; percentiles are exceedance (P90 the low case).`,
  } : null;

  // ---- figures (RL6) ----
  const series = buildDcaSeries({ data: well.data, stream, fit, forecast: fc, fitWindow: a.fitWindow, excluded: s.excluded, forecastConfig: cfg, u });
  const histogram = isMc ? createEURHistogram((fc.probabilistic.distribution || []).map((v) => vol(v)), 15) : [];

  // ---- limits (RL9) ----
  const flags = [];
  if (fit.b > 1) flags.push(`b is ${sig4(fit.b)}, above 1. Arps above 1 describes transient or boundary-free flow; held to the end of a long horizon it overstates EUR, and without an economic limit it has no finite EUR. A terminal (minimum) decline is the usual cure; this app has none (Step 2).`);
  if (sum.used < 12) flags.push(`Only ${sum.used} points were used in the fit.`);
  const spanDays = usedDates.length > 1 ? (Date.parse(usedDates[usedDates.length - 1]) - Date.parse(usedDates[0])) / DAY : 0;
  if (spanDays > 0 && (fc.timeToLimit || 0) > 5 * spanDays) flags.push(`The forecast runs ${num(fc.timeToLimit / spanDays, 1)} times longer than the fit window it extrapolates (${num(spanDays / DCA_DAYS_PER_YEAR, 1)} years of data).`);
  if (finite(fit.R2) && fit.R2 < 0.8) flags.push(`R2 is ${fit.R2.toFixed(3)}: the model describes the data poorly.`);
  if (!ci.hasIntervals) flags.push('The regression gave no parameter intervals, so no probabilistic forecast could be run.');
  const lastRate = prepared.rows.filter((r) => finite(r.rate) && r.rate > 0).slice(-1)[0];
  if (lastRate && qAtCutoff > 0 && Math.abs(lastRate.rate - qAtCutoff) / lastRate.rate > 0.25) flags.push(`At the cut-off the fit gives ${num(rate(qAtCutoff), 1)} ${rateU} against a last measured ${num(rate(lastRate.rate), 1)} ${rateU} (${num(100 * (qAtCutoff - lastRate.rate) / lastRate.rate, 0)}%). The forecast starts from the fit, not from the last measurement.`);
  if (fc.limitBeforeToday) flags.push('The fit is below the economic limit at the cut-off, so remaining reserves are zero.');
  if (!fc.limitReached && !fc.limitBeforeToday) flags.push('The economic limit is not reached inside the horizon: remaining reserves and EUR stop at the horizon and are not reserves to the limit.');
  if (well.sample) flags.push('This is the sample well, built from published test data. It is not field data.');
  if (a.carried) flags.push(a.carried);

  const assumptions = [
    'Arps decline describes boundary-dominated flow at constant bottom-hole pressure and unchanged operating conditions. A change of choke, artificial lift, completion or offset injection starts a new decline that this fit does not see.',
    'The fit is one segment over the fit window. Earlier behaviour outside the window is shown on the plots and not used.',
    'b above 1 is not boundary-dominated behaviour; it overstates late rates when held to the end of the forecast.',
    'Forecasting extrapolates the fitted curve beyond the data; the further it runs, the less the data constrain it.',
    'Rates are daily rates at stock-tank conditions from the imported history; produced to date is the trapezoid sum of those rates and can differ from metered cumulative production.',
    'The economic limit is a fixed rate with no cost model; remaining reserves stop there.',
    'Intervals are first-order (delta method) estimates from the linearised regression; the b interval is assumed. The probabilistic forecast samples those intervals and is not an independent uncertainty assessment.',
    'Units: state is held in bbl/d, Mscf/d and a per-day decline; this report prints the display units named in its header. A year is 365.25 days.',
  ];

  return {
    ok: true,
    title: REPORT_TITLE,
    appName: REPORT_APP_NAME,
    generatedAt,
    wellName: well.name,
    stream,
    units: { rate: rateU, volume: volU, display: u.displayUnits() },
    identification,
    inputs,
    missing,
    dataCounts,
    dataRows,
    leftOut: leftOut.map((r) => [day(r.date), finite(r.rate) ? num(rate(r.rate), 2) : EMPTY_VALUE, r.reason]),
    importNotes,
    eurRows,
    closes,
    lifeRows,
    regression,
    declineRows,
    mc,
    series,
    histogram,
    flags,
    assumptions,
    headline: { produced: vol(produced), remaining: vol(remaining), eur: vol(eur), qi: rate(fit.qi), diPctYr: nominalAnnualPct(fit.Di), b: fit.b },
  };
}

// ---- the PDF ---------------------------------------------------------------

const RGB = Object.freeze({
  used: [37, 99, 235], left: [148, 163, 184], fit: [5, 150, 105], forecast: [217, 119, 6], limit: [220, 38, 38], band: [124, 58, 237], p10: [162, 28, 175], p90: [159, 18, 57],
});

/** The figure list of the report, from the model (also what the Report tab names). */
export function dcaFigures(m) {
  const s = m.series;
  const rateUnit = m.units.rate;
  const volUnit = m.units.volume;
  const figs = [];
  const rateSeries = [
    { name: 'Data used in the fit', type: 'scatter', rgb: RGB.used, pts: s.used, marker: 'circle' },
    s.left.length ? { name: 'Data left out', type: 'scatter', rgb: RGB.left, pts: s.left, marker: 'square' } : null,
    { name: 'Fitted model', type: 'line', rgb: RGB.fit, pts: s.fitted, width: 0.5 },
    { name: 'Forecast', type: 'line', rgb: RGB.forecast, pts: s.forecast, dash: [1.5, 1] },
    s.p10.length ? { name: 'P10 (high)', type: 'line', rgb: RGB.p10, pts: s.p10, dash: [0.6, 0.8] } : null,
    s.p90.length ? { name: 'P90 (low)', type: 'line', rgb: RGB.p90, pts: s.p90, dash: [0.6, 0.8] } : null,
  ].filter(Boolean);
  figs.push({
    id: 'rate-time',
    title: 'Rate against time (log rate)',
    caption: `${m.wellName}, ${m.stream}. Data used in the fit, data left out, the fitted Arps model over the fit window (shaded) and the forecast from the data cut-off${s.limit != null ? `; the economic limit of ${num(s.limit, 2)} ${rateUnit} dashed` : ''}. The fit is one segment: no segment boundary to mark.${s.stride > 1 ? ` Every ${s.stride}th of the ${num(s.historyRows)} rows is drawn; the fit used them all.` : ''}`,
    panels: [{
      height: 82,
      spec: {
        xTitle: 'Date', yTitle: `Rate (${rateUnit})`, xDate: true, yLog: true,
        series: rateSeries,
        bands: s.window ? [{ x0: s.window.t0, x1: s.window.t1, label: 'Fit window' }] : [],
        lines: [
          ...(s.limit != null ? [{ y: s.limit, label: `Economic limit ${num(s.limit, 2)} ${rateUnit}`, rgb: RGB.limit, dash: [1.5, 1] }] : []),
          ...(s.forecastStart ? [{ x: s.forecastStart, label: 'Data cut-off', dash: [0.8, 0.8] }] : []),
        ],
        notes: [`qi ${num(m.headline.qi, 1)} ${rateUnit}, Di ${num(m.headline.diPctYr, 2)} %/yr nominal, b ${sig4(m.headline.b)}`],
        notesAt: 'top-right',
      },
    }],
  });
  figs.push({
    id: 'rate-cum',
    title: 'Rate against cumulative production',
    caption: `The rate history against the cumulative produced from the first row (trapezoids), the fitted rate at the data dates, and the forecast to EUR ${num(m.headline.eur)} ${volUnit}.`,
    panels: [{
      height: 72,
      spec: {
        xTitle: `Cumulative (${volUnit})`, yTitle: `Rate (${rateUnit})`,
        series: [
          { name: 'Data', type: 'scatter', rgb: RGB.used, pts: s.rateCumHistory, marker: 'circle' },
          { name: 'Fitted model', type: 'line', rgb: RGB.fit, pts: s.rateCumFitted },
          { name: 'Forecast', type: 'line', rgb: RGB.forecast, pts: s.rateCumForecast, dash: [1.5, 1] },
        ],
        lines: [
          ...(s.limit != null ? [{ y: s.limit, label: 'Economic limit', rgb: RGB.limit, dash: [1.5, 1] }] : []),
          ...(s.eur != null ? [{ x: s.eur, label: 'EUR', rgb: RGB.limit, dash: [0.8, 0.8] }] : []),
        ],
      },
    }],
  });
  figs.push({
    id: 'cum-time',
    title: 'Cumulative production against time',
    caption: `Cumulative from the first row: the history (trapezoids of the rates) and the forecast on top of what was produced, ending at EUR ${num(m.headline.eur)} ${volUnit}.`,
    panels: [{
      height: 66,
      spec: {
        xTitle: 'Date', yTitle: `Cumulative (${volUnit})`, xDate: true,
        series: [
          { name: 'Cumulative to the cut-off', type: 'line', rgb: RGB.used, pts: s.cumHistory },
          { name: 'Forecast', type: 'line', rgb: RGB.forecast, pts: s.cumForecast, dash: [1.5, 1] },
        ],
        lines: s.eur != null ? [{ y: s.eur, label: `EUR ${num(s.eur)} ${volUnit}`, rgb: RGB.limit, dash: [1.5, 1] }] : [],
      },
    }],
  });
  if (m.mc && m.histogram.length) {
    const width = m.histogram.length > 1 ? (m.histogram[1].bin - m.histogram[0].bin) : 1;
    figs.push({
      id: 'eur-distribution',
      title: 'EUR distribution (Monte Carlo)',
      caption: `${m.mc.note} P90, P50 and P10 marked.`,
      panels: [{
        height: 62,
        spec: {
          xTitle: `EUR (${volUnit})`, yTitle: 'Runs',
          barWidth: width * 0.9,
          series: [{ name: 'Runs', type: 'bar', rgb: RGB.band, pts: m.histogram.map((h) => [h.bin, h.count]) }],
          lines: [
            { x: m.mc.p90View, label: 'P90', rgb: RGB.p90, dash: [1, 1] },
            { x: m.mc.p50View, label: 'P50', rgb: RGB.forecast, dash: [1, 1], row: 1 },
            { x: m.mc.p10View, label: 'P10', rgb: RGB.p10, dash: [1, 1], row: 2 },
          ].filter((l) => finite(l.x)),
        },
      }],
    });
  } else {
    figs.push({ id: 'eur-distribution', title: 'EUR distribution (Monte Carlo)', statement: 'Does not apply: the forecast is deterministic. Switch on probabilistic mode and run the forecast again for a distribution.' });
  }
  return figs;
}

const INPUT_COLUMNS = Object.freeze({ 0: { cellWidth: 52 }, 1: { cellWidth: 46 }, 2: { cellWidth: 16 } });

/** Rows of the data table before the report says where the rest is. */
export const MAX_DATA_ROWS = 120;

/**
 * Build the PDF.
 * @param {object} model collectDcaReportArgs(...)
 * @param {{logo?: object}} [opts]
 * @returns {{doc: object, figures: Array, pages: number, model: object}}
 */
export function buildDcaPdf(model, { logo = null } = {}) {
  if (!model?.ok) throw new Error(model?.refusal || 'The report could not be built.');
  if (model.missing?.length) throw new Error(`The report was not built: no inputs row for ${model.missing.join(', ')}.`);
  const r = createReport({ title: REPORT_TITLE, appName: REPORT_APP_NAME, logo });
  r.header({ identification: model.identification, displayUnits: model.units.display, generatedAt: model.generatedAt });

  r.table('Headline results', ['Quantity', 'Value', 'Unit', 'How'], model.eurRows, {
    note: model.closes ? 'EUR is the sum of the two rows above it.' : 'The parts do not close on EUR.',
  });
  r.table('Life', ['Quantity', 'Value'], model.lifeRows);
  r.inputsTable(model.inputs, {
    title: 'Inputs',
    columnStyles: INPUT_COLUMNS,
    note: 'Every value the fit and the forecast read. "App default" means the value the app starts with was not changed; it is printed so a reader can judge it.',
  });
  r.table('Decline rate and its basis', ['Basis', 'Value', 'Unit'], model.declineRows, {
    note: 'The fit holds Di as the nominal (instantaneous) decline per day at the fit start. Per year it is that times 365.25. The effective first-year decline is the share of the initial rate lost over the first year, read off the fitted curve.',
  });
  r.table('Regression', ['Item', 'Value'], model.regression);
  if (model.mc) r.table('Monte Carlo EUR', ['Percentile', 'Value', 'Unit'], model.mc.rows, { note: model.mc.note });
  else r.section('Monte Carlo EUR', 'Not run: the forecast is deterministic.');

  r.table('Data used and left out', ['Count', 'Rows'], model.dataCounts, {
    note: model.importNotes || 'Used plus outside the window plus at or below zero plus excluded plus rows with no rate equals the rows imported.',
  });
  if (model.leftOut.length) r.table('Points left out of the fit and why', ['Date', `Rate (${model.units.rate})`, 'Reason'], model.leftOut);
  const rows = model.dataRows.length > MAX_DATA_ROWS ? model.dataRows.slice(0, MAX_DATA_ROWS) : model.dataRows;
  r.table('Production data', ['Date', `Rate (${model.units.rate})`, 'In the fit'], rows, {
    note: model.dataRows.length > MAX_DATA_ROWS ? `The first ${MAX_DATA_ROWS} of ${model.dataRows.length} rows; the counts above cover them all.` : undefined,
  });

  r.limits({ assumptions: model.assumptions, flags: model.flags, noFlagsText: 'Nothing in this analysis is flagged.' });

  const figs = r.figures(dcaFigures(model));
  const out = r.finish({ footer: `${REPORT_TITLE}, ${model.wellName}, ${model.stream}` });
  return { ...out, figuresBuilt: figs, model };
}

/** Build and save the PDF (the Export button). */
export async function exportDcaPdf(model) {
  const { loadPetrolordLogo } = await import('@/lib/pdfBrand');
  const logo = await loadPetrolordLogo().catch(() => null);
  const { doc } = buildDcaPdf(model, { logo });
  const name = `${String(model.wellName || 'well').replace(/[^\w.-]+/g, '_')}_${model.stream}_decline_report.pdf`;
  doc.save(name);
  return name;
}
