// Control points for a top map, through the shared datum module
// (WDM-U2-007). The gridding engine's tops door places each top through the
// well's survey and a KB number; this wrapper hands it the well's stated
// reference elevation (src/lib/wellDatum.js) and leaves out, with a reason,
// the wells that state none when the map is in TVDSS. Nothing is gridded on
// an assumed 0. MD and TVD maps need no datum and keep every well.

import { topsToControlPoints as engineTopsToControlPoints, CONTROL_POINT_SKIP_REASONS as ENGINE_SKIP_REASONS } from '../engine/surface';
import { readWellDatum } from '@/lib/wellDatum';

/** The engine's skip reasons plus the datum one, rendered by the workstation and the help guide. */
export const CONTROL_POINT_SKIP_REASONS = Object.freeze({
  ...ENGINE_SKIP_REASONS,
  no_datum: 'no depth reference elevation: set it in Well Data Manager',
});

/**
 * Same contract as the engine's topsToControlPoints.
 * @param {Array} wells registry wells with tops
 * @param {string} topName
 * @param {{depthRef?: 'md'|'tvd'|'tvdss', placement?: 'borehole'|'surface'}} [opts]
 */
export function topsToControlPoints(wells, topName, opts = {}) {
  const depthRef = opts.depthRef ?? 'tvdss';
  const usable = [];
  const noDatum = [];
  for (const w of wells || []) {
    const d = readWellDatum(w);
    if (depthRef === 'tvdss' && !d.tvdssOk) {
      const has = (w.tops || []).some((t) => t.name === topName);
      noDatum.push({ well: w.name, reason: has ? 'no_datum' : 'no_top' });
      continue;
    }
    usable.push(d.tvdssOk ? { ...w, kb_m: d.refElevM } : w);
  }
  const r = engineTopsToControlPoints(usable, topName, opts);
  return { ...r, skipped: [...r.skipped, ...noDatum] };
}
