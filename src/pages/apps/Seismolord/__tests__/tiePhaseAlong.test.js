// Phase along the tie (QI round 3): the Synthetics check on a tie whose
// seismic phase drifts, its one-line text, and the drift stored with the
// committed tie's QC record (read by QI Studio). The engine's numbers are
// gated in the engines suite (seismolord.tiePhase).
import { timeVariantPhaseCheck, rotateTimeVariant } from '../engine/tiePhase';
import { tieQcRecord, describeTieQc } from '../lib/wellWavelet';
import { phaseAlongText } from '../components/SyntheticsPanel';

const DT = 2; const NS = 1000;
let seed = 8; const u = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const ricker = (t) => { const a = (Math.PI * 30 * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
const refl = Float64Array.from({ length: NS }, () => (u() > 0.2 ? u() : 0));
const synth = Float64Array.from({ length: NS }, (_, i) => { let s = 0; for (let k = -30; k <= 30; k++) { const j = i - k; if (j >= 0 && j < NS) s += refl[j] * ricker(k * DT); } return s; });

test('a drifting tie is offered the time-variant phase, and the text says so', () => {
  const seis = rotateTimeVariant(synth, DT, (t) => -50 + 120 * (t / 2000));
  const c = timeVariantPhaseCheck(synth, seis, DT);
  expect(c.offer).toBe(true);
  expect(phaseAlongText(c)).toMatch(/drifting 1[01]\d degrees.*A constant-phase wavelet fits part of the interval only/);
  const rec = tieQcRecord({ qc: [{ twtMs: 100, corr: 0.8 }], phaseTrend: { ...c.trend, applied: true } });
  expect(rec.phase_trend).toMatchObject({ applied: true });
  expect(Math.abs(rec.phase_trend.drift_deg - 120)).toBeLessThan(20);
  expect(describeTieQc(rec)).toMatch(/phase drift \d+(\.\d)? deg \(applied\)/);
});

test('negative control: a constant-phase tie is not offered; a record without the check has no drift', () => {
  const seis = rotateTimeVariant(synth, DT, () => 30);
  const c = timeVariantPhaseCheck(synth, seis, DT);
  expect(c.offer).toBe(false);
  expect(phaseAlongText(c)).toMatch(/A constant phase fits this tie\./);
  expect(tieQcRecord({ qc: [] }).phase_trend).toBeUndefined();
  expect(phaseAlongText({ trend: null })).toMatch(/too few windows/);
});
