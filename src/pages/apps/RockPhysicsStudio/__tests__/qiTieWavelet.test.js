/**
 * QI A6: a tie committed in Seismolord keeps its wavelet, and Rock Physics
 * Studio's gather uses that wavelet (resampled to its interval) in place of
 * a rebuilt Ricker. An older record (no samples) keeps the Ricker rebuild
 * and says why.
 */
import { tieQcRecord, storedSamples } from '../../Seismolord/lib/wellWavelet';
import { tieWavelet, waveletFor } from '../services/gather';

const wav = Array.from({ length: 151 }, (_, i) => Math.sin(i / 7) * Math.exp(-(((i - 75) / 30) ** 2)));

test('the stored copy keeps at most 121 centred samples at 5 significant digits', () => {
  const s = storedSamples(wav);
  expect(s.length).toBe(121);
  expect(s[60]).toBeCloseTo(wav[75], 4);
  const rec = tieQcRecord({ qc: [], wavelet: { kind: 'well', peakHz: 30, phaseDeg: 10, samples: wav, dtMs: 2 } });
  expect(rec.wavelet).toMatchObject({ kind: 'well', dt_ms: 2 });
  expect(rec.wavelet.samples).toHaveLength(121);
  // negative control: a Ricker tie stores no samples
  expect(tieQcRecord({ qc: [], wavelet: { kind: 'ricker', peakHz: 30, phaseDeg: 0 } }).wavelet.samples).toBeUndefined();
});

test('the gather uses the stored wavelet itself, resampled to its interval', () => {
  const rec = tieQcRecord({ qc: [], wavelet: { kind: 'well', peakHz: 30, phaseDeg: 10, samples: wav, dtMs: 2 } });
  const well = { checkshots_derived: { provenance: { qc: rec } } };
  expect(tieWavelet(well).samples).toHaveLength(121);
  const same = waveletFor({ wavelet: 'tie', dtMs: 2 }, well);
  expect(same.source).toBe('tie-samples');
  expect(Array.from(same.samples)).toEqual(rec.wavelet.samples);
  const resampled = waveletFor({ wavelet: 'tie', dtMs: 4 }, well);
  expect(resampled.source).toBe('tie-samples');
  expect(resampled.samples.length).toBe(61);
  expect(resampled.samples[30]).toBeCloseTo(rec.wavelet.samples[60], 6);
  expect(resampled.label).toMatch(/resampled from 2 ms/);
});

test('negative control: an older record without samples is rebuilt as a Ricker and says so', () => {
  const well = { checkshots_derived: { provenance: { qc: { wavelet: { kind: 'well', peak_hz: 30, phase_deg: 10 }, measured_at: 'x' } } } };
  const w = waveletFor({ wavelet: 'tie', dtMs: 2 }, well);
  expect(w.source).toBe('tie'); // the tie's peak and phase, rebuilt as a Ricker
  expect(w.samples.length).toBeGreaterThan(0);
  expect(w.label).toMatch(/re-commit it in Seismolord/);
});
