// What the exported section says about itself (AppUpgrade WC-U1-010, PL7):
// the header a reviewer needs to sign a correlation panel without the app
// around it: who and where (field, analyst), what was drawn (wells, datum
// and flattening, depth reference, unit, spacing, template), at what scale,
// when, and by which build. Pure, Latin-1 only (no em dashes).

import { DEPTH_REF_LABEL, verticalScale } from '@/components/wells/section/sectionFrame';

export { verticalScale };
import { toDisplay } from '@/components/wells/depthModes';
import { buildLabel } from '@/lib/platformBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';

function datumText(datum, depthRef, depthUnit) {
  const ref = DEPTH_REF_LABEL[depthRef] || 'MD';
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  if (datum?.mode === 'flatten') {
    const d = !Number.isFinite(datum.datumM) ? EMPTY_VALUE
      : depthRef === 'twt' ? `${Number(datum.datumM.toFixed(1))} ms ${ref}` : `${Number(toDisplay(datum.datumM, depthUnit).toFixed(1))} ${u} ${ref}`;
    return `Flattened on ${datum.topName || EMPTY_VALUE} at ${d}`;
  }
  if (datum?.mode === 'stretch') return `Stretched between ${datum.upperName || EMPTY_VALUE} and ${datum.lowerName || EMPTY_VALUE}`;
  return 'Structural (true depth)';
}

/**
 * Title and caption lines of the exported PNG.
 * @param {Object} p
 * @param {Array<{name: string}>} p.wells section order
 * @param {Object} p.datum @param {'md'|'tvd'|'tvdss'} p.depthRef @param {'m'|'ft'} p.depthUnit
 * @param {'equal'|'proportional'} p.spacing effective spacing
 * @param {string} p.templateName @param {?number} p.scale 1:N
 * @param {{field?: string, analyst?: string}} [p.report]
 * @param {Date} [p.now] @param {string} [p.build]
 * @param {?{first: number, last: number, n: number}} [p.window] wells in view (1-based) when the band scrolls
 * @returns {{title: string, caption: string[]}}
 */
export function sectionCaption({ wells, datum, depthRef, depthUnit, spacing, templateName, scale, report = {}, now = new Date(), build = buildLabel(), window: shown = null }) {
  const field = (report?.field || '').trim();
  const analyst = (report?.analyst || '').trim();
  const names = (wells || []).map((w) => w.name);
  const title = `Well Correlation${field ? `: ${field}` : ''} (${names.length} well${names.length === 1 ? '' : 's'})`;
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  const caption = [
    // U2-002: a scrolled section exports the window on screen and says so
    shown && shown.n > 0 && (shown.first > 1 || shown.last < shown.n)
      ? `Wells ${shown.first} to ${shown.last} of ${shown.n} shown: ${names.slice(shown.first - 1, shown.last).join(', ')}`
      : `Wells: ${names.join(', ') || EMPTY_VALUE}`,
    `${datumText(datum, depthRef, depthUnit)} · ${depthRef === 'twt' ? 'Time TWT in ms from each well\'s checkshots' : `Depth ${DEPTH_REF_LABEL[depthRef] || 'MD'} in ${u} (TVDSS below mean sea level)`} · Vertical scale ${scale ? `1:${scale.toLocaleString('en-US')}` : depthRef === 'twt' ? `${EMPTY_VALUE} (time)` : EMPTY_VALUE} · Spacing ${spacing === 'proportional' ? 'by distance' : spacing === 'line' ? 'by distance along the section line' : 'equal'} · Template ${templateName || EMPTY_VALUE}`,
    `Field ${field || EMPTY_VALUE} · Analyst ${analyst || EMPTY_VALUE} · ${now.toISOString().slice(0, 10)} · ${build}`,
  ];
  return { title, caption };
}
