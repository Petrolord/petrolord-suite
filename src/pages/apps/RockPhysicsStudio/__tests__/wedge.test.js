/**
 * G6.3 — wedge engine vs oracle goldens. Tolerance 1e-5 relative:
 * the shared waveform primitives store Float32 (Seismolord contract);
 * the oracle runs float64. Tuning thickness must land on the same
 * sample as the oracle exactly.
 */

import fs from 'fs';
import path from 'path';
import { rickerWavelet } from '@/lib/waveform';
import { tuningCurve, tuningThicknessMs, wedgeTrace } from '../engine/wedge';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'rockphysics');
const W = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8')).wedge;

const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

test('shared Ricker matches the oracle wavelet', () => {
  const w = rickerWavelet(W.freq_hz, W.dt_ms, 60);
  expect(w.length).toBe(W.wavelet.length);
  for (let i = 0; i < w.length; i++) {
    if (!close(w[i], W.wavelet[i], 1e-6)) {
      throw new Error(`wavelet[${i}]: ${w[i]} vs ${W.wavelet[i]}`);
    }
  }
});

test('tuning curve matches the oracle', () => {
  const { thicknessesMs, amplitudes } = tuningCurve(
    W.rc_top, W.rc_base, W.freq_hz, W.dt_ms, W.max_thickness_ms,
  );
  expect(amplitudes.length).toBe(W.tuning_curve.length);
  for (let i = 0; i < amplitudes.length; i++) {
    if (!close(amplitudes[i], W.tuning_curve[i], 1e-5)) {
      throw new Error(`tuning[${thicknessesMs[i]}ms]: ${amplitudes[i]} vs ${W.tuning_curve[i]}`);
    }
  }
  expect(tuningThicknessMs(amplitudes, W.dt_ms)).toBe(W.tuning_thickness_ms);
});

test('thick-bed limit recovers the isolated reflection', () => {
  const { trace, t0 } = wedgeTrace(180, 0.1, -0.1, 25, 1, 240);
  expect(Math.abs(trace[t0] - 0.1)).toBeLessThan(1e-4);
});

test('invalid params throw', () => {
  expect(() => wedgeTrace(-1, 0.1, -0.1, 25, 1, 240)).toThrow(/Thickness/);
  expect(() => tuningCurve(0.1, -0.1, 0, 1, 60)).toThrow(/positive/);
});
