// Suggest anchors (QI upgrade, F3 benchmark F-4, 2026-10-15): the Synthetics
// tie's stretch and squeeze proposed by engines seismolord/autoAnchors.js
// (dynamic warping, validated on known warps), turned into the panel's
// anchor list and phase, for the interpreter to review, drag, delete and
// commit. Nothing is committed here.
import { suggestTieAnchors } from '../engine/autoAnchors';

/**
 * @param {ArrayLike<number>} synthetic the run's synthetic on the seismic grid
 * @param {ArrayLike<number>} seismic the corridor's centre trace
 * @param {number} dtMs
 * @returns {{ok: boolean, message: string, anchors: Array<{synTwtMs, seisTwtMs}>,
 *   phase: ?{phiRad, phiDeg, corr, corr0}}}
 */
export function anchorSuggestion(synthetic, seismic, dtMs) {
  const s = suggestTieAnchors(synthetic, seismic, dtMs);
  if (!s.ok) return { ok: false, message: s.reason || 'No anchors suggested.', anchors: [], phase: null };
  const phiRad = (s.phiDeg * Math.PI) / 180;
  const pct = (v) => (Number.isFinite(v) ? v.toFixed(2) : 'n/a');
  return {
    ok: true,
    anchors: s.anchors.map(({ synTwtMs, seisTwtMs }) => ({ synTwtMs, seisTwtMs })),
    phase: { phiRad, phiDeg: s.phiDeg, corr: s.corrAfter, corr0: s.corrBefore },
    message: `${s.anchors.length} anchors suggested with a ${s.phiDeg.toFixed(0)} degree phase: correlation ${pct(s.corrBefore)} before, ${pct(s.corrAfter)} after. Review them on the tracks (drag to adjust, double-click to remove), then commit.`,
  };
}
