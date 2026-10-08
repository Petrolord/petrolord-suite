// The probabilistic dialog shows ranges in the session's units (2026-10-08,
// demo videos: the sonic slownesses read us/m in an oilfield session). The
// stored spec and the engine stay SI.
import { specToDisplay, specFromDisplay, specForEngine } from '../services/probabilistic';

const M_PER_FT = 0.3048;
const si = {
  dtMa: { vary: true, type: 'triangular', q10: 175, q50: 182, q90: 190 },
  dtFl: { vary: true, type: 'normal', mean: 656, stdDev: 10 },
  rw: { vary: true, type: 'triangular', q10: 0.06, q50: 0.078, q90: 0.097 },
};

test('field display: slowness in us/ft, a spread scales without an offset, unitless keys untouched', () => {
  const d = specToDisplay(si, 'field');
  expect(d.dtMa.q50).toBeCloseTo(182 * M_PER_FT, 9);
  expect(d.dtFl.mean).toBeCloseTo(656 * M_PER_FT, 9);
  expect(d.dtFl.stdDev).toBeCloseTo(10 * M_PER_FT, 9);
  expect(d.rw).toEqual(si.rw);
});

test('typed in field units and back: the engine spec is the SI one', () => {
  const back = specFromDisplay(specToDisplay(si, 'field'), 'field');
  expect(back.dtMa.q10).toBeCloseTo(175, 9);
  expect(back.dtFl.stdDev).toBeCloseTo(10, 9);
  const e1 = specForEngine(back); const e0 = specForEngine(si);
  expect(e1.dtMa.mode).toBeCloseTo(e0.dtMa.mode, 9);
});

test('negative control: an SI session converts nothing', () => {
  expect(specToDisplay(si, 'si')).toEqual(si);
  expect(specFromDisplay(si, 'si')).toEqual(si);
});

test('text still being typed is left as typed', () => {
  const d = specFromDisplay({ dtMa: { vary: true, type: 'triangular', q10: '', q50: '55.', q90: 'abc' } }, 'field');
  expect(d.dtMa.q10).toBe('');
  expect(d.dtMa.q50).toBeCloseTo(55 / M_PER_FT, 9);
  expect(d.dtMa.q90).toBe('abc');
});
