// AI scan-read proposals (PT7). The edge function petro-scan-read asks a
// vision model what is PRINTED on a scanned log header and returns this
// key list; the client normalises it here and only ever pre-fills the
// digitizer's calibration form with it. The user confirms every value,
// the model never traces and never saves.

export const PROPOSAL_KEYS = [
  'mnemonic', 'unit', 'depth_unit', 'depth_top', 'depth_bottom',
  'value_left', 'value_right', 'value_log', 'curve_color_hex', 'confidence', 'notes',
];

export const M_PER_FT = 0.3048;

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v, max = 40) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/** Normalise a raw model reply into the proposal shape; unknown keys are dropped. */
export function parseScanProposal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The scan reader returned no proposal.');
  }
  const mnemonic = str(raw.mnemonic, 24);
  const hex = /^#?[0-9a-f]{6}$/i.test(String(raw.curve_color_hex || '').trim())
    ? `#${String(raw.curve_color_hex).trim().replace(/^#/, '').toLowerCase()}`
    : null;
  const du = String(raw.depth_unit || '').trim().toLowerCase();
  const confidence = num(raw.confidence);
  return {
    mnemonic: mnemonic ? mnemonic.toUpperCase().replace(/\s+/g, '_') : null,
    unit: str(raw.unit, 16),
    depth_unit: du === 'ft' || du === 'feet' || du === 'f' ? 'ft' : (du === 'm' || du === 'metres' || du === 'meters' ? 'm' : null),
    depth_top: num(raw.depth_top),
    depth_bottom: num(raw.depth_bottom),
    value_left: num(raw.value_left),
    value_right: num(raw.value_right),
    value_log: raw.value_log === true || String(raw.value_log).toLowerCase() === 'true',
    curve_color_hex: hex,
    confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence)),
    notes: str(raw.notes, 300),
  };
}

/**
 * Turn a proposal into the digitizer's calibration pre-fill. Pixels are
 * ASSUMED at the image edges (the model reads labels, not pixels) and
 * flagged so the dialog tells the user to pick the real reference lines.
 * Depths are converted to metres MD at the door when the header is in feet.
 * @returns {{depthCal: Array|null, valueCal: Array|null, valueLog: boolean,
 *   assumedEdges: boolean, depthUnitIn: 'm'|'ft'|null, mnemonic, unit, seedHex}}
 */
export function proposalToCalibration(p, { width, height }) {
  const k = p.depth_unit === 'ft' ? M_PER_FT : 1;
  const depthOk = p.depth_top !== null && p.depth_bottom !== null && p.depth_top !== p.depth_bottom;
  const valueOk = p.value_left !== null && p.value_right !== null && p.value_left !== p.value_right
    && !(p.value_log && (p.value_left <= 0 || p.value_right <= 0));
  const H = Math.max(2, Math.round(height || 2));
  const W = Math.max(2, Math.round(width || 2));
  return {
    depthCal: depthOk ? [{ pixel: 0, value: p.depth_top * k }, { pixel: H - 1, value: p.depth_bottom * k }] : null,
    valueCal: valueOk ? [{ pixel: 0, value: p.value_left }, { pixel: W - 1, value: p.value_right }] : null,
    valueLog: !!p.value_log,
    assumedEdges: depthOk || valueOk,
    depthUnitIn: p.depth_unit,
    mnemonic: p.mnemonic,
    unit: p.unit,
    seedHex: p.curve_color_hex,
  };
}

/** Keys the user changed after Accept (recorded in provenance as ai_calibration.edited). */
export function proposalEdited(original, accepted) {
  const changed = [];
  for (const key of PROPOSAL_KEYS) {
    if (key === 'confidence' || key === 'notes') continue;
    const a = original?.[key] ?? null;
    const b = accepted?.[key] ?? null;
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) changed.push(key);
    } else if (a !== b) changed.push(key);
  }
  return changed;
}
