// Volumes report (Earth Modeling EM5, 2026-09-06): the per-zone,
// per-block volume tables as CSV in the chosen display units, with the
// population provenance and the model frame in a header. Pure.

import { volumeValue, volumeUnitLabel } from './units';
import { describeProvenance } from './propertyKriging';

const q = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * @param {object} built the built model
 * @param {{name:string, volumeUnits:'metric'|'field', depthUnit?:string}} opts
 * @returns {{text:string, fileName:string}}
 */
export function volumesCsv(built, { name = 'earth-model', volumeUnits = 'metric' } = {}) {
  if (!built?.zones?.length) throw new Error('Build the model first; there are no volumes to export.');
  const cols = ['bulk_m3', 'net_m3', 'pore_m3', 'hcpv_m3'];
  const head = ['zone', 'registry_zone', 'block', 'cells', ...cols.map((c) => `${c.replace('_m3', '')} (${volumeUnitLabel(c, volumeUnits)})`)];
  const lines = [
    `# ${name}: volumes per zone and fault block`,
    `# frame ${built.spec.nx} x ${built.spec.ny} at ${built.spec.dx} x ${built.spec.dy} m${built.boundary ? `, clipped to ${built.boundary.name}` : ''}${built.crs ? `, CRS ${built.crs}` : ''}`,
    `# units ${volumeUnits}; rock volume in ${volumeUnitLabel('bulk_m3', volumeUnits)}, pore volume in ${volumeUnitLabel('pore_m3', volumeUnits)}`,
    head.map(q).join(','),
  ];
  for (const z of built.zones) {
    const keys = Object.keys(z.volumes).sort((a, b) => (a === 'total' ? 1 : b === 'total' ? -1 : a.localeCompare(b)));
    for (const k of keys) {
      const v = z.volumes[k];
      lines.push([z.name, z.registryZone || '', k === 'total' ? 'TOTAL' : `Block ${k}`, v.cells,
        ...cols.map((c) => volumeValue(v[c], c, volumeUnits).toFixed(4))].map(q).join(','));
    }
  }
  lines.push('');
  lines.push('# population provenance');
  for (const z of built.zones) {
    for (const [prop, rows] of Object.entries(z.provenance || {})) lines.push(`# ${z.name} ${prop}: ${describeProvenance(rows)}`);
  }
  const fileName = `${String(name).replace(/[^\w-]+/g, '_') || 'earth-model'}-volumes-${volumeUnits}.csv`;
  return { text: `${lines.join('\n')}\n`, fileName };
}
