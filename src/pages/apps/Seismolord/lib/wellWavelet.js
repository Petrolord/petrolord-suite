// Wavelets at the well and tie QC stored with the tie (upgrade U2-013).
//
// Two wavelets now come from the seismic at the well:
//  - statistical (engines extractStatisticalWavelet, W-series oracle): the
//    amplitude spectrum of the traces' autocorrelation, zero phase. By the
//    Wiener-Khinchin theorem its spectrum is the source wavelet's spectrum
//    when the reflectivity is white, but its phase is assumed (zero);
//  - from the well (this module): the least-squares (Wiener) wavelet that
//    best convolves the well's reflectivity into the seismic trace at the
//    well, so its phase is measured, not assumed (the Petrel and Kingdom
//    well-based extraction). Mildly damped (lambda) so noise and short
//    logs do not blow it up.
// Each wavelet is described by its peak frequency and its constant phase
// (the rotation of the zero-phase wavelet with the same amplitude
// spectrum that best matches it).
//
// Tie QC: the windowed correlation, its mean and minimum, the bulk shift,
// the phase applied and the wavelet used, rounded into a small record the
// commit stores in the existing provenance jsonb (geo_wells
// checkshots_derived.provenance and the volume's velocity_calibration), so
// a reviewer can audit the tie later. No schema change.

import { estimatePhaseRotation } from '../engine/tieWarp';

const NULL_F32 = Math.fround(1.0e30);
const live = (v) => v !== NULL_F32 && Number.isFinite(v);

