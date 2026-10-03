// Decline Curve Analysis: the fit and the deterministic forecast of one
// stream of one well, as one pure path (DCA-U1). The studio context, the
// sample well, the report tests and the sender all call these, so a gate
// that holds the report against a fit holds it against the fit the app made.
import { fitArpsModel } from './dcaEngine';
import { forecastFromHistory } from './forecastFromHistory';
import { validateFitInput } from './dcaErrorHandling';
import { analysisOf, prepareFitData, fitBasisOf, forecastBasisOf } from './dcaModel';

/**
 * Fit one stream of a well on its window, without the excluded points.
 * @returns {{ok: true, fit: object, summary: object}|{ok: false, error: string}}
 */
export function fitWell(well, stream, { now = new Date() } = {}) {
  const a = analysisOf(well);
  const s = a.streams[stream];
  const data = well?.data || [];
  const prepared = prepareFitData(data, stream, a.fitWindow, s.excluded);
  if (prepared.summary.withRate === 0 && data.length > 0) {
    return { ok: false, error: `No ${stream} rates in this well's data. Import a file with a ${stream} column to fit this stream.` };
  }
  const validation = validateFitInput(prepared.points, a.fitWindow, s.modelType);
  if (!validation.valid) return { ok: false, error: validation.error };
  const result = fitArpsModel(prepared.points, s.modelType, null, s.constraints);
  if (!(result && result.qi > 0 && result.modelType && result.modelType !== 'None')) {
    return { ok: false, error: 'Fit failed - check data quality' };
  }
  return {
    ok: true,
    summary: prepared.summary,
    fit: {
      ...result,
      fittedAt: now.toISOString(),
      points: prepared.summary,
      basis: fitBasisOf({ data, stream, window: a.fitWindow, modelType: s.modelType, constraints: s.constraints, excluded: s.excluded }),
    },
  };
}

/** The deterministic forecast of the stream's fit, stamped with what it was run on. */
export function forecastWell(well, stream, { now = new Date(), fit = null } = {}) {
  const a = analysisOf(well);
  const s = a.streams[stream];
  const f = fit || s.fitResults;
  if (!f) return null;
  const fc = forecastFromHistory(f, s.forecastConfig, well?.data || [], stream);
  return { ...fc, forecastAt: now.toISOString(), basis: forecastBasisOf(f, s.forecastConfig, well?.data || [], stream) };
}

/** A copy of the well with one stream's fit and forecast replaced. */
export function withStreamResults(well, stream, patch) {
  const a = analysisOf(well);
  return { ...well, analysis: { ...a, streams: { ...a.streams, [stream]: { ...a.streams[stream], ...patch } } } };
}
