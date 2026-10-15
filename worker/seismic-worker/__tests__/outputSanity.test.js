/**
 * @jest-environment node
 */
// Output sanity (F3 benchmark F-3, 2026-10-15): absurd blind tables and
// overflowed volumes fail the job instead of reporting success. The F3 rows
// (blind AI errors of 5.7e29 and 1.9e47 percent) are the positive case; a
// sound table is the negative control.
import { blindTableProblem, propertyRowsProblem, makeSanityCounter, MAX_BAD_SHARE } from '../src/outputSanity.js';

const row = (name, rmsPct, corr = 0.8, n = 100) => ({ name, blind: { corr, rmsPct, n }, withWell: { corr: 0.9, rmsPct: 4, n } });

test('blind tables: the F3 rows fail, a sound table and empty rows pass', () => {
  expect(blindTableProblem([row('F03-04', 5.7e29, 0.3), row('F03-02', 1.9e47, 0.04)])).toMatch(/F03-04: blind error 5.70e\+29 percent; F03-02/);
  expect(blindTableProblem([row('A', 8.2), row('B', 14)])).toBeNull();
  expect(blindTableProblem([row('A', NaN, NaN, 0)])).toBeNull(); // a well with no samples says why elsewhere
  expect(blindTableProblem([row('A', NaN, 0.5, 50)])).toMatch(/not a number/);
  // coloured (relative): correlation only
  expect(blindTableProblem([row('A', null, -0.27)])).toBeNull();
  // prestack rows score several outputs
  expect(blindTableProblem([{ name: 'W', blind: { ai: { corr: 0.8, rmsPct: 6, n: 80 }, vpvs: { corr: 0.5, rmsPct: 240, n: 80 } } }])).toMatch(/W \(vpvs\): blind error 240 percent/);
});

test('property rows: an RMS over half a unit fails; facies rows and errors pass through', () => {
  expect(propertyRowsProblem([{ name: 'A', n: 40, rms: 0.03 }, { name: 'B', error: 'No log' }, { name: 'C', n: 30, accuracy: 0.7 }])).toBeNull();
  expect(propertyRowsProblem([{ name: 'A', n: 40, rms: 3.2 }])).toMatch(/A: RMS 3.20/);
  expect(propertyRowsProblem([{ name: 'A', n: 40, rms: NaN }])).toMatch(/not a number/);
});

test('volumes: a few lost samples warn, more than 0.1 percent fail, null input is not counted', () => {
  const c = makeSanityCounter();
  for (let i = 0; i < 100000; i++) c.add(true, i < 50 ? Infinity : 1000);
  for (let i = 0; i < 1000; i++) c.add(false, NaN);
  expect(c.live).toBe(100000);
  expect(c.verdict().fail).toBeNull();
  expect(c.verdict('the impedance').warning).toMatch(/50 of 100000 samples of the impedance/);
  const d = makeSanityCounter();
  for (let i = 0; i < 1000; i++) d.add(true, i < 1000 * MAX_BAD_SHARE * 3 ? NaN : 1);
  expect(d.verdict().fail).toMatch(/unstable/);
  const e = makeSanityCounter();
  for (let i = 0; i < 10; i++) e.add(true, 5);
  expect(e.verdict()).toEqual({ fail: null, warning: null });
});
