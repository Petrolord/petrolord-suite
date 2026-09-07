// Rule-based facies (Petrophysics Studio PT9e, 2026-09-07): an ordered
// list of classes, each a conjunction of cutoff conditions on any input
// or computed curve; the first class whose conditions all hold names the
// sample. Pure: the workstation supplies curves, this returns a class
// index per sample (NaN where no class matches or an input is missing),
// the same shape the crossplot-polygon facies use, so the strip track,
// the interval publisher and the summaries need nothing new.
//
// This is a deterministic cutoff classifier ("electrofacies by rules"),
// not a clustering; it is what an interpreter writes on a whiteboard as
// "clean sand: Vsh < 0.35 and phi >= 0.10", and every class is explainable.

export const RULE_OPS = ['<', '<=', '>=', '>'];

/** Curves a rule may reference, in the order the picker shows them. */
export const RULE_CURVES = ['VSH', 'PHIE', 'PHIT', 'SW', 'KPERM', 'BVW', 'GR', 'RHOB', 'NPHI', 'DT', 'RT', 'PAY'];

const COLORS = ['#f5d90a', '#f59e0b', '#a3a065', '#7c3aed', '#5c3a1e', '#0891b2', '#dc2626', '#059669'];

/** A sensible starting set, phrased on the pipeline's own outputs. */
export function defaultRules() {
  return [
    { name: 'Pay sand', color: COLORS[0], conditions: [{ curve: 'VSH', op: '<', value: 0.35 }, { curve: 'PHIE', op: '>=', value: 0.1 }, { curve: 'SW', op: '<=', value: 0.6 }] },
    { name: 'Wet sand', color: COLORS[1], conditions: [{ curve: 'VSH', op: '<', value: 0.35 }, { curve: 'PHIE', op: '>=', value: 0.1 }] },
    { name: 'Tight sand', color: COLORS[2], conditions: [{ curve: 'VSH', op: '<', value: 0.35 }] },
    { name: 'Shaly sand', color: COLORS[3], conditions: [{ curve: 'VSH', op: '<', value: 0.65 }] },
    { name: 'Shale', color: COLORS[4], conditions: [] },
  ];
}

export const nextColor = (i) => COLORS[i % COLORS.length];

const test = (v, op, x) => {
  switch (op) {
    case '<': return v < x;
    case '<=': return v <= x;
    case '>': return v > x;
    default: return v >= x;
  }
};

/**
 * Validate a rule set: names present and unique, every condition on a
 * known curve with a numeric value. Returns a list of problems (empty =
 * valid) so the dialog can show them rather than silently skip.
 */
export function validateRules(rules) {
  const problems = [];
  const seen = new Set();
  (rules || []).forEach((r, i) => {
    const name = String(r.name || '').trim();
    if (!name) problems.push(`Class ${i + 1} has no name.`);
    else if (seen.has(name.toLowerCase())) problems.push(`Class name "${name}" is used twice.`);
    seen.add(name.toLowerCase());
    for (const c of r.conditions || []) {
      if (!RULE_OPS.includes(c.op)) problems.push(`${name || `Class ${i + 1}`}: unknown operator "${c.op}".`);
      if (!Number.isFinite(Number(c.value)) || c.value === '' || c.value === null) problems.push(`${name || `Class ${i + 1}`}: ${c.curve} ${c.op} needs a number.`);
      if (!c.curve) problems.push(`${name || `Class ${i + 1}`}: a condition has no curve.`);
    }
  });
  return problems;
}

/** Curves the rule set references, so the caller can say which are missing. */
export function rulesCurves(rules) {
  const out = new Set();
  for (const r of rules || []) for (const c of r.conditions || []) if (c.curve) out.add(c.curve);
  return [...out];
}

/**
 * Classify every sample. curvesByKey maps a curve key to its array (any
 * of inputs and outputs). A sample whose referenced curve is NaN fails
 * that condition; a class with no conditions matches everything left.
 * @returns {{data: Float64Array, missing: string[]}} class index per sample
 */
export function classifyRules(curvesByKey, rules, n) {
  const missing = rulesCurves(rules).filter((k) => !curvesByKey[k]);
  const data = new Float64Array(n).fill(NaN);
  const compiled = (rules || []).map((r) => (r.conditions || []).map((c) => ({ arr: curvesByKey[c.curve] || null, op: c.op, x: Number(c.value) })));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < compiled.length; k++) {
      let ok = true;
      for (const c of compiled[k]) {
        const v = c.arr ? c.arr[i] : NaN;
        if (!Number.isFinite(v) || !test(v, c.op, c.x)) { ok = false; break; }
      }
      if (ok) { data[i] = k; break; }
    }
  }
  return { data, missing };
}

/** Thickness per class (metres of the depth vector), for the summary. */
export function classThickness(depth, data, nClasses) {
  const n = depth.length;
  const out = new Float64Array(nClasses);
  let unclassified = 0;
  for (let i = 0; i < n; i++) {
    const step = i + 1 < n ? depth[i + 1] - depth[i] : (i > 0 ? depth[i] - depth[i - 1] : 0);
    const th = Math.abs(step);
    const k = data[i];
    if (Number.isFinite(k) && k >= 0 && k < nClasses) out[k] += th;
    else unclassified += th;
  }
  return { thickness: out, unclassified };
}

/** One line per condition, for tooltips and the interval description. */
export const describeRule = (r) => ((r.conditions || []).length
  ? r.conditions.map((c) => `${c.curve} ${c.op} ${c.value}`).join(' and ')
  : 'everything else');
