// U2-013: wavelets at the well and tie QC stored with the tie.
// Analytic case: seismic = white reflectivity convolved with a 30 Hz Ricker
// rotated 40 degrees. The Ricker amplitude spectrum f^2 exp(-f^2/f0^2) peaks
// at f0 (the published property of the Ricker wavelet), and a
// least-squares extraction from the well recovers the wavelet itself.
import {
  extractWellWavelet, describeWavelet, waveletCorrelation, tieQcRecord, describeTieQc,
} from '@/pages/apps/Seismolord/lib/wellWavelet';
import { rickerWavelet, convolveSame, extractStatisticalWavelet } from '@/pages/apps/Seismolord/engine/synthetics';
import { rotateConstantPhase } from '@/pages/apps/Seismolord/engine/tieWarp';

const dtMs = 2;
const ns = 1000;
/** Deterministic white reflectivity (LCG), sparse spikes. */
function reflectivity(seed = 7) {
  let x = seed;
  const rnd = () => { x = (1103515245 * x + 12345) % 2147483648; return x / 2147483648; };
  return Float32Array.from({ length: ns }, () => (rnd() < 0.3 ? (rnd() - 0.5) * 0.4 : 0));
}
const TRUE_W = rotateConstantPhase(rickerWavelet(30, dtMs, 30), (40 * Math.PI) / 180);

describe('describeWavelet on the analytic Ricker', () => {
  test('peak frequency of a 30 Hz Ricker is 30 Hz; zero phase; a 40 degree rotation reads 40', () => {
    const z = describeWavelet(rickerWavelet(30, dtMs, 30), dtMs);
    expect(Math.abs(z.peakHz - 30)).toBeLessThan(0.5);
    expect(Math.abs(z.phaseDeg)).toBeLessThan(1);
    const r = describeWavelet(TRUE_W, dtMs);
    expect(Math.abs(r.phaseDeg - 40)).toBeLessThan(2);
    expect(Math.abs(r.peakHz - 30)).toBeLessThan(1);
  });
});

describe('extractWellWavelet (least squares from the well)', () => {
  const rc = reflectivity();
  const seismic = convolveSame(rc, TRUE_W).data;

  test('recovers the true wavelet, phase and all', () => {
    const { wavelet, fitCorr } = extractWellWavelet(rc, seismic, { halfLength: 15, damping: 1e-6 });
    expect(waveletCorrelation(wavelet, TRUE_W)).toBeGreaterThan(0.999);
    expect(fitCorr).toBeGreaterThan(0.999);
    const d = describeWavelet(wavelet, dtMs);
    expect(Math.abs(d.phaseDeg - 40)).toBeLessThan(3);
    expect(Math.abs(d.peakHz - 30)).toBeLessThan(1.5);
  });

  test('negative control: the statistical wavelet gets the spectrum but assumes zero phase', () => {
    const stat = extractStatisticalWavelet([seismic], dtMs, { waveletLengthMs: 60 });
    const d = describeWavelet(stat, dtMs);
    expect(Math.abs(d.peakHz - 30)).toBeLessThan(4);          // Wiener-Khinchin: the spectrum is right
    expect(Math.abs(d.phaseDeg)).toBeLessThan(2);             // but the phase is zero by construction
    expect(waveletCorrelation(stat, TRUE_W)).toBeLessThan(0.9);
  });

  test('stable with 20 % noise and damping', () => {
    let x = 3;
    const rms = Math.sqrt(seismic.reduce((s2, v) => s2 + v * v, 0) / seismic.length);
    // uniform noise with an RMS of 20 % of the signal RMS
    const noisy = Float32Array.from(seismic, (v) => { x = (69069 * x + 1) % 4294967296; return v + 0.2 * rms * Math.sqrt(3) * (2 * (x / 4294967296) - 1); });
    const { wavelet } = extractWellWavelet(rc, noisy, { halfLength: 15 });
    expect(waveletCorrelation(wavelet, TRUE_W)).toBeGreaterThan(0.95);
  });

  test('a flat log is refused with the reason, never a zero wavelet (PL4)', () => {
    expect(() => extractWellWavelet(new Float32Array(ns), seismic)).toThrow(/reflectivity is flat/);
  });

  test('a log too short is refused with the reason (PL2)', () => {
    expect(() => extractWellWavelet(rc.subarray(0, 40), seismic.subarray(0, 40), { halfLength: 15 })).toThrow(/needs at least 62/);
  });
});

describe('tie QC record', () => {
  test('compact, rounded, described in one line', () => {
    const qc = Array.from({ length: 450 }, (_, i) => ({ twtMs: 1000 + i * 2, corr: i === 3 ? null : 0.6 + 0.0001 * i }));
    const rec = tieQcRecord({
      qc, shiftMs: 8.04, phiDeg: 38.66, anchors: 3, wavelet: { kind: 'well', lengthMs: 60, peakHz: 29.94, phaseDeg: 40.21 }, wellName: 'KETA-1',
    });
    expect(rec.windows.length).toBeLessThanOrEqual(200);
    expect(rec.mean_corr).toBeCloseTo(0.622, 3);
    expect(rec.min_corr).toBe(0.6);
    expect(rec.phase_deg).toBe(38.7);
    expect(rec.wavelet).toEqual({
      kind: 'well', length_ms: 60, peak_hz: 29.9, phase_deg: 40.2,
    });
    expect(describeTieQc(rec)).toMatch(/^Tie QC: mean correlation 0\.62, minimum 0\.60, 3 anchors, phase 38\.7 deg, well wavelet 29\.9 Hz 40\.2 deg/);
    expect(JSON.stringify(rec).length).toBeLessThan(6000);
  });
});
