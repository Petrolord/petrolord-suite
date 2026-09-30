// What an exported map says about itself (MAP-U1-013, PL7, 2026-09-30):
// the header a reviewer needs to sign a structure map without the app
// around it. Who and where (field, analyst); what the map is (source,
// wells, depth reference, gridding method, cell, extent, faults and
// boundary); how to read it (unit, sign convention, contour interval,
// CRS and XY unit); when and by which build. Pure; Latin-1 only.

import { buildLabel } from '@/lib/platformBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { isLengthSurface } from './surfaceExport';
import { xyUnitOf, XY_UNIT_LABEL } from './xyUnits';
import { DEPTH_REF_LABEL } from './gridStatus';

export const REPORT_KEY = 'mapping.report';

const METHOD_LABEL = {
  tps: 'thin-plate spline', 'tps-blocked': 'thin-plate spline by fault block', kriging: 'ordinary kriging', tension: 'spline in tension',
};

/** One phrase for where the surface came from. */
export function sourceText(surface) {
  const p = surface?.provenance || {};
  const src = p.source || {};
  const method = METHOD_LABEL[p.method] || null;
  const bits = [];
  if (src.type === 'top') bits.push(`Top ${src.key} from ${p.control_points ?? EMPTY_VALUE} control points, ${DEPTH_REF_LABEL[p.depth_ref] || 'TVDSS'} at the borehole`);
  else if (src.type === 'zone') bits.push(`Zone ${src.zoneName || ''} ${src.key} from ${p.control_points ?? EMPTY_VALUE} wells`.replace(/\s+/g, ' '));
  else if (src.type === 'net') bits.push(`${src.measure === 'ratio' ? 'Net to gross' : src.measure === 'gross' ? 'Gross vertical thickness' : 'Net sand'} ${src.upper} to ${src.lower} from ${p.control_points ?? EMPTY_VALUE} wells`);
  else if (p.imported_from?.file_name) bits.push(`Imported from ${p.imported_from.file_name}`);
  else if (p.time_depth) bits.push(p.time_depth.method === 'average_velocity_from_wells' ? `Depth converted with average velocity from wells on ${p.time_depth.top}` : `Depth converted with V0 + kZ${p.time_depth.corrected_to ? `, corrected to ${p.time_depth.corrected_to}` : ''}`);
  else if (p.thickness) bits.push('Isochore of two surfaces');
  else if (p.arithmetic) bits.push(`Surface arithmetic (${p.arithmetic.op})`);
  else if (p.app === 'contour-map-digitizer') bits.push('Digitized from a contour map');
  else if (p.app === 'seismolord') bits.push('Seismolord horizon');
  if (method) bits.push(method);
  if (p.cell_m) bits.push(`cell ${p.cell_m} m`);
  if (p.extent?.beyond_m) bits.push(`mapped ${p.extent.beyond_m} m past the wells`);
  if (p.faults?.length) bits.push(`fault blocks ${p.faults.map((f) => f.name).join(', ')}`);
  if (p.boundary?.name) bits.push(`clipped to ${p.boundary.name}`);
  if (p.guide_points?.length) bits.push(`${p.guide_points.length} guide points`);
  return bits.join(', ') || 'Source not recorded';
}

/**
 * @param {{surface:object, depthUnit:'m'|'ft', depthPositive?:boolean, contourStep?:?number,
 *   report?:{field?:string, analyst?:string}, now?:Date, build?:string}} p
 *   contourStep is the interval in the display unit
 * @returns {{title:string, caption:string[]}}
 */
export function mapCaption({ surface, depthUnit = 'ft', depthPositive = false, contourStep = null, report = {}, now = new Date(), build = buildLabel() }) {
  const field = String(report?.field || '').trim();
  const analyst = String(report?.analyst || '').trim();
  const name = surface?.name || 'Surface';
  const length = isLengthSurface(surface);
  const isTime = surface?.z_domain === 'time';
  const structure = length && surface?.kind !== 'isochore';
  const values = length
    ? `${structure ? (depthPositive ? 'Depth below mean sea level' : 'Elevation, negative below mean sea level') : 'Thickness'} in ${depthUnit}`
    : isTime ? 'Two-way time in ms' : `Attribute${surface?.z_unit ? ` in ${surface.z_unit}` : ''}`;
  const ci = contourStep ? `Contour interval ${Number(contourStep.toFixed(3))}${length ? ` ${depthUnit}` : isTime ? ' ms' : ''}` : `Contour interval ${EMPTY_VALUE}`;
  const xy = xyUnitOf(surface);
  const crs = surface?.crs ? `CRS ${surface.crs} (XY in ${XY_UNIT_LABEL[xy] || xy || 'metres'})` : 'No CRS: placement unverified';
  return {
    title: `${name}${field ? ` · ${field}` : ''}`,
    caption: [
      sourceText(surface),
      `${values} · ${ci} · ${crs}`,
      `Field ${field || EMPTY_VALUE} · Analyst ${analyst || EMPTY_VALUE} · ${now.toISOString().slice(0, 10)} · ${build}`,
    ],
  };
}

/** Report fields kept per browser. */
export function readReport() {
  try { const r = JSON.parse(localStorage.getItem(REPORT_KEY) || '{}'); return { field: r.field || '', analyst: r.analyst || '' }; } catch { return { field: '', analyst: '' }; }
}
export function writeReport(r) {
  try { localStorage.setItem(REPORT_KEY, JSON.stringify({ field: r.field || '', analyst: r.analyst || '' })); } catch { /* private mode */ }
}
