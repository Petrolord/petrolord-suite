/**
 * Seismic QC additions in the shared runner (QI upgrade P2.11): a peg-leg
 * multiple train is reported per window and raises an issue (primaries alone
 * do not), and the narrow-band rule no longer fires on a narrow low spike
 * above a broad spectrum (benchmark finding F-1) while a truly narrow band
 * still does.
 */
import { runSeismicQc, qcIssues } from '../services/qcRun';

function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; }; }
function volume({ multiple, nIl = 8, nXl = 16, ns = 600, b = 32, dtMs = 4 }) {
  const wav = Array.from({ length: 31 }, (_, i) => { const t = ((i - 15) * dtMs) / 1000; const a = (Math.PI * 30 * t) ** 2; return (1 - 2 * a) * Math.exp(-a); });
  const P = 120 / dtMs;
  const traceOf = (seed) => {
    const r = rng(seed); const refl = new Float64Array(ns);
    for (let i = 0; i < ns; i++) if (Math.abs(r()) > 0.42) refl[i] = r();
    const out = Float64Array.from(refl);
    if (multiple) for (let i = 0; i < ns; i++) { let a = refl[i]; for (let m = 1; m <= 4 && i + m * P < ns; m++) { a *= -0.6; out[i + m * P] += a; } }
    return Float64Array.from({ length: ns }, (_, s) => { let v = 0; for (let k = 0; k < wav.length; k++) { const q = s - k + 15; if (q >= 0 && q < ns) v += out[q] * wav[k]; } return v; });
  };
  const tr = Array.from({ length: nIl }, (_, i) => traceOf(i + 1));
  const grid = [Math.ceil(nIl / b), Math.ceil(nXl / b), Math.ceil(ns / b)];
  const getBrick = async (bi, bj, bk) => {
    const o = new Float32Array(b ** 3);
    for (let li = 0; li < b; li++) for (let lj = 0; lj < b; lj++) for (let lk = 0; lk < b; lk++) { const i = bi * b + li; const j = bj * b + lj; const s = bk * b + lk; if (i < nIl && j < nXl && s < ns) o[(li * b + lj) * b + lk] = tr[i][s]; }
    return o;
  };
  return { getBrick, geom: { nIl, nXl, ns, brickSize: b, grid }, dtMs };
}

test('a multiple train is found in its windows and raises an issue; primaries alone do not', async () => {
  const m = await runSeismicQc({ ...volume({ multiple: true }), windows: 2, slices: 1 });
  expect(m.windows.some((w) => w.multiples?.periodic && Math.abs(w.multiples.periodMs - 120) <= 4)).toBe(true);
  expect(qcIssues(m, 'V').some((i) => /periodic energy every 120 ms/.test(i.title))).toBe(true);
  const p = await runSeismicQc({ ...volume({ multiple: false }), windows: 2, slices: 1 });
  expect(p.windows.every((w) => !w.multiples?.periodic)).toBe(true);
  expect(qcIssues(p, 'V').some((i) => /periodic/.test(i.title))).toBe(false);
});

test('narrow band against a narrow low spike (F-1)', () => {
  const win = (stats) => ({ t0Ms: 2000, t1Ms: 3000, snr: { median: 10, medianDb: 10 }, stats });
  const spike = qcIssues({ windows: [win({ peakHz: 6.5, band6: [5.2, 10.6], bandwidth6Hz: 5.4, centroidHz: 29 })], footprints: [] }, 'F3');
  expect(spike.map((i) => i.key)).toEqual(['qc:F3:spike-2000']);
  expect(spike[0].title).toMatch(/narrow spectral peak at 6.5 Hz/);
  const narrow = qcIssues({ windows: [win({ peakHz: 12, band6: [9, 16], bandwidth6Hz: 7, centroidHz: 13 })], footprints: [] }, 'F3');
  expect(narrow.map((i) => i.key)).toEqual(['qc:F3:band-2000']);
});
