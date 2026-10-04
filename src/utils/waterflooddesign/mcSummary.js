// The Monte Carlo summary a Waterflood project keeps (WF-U1, RL12). The run
// itself is the canonical module's (src/lib/monteCarlo.js through
// src/utils/waterfloodUncertainty.js); only its percentiles, counts and
// rejection accounting are stored, with a fingerprint of the inputs it was
// run on, so a reopened project can say whether the summary still
// describes the working case. Pure.

const pick = (st) => (st ? { p90: st.p90 ?? null, p50: st.p50 ?? null, p10: st.p10 ?? null, mean: st.mean ?? null } : null);

/** A stable text of what a run depends on. */
export function mcInputsFingerprint({ displacementInputs, patternInputs, uncertaintyConfig }) {
  const { krIntake: _k, ...d } = displacementInputs || {};
  const sortObj = (o) => (o && typeof o === 'object' && !Array.isArray(o)
    ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortObj(o[k])]))
    : Array.isArray(o) ? o.map(sortObj) : o);
  return JSON.stringify(sortObj({ d, p: patternInputs || {}, u: uncertaintyConfig || {} }));
}

export function mcSummaryRecord(result, { ranAt, fingerprint }) {
  if (!result) return null;
  return {
    ranAt,
    fingerprint,
    iterations: result.iterations ?? null,
    validCount: result.validCount ?? null,
    rejectedCount: result.rejectedCount ?? null,
    btNeverCount: result.btNeverCount ?? 0,
    rejectionReasons: result.rejectionReasons || {},
    np: pick(result.stats?.np),
    rf: pick(result.stats?.rf),
    btYears: pick(result.stats?.btYears),
    sensitivity: (result.sensitivity || []).map((s) => ({ label: s.label, rho: s.rho, contribution: s.contribution })),
    method: 'Monte Carlo through the canonical module (src/lib/monteCarlo.js), each realization rerunning the five-spot forecast',
  };
}

/** 'current' when the summary was run on the inputs now on screen, 'stale' otherwise, null without one. */
export function mcSummaryState(summary, inputs) {
  if (!summary) return null;
  return summary.fingerprint === mcInputsFingerprint(inputs) ? 'current' : 'stale';
}
