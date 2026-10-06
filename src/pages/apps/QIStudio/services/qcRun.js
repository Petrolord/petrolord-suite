// Seismic QC over a stored v4 volume (QI programme Q4a / A5, 2026-10-06):
// spectra and bandwidth per time window, signal-to-noise per sampled inline,
// and the acquisition footprint on time slices, from the engines'
// seismicQc.js. One function for the seismic worker (whole volume, the
// seismic_qc job) and the browser (the same sampling on a window): getBrick
// is the only difference. Pure apart from the brick reads.

import { averageSpectrum, spectrumStats, snrFromCoherency, footprint } from '../engine/seismicQc';
import { assembleSlices } from '../../../../../packages/engines/engines/seismolord/sliceAssembly';

const evenly = (n, k) => {
  if (n <= k) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: k }, (_, i) => Math.round(((i + 0.5) * n) / k - 0.5));
};

/** A spectrum thinned to about `points` values for storing and drawing. */
function thin({ freqHz, amp }, points = 160) {
  const step = Math.max(1, Math.floor(freqHz.length / points));
  const f = []; const a = [];
  for (let k = 0; k < freqHz.length; k += step) { f.push(Number(freqHz[k].toFixed(3))); a.push(Number(amp[k].toPrecision(5))); }
  return { freqHz: f, amp: a };
}

/**
 * @param {Object} p
 * @param {(i, j, k) => Promise<Float32Array>} p.getBrick
 * @param {{nIl, nXl, ns, brickSize, grid}} p.geom
 * @param {number} p.dtMs sample interval
 * @param {number} [p.inlines] inlines sampled (default 12)
 * @param {number} [p.tracesPerInline] traces per inline for the spectra (default 64)
 * @param {number} [p.windows] equal time windows (default 3)
 * @param {number} [p.slices] time slices for the footprint (default 3)
 * @param {number} [p.rmsHalf] the RMS map of each slice spans +/- rmsHalf samples (default 8)
 */
export async function runSeismicQc({ getBrick, geom, dtMs, inlines = 12, tracesPerInline = 64, windows = 3, slices = 3, rmsHalf = 8, onProgress, shouldCancel }) {
  if (!(dtMs > 0)) throw new Error('The volume has no sample interval.');
  const ilIdx = evenly(geom.nIl, inlines);
  const winLen = Math.floor(geom.ns / windows);
  if (winLen < 16) throw new Error('The traces are too short to split into time windows.');
  const wins = Array.from({ length: windows }, (_, w) => ({ s0: w * winLen, s1: w === windows - 1 ? geom.ns : (w + 1) * winLen }));
  const perWindow = wins.map(() => ({ traces: [], snr: [] }));
  const inlineSlices = await assembleSlices(getBrick, geom, 'inline', ilIdx, { onProgress: (d, t) => onProgress?.(0.7 * (t ? d / t : 0), 'Reading inlines') });
  if (shouldCancel?.()) return null;
  const xlPick = evenly(geom.nXl, tracesPerInline);
  for (const il of ilIdx) {
    const { data: sl, nullValue } = inlineSlices.get(il); // width ns, height nXl: row j is crossline j's trace
    // nulls are stored as a sentinel; the engine skips non-finite samples
    const traceAt = (j, s0, s1) => Float64Array.from(sl.subarray(j * geom.ns + s0, j * geom.ns + s1), (v) => (v === nullValue ? NaN : v));
    wins.forEach((w, k) => {
      for (const j of xlPick) perWindow[k].traces.push(traceAt(j, w.s0, w.s1));
      const neighbours = [];
      for (let j = 0; j < Math.min(geom.nXl, 200); j++) neighbours.push(traceAt(j, w.s0, w.s1));
      try { perWindow[k].snr.push({ inline: il, ...snrFromCoherency(neighbours) }); } catch { /* an all-null inline is skipped */ }
    });
  }
  const windowsOut = wins.map((w, k) => {
    const spec = averageSpectrum(perWindow[k].traces, dtMs);
    const snrs = perWindow[k].snr.map((s) => s.snr).sort((a, b) => a - b);
    const median = snrs.length ? snrs[Math.floor((snrs.length - 1) / 2)] : NaN;
    return {
      t0Ms: w.s0 * dtMs,
      t1Ms: w.s1 * dtMs,
      stats: spectrumStats(spec),
      spectrum: thin(spec),
      snr: { median, medianDb: median > 0 ? 10 * Math.log10(median) : null, perInline: perWindow[k].snr.map((s) => ({ inline: s.inline, snr: s.snr })) },
    };
  });
  // the footprint on RMS-amplitude maps (the usual footprint display): the
  // RMS over +/- rmsHalf samples around each slice time, then the striping
  // of that map. Neighbouring slices share bricks, so the extra reads are few.
  const sIdx = evenly(geom.ns, slices).map((s) => Math.min(geom.ns - 1, s));
  const wanted = [];
  for (const s of sIdx) for (let d = -rmsHalf; d <= rmsHalf; d++) { const q = s + d; if (q >= 0 && q < geom.ns) wanted.push(q); }
  const timeSlices = await assembleSlices(getBrick, geom, 'time', [...new Set(wanted)], { onProgress: (d, t) => onProgress?.(0.7 + 0.25 * (t ? d / t : 0), 'Reading time slices') });
  const footprints = sIdx.map((s) => {
    const n = geom.nIl * geom.nXl;
    const sum = new Float64Array(n); const cnt = new Uint16Array(n);
    for (let d = -rmsHalf; d <= rmsHalf; d++) {
      const got = timeSlices.get(s + d);
      if (!got) continue;
      const { data, nullValue } = got;
      for (let q = 0; q < n; q++) { const v = data[q]; if (v !== nullValue && Number.isFinite(v)) { sum[q] += v * v; cnt[q] += 1; } }
    }
    const rows = Array.from({ length: geom.nIl }, (_, i) => Float64Array.from({ length: geom.nXl }, (_, j) => { const q = i * geom.nXl + j; return cnt[q] ? Math.sqrt(sum[q] / cnt[q]) : NaN; }));
    try {
      const f = footprint(rows);
      // how many repeats of the period the slice holds: a footprint repeats
      // many times; three cycles of a random profile can look periodic
      const withCycles = (v, n) => ({ ...v, cycles: Number.isFinite(v.period) && v.period > 0 ? n / v.period : 0 });
      return { tMs: s * dtMs, rmsWindowMs: (2 * rmsHalf + 1) * dtMs, alongCrossline: withCycles(f.alongCrossline, geom.nXl), alongInline: withCycles(f.alongInline, geom.nIl) };
    } catch (e) { return { tMs: s * dtMs, error: e.message }; }
  });
  onProgress?.(1, 'Done');
  return { sampled: { inlines: ilIdx.length, tracesPerInline: xlPick.length }, windows: windowsOut, footprints };
}

