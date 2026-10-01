// Monte Carlo input distributions for the Probabilistic panel
// (ReservoirCalc Pro upgrade U1, 2026-09-30). Pure; the panel keeps the
// state and the engine samples what `formatDistributions` returns.
//
// RCP-U1-008: base-case consistency used to move only the triangle's
// most-likely value (p50) onto a new deterministic base and left Min and
// Max where they were, so a porosity base moved from 0.20 to 0.30 made a
// triangle 0.16 / 0.30 / 0.24 with its mode above its maximum, which the
// sampler accepted silently. The whole distribution now moves with its
// centre (contacts by a shift, positive quantities by a ratio), and a
// malformed distribution is refused with the reason.
// RCP-U1-015: net-to-gross could not be uncertain (the panel forced a
// constant); RCP-U1-014: the analytic gas-cap fraction was a constant;
// RCP-U1-003: recovery factors had no distribution, so there was no
// recoverable volume to hand to Prospect Risking.

export const CONTACT_KEYS = new Set(['owc', 'goc']);
const FRACTION_KEYS = new Set(['porosity', 'sw', 'ntg', 'gasCapFraction']);

export const DIST_LABELS = {
  porosity: 'Porosity (fraction)',
  sw: 'Water Saturation (fraction)',
  ntg: 'Net-to-Gross (fraction)',
  area: 'Area',
  thickness: 'Gross Thickness',
  owc: 'Oil-Water Contact (OWC)',
  goc: 'Gas-Oil Contact (GOC)',
  grvFactor: 'GRV Factor (structural uncertainty)',
  fvf: 'Oil FVF (Bo)',
  bg: 'Gas FVF (Bg)',
  gasCapFraction: 'Gas Cap Fraction of GRV',
  recovery: 'Oil Recovery Factor (%)',
  recoveryGas: 'Gas Recovery Factor (%)',
};

/** The distribution keys a run of this shape samples, in display order. */
export function distKeysFor({ structural = false, fluidType = 'oil', inputMethod = 'simple' } = {}) {
  const oil = fluidType === 'oil' || fluidType === 'oil_gas';
  const gas = fluidType === 'gas' || fluidType === 'oil_gas';
  const keys = ['porosity', 'sw', 'ntg'];
  if (structural) {
    if (fluidType === 'oil_gas') keys.push('goc');
    keys.push('owc', 'grvFactor');
  } else {
    keys.push('thickness', 'area');
    if (fluidType === 'oil_gas' && inputMethod === 'simple') keys.push('gasCapFraction');
  }
  if (oil) keys.push('fvf');
  if (gas) keys.push('bg');
  if (oil) keys.push('recovery');
  if (gas) keys.push('recoveryGas');
  return keys;
}

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/**
 * The starting distribution of one key around its deterministic value.
 * Area, thickness, porosity, Sw and the FVFs start as a +/-20% triangle
 * (the earlier default); contacts as an additive spread; NTG, the
 * gas-cap fraction and the recovery factors start with no spread (a
 * constant the user can widen), so adding them changes no earlier run.
 */
export function defaultDist(key, value, unitSystem = 'field') {
  if (key === 'grvFactor') return { type: 'triangular', p90: 0.85, p50: 1, p10: 1.15, mean: 1, stdDev: 0.1, min: 0.85, max: 1.15 };
  if (CONTACT_KEYS.has(key)) {
    const v = Number.isFinite(num(value)) ? num(value) : (key === 'goc' ? -7000 : -8000);
    const d = unitSystem === 'field' ? 50 : 15;
    return { type: 'triangular', p90: v - d, p50: v, p10: v + d, mean: v, stdDev: d / 2, min: v - d, max: v + d };
  }
  const v = Number.isFinite(num(value)) ? num(value) : 0;
  const spread = ['ntg', 'gasCapFraction', 'recovery', 'recoveryGas'].includes(key) ? 0 : 0.2;
  return {
    type: 'triangular',
    p90: v * (1 - spread), p50: v, p10: v * (1 + spread),
    mean: v, stdDev: v * (spread / 2),
    min: v * (1 - spread), max: v * (1 + spread),
  };
}

