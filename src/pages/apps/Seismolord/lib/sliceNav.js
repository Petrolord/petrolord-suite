// Slice navigation helpers (tester feedback 2026-09-22): step size,
// go-to-line in survey units and the player's stepping rule. Pure, so
// the ribbon controls, the section and 3D keyboard handlers and the
// player loop all share one clamp and one unit conversion.

export const ORIENTATIONS = ['inline', 'xline', 'time'];

/** Largest 0-based index of an orientation on a manifest geometry. */
export function maxIndexFor(geometry, orientation) {
  if (!geometry) return 0;
  if (orientation === 'inline') return Math.max(0, geometry.il.count - 1);
  if (orientation === 'xline') return Math.max(0, geometry.xl.count - 1);
  return Math.max(0, geometry.ns - 1);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Survey value (IL number, XL number, or TWT in ms) -> 0-based index,
 * rounded to the nearest line or sample and clamped to the survey.
 * Returns null for a non-numeric entry.
 * @param {Object} geometry manifest.geometry
 * @param {'inline'|'xline'|'time'} orientation
 * @param {number|string} value
 */
export function surveyValueToIndex(geometry, orientation, value) {
  const text = typeof value === 'string' ? value.trim() : value;
  if (!geometry || text === '' || text == null) return null;
  const v = Number(text);
  if (!Number.isFinite(v)) return null;
  let idx;
  if (orientation === 'inline') {
    idx = (v - geometry.il.min) / (geometry.il.step || 1);
  } else if (orientation === 'xline') {
    idx = (v - geometry.xl.min) / (geometry.xl.step || 1);
  } else {
    idx = (v * 1000) / geometry.dt_us;
  }
  return clamp(Math.round(idx), 0, maxIndexFor(geometry, orientation));
}

/** 0-based index -> survey value (IL / XL number, or TWT ms). */
export function indexToSurveyValue(geometry, orientation, index) {
  if (!geometry) return null;
  if (orientation === 'inline') return geometry.il.min + index * geometry.il.step;
  if (orientation === 'xline') return geometry.xl.min + index * geometry.xl.step;
  return (index * geometry.dt_us) / 1000;
}

/** Unit word for the go-to box and the step setting. */
export function surveyUnitLabel(orientation) {
  if (orientation === 'inline') return 'IL';
  if (orientation === 'xline') return 'XL';
  return 'ms';
}

/** Sanitize a step-size entry: a whole number of lines or samples >= 1. */
export function normalizeStep(value, max = Infinity) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, max));
}

/**
 * One step of `delta` increments of `step` lines or samples, clamped.
 * @returns {number} the new index
 */
export function stepIndex(index, delta, step, maxIndex) {
  return clamp(index + delta * normalizeStep(step), 0, Math.max(0, maxIndex));
}

/**
 * The player's next index, or null at the end of the survey (the
 * player stops there). A step that would overshoot lands on the last
 * line once, so the end of the survey is always shown.
 */
export function nextPlayIndex(index, direction, step, maxIndex) {
  const next = stepIndex(index, direction, step, maxIndex);
  return next === index ? null : next;
}

/** Player speeds (slices per second). */
export const PLAY_SPEEDS = [0.5, 1, 2, 4, 8];

/** Defaults for the persisted player settings (step per orientation). */
export const DEFAULT_PLAYER = {
  step: { inline: 1, xline: 1, time: 1 },
  speed: 2,
};

/** Merge a persisted payload over the defaults, dropping bad values. */
export function sanitizePlayer(raw) {
  const out = { step: { ...DEFAULT_PLAYER.step }, speed: DEFAULT_PLAYER.speed };
  if (raw && typeof raw === 'object') {
    for (const o of ORIENTATIONS) {
      if (raw.step && raw.step[o] != null) out.step[o] = normalizeStep(raw.step[o]);
    }
    if (PLAY_SPEEDS.includes(Number(raw.speed))) out.speed = Number(raw.speed);
  }
  return out;
}
