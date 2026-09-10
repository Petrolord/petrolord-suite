// Stretch and squeeze depth shifting (Petrophysics Studio PT11c,
// 2026-09-10): the shift function is a FIRST-CLASS OBJECT stored with the
// shifted curve (`<KEY>_DS`, a new registry row) in its provenance, and
// the raw curve is never written. The row's samples are the applied
// result, because every consumer indexes rows on the shared depth grid
// and other apps read rows; the tie pairs are the source of truth and are
// re-applied from the raw curve whenever the panel opens (apply on read),
// so a shift is reversible, editable and resettable from the UI. Every
// save appends { at, by, pairs } to the shift's edit list.
//
// Resampling is the engine's one resampler (conditioning.js readAt):
// linear between the two raw samples bracketing the requested depth,
// NaN outside the extent, nulls never bridged.

import { tiePointWarp, depthShiftTiePoints, shiftCurve } from '../engine/conditioning';
import { PIPELINE_VERSION } from '../engine/pipeline';

export const DS_SUFFIX = '_DS';
export const dsName = (mnemonic) => `${mnemonic}${DS_SUFFIX}`;
export const isDsName = (mnemonic) => String(mnemonic || '').toUpperCase().endsWith(DS_SUFFIX);

/** Apply a tie set: { ok, data, shift } or { ok: false, error } (never throws). */
export function applyTies(depth, x, pairs) {
  const w = tiePointWarp(pairs);
  if (!w.ok) return { ok: false, error: w.error };
  return { ok: true, pairs: w.pairs, data: depthShiftTiePoints(depth, x, w.pairs), shift: shiftCurve(depth, w.pairs) };
}

/** The shift object stored on a `_DS` row, or null when the row carries none. */
export function shiftOfLog(log) {
  const s = log?.provenance?.shift;
  return s && Array.isArray(s.pairs) ? s : null;
}

/** The `_DS` row of this source curve among the well's registry rows. */
export function shiftLogFor(allLogs, sourceMnemonic) {
  const want = dsName(sourceMnemonic);
  return (allLogs || []).find((l) => l.mnemonic === want && shiftOfLog(l)) || null;
}

/**
 * The prepared registry log for a saved shift (the publishCurves shape).
 * `previous` is the existing `_DS` row, whose edit list is carried forward.
 */
export function buildShiftLog({
  wellData, sourceMnemonic, referenceMnemonic, pairs, projectId, by = null, previous = null, now = () => new Date(),
}) {
  const depth = wellData.curves.DEPT;
  const raw = wellData.logs[sourceMnemonic];
  if (!raw) throw new Error(`No curve ${sourceMnemonic} on this well.`);
  const applied = applyTies(depth, raw, pairs);
  if (!applied.ok) throw new Error(applied.error);
  const rowOf = (m) => (wellData.allLogs || []).find((l) => l.mnemonic === m) || null;
  const srcRow = rowOf(sourceMnemonic);
  const refRow = rowOf(referenceMnemonic);
  const data = new Float32Array(applied.data.length);
  let nullCount = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] = applied.data[i];
    if (!Number.isFinite(applied.data[i])) nullCount += 1;
  }
  const prevShift = shiftOfLog(previous);
  const edits = [...(prevShift?.edits || []), { at: now().toISOString(), by, pairs: applied.pairs.map(([r, t]) => [r, t]) }];
  return {
    mnemonic: dsName(sourceMnemonic),
    description: `${sourceMnemonic} depth-shifted by ${applied.pairs.length} tie point${applied.pairs.length === 1 ? '' : 's'} against ${referenceMnemonic}`,
    unit: srcRow?.unit || '',
    data,
    startMdM: depth[0],
    stopMdM: depth[depth.length - 1],
    stepM: srcRow?.step_m ?? null,
    nSamples: data.length,
    nullCount,
    provenance: {
      computed: true,
      engine: 'petrophysics-studio',
      operation: 'depth-shift',
      method: 'tie-points',
      project_id: projectId,
      pipeline_version: PIPELINE_VERSION,
      input_log_ids: [srcRow?.id, refRow?.id].filter(Boolean),
      shift: {
        reference: { mnemonic: referenceMnemonic, logId: refRow?.id || null },
        source: { mnemonic: sourceMnemonic, logId: srcRow?.id || null },
        pairs: applied.pairs.map(([r, t]) => [r, t]),
        interpolation: 'linear-bracketing',
        beyond: 'constant',
        edits,
      },
    },
  };
}

/**
 * Apply on read: re-apply a stored shift to the raw curve and count the
 * samples that differ from the stored row (expected 0; the round-trip gate
 * pins it). NaN matches NaN.
 */
export function verifyStoredShift(depth, raw, stored, shift) {
  const applied = applyTies(depth, raw, shift.pairs);
  if (!applied.ok) return { ok: false, error: applied.error, mismatches: NaN };
  let mismatches = 0;
  for (let i = 0; i < stored.length; i++) {
    const a = applied.data[i];
    const b = stored[i];
    if (Number.isNaN(a) && Number.isNaN(b)) continue;
    // stored rows are float32; compare at float32 precision
    if (Math.fround(a) !== Math.fround(b)) mismatches += 1;
  }
  return { ok: true, mismatches };
}

const M_TO_FT = 3.280839895013123;

/**
 * The three panel tracks: reference, target (raw grey dashed + shifted in
 * colour) and the shift-versus-depth track in the display unit.
 */
export function shiftTracks({
  referenceMnemonic, referenceData, sourceMnemonic, sourceData, shifted, shift, depthUnit = 'm', unitOf = () => '',
}) {
  const range = (arr) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of arr || []) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!(lo < hi)) return [0, 1];
    const pad = (hi - lo) * 0.05;
    return [lo - pad, hi + pad];
  };
  const [rLo, rHi] = range(referenceData);
  const [sLo, sHi] = range(sourceData);
  const f = depthUnit === 'ft' ? M_TO_FT : 1;
  const shiftDisp = shift ? Float64Array.from(shift, (v) => v * f) : null;
  let amp = 0;
  for (const v of shiftDisp || []) if (Number.isFinite(v) && Math.abs(v) > amp) amp = Math.abs(v);
  const sMax = amp > 0 ? Math.ceil(amp * 1.2 * 10) / 10 : 1;
  return [
    {
      key: 'ref', title: `${referenceMnemonic} (reference)`, scale: 'linear', min: rLo, max: rHi, unit: unitOf(referenceMnemonic), width: 1.2,
      curves: [{ name: referenceMnemonic, data: referenceData, color: '#22d3ee', lineWidth: 1.2 }],
    },
    {
      key: 'target', title: `${sourceMnemonic} (raw, shifted)`, scale: 'linear', min: sLo, max: sHi, unit: unitOf(sourceMnemonic), width: 1.2,
      curves: [
        { name: `${sourceMnemonic} raw`, data: sourceData, color: '#94a3b8', style: 'dash', lineWidth: 1 },
        ...(shifted ? [{ name: dsName(sourceMnemonic), data: shifted, color: '#f59e0b', lineWidth: 1.4 }] : []),
      ],
    },
    {
      key: 'shift', title: 'Shift', scale: 'linear', min: -sMax, max: sMax, unit: depthUnit, width: 0.7,
      curves: shiftDisp ? [{ name: 'SHIFT', data: shiftDisp, color: '#a78bfa', lineWidth: 1.2 }] : [],
    },
  ];
}
