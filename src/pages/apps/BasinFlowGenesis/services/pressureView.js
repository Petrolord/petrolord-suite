// The present-day pressure column for the screen (BF-U2-015). The engine
// reports Pa at each slice; the display follows the depth unit: MPa with
// metres, psi with feet (said on the axis). Pure.

import { depthToDisplay } from './units';

const PSI_PER_PA = 1 / 6894.757293168361;

export const pressureUnitFor = (depthUnit) => (depthUnit === 'ft' ? 'psi' : 'MPa');
export const pressureToDisplay = (pa, pU) => (Number.isFinite(pa) ? (pU === 'psi' ? pa * PSI_PER_PA : pa / 1e6) : NaN);

/** Rows shallow to deep, starting at the surface (0, 0, 0). */
export function pressureRows(results, depthUnit = 'm') {
  const col = results?.data?.column;
  if (!Array.isArray(col) || !col.length || !Number.isFinite(col[0].porePressurePa)) return [];
  const pU = pressureUnitFor(depthUnit);
  const p = (v) => Number(pressureToDisplay(v, pU).toFixed(pU === 'psi' ? 0 : 2));
  return [{ depth: 0, hydrostatic: 0, pore: 0, overburden: 0 },
    ...col.map((c) => ({ depth: Number(depthToDisplay(c.depth, depthUnit).toFixed(1)), hydrostatic: p(c.hydrostaticPa), pore: p(c.porePressurePa), overburden: p(c.overburdenPa) }))];
}

/** What the column says, in words. */
export function pressureSummary(results, depthUnit = 'm') {
  const col = results?.data?.column || [];
  if (!col.length || !Number.isFinite(col[0].porePressurePa)) return { maxPa: null, text: '' };
  const pU = pressureUnitFor(depthUnit);
  const worst = col.reduce((a, b) => (b.overpressurePa > a.overpressurePa ? b : a));
  const d = pU === 'psi' ? 0 : 1;
  const base = '1D compaction disequilibrium on the burial history (Kozeny-Carman permeability by lithology); it does not feed back into compaction.';
  if (!(worst.overpressurePa > 1e5)) return { maxPa: worst.overpressurePa, text: `The column stays at about hydrostatic pressure. ${base}` };
  const frac = worst.overpressurePa / Math.max(1, worst.overburdenPa - worst.hydrostaticPa);
  return {
    maxPa: worst.overpressurePa,
    text: `Overpressure up to ${pressureToDisplay(worst.overpressurePa, pU).toFixed(d)} ${pU} at ${depthToDisplay(worst.depth, depthUnit).toFixed(0)} ${depthUnit} (${(100 * frac).toFixed(0)} % of the way from hydrostatic to overburden). ${base}`,
  };
}
