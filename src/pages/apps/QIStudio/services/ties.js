// Well ties across the study (QI programme Q6a / A6, 2026-10-06): the tie
// each well has in Seismolord (the QC record committed with the tie: the
// windowed correlation, the bulk shift, the phase and the wavelet), the
// wavelets compared and averaged across wells (engines qi/wavelets.js), and
// the issues a QI study cares about: wells with no tie, poor ties,
// inconsistent phase or frequency between wells, a well whose wavelet does
// not fit the others. Pure.

import { compareWavelets, resampleWavelet } from '../engine/wavelets';

/** The stored tie of a well, or null. */
export function tieOf(well) {
  const qc = well?.checkshots_derived?.provenance?.qc;
  if (!qc) return null;
  const w = qc.wavelet || null;
  return {
    meanCorr: qc.mean_corr ?? null,
    minCorr: qc.min_corr ?? null,
    shiftMs: qc.bulk_shift_ms ?? null,
    phaseDeg: qc.phase_deg ?? null,
    anchors: qc.anchors || 0,
    volume: qc.volume || null,
    measuredAt: qc.measured_at || null,
    wavelet: w ? {
      kind: w.kind || null,
      peakHz: w.peak_hz ?? null,
      phaseDeg: w.phase_deg ?? null,
      samples: Array.isArray(w.samples) && w.samples.length >= 5 && Number(w.dt_ms) > 0 ? w.samples : null,
      dtMs: Number(w.dt_ms) > 0 ? Number(w.dt_ms) : null,
    } : null,
  };
}

/** One row per chosen well. */
export function tieRows(ready) {
  return ready.map((r) => ({ wellId: r.well.id, wellName: r.well.name, tie: tieOf(r.well) }));
}

/**
 * The wavelets of the wells that stored one, on one sample interval (the
 * finest) and one length (the shortest, centred), compared and averaged.
 * @returns {null | {dtMs, names: string[], average, aligned, similarity, misfit}}
 */
export function waveletComparison(rows) {
  const withW = rows.filter((r) => r.tie?.wavelet?.samples);
  if (withW.length < 2) return null;
  const dt = Math.min(...withW.map((r) => r.tie.wavelet.dtMs));
  const resampled = withW.map((r) => ({ name: r.wellName, w: r.tie.wavelet.dtMs === dt ? Float64Array.from(r.tie.wavelet.samples) : resampleWavelet(r.tie.wavelet.samples, r.tie.wavelet.dtMs, dt) }));
  const n = Math.min(...resampled.map((x) => x.w.length));
  const crop = (w) => { const s = Math.floor((w.length - n) / 2); return w.subarray(s, s + n); };
  const cmp = compareWavelets(resampled.map((x) => ({ name: x.name, samples: crop(x.w) })), { maxLag: Math.max(2, Math.round(20 / dt)) });
  return { dtMs: dt, names: resampled.map((x) => x.name), ...cmp };
}

const spread = (vals) => (vals.length ? Math.max(...vals) - Math.min(...vals) : 0);

/** Tie issues for the register. */
export function tieIssues(rows, comparison) {
  const out = [];
  const add = (key, severity, title, detail, remedy) => out.push({ key: `tie:${key}`, area: 'Well tie', severity, title, detail, remedy });
  for (const r of rows) {
    const t = r.tie;
    if (!t) { add(`${r.wellId}:none`, 'medium', `${r.wellName}: no well tie`, 'No tie has been committed for this well in Seismolord.', 'Tie the well in Seismolord (Synthetics), using the drift-corrected sonic where there is one, and commit the tie.'); continue; }
    if (t.meanCorr != null && t.meanCorr < 0.5) add(`${r.wellId}:poor`, 'high', `${r.wellName}: poor tie`, `Mean windowed correlation ${t.meanCorr.toFixed(2)}.`, 'Revisit the tie: the sonic (drift-correct it to the checkshots), the wavelet, the bulk shift and stretch anchors. A poor tie undermines every amplitude interpretation at this well.');
    else if (t.meanCorr != null && t.meanCorr < 0.7) add(`${r.wellId}:fair`, 'medium', `${r.wellName}: fair tie`, `Mean windowed correlation ${t.meanCorr.toFixed(2)}${t.minCorr != null ? `, minimum ${t.minCorr.toFixed(2)}` : ''}.`, 'Check the target window in particular; consider a drift-corrected sonic or a well-extracted wavelet.');
    if (t.wavelet && !t.wavelet.samples && t.wavelet.kind !== 'ricker') add(`${r.wellId}:nowavelet`, 'low', `${r.wellName}: tie wavelet not stored`, 'This tie was committed before wavelets were kept, so only its peak and phase are known.', 'Re-commit the tie in Seismolord to keep the wavelet itself for modelling and inversion.');
  }
  const phases = rows.map((r) => r.tie?.wavelet?.phaseDeg).filter((v) => Number.isFinite(v));
  if (phases.length >= 2 && spread(phases) > 30) add('phase-spread', 'medium', 'Wavelet phase differs between wells', `The tie wavelets range from ${Math.min(...phases).toFixed(0)} to ${Math.max(...phases).toFixed(0)} degrees.`, 'Look for a processing change across the survey or a mis-tie; one wavelet for the study needs consistent phase.');
  const peaks = rows.map((r) => r.tie?.wavelet?.peakHz).filter((v) => Number.isFinite(v) && v > 0);
  if (peaks.length >= 2 && spread(peaks) / Math.min(...peaks) > 0.25) add('peak-spread', 'low', 'Wavelet frequency differs between wells', `Peak frequencies from ${Math.min(...peaks).toFixed(1)} to ${Math.max(...peaks).toFixed(1)} Hz.`, 'Expect a time- or space-varying wavelet; check whether the wells sit at different target depths.');
  if (comparison) {
    for (const m of comparison.misfit) {
      if (m.corrToAverage < 0.8) add(`misfit:${m.name}`, 'medium', `${m.name}: wavelet unlike the others`, `Correlation with the average wavelet ${m.corrToAverage.toFixed(2)}.`, 'Leave this well out of the field wavelet, or re-extract it over a better window.');
    }
  }
  return out;
}