function solveDense(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let q = c + 1; q < n; q++) if (Math.abs(M[q][c]) > Math.abs(M[p][c])) p = q;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let q = c + 1; q < n; q++) {
      const f = M[q][c] / M[c][c];
      if (f) for (let m = c; m <= n; m++) M[q][m] -= f * M[c][m];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/**
 * Least-squares wavelet from the well: w minimising
 * sum_t (sum_k w[k] rc[t - k] - s[t])^2 + lambda * sum_k w[k]^2 over the
 * samples where both are live; k = -half..half (centre = zero lag).
 * @param {ArrayLike<number>} rc reflectivity on the seismic time grid
 * @param {ArrayLike<number>} seismic the trace at the well, same grid
 * @param {{halfLength?: number, damping?: number}} [opts] damping relative
 *   to the mean diagonal of the normal equations
 * @returns {{wavelet: Float32Array, used: number, fitCorr: number}}
 */
export function extractWellWavelet(rc, seismic, { halfLength = 15, damping = 1e-3 } = {}) {
  const L = halfLength;
  const n = Math.min(rc.length, seismic.length);
  const m = 2 * L + 1;
  const rows = [];
  for (let t = 0; t < n; t++) {
    if (!live(seismic[t])) continue;
    const row = new Float64Array(m);
    let ok = true;
    let energy = 0;
    for (let k = -L; k <= L; k++) {
      const i = t - k;
      const v = i >= 0 && i < n ? rc[i] : 0;
      if (i >= 0 && i < n && !live(v)) { ok = false; break; }
      row[k + L] = live(v) ? v : 0;
      energy += row[k + L] * row[k + L];
    }
    if (ok) rows.push([row, seismic[t], energy]);
  }
  if (!rows.some((r) => r[2] > 0)) throw new Error('The well reflectivity is flat over the seismic at the well, so there is nothing to extract a wavelet from.');
  if (rows.length < 2 * m) {
    throw new Error(`The log covers ${rows.length} usable samples at the well; a ${m}-sample wavelet needs at least ${2 * m}. Shorten the wavelet or use the statistical one.`);
  }
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  for (const [row, s] of rows) {
    for (let i = 0; i < m; i++) {
      b[i] += row[i] * s;
      for (let j = i; j < m; j++) A[i][j] += row[i] * row[j];
    }
  }
  let diag = 0;
  for (let i = 0; i < m; i++) { for (let j = 0; j < i; j++) A[i][j] = A[j][i]; diag += A[i][i]; }
  const lam = damping * (diag / m);
  for (let i = 0; i < m; i++) A[i][i] += lam;
  const w = solveDense(A, b);
  if (!w) throw new Error('The reflectivity at the well is too weak to extract a wavelet.');
  // fit quality: correlation of rc * w with the seismic over the used rows
  let xy = 0; let xx = 0; let yy = 0;
  for (const [row, s] of rows) {
    let p = 0;
    for (let i = 0; i < m; i++) p += row[i] * w[i];
    xy += p * s; xx += p * p; yy += s * s;
  }
  const peak = Math.max(...w.map(Math.abs)) || 1;
  return {
    wavelet: Float32Array.from(w, (v) => v / peak),
    used: rows.length,
    fitCorr: xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0,
  };
}

/** |DFT| of a centred wavelet at nfft points (small n, direct sums). */
function amplitudeSpectrum(w, nfft) {
  const L = (w.length - 1) / 2;
  const out = new Float64Array(nfft / 2 + 1);
  for (let f = 0; f <= nfft / 2; f++) {
    let re = 0; let im = 0;
    for (let k = 0; k < w.length; k++) {
      const a = (-2 * Math.PI * f * (k - L)) / nfft;
      re += w[k] * Math.cos(a); im += w[k] * Math.sin(a);
    }
    out[f] = Math.hypot(re, im);
  }
  return out;
}

/** The zero-phase wavelet with the same amplitude spectrum. */
function zeroPhaseOf(w, nfft) {
  const amp = amplitudeSpectrum(w, nfft);
  const L = (w.length - 1) / 2;
  const out = new Float32Array(w.length);
  for (let k = -L; k <= L; k++) {
    let s = amp[0];
    for (let f = 1; f < nfft / 2; f++) s += 2 * amp[f] * Math.cos((2 * Math.PI * f * k) / nfft);
    s += amp[nfft / 2] * Math.cos(Math.PI * k);
    out[k + L] = s / nfft;
  }
  return out;
}

/**
 * Peak frequency and constant phase of a centred wavelet.
 * @returns {{peakHz: number, phaseDeg: ?number}}
 */
export function describeWavelet(w, dtMs) {
  let nfft = 256;
  while (nfft < 4 * w.length) nfft *= 2;
  const amp = amplitudeSpectrum(w, nfft);
  let best = 1;
  for (let f = 1; f < amp.length; f++) if (amp[f] > amp[best]) best = f;
  // parabolic refinement of the peak bin
  let off = 0;
  if (best > 0 && best < amp.length - 1) {
    const den = amp[best - 1] - 2 * amp[best] + amp[best + 1];
    if (den < 0) off = (0.5 * (amp[best - 1] - amp[best + 1])) / den;
  }
  const df = 1000 / (nfft * dtMs);
  const est = estimatePhaseRotation(zeroPhaseOf(w, nfft), w, { minOverlap: Math.min(8, w.length) });
  return { peakHz: (best + off) * df, phaseDeg: est ? est.phiDeg : null };
}

/** Normalised correlation of two same-length wavelets. */
export function waveletCorrelation(a, b) {
  let xy = 0; let xx = 0; let yy = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { xy += a[i] * b[i]; xx += a[i] * a[i]; yy += b[i] * b[i]; }
  return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0;
}

/** At most 121 samples about the centre, 5 significant digits (the stored copy of a wavelet). */
export function storedSamples(w, max = 121) {
  const n = w.length;
  const keep = Math.min(n, max % 2 ? max : max - 1);
  const start = Math.floor((n - keep) / 2);
  return Array.from({ length: keep }, (_, i) => Number(Number(w[start + i]).toPrecision(5)));
}

const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/**
 * The tie QC record stored with the tie.
 * @param {{qc: ?Array<{twtMs, corr}>, shiftMs?: number, phiDeg?: ?number,
 *   anchors?: number, wavelet?: {kind: string, lengthMs?: number, peakHz?: number, phaseDeg?: ?number,
 *   samples?: ArrayLike<number>, dtMs?: number},
 *   wellName?: string, volumeName?: ?string}} p
 *   QI A6 (2026-10-06): the wavelet's samples are kept too (at most 121,
 *   centred, 5 significant digits), so Rock Physics Studio and QI Studio use
 *   the wavelet itself (earlier records carry only its peak and phase).
 */
export function tieQcRecord({
  qc, shiftMs = 0, phiDeg = null, anchors = 0, wavelet = null, wellName = null, volumeName = null,
}) {
  const rows = (qc || []).filter((r) => r && Number.isFinite(r.corr));
  const mean = rows.length ? rows.reduce((s, r) => s + r.corr, 0) / rows.length : null;
  const min = rows.length ? Math.min(...rows.map((r) => r.corr)) : null;
  // at most 200 windows, evenly thinned
  const step = Math.max(1, Math.ceil(rows.length / 200));
  return {
    version: 1,
    well: wellName,
    volume: volumeName,
    mean_corr: r3(mean),
    min_corr: r3(min),
    windows: rows.filter((_, i) => i % step === 0).map((r) => [r1(r.twtMs), r3(r.corr)]),
    bulk_shift_ms: r1(shiftMs),
    phase_deg: r1(phiDeg),
    anchors,
    wavelet: wavelet ? {
      kind: wavelet.kind,
      length_ms: r1(wavelet.lengthMs),
      peak_hz: r1(wavelet.peakHz),
      phase_deg: r1(wavelet.phaseDeg),
      ...(wavelet.samples?.length && wavelet.dtMs > 0 ? { dt_ms: wavelet.dtMs, samples: storedSamples(wavelet.samples) } : {}),
    } : null,
    measured_at: new Date().toISOString(),
  };
}

/** One line for a stored record (the panel badge and the report). */
export function describeTieQc(rec) {
  if (!rec) return null;
  const parts = [
    rec.mean_corr != null ? `mean correlation ${rec.mean_corr.toFixed(2)}` : null,
    rec.min_corr != null ? `minimum ${rec.min_corr.toFixed(2)}` : null,
    rec.anchors ? `${rec.anchors} anchors` : null,
    rec.phase_deg != null ? `phase ${rec.phase_deg} deg` : null,
    rec.wavelet ? `${rec.wavelet.kind} wavelet${rec.wavelet.peak_hz != null ? ` ${rec.wavelet.peak_hz} Hz` : ''}${rec.wavelet.phase_deg != null ? ` ${rec.wavelet.phase_deg} deg` : ''}` : null,
  ].filter(Boolean);
  return `Tie QC: ${parts.join(', ')} (${String(rec.measured_at || '').slice(0, 10)})`;
}
