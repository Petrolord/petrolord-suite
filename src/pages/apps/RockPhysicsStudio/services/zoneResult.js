// The zone substitution every view shares (U2, 2026-10-01): the Fluids
// panel's table and chart, the crossplot, the angle gather, the PDF and the
// publish all read this one result, so they cannot disagree. Pure.

import { substituteZone } from './scenario';
import { elasticMeans } from './elastic';
import { zoneIndices, meanAt } from './prep';

/**
 * @param {Object} model the SI well model (prep.buildModel)
 * @param {{top_md_m: number, base_md_m: number}} zone
 * @returns {null | {error: string} | {indices: number[], sub: Object, kmin: number,
 *   merged: {vp: number[], vs: number[], rho: number[]}, before: Object, after: Object}}
 *   `merged` is the published case over the whole well: substituted where a
 *   sample was substituted, in situ everywhere else.
 */
export function computeZoneResult(model, zone, scenario, rock) {
  if (!model || !zone) return null;
  const indices = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
  if (!indices.length) return { error: 'The zone has no samples in this well.' };
  let sub;
  try { sub = substituteZone(model, indices, scenario, rock); } catch (e) { return { error: e.message }; }
  // RP-U1-006/007: "after" is the case that publishes: substituted where
  // the sample was substituted, in situ where it was left (outside the
  // limits) or skipped; both sides average the same zone samples
  const mergedKey = (key) => Array.from(model[key], (v, i) => (Number.isFinite(sub[key][i]) ? sub[key][i] : v));
  const merged = { vp: mergedKey('vp'), vs: mergedKey('vs'), rho: mergedKey('rho') };
  const side = (vp, vs, rho) => ({
    vp: meanAt(vp, indices), vs: meanAt(vs, indices), rho: meanAt(rho, indices), ...elasticMeans(vp, vs, rho, indices),
  });
  return {
    indices,
    sub,
    kmin: sub.kmin,
    merged,
    before: side(model.vp, model.vs, model.rho),
    after: side(merged.vp, merged.vs, merged.rho),
  };
}