/** Central value of a panel distribution. */
export function centralOf(d) {
  if (!d) return NaN;
  if (d.type === 'uniform') return (num(d.min) + num(d.max)) / 2;
  if (d.type === 'normal' || d.type === 'lognormal') return num(d.mean);
  return num(d.p50);
}

/**
 * Move a distribution so its centre sits on `base`, keeping its shape:
 * contacts shift, positive quantities scale by the ratio (a +/-20%
 * triangle stays +/-20%), anything else shifts.
 */
export function recentreDist(d, base, key) {
  const b = num(base);
  const c = centralOf(d);
  if (!d || !Number.isFinite(b) || !Number.isFinite(c) || b === c) return d;
  const ratio = !CONTACT_KEYS.has(key) && c > 0 && b > 0 ? b / c : null;
  const move = (v) => {
    const x = num(v);
    if (!Number.isFinite(x)) return v;
    return ratio ? x * ratio : x + (b - c);
  };
  const out = { ...d };
  for (const k of ['p90', 'p50', 'p10', 'mean', 'min', 'max']) out[k] = move(d[k]);
  if (Number.isFinite(num(d.stdDev))) out.stdDev = ratio ? num(d.stdDev) * ratio : num(d.stdDev);
  return out;
}

/** Add the keys a run needs (defaults around the base) and keep the ones the user edited. */
export function syncDistParams(prev = {}, keys, base = {}, unitSystem = 'field') {
  const next = {};
  for (const k of keys) next[k] = prev[k] || defaultDist(k, base[k], unitSystem);
  return next;
}

/**
 * The engine's input set from the panel's distributions, or the problems
 * that stop a run. Only `keys` are sent.
 * @returns {{formatted: Object, problems: string[]}}
 */
export function formatDistributions(distParams, keys = Object.keys(distParams || {})) {
  const formatted = {};
  const problems = [];
  for (const key of keys) {
    const val = distParams?.[key];
    if (!val) continue;
    const label = DIST_LABELS[key] || key;
    if (val.type === 'uniform') {
      const lo = Math.min(num(val.min), num(val.max));
      const hi = Math.max(num(val.min), num(val.max));
      if (![lo, hi].every(Number.isFinite)) { problems.push(`${label}: enter Min and Max.`); continue; }
      formatted[key] = { type: 'uniform', min: lo, max: hi };
    } else if (val.type === 'normal' || val.type === 'lognormal') {
      const m = num(val.mean); const sd = num(val.stdDev);
      if (!Number.isFinite(m) || !Number.isFinite(sd) || sd < 0) { problems.push(`${label}: enter a mean and a standard deviation of zero or more.`); continue; }
      if (val.type === 'lognormal' && !(m > 0)) { problems.push(`${label}: a lognormal needs a positive mean.`); continue; }
      formatted[key] = { type: val.type, mean: m, stdDev: sd };
      if (FRACTION_KEYS.has(key)) { formatted[key].min = 0; formatted[key].max = 1; }
    } else {
      const lo = Math.min(num(val.p90), num(val.p10));
      const hi = Math.max(num(val.p90), num(val.p10));
      const mode = num(val.p50);
      if (![lo, hi, mode].every(Number.isFinite)) { problems.push(`${label}: enter Min, Most likely and Max.`); continue; }
      if (mode < lo - 1e-12 || mode > hi + 1e-12) {
        problems.push(`${label}: the most likely value ${fmt(mode)} lies outside Min ${fmt(lo)} to Max ${fmt(hi)}.`);
        continue;
      }
      formatted[key] = { type: 'triangular', min: lo, mode, max: hi };
    }
  }
  return { formatted, problems };
}

const fmt = (v) => String(Number(Number(v).toPrecision(4)));
