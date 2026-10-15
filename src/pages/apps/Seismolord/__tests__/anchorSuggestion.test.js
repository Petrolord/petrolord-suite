/**
 * Suggest anchors in Synthetics (QI upgrade, F3 benchmark F-4): the
 * engine's suggestion becomes the panel's anchors and applied phase, and a
 * synthetic warped by a known stretch is matched once the anchors are
 * applied through the panel's own warp. Negative control: noise suggests no
 * anchors and the panel keeps none.
 */
import { anchorSuggestion } from '../lib/anchorSuggestion';
import { makeTieWarp, warpTrace, rotateConstantPhase } from '../engine/tieWarp';
import { traceCorrelation } from '../engine/autoAnchors';

const DT = 4; const NS = 500;
function rng(seed) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32; }; }
function synthetic(seed) {
  const r = rng(seed); const refl = Float64Array.from({ length: NS }, () => (r() < 0.25 ? (r() - 0.5) * 0.2 : 0));
  const w = []; for (let i = -15; i <= 15; i++) { const a = (Math.PI * 30 * i * DT / 1000) ** 2; w.push((1 - 2 * a) * Math.exp(-a)); }
  return Float32Array.from({ length: NS }, (_, i) => w.reduce((s, v, k) => { const j = i - k + 15; return j >= 0 && j < NS ? s + refl[j] * v : s; }, 0));
}
const shift = (t) => 10 + 14 * Math.sin((2 * Math.PI * t) / 1000);
const truth = makeTieWarp(Array.from({ length: 52 }, (_, i) => ({ synTwtMs: i * 40, seisTwtMs: i * 40 + shift(i * 40) })));

test('the suggestion fills the anchors and the phase, and the panel warp then matches the seismic', () => {
  const syn = synthetic(4);
  const seis = rotateConstantPhase(warpTrace(syn, DT, truth, NS), (-25 * Math.PI) / 180);
  const r = anchorSuggestion(syn, seis, DT);
  expect(r.ok).toBe(true);
  expect(r.message).toMatch(/anchors suggested/);
  for (const a of r.anchors) expect(Math.abs(a.seisTwtMs - a.synTwtMs - shift(a.synTwtMs))).toBeLessThanOrEqual(DT);
  expect(Math.abs(r.phase.phiDeg + 25)).toBeLessThan(6);
  // the panel's pipeline: warp, then rotate
  const display = rotateConstantPhase(warpTrace(syn, DT, makeTieWarp(r.anchors), NS), r.phase.phiRad);
  expect(traceCorrelation(display, seis)).toBeGreaterThan(0.9);
  expect(traceCorrelation(syn, seis)).toBeLessThan(0.5);
});

test('negative control: noise gives no anchors and says why', () => {
  const r0 = rng(8);
  const r = anchorSuggestion(synthetic(2), Float32Array.from({ length: NS }, () => r0() - 0.5), DT);
  expect(r.ok).toBe(false);
  expect(r.anchors).toEqual([]);
  expect(r.phase).toBeNull();
});
