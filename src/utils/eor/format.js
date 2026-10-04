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
import { formationLabel } from '../eorScreeningCalculations.js';

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
  if (v.status === 'pass') return `${a} is within ${requiredText(v, system)}.`;
  if (v.status === 'fail') {
    const edge = v.side === 'below' ? v.spec.min : v.spec.max;
    return `${a} is ${v.side} the ${v.side === 'below' ? 'minimum' : 'maximum'} ${quantity(v.kind, edge, u)}.`;
  }
  return '';
}
