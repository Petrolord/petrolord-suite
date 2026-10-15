// Job result warnings (QI round 3, 2026-10-15). A worker job that succeeds
// can still carry `warnings` (outputSanity.js: a few samples lost as nulls).
// The panels keep them on the run record and show them under the run.

/** The distinct warning texts of a job result (any shape), at most eight. */
export function jobWarnings(result) {
  const list = Array.isArray(result?.warnings) ? result.warnings : [];
  const out = [];
  for (const w of list) {
    const t = typeof w === 'string' ? w.trim() : typeof w?.message === 'string' ? w.message.trim() : '';
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 8);
}

/** The fields to merge into a run record when its job finishes: nothing when there is no warning. */
export const warningsField = (result) => {
  const w = jobWarnings(result);
  return w.length ? { warnings: w } : {};
};
