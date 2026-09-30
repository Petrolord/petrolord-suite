// Status-line wording for a gridding run (MS0, 2026-09-05). Pure so the
// skipped-well and extrapolation wording is unit-tested without the
// workstation: names the depth reference and display unit, lists wells
// the engine could not place (never the ones that simply lack the top),
// and counts tops placed along the final survey tangent.

import { CONTROL_POINT_SKIP_REASONS } from '../engine/surface';

export const DEPTH_REF_LABEL = { md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' };

/**
 * What a top map is, by its depth reference (MAP-T1-006 for MD,
 * MAP-U1-002 for TVD). Only TVDSS is a structure map: an elevation below
 * one datum (mean sea level) that ReservoirCalc Pro, Earth Modeling,
 * Simulation and Well Design read as depth. TVD is measured below each
 * well's own KB, so two wells with different KBs disagree about the same
 * horizon; like MD it is published as an attribute of positive metres
 * below the depth reference, and says so in its name.
 * @returns {{name:string, kind:'structure'|'attribute', zSign:1|-1, zUnit:?string}}
 *   zSign multiplies the engine's control values into the published ones
 */
export function topMapKind(depthRef, topName) {
  if (depthRef === 'md') return { name: `${topName} MD (measured depth, m)`, kind: 'attribute', zSign: 1, zUnit: 'm' };
  if (depthRef === 'tvd') return { name: `${topName} TVD (below KB, m)`, kind: 'attribute', zSign: -1, zUnit: 'm' };
  return { name: `${topName} structure`, kind: 'structure', zSign: 1, zUnit: null };
}

/** Skipped entries worth telling the user about (a well without the
 *  top is the normal case, not a problem). */
export function reportableSkips(skipped) {
  return (skipped || []).filter((s) => s.reason !== 'no_top');
}

/**
 * @param {{name, result:{points, skipped, extrapolated, depthRef}, spec, depthUnit}} p
 */
export function describeGridResult({ name, result, spec, depthUnit = 'ft', method = 'tps' }) {
  // MAP-U1-002: only TVDSS is an elevation; MD and TVD maps are attributes in metres below KB
  const ref = !result.depthRef ? 'attribute'
    : result.depthRef === 'tvdss' ? `TVDSS elevation, ${depthUnit}`
      : `${DEPTH_REF_LABEL[result.depthRef]} below KB, m, an attribute`;
  const verb = method === 'kriging' ? 'Kriged' : 'Gridded';
  const parts = [`${verb} ${name} (${ref}) from ${result.points.length} wells (${spec.nx}×${spec.ny}).`];
  const skips = reportableSkips(result.skipped);
  if (skips.length) {
    parts.push(`Skipped ${skips.length}: ${skips.map((s) => `${s.well} (${CONTROL_POINT_SKIP_REASONS[s.reason] || s.reason})`).join(', ')}.`);
  }
  if (result.extrapolated) {
    parts.push(`${result.extrapolated} top${result.extrapolated === 1 ? '' : 's'} below the last survey station follow the final tangent.`);
  }
  parts.push('Review, then Publish.');
  return parts.join(' ');
}
