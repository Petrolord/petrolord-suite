/**
 * Words and numbers of a screening verdict in a display unit system
 * (EOR-U1): the required range, the value of this reservoir, the reason a
 * criterion passed, failed, was marginal or was not screened. One source
 * for the screen and the report, so both say the same thing (RL12).
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { eorUnits } from './units.js';
import { formationLabel, PROJECT_RANGES } from '../eorScreeningCalculations.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export const STATUS_WORDS = Object.freeze({ pass: 'pass', marginal: 'marginal', fail: 'fail', na: 'not screened' });
export const OUTCOME_WORDS = Object.freeze({
  qualified: 'Qualified', marginal: 'Marginal', 'screened out': 'Screened out', 'not screened': 'Not screened',
});

/** A number of a kind with its unit: "5,200 ft", "1,585 m". */
export function quantity(kind, stored, u) {
  if (!finite(stored)) return EMPTY_VALUE;
  const t = u.fmt(kind, stored);
  const lab = u.label(kind);
  return lab ? `${t} ${lab}` : t;
}

/** The required range in the display unit: "> 2,800 ft", "10 to 150 cp". */
export function requiredText(v, system = 'oilfield') {
  const u = eorUnits(system);
  if (v.required) return v.required;
  const s = v.spec;
  if (!s || (s.min == null && s.max == null)) return 'Not critical';
  if (s.min != null && s.max != null) return `${u.fmt(v.kind, s.min)} to ${quantity(v.kind, s.max, u)}`;
  if (s.min != null) return `> ${quantity(v.kind, s.min, u)}${v.band ? ` (for ${v.band})` : ''}`;
  return `< ${quantity(v.kind, s.max, u)}`;
}

/** The value of this reservoir. */
export function actualText(v, system = 'oilfield') {
  if (v.key === 'formation') return v.actual ? formationLabel(v.actual) || v.actual : EMPTY_VALUE;
  return quantity(v.kind, v.actual, eorUnits(system));
}

/** The project average the paper underlines, for context. */
export function averageText(v, system = 'oilfield') {
  return finite(v.average) ? quantity(v.kind, v.average, eorUnits(system)) : '';
}

/** Why the verdict is what it is. */
export function reasonText(v, system = 'oilfield') {
  if (v.reason) return v.reason;
  const u = eorUnits(system);
  const a = quantity(v.kind, v.actual, u);
  if (v.key === 'formation') {
    return v.status === 'pass' ? `${actualText(v)} is a formation the paper names.` : `${actualText(v)} is outside "${v.required}".`;
  }
  if (v.status === 'pass') return `${a} meets ${requiredText(v, system)}.`;
  if (v.status === 'fail') {
    const edge = v.side === 'below' ? v.spec.min : v.spec.max;
    return `${a} is ${v.side} the ${v.side === 'below' ? 'minimum' : 'maximum'} ${quantity(v.kind, edge, u)}.`;
  }
  return '';
}

/**
 * EOR-U2-007: how far the value sits from the limit its verdict was judged
 * on, as information, never a score (Part 1, p. 192: limits are not sharp).
 * For a window (min and max) the nearer limit. delta is in oilfield units,
 * positive inside the limit, negative outside; relPct is |delta| over the
 * limit. null when there is no numeric limit or no value.
 */
export function distanceToLimit(v) {
  if (!v || !v.spec || !finite(v.actual) || v.key === 'formation') return null;
  const { min, max } = v.spec;
  const cands = [];
  if (finite(min)) cands.push({ limit: 'min', limitValue: min, delta: v.actual - min });
  if (finite(max)) cands.push({ limit: 'max', limitValue: max, delta: max - v.actual });
  if (!cands.length) return null;
  // judged on the side it fails, else on the nearer limit
  const pick = cands.find((c) => c.delta < 0) || cands.reduce((a, b) => (Math.abs(b.delta) < Math.abs(a.delta) ? b : a));
  return { ...pick, inside: pick.delta >= 0, relPct: pick.limitValue !== 0 ? (100 * Math.abs(pick.delta)) / Math.abs(pick.limitValue) : null };
}

const num4 = (x) => {
  const r = parseFloat(Number(x).toPrecision(4));
  return Math.abs(r) >= 1000 ? r.toLocaleString('en-US', { maximumFractionDigits: 12 }) : String(r);
};
const pctText = (p) => (p >= 100 ? String(Math.round(p)) : String(parseFloat(p.toPrecision(2))));

/** "700 ft above the minimum 2,800 ft (25 %)" in the display units; EMPTY_VALUE when there is no distance. */
export function distanceText(v, system = 'oilfield') {
  const d = distanceToLimit(v);
  if (!d) return EMPTY_VALUE;
  const u = eorUnits(system);
  // the difference of the shown values, so a temperature converts without its offset
  const shownDelta = Math.abs(u.show(v.kind, v.actual) - u.show(v.kind, d.limitValue));
  const lab = u.label(v.kind);
  const above = v.actual >= d.limitValue;
  const words = `${num4(shownDelta)}${lab ? ` ${lab}` : ''} ${above ? 'above' : 'below'} the ${d.limit === 'min' ? 'minimum' : 'maximum'} ${quantity(v.kind, d.limitValue, u)}`;
  return d.relPct == null ? words : `${words} (${pctText(d.relPct)} %)`;
}

/**
 * EOR-U2-006: the printed range of current projects for a criterion of a
 * method, and whether this reservoir sits inside it; null when the paper
 * prints none. Context only, never scored.
 */
export function projectRangeText(methodId, v, system = 'oilfield') {
  const r = PROJECT_RANGES[methodId]?.criteria?.[v.key];
  if (!r) return null;
  const u = eorUnits(system);
  let text;
  if (finite(r.min) && finite(r.max)) text = `${u.fmt(v.kind, r.min)} to ${quantity(v.kind, r.max, u)}`;
  else text = `from ${quantity(v.kind, r.min, u)}`;
  if (r.note && !finite(r.max)) return `${text} (${r.note})`;
  if (r.note) text += ` (${r.note})`;
  if (!finite(v.actual)) return text;
  const inside = v.actual >= r.min - 1e-9 && (!finite(r.max) || v.actual <= r.max + 1e-9);
  return `${text} (${inside ? 'inside' : 'outside'})`;
}
