// PS8: conditioning engine vs the COND goldens at 1e-12, plus the
// behavioural invariants (spikes die, clean samples survive, gaps
// never bridge, the interp cap is visible).

import fs from 'fs';
import path from 'path';
import {
  despikeHampel, smoothMean, smoothMedian, depthShiftBlock, badHoleFlag, applyBadHole,
} from '../engine/conditioning';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const toF64 = (arr) => Float64Array.from(arr, (v) => (v === null ? NaN : v));
const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
const expectCurve = (got, want) => {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i++) {
    if (want[i] === null) expect(Number.isNaN(got[i])).toBe(true);
    else expect(close(got[i], want[i])).toBe(true);
  }
};

const C = goldens.COND;
const depth = toF64(typewell.curves.DEPT);
const rhob = toF64(typewell.curves.RHOB);
const grSpiked = toF64(C.GR_SPIKED);

test('despike, smoothing and block shift match the COND goldens', () => {
  expectCurve(despikeHampel(grSpiked, C.params.halfWindow, C.params.nSigma), C.GR_DESPIKED);
  expectCurve(smoothMean(toF64(typewell.curves.GR), 2), C.GR_SMOOTH_MEAN);
  expectCurve(smoothMedian(toF64(typewell.curves.GR), 2), C.GR_SMOOTH_MEDIAN);
  expectCurve(depthShiftBlock(depth, toF64(typewell.curves.GR), C.params.shiftM), C.GR_SHIFTED);
});

test('bad-hole flags and both repair modes match the goldens', () => {
  const flags = badHoleFlag(
    { cali: toF64(C.CALI_SYN), bitSize: C.params.bitSize, drho: toF64(C.DRHO_SYN) },
    { washoutOver: C.params.washoutOver, drhoMax: C.params.drhoMax },
  );
  expect(Array.from(flags)).toEqual(C.BADHOLE);
  expectCurve(applyBadHole(rhob, flags, { mode: 'null' }), C.RHOB_NULLED);
  expectCurve(applyBadHole(rhob, flags, { mode: 'interp', maxGapSamples: C.params.maxGapSamples }), C.RHOB_INTERP);
});

test('the injected spikes die and clean neighbours are untouched', () => {
  const out = despikeHampel(grSpiked, C.params.halfWindow, C.params.nSigma);
  for (const i of [30, 75, 140]) {
    expect(Math.abs(out[i] - grSpiked[i])).toBeGreaterThan(10);
  }
  // a clean sample far from any spike or null is bit-identical
  expect(out[10]).toBe(grSpiked[10]);
});

test('interp cap is visible: runs longer than maxGapSamples null out', () => {
  const x = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const flags = Uint8Array.from([0, 1, 1, 1, 0, 0, 0, 0]);
  const bridged = applyBadHole(x, flags, { mode: 'interp', maxGapSamples: 3 });
  expect(close(bridged[2], 3)).toBe(true); // linear bridge 1..5
  const capped = applyBadHole(x, flags, { mode: 'interp', maxGapSamples: 2 });
  expect(Number.isNaN(capped[2])).toBe(true);
  // a run touching the array edge can never bridge
  const edge = applyBadHole(x, Uint8Array.from([1, 1, 0, 0, 0, 0, 0, 0]), { mode: 'interp', maxGapSamples: 5 });
  expect(Number.isNaN(edge[0])).toBe(true);
});

test('depth shift never bridges a null gap and nulls outside the extent', () => {
  const d = Float64Array.from([0, 1, 2, 3]);
  const x = Float64Array.from([10, NaN, 30, 40]);
  const s = depthShiftBlock(d, x, 0.5);
  expect(Number.isNaN(s[0])).toBe(true); // reads z=-0.5, outside
  expect(Number.isNaN(s[1])).toBe(true); // brackets the NaN
  expect(close(s[3], 35)).toBe(true);    // interpolates 30..40 at 2.5
});
