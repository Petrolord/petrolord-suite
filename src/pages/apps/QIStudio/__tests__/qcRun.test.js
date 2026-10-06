/**
 * Seismic QC over a stored volume (QI A5): the runner the seismic_qc worker
 * job and the browser share, on a synthetic v4-brick volume with known
 * truths: a 30 Hz Ricker, a designed signal-to-noise of 4 and an
 * acquisition stripe every 4 crosslines. Negative controls: the same volume
 * with no stripe, and a noise-dominated volume.
 */
import { runSeismicQc, qcIssues, isStripe } from '../services/qcRun';

function rng(seed) {
  let s = seed;
  const u = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return () => Math.sqrt(-2 * Math.log(Math.max(u(), 1e-12))) * Math.cos(2 * Math.PI * u());
}

/** A synthetic volume served as v4 bricks: ((i * b + j) * b + k). */
function makeVolume({ nIl = 24, nXl = 48, ns = 384, b = 32, dtMs = 2, snr = 4, stripe = true, seed = 3 } = {}) {
  const g = rng(seed);
  const wav = Array.from({ length: 61 }, (_, i) => { const t = ((i - 30) * dtMs) / 1000; const a = (Math.PI * 30 * t) ** 2; return (1 - 2 * a) * Math.exp(-a); });
  const conv = (r) => r.map((_, s) => { let v = 0; for (let k = 0; k < wav.length; k++) { const q = s - k + 30; if (q >= 0 && q < r.length) v += r[q] * wav[k]; } return v; });
  // one reflectivity per inline (layers flat along the crossline), the same signal on every trace of the inline
  const signal = Array.from({ length: nIl }, () => conv(Array.from({ length: ns }, () => g())));
  const rms = Math.sqrt(signal.flat().reduce((s, v) => s + v * v, 0) / (nIl * ns));
  const noiseSd = rms / Math.sqrt(snr);
  const vol = new Float32Array(nIl * nXl * ns);
  for (let i = 0; i < nIl; i++) for (let j = 0; j < nXl; j++) {
    const gain = stripe && j % 4 === 0 ? 1.6 : 1;
    for (let s = 0; s < ns; s++) vol[(i * nXl + j) * ns + s] = gain * signal[i][s] + noiseSd * g();
  }
  const grid = [Math.ceil(nIl / b), Math.ceil(nXl / b), Math.ceil(ns / b)];
  const getBrick = async (bi, bj, bk) => {
    const out = new Float32Array(b * b * b);
    for (let li = 0; li < b; li++) for (let lj = 0; lj < b; lj++) for (let lk = 0; lk < b; lk++) {
      const i = bi * b + li; const j = bj * b + lj; const s = bk * b + lk;
      if (i < nIl && j < nXl && s < ns) out[(li * b + lj) * b + lk] = vol[(i * nXl + j) * ns + s];
    }
    return out;
  };
  return { getBrick, geom: { nIl, nXl, ns, brickSize: b, grid }, dtMs };
}

test('spectra, signal-to-noise and footprint recover the designed volume', async () => {
  const v = makeVolume();
  const r = await runSeismicQc({ ...v, inlines: 12, windows: 3, slices: 3 });
  expect(r.windows).toHaveLength(3);
  for (const w of r.windows) {
    expect(w.stats.band6[0]).toBeLessThan(30);
    expect(w.stats.band6[1]).toBeGreaterThan(30);
    expect(Math.abs(w.stats.peakHz - 30)).toBeLessThan(8);
    // the stripe lifts one trace in four, so the neighbours differ slightly in level; S/N stays near the design
    expect(w.snr.median).toBeGreaterThan(2.5);
    expect(w.snr.median).toBeLessThan(6);
    expect(w.spectrum.freqHz.length).toBeLessThan(200);
  }
  expect(r.footprints.every((f) => Math.abs(f.alongCrossline.period - 4) < 0.01 && isStripe(f.alongCrossline))).toBe(true);
  const issues = qcIssues(r, 'Keta 3D');
  expect(issues.some((i) => /acquisition footprint/.test(i.title))).toBe(true);
  expect(issues.some((i) => /signal weaker than noise/.test(i.title))).toBe(false);
});

test('negative controls: no stripe gives no footprint issue; a noisy volume raises a high signal issue', async () => {
  const clean = await runSeismicQc({ ...makeVolume({ stripe: false }), inlines: 8 });
  expect(qcIssues(clean, 'v').some((i) => /footprint/.test(i.title))).toBe(false);
  expect(clean.windows.every((w) => Math.abs(w.snr.median - 4) / 4 < 0.3)).toBe(true);
  const noisy = await runSeismicQc({ ...makeVolume({ stripe: false, snr: 0.4, seed: 9 }), inlines: 8 });
  const issues = qcIssues(noisy, 'v');
  expect(issues.some((i) => i.severity === 'high' && /signal weaker than noise/.test(i.title))).toBe(true);
});

test('refuses traces too short for the windows', async () => {
  await expect(runSeismicQc({ ...makeVolume({ ns: 40 }), windows: 3 })).rejects.toThrow(/too short/);
});
