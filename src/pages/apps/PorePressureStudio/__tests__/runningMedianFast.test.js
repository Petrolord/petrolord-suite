// The sliding running median (2026-10-14) returns exactly what a sort per
// sample returns (the reference below, the previous implementation), on
// gaps, steps, ties and float32-style depths, and runs a 14,000-sample log
// with a 300 ft window fast enough to be called dozens of times per fit.
import { runningMedian } from '../services/shalePressure';

function reference(zM, values, windowM) {
  const n = values.length;
  if (!(windowM > 0) || n < 3) return values.slice();
  const half = windowM / 2;
  return values.map((v, i) => {
    if (v == null || !Number.isFinite(v)) return v;
    const w = [];
    for (let k = 0; k < n; k++) if (zM[k] >= zM[i] - half && zM[k] <= zM[i] + half && values[k] != null && Number.isFinite(values[k])) w.push(values[k]);
    w.sort((a, b) => a - b);
    const m = w.length;
    return m % 2 ? w[(m - 1) / 2] : 0.5 * (w[m / 2 - 1] + w[m / 2]);
  });
}

let seed = 20261014;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test('identical to a sort per sample on gaps, nulls, ties and uneven depths', () => {
  for (let trial = 0; trial < 20; trial++) {
    const n = 300 + Math.floor(rnd() * 200);
    let z = 0;
    const zM = []; const v = [];
    for (let i = 0; i < n; i++) {
      z += rnd() < 0.05 ? 25 : Math.fround(0.1524 + rnd() * 0.01);
      zM.push(z);
      const r = rnd();
      v.push(r < 0.1 ? null : r < 0.15 ? NaN : r < 0.3 ? 7 : Math.round(rnd() * 1000) / 10);
    }
    for (const w of [0.5, 3, 10, 40]) expect(runningMedian(zM, v, w)).toEqual(reference(zM, v, w));
  }
});

test('a 14,000-sample log with a 91 m (300 ft) window runs in well under a second', () => {
  const n = 14370;
  const zM = Array.from({ length: n }, (_, i) => i * 0.1524);
  const v = zM.map((z, i) => (i % 3 ? null : 1e6 + 1e4 * Math.sin(z / 7) + (i % 7) * 100));
  const t0 = Date.now();
  for (let k = 0; k < 5; k++) runningMedian(zM, v, 91.44);
  expect((Date.now() - t0) / 5).toBeLessThan(400);
});
