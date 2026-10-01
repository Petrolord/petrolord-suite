// Saved Monte Carlo runs (ReservoirCalc Pro upgrade U1, PL10, RCP-U1-013).
// A run keeps every realization (volumes, GRV, recoverable streams and
// the sampled inputs). Saved as it was, a 50,000-realization study put
// about 25 MB of JSON into the project row, twice (the active reservoir
// is mirrored at the top of the blob), and 200,000 about 100 MB, which a
// save request does not survive. The statistics, the percentile
// realizations and the diagnostics are kept whole; the realizations are
// thinned by an even stride to a few thousand, enough for the histogram
// and the tornado, and the run says it was thinned. Pure.

export const KEEP_REALIZATIONS = 2000;

const thin = (arr, keep) => {
  if (!Array.isArray(arr) || arr.length <= keep) return arr;
  const stride = arr.length / keep;
  const out = new Array(keep);
  for (let i = 0; i < keep; i++) out[i] = arr[Math.floor(i * stride)];
  return out;
};

/** A run as it is saved: whole statistics, thinned realizations. */
export function compactRun(run, keep = KEEP_REALIZATIONS) {
  if (!run || !run.raw) return run || null;
  const raw = run.raw;
  const total = Math.max(raw.stooip?.length || 0, raw.giip?.length || 0, raw.samples?.length || 0);
  if (total <= keep) return run;
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? thin(v, keep) : v;
  out.thinned = { kept: keep, of: total };
  return { ...run, raw: out };
}

/** Every reservoir snapshot's run compacted. */
export function compactReservoirs(reservoirs, keep = KEEP_REALIZATIONS) {
  if (!Array.isArray(reservoirs)) return reservoirs;
  return reservoirs.map((r) => (r?.probResults ? { ...r, probResults: compactRun(r.probResults, keep) } : r));
}
