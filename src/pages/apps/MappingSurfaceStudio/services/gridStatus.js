// Status-line wording for a gridding run (MS0, 2026-09-05). Pure so the
// skipped-well and extrapolation wording is unit-tested without the
// workstation: names the depth reference and display unit, lists wells
// the engine could not place (never the ones that simply lack the top),
// and counts tops placed along the final survey tangent.

import { CONTROL_POINT_SKIP_REASONS } from '../engine/surface';

export const DEPTH_REF_LABEL = { md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' };

/** Skipped entries worth telling the user about (a well without the
 *  top is the normal case, not a problem). */
export function reportableSkips(skipped) {
  return (skipped || []).filter((s) => s.reason !== 'no_top');
}

/**
 * @param {{name, result:{points, skipped, extrapolated, depthRef}, spec, depthUnit}} p
 */
export function describeGridResult({ name, result, spec, depthUnit = 'ft' }) {
  const ref = result.depthRef ? `${DEPTH_REF_LABEL[result.depthRef]} elevation, ${depthUnit}` : 'attribute';
  const parts = [`Gridded ${name} (${ref}) from ${result.points.length} wells (${spec.nx}×${spec.ny}).`];
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
