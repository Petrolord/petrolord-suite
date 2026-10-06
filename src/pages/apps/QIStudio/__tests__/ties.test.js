/**
 * Well ties across the study (QI A6): stored tie records read, the tie
 * wavelets compared and averaged across wells (engines qi/wavelets.js), and
 * the tie issues, with negative controls.
 */
import { tieOf, tieRows, waveletComparison, tieIssues } from '../services/ties';

const ricker = (fp, dt, half, phaseDeg = 0) => Array.from({ length: 2 * half + 1 }, (_, i) => {
  const t = ((i - half) * dt) / 1000; const a = (Math.PI * fp * t) ** 2;
  const r = (1 - 2 * a) * Math.exp(-a);
  const q = -Math.PI * fp * t * (3 - 2 * a) * Math.exp(-a);
  const p = (phaseDeg * Math.PI) / 180;
  return Math.cos(p) * r + Math.sin(p) * q;
});
const wellWith = (id, name, { mean = 0.8, phase = 0, peak = 30, dt = 2, samples = true } = {}) => ({
  well: {
    id, name,
    checkshots_derived: { provenance: { qc: { mean_corr: mean, min_corr: mean - 0.2, bulk_shift_ms: 4, measured_at: '2026-10-01T00:00:00Z', wavelet: { kind: 'well', peak_hz: peak, phase_deg: phase, ...(samples ? { dt_ms: dt, samples: ricker(peak, dt, Math.round(60 / dt), phase) } : {}) } } } },
  },
});

test('a stored tie is read; a well without one is null', () => {
  const t = tieOf(wellWith('a', 'A').well);
  expect(t).toMatchObject({ meanCorr: 0.8, shiftMs: 4, wavelet: { kind: 'well', peakHz: 30, dtMs: 2 } });
  expect(t.wavelet.samples.length).toBe(61);
  expect(tieOf({ id: 'x' })).toBeNull();
});

test('wavelets on different intervals are compared on the finest; identical wells fit the average', () => {
  const rows = tieRows([wellWith('a', 'A', { dt: 2 }), wellWith('b', 'B', { dt: 4 })]);
  const cmp = waveletComparison(rows);
  expect(cmp.dtMs).toBe(2);
  for (const m of cmp.misfit) expect(m.corrToAverage).toBeGreaterThan(0.99);
});

test('a well with a 90 degree wavelet stands out, and the issues say so', () => {
  const rows = tieRows([wellWith('a', 'A'), wellWith('b', 'B'), wellWith('c', 'C', { phase: 90 })]);
  const cmp = waveletComparison(rows);
  const issues = tieIssues(rows, cmp);
  expect(issues.some((i) => i.title === 'Wavelet phase differs between wells')).toBe(true);
  expect(cmp.misfit.find((m) => m.name === 'C').corrToAverage).toBeLessThan(cmp.misfit.find((m) => m.name === 'A').corrToAverage);
  // negative control: consistent wells raise no phase issue
  const same = tieRows([wellWith('a', 'A'), wellWith('b', 'B')]);
  expect(tieIssues(same, waveletComparison(same)).some((i) => /phase differs/.test(i.title))).toBe(false);
});

test('no tie, a poor tie, a fair tie and a tie without its wavelet are flagged', () => {
  const rows = tieRows([
    { well: { id: 'n', name: 'NOTIE' } },
    wellWith('p', 'POOR', { mean: 0.4 }),
    wellWith('f', 'FAIR', { mean: 0.65 }),
    wellWith('o', 'OLD', { samples: false }),
  ]);
  const t = tieIssues(rows, null).map((i) => [i.title, i.severity]);
  expect(t).toEqual(expect.arrayContaining([
    ['NOTIE: no well tie', 'medium'], ['POOR: poor tie', 'high'], ['FAIR: fair tie', 'medium'], ['OLD: tie wavelet not stored', 'low'],
  ]));
  expect(waveletComparison(tieRows([wellWith('a', 'A')]))).toBeNull();
});
