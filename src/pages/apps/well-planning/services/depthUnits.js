// Depth units for the Targets tab, the target dialogs and the datum
// fields (2026-10-13). Everything is stored in metres, as before; the
// fields show and take the depth unit of the user's unit profile (the
// Targets tab and target dialogs, which belong to the site) or of the
// wellbore (its datum, vertical tolerance and separation-rule inputs).
// Site eastings and northings stay in the site CRS unit (metres).

import { useAppUnits } from '@/lib/units/useAppUnits';

export const FT_PER_M = 1 / 0.3048;

/** A metre value in `unit` ('m' | 'ft'); null stays null. */
export function mToUnit(m, unit) {
  if (m === null || m === undefined || m === '') return null;
  const n = Number(m);
  if (!Number.isFinite(n)) return null;
  return unit === 'ft' ? n * FT_PER_M : n;
}

/** A value typed in `unit` back to metres; blank or non-numeric gives null. */
export function unitToM(v, unit) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return unit === 'ft' ? n / FT_PER_M : n;
}

/** A metre value as a field string in `unit`, rounded so a round trip is
 *  stable to the centimetre (4 decimals in ft, 3 in m); '' for empty. */
export function fieldFromM(m, unit, digits = null) {
  const v = mToUnit(m, unit);
  if (v === null) return '';
  const d = digits ?? (unit === 'ft' ? 4 : 3);
  return String(Number(v.toFixed(d)));
}

/** Display string of a metre value in `unit` with `digits` decimals ('' for empty). */
export function showDepth(m, unit, digits = 1) {
  const v = mToUnit(m, unit);
  return v === null ? '' : v.toFixed(digits);
}

export const TARGET_UNIT_SPEC = { depth: { family: 'depth', allowed: ['m', 'ft'] } };

/** The depth unit the Targets tab and target dialogs show: the unit profile's. */
export function useTargetDepthUnit() {
  const u = useAppUnits('well-planning', TARGET_UNIT_SPEC, { fallback: { depth: 'ft' } });
  return u.units.depth === 'm' ? 'm' : 'ft';
}
