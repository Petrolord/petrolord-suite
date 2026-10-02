/**
 * Report Kit: the completeness guard of the inputs table (reviewer lens
 * RL1). A report prints every value the analysis read. This helper takes
 * the object an app hands to its engine and the rows of its inputs model
 * and names every engine input that has no row, so a new engine input
 * cannot ship unprinted: the app's test asserts the list is empty.
 *
 * Pure.
 */

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The leaf paths of an engine input object: { a: 1, b: { c: 2 } } gives
 * ['a', 'b.c']. Arrays count as one leaf (a table is one input).
 */
export function engineInputKeys(input, prefix = '') {
  if (!isRecord(input)) return [];
  const out = [];
  for (const [k, v] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isRecord(v)) out.push(...engineInputKeys(v, path));
    else out.push(path);
  }
  return out;
}

/**
 * @param {object} engineInput the object the engine is called with
 * @param {Array<{engineKeys?: string[], key?: string}>} rows the inputs model; a row covers the
 *   engine paths listed in `engineKeys` (or its own `key`)
 * @param {{ignore?: string[]}} [opts] engine paths that are not inputs (derived values, flags)
 * @returns {string[]} the engine paths with no row
 */
export function missingInputRows(engineInput, rows, { ignore = [] } = {}) {
  const covered = new Set();
  for (const r of rows || []) for (const k of (r.engineKeys || (r.key ? [r.key] : []))) covered.add(k);
  const skip = new Set(ignore);
  return engineInputKeys(engineInput).filter((k) => !covered.has(k) && !skip.has(k));
}