/**
 * QC issues for the issue register, from a result: weak signal, a narrow
 * band, a footprint, and a band that collapses with depth.
 */
/** The footprint rule: a large share, a prominent peak and at least five repeats across the slice. */
export const isStripe = (v) => !!v && v.share > 0.3 && v.prominence >= 10 && v.cycles >= 5;

export function qcIssues(result, volumeName = 'the volume') {
  const out = [];
  const add = (key, severity, title, detail, remedy) => out.push({ key: `qc:${volumeName}:${key}`, area: 'Seismic QC', severity, title, detail, remedy });
  for (const w of result.windows) {
    const label = `${Math.round(w.t0Ms)} to ${Math.round(w.t1Ms)} ms`;
    if (w.snr.median < 1) add(`snr-${w.t0Ms}`, 'high', `${volumeName}: signal weaker than noise, ${label}`, `Median signal-to-noise ${w.snr.median.toFixed(2)} (${w.snr.medianDb?.toFixed(1)} dB).`, 'Review the processing (noise attenuation, stacking fold); amplitudes in this window are unreliable for QI.');
    else if (w.snr.median < 3) add(`snr-${w.t0Ms}`, 'medium', `${volumeName}: low signal-to-noise, ${label}`, `Median signal-to-noise ${w.snr.median.toFixed(2)} (${w.snr.medianDb?.toFixed(1)} dB).`, 'Consider structure-oriented filtering before amplitude work; carry the noise into the feasibility models.');
    if (w.stats.bandwidth6Hz < 10) add(`band-${w.t0Ms}`, 'medium', `${volumeName}: narrow band, ${label}`, `The -6 dB band is ${w.stats.band6[0].toFixed(1)} to ${w.stats.band6[1].toFixed(1)} Hz (${w.stats.bandwidth6Hz.toFixed(1)} Hz wide).`, 'Expect poor vertical resolution: check tuning thickness against the targets in Rock Physics Studio (Wedge).');
  }
  if (result.windows.length > 1) {
    const first = result.windows[0].stats.peakHz;
    const last = result.windows[result.windows.length - 1].stats.peakHz;
    if (first > 0 && last / first < 0.6) add('attenuation', 'low', `${volumeName}: dominant frequency falls with depth`, `Peak ${first.toFixed(1)} Hz shallow, ${last.toFixed(1)} Hz deep.`, 'Use a time-varying wavelet for ties and inversion.');
  }
  for (const f of result.footprints) {
    for (const [axis, v] of [['crossline', f.alongCrossline], ['inline', f.alongInline]]) {
      // a real stripe: a large share, well above the band's random level, repeated across the slice
      if (isStripe(v)) add(`footprint-${axis}-${f.tMs}`, 'medium', `${volumeName}: acquisition footprint at ${Math.round(f.tMs)} ms`, `A stripe every ${v.period.toFixed(1)} ${axis}s holds ${Math.round(v.share * 100)} percent of the slice variance along the ${axis}s.`, 'Treat amplitude maps with care; consider footprint suppression (kx-ky filtering) before QI.');
    }
  }
  return out;
}
