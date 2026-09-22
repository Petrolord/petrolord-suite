// The SliceSource contract (docs/scope/Seismolord-LARGE-SURVEY-PLAN.md,
// Architecture): every viewer window asks a source for slices and never
// touches bricks or files itself.
//
//   source.getSlice({ orientation: 'inline'|'crossline'|'time', index, level }, signal)
//     -> { data: Float32Array, width, height, traceRms, level, codec, nullValue,
//          absSample?, final }
//
// Sources live in the slice worker (workers/slice.worker.js); the main
// thread holds a proxy (sources/sliceWorkerClient.js). Kinds:
//   - 'local'  LocalSegySource: the File the user picked, inline and
//              crossline only (time slices need the whole file).
//   - 'bricks' BrickSource v1: today's float32 bricks, streamed.
// This module is shared by both sides: names, error codes and the plain
// messages the viewer shows.

import { formatBudget } from './memoryBudget';

export const SOURCE_KINDS = Object.freeze({ LOCAL: 'local', BRICKS: 'bricks' });

/** Error codes that cross the worker boundary (error.code). */
export const SOURCE_ERRORS = Object.freeze({
  ABORTED: 'ABORTED',
  TIME_NEEDS_CONVERSION: 'TIME_SLICE_NEEDS_CONVERSION',
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
  TIMEOUT: 'TIMEOUT',
  WORKER_CRASHED: 'WORKER_CRASHED',
  FAILED: 'FAILED',
});

/** The plan says 'crossline'; the viewer and engines say 'xline'. */
export const toEngineOrientation = (o) => (o === 'crossline' ? 'xline' : o);

/** Cache key of one slice. */
export const sliceKey = (sourceId, orientation, index, level = 0) =>
  `${sourceId}|${toEngineOrientation(orientation)}|${index}|${level}`;

/** An Error carrying a source error code. */
export function sourceError(code, message) {
  const e = new Error(message);
  e.code = code;
  if (code === SOURCE_ERRORS.ABORTED) e.name = 'AbortError';
  return e;
}

/** True for anything that means the engine ran out of memory. */
export function isOutOfMemory(err) {
  if (!err) return false;
  if (err.code === SOURCE_ERRORS.OUT_OF_MEMORY) return true;
  // V8 reports a failed typed-array allocation as a RangeError ("Array
  // buffer allocation failed", "Invalid typed array length"); a RangeError
  // about DataView bounds is a truncated file and stays a plain failure
  return /allocation failed|out of memory|invalid (typed )?array length/i
    .test(err.message || '');
}

/** True for a request the user moved away from (never shown). */
export function isAborted(err) {
  if (!err) return false;
  return err.code === SOURCE_ERRORS.ABORTED || err.name === 'AbortError'
    || /ABORTED$/.test(err.message || '');
}

/** Classify any error into a code for the wire. */
export function errorCode(err) {
  if (err?.code && Object.values(SOURCE_ERRORS).includes(err.code)) return err.code;
  if (err?.name === SOURCE_ERRORS.TIME_NEEDS_CONVERSION) return SOURCE_ERRORS.TIME_NEEDS_CONVERSION;
  if (isAborted(err)) return SOURCE_ERRORS.ABORTED;
  if (isOutOfMemory(err)) return SOURCE_ERRORS.OUT_OF_MEMORY;
  return SOURCE_ERRORS.FAILED;
}

/**
 * The message the viewer shows for a failed request. Owner copy rule: no
 * em dashes and no "X, not Y" contrastives.
 * @param {Error} err
 * @param {{budgetBytes?: number, what?: string}} [ctx] what: 'this slice' etc.
 */
export function friendlySourceMessage(err, { budgetBytes, what = 'this slice' } = {}) {
  const code = errorCode(err);
  const budget = budgetBytes ? formatBudget(budgetBytes) : null;
  switch (code) {
    case SOURCE_ERRORS.OUT_OF_MEMORY:
    case SOURCE_ERRORS.WORKER_CRASHED:
      return `Seismolord ran out of memory loading ${what}. `
        + (budget ? `It keeps at most ${budget} of survey data in memory on this machine. ` : '')
        + 'Close other tabs or windows to free memory, then press Retry.';
    case SOURCE_ERRORS.TIMEOUT:
      return `Loading ${what} took too long. Check your connection, then press Retry.`;
    case SOURCE_ERRORS.TIME_NEEDS_CONVERSION:
      return 'Time slices are available after conversion, because each one needs the whole file.';
    default:
      return `Could not load ${what}: ${err?.message || 'unknown error'}`;
  }
}
