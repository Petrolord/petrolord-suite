// Min/max over a station or row array without a spread call.
//
// `Math.max(...rows.map(f))` passes one argument per station. A long or
// degenerate plan pushes that past the JS argument limit and the call
// throws RangeError: Maximum call stack size exceeded, which unmounts
// the app through the global error boundary rather than showing
// anything the designer can act on. Trajectory arrays are unbounded in
// principle (they grow with hole length), so every extent in this app
// goes through these reducers.

/** Largest finite value of `pick` over `rows`, or `fallback` if none. */
export function maxOf(rows, pick = (v) => v, fallback = null) {
  let out = fallback;
  for (let i = 0; i < rows.length; i++) {
    const v = pick(rows[i], i);
    if (Number.isFinite(v) && (out === fallback || v > out)) out = v;
  }
  return out;
}

/** Smallest finite value of `pick` over `rows`, or `fallback` if none. */
export function minOf(rows, pick = (v) => v, fallback = null) {
  let out = fallback;
  for (let i = 0; i < rows.length; i++) {
    const v = pick(rows[i], i);
    if (Number.isFinite(v) && (out === fallback || v < out)) out = v;
  }
  return out;
}

/** {min, max} in one pass; both null when nothing finite was seen. */
export function extentOf(rows, pick = (v) => v) {
  let min = null;
  let max = null;
  for (let i = 0; i < rows.length; i++) {
    const v = pick(rows[i], i);
    if (!Number.isFinite(v)) continue;
    if (min === null || v < min) min = v;
    if (max === null || v > max) max = v;
  }
  return { min, max };
}
