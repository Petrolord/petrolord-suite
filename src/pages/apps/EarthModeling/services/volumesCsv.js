// Volumes report (Earth Modeling EM5, 2026-09-06): the per-zone,
// per-block volume tables as CSV in the chosen display units, with the
// population provenance and the model frame in a header. Pure.

import { volumeValue, volumeUnitLabel } from './units';
import { describeProvenance } from './propertyKriging';
import { buildLabel } from '@/lib/platformBuild';
import { describeTraps } from './trapBound';

const cell = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : Number(v).toFixed(2));
const latin1 = (t) => String(t).replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?');

/** One zone's contacts and FVFs as the build used them. */
function fluidText(z) {
  const f = z.fluids || {};
  const bits = [];
  bits.push(Number.isFinite(f.goc) ? `GOC ${f.goc.toFixed(1)} m` : 'no GOC');
  bits.push(Number.isFinite(f.owc) ? `OWC ${f.owc.toFixed(1)} m` : 'no OWC (whole zone counted as hydrocarbon)');
  // U2-005: contacts per fault block
  for (const [lab, b] of Object.entries(f.blocks || {})) {
    bits.push(`block ${lab}${Number.isFinite(b.goc) ? ` GOC ${b.goc.toFixed(1)} m` : ''}${Number.isFinite(b.owc) ? ` OWC ${b.owc.toFixed(1)} m` : ''}`);
  }
  if (Number.isFinite(f.bo)) bits.push(`Bo ${f.bo} rb/stb`);
  if (Number.isFinite(f.bg)) bits.push(`Bg ${Number(f.bg).toPrecision(4)} rm3/sm3`);
  if (f.gasZone) bits.push('gas zone');
  if (z.trap) bits.push(`leg bounded by the closure and spill: ${describeTraps(z.trap)}`);
  if (z.openEdge?.open) bits.push(z.openEdge.spillAtEdge ? 'OPEN: the trap spills at the model edge' : `OPEN: the hydrocarbon leg reaches the model edge at ${z.openEdge.nodes} nodes`);
  return bits.join(', ');
}

const q = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * @param {object} built the built model
 * U1 (EM-U1-011, PL7): the header also carries what a reviewer signs
 * against: field, analyst, date and build; the depth reference and XY
 * unit; each zone's contacts and FVFs as used; open-edge and clamp flags.
 * Latin-1 only.
 * @param {{name:string, volumeUnits:'metric'|'field', report?:{field?:string, analyst?:string}, now?:Date, build?:string}} opts
 * @returns {{text:string, fileName:string}}
 */
export function volumesCsv(built, { name = 'earth-model', volumeUnits = 'metric', report = {}, now = new Date(), build = buildLabel() } = {}) {
  if (!built?.zones?.length) throw new Error('Build the model first; there are no volumes to export.');
  // T1: split and in-place columns join when any zone carries contacts or FVFs
  const split = built.zones.some((z) => z.volumes?.total && 'oil_hcpv_m3' in z.volumes.total);
  const inPlace = built.zones.some((z) => Number.isFinite(z.volumes?.total?.stoiip_m3) || Number.isFinite(z.volumes?.total?.giip_m3));
  const cols = ['bulk_m3', 'net_m3', 'pore_m3', 'hcpv_m3', ...(split ? ['gas_hcpv_m3', 'oil_hcpv_m3'] : []), ...(inPlace ? ['stoiip_m3', 'giip_m3'] : [])];
  const frameM = built.specM || built.spec;
  const head = ['zone', 'registry_zone', 'block', 'cells', ...cols.map((c) => `${c.replace('_m3', '')} (${volumeUnitLabel(c, volumeUnits)})`)];
  const lines = [
    `# ${name}: volumes per zone and fault block`,
    `# frame ${built.spec.nx} x ${built.spec.ny} at ${cell(frameM.dx)} x ${cell(frameM.dy)} m${built.boundary ? `, clipped to ${built.boundary.name}` : ''}${built.crs ? `, CRS ${built.crs}` : ''}`,
    `# units ${volumeUnits}; rock volume in ${volumeUnitLabel('bulk_m3', volumeUnits)}, pore volume in ${volumeUnitLabel('pore_m3', volumeUnits)}`,
    `# field ${String(report?.field || '').trim() || 'not given'}; analyst ${String(report?.analyst || '').trim() || 'not given'}; date ${now.toISOString().slice(0, 10)}; ${build}`,
    `# depth TVDSS in metres below mean sea level, positive down; XY unit ${built.xyUnit || 'm'}${built.crs ? '' : ' (no CRS recorded)'}; bulk = GRV, net = NRV, pore = NRV x porosity, hcpv = pore x (1 - Sw) above the contact`,
    ...built.zones.map((z) => `# ${z.name} fluids: ${fluidText(z)}`),
    head.map(q).join(','),
  ];
  for (const z of built.zones) {
    const keys = Object.keys(z.volumes).sort((a, b) => (a === 'total' ? 1 : b === 'total' ? -1 : a.localeCompare(b)));
    for (const k of keys) {
      const v = z.volumes[k];
      lines.push([z.name, z.registryZone || '', k === 'total' ? 'TOTAL' : `Block ${k}`, v.cells,
        ...cols.map((c) => { const x = volumeValue(v[c], c, volumeUnits); return x === null ? '' : x.toFixed(4); })].map(q).join(','));
    }
  }
  lines.push('');
  lines.push('# population provenance');
  for (const z of built.zones) {
    for (const [prop, rows] of Object.entries(z.provenance || {})) lines.push(`# ${z.name} ${prop}: ${describeProvenance(rows)}`);
  }
  const fileName = `${String(name).replace(/[^\w-]+/g, '_') || 'earth-model'}-volumes-${volumeUnits}.csv`;
  for (const c of built.propertyClamps || []) lines.push(`# ${c.zone} ${c.prop}: ${c.nodes} nodes extrapolated outside 0 to 1 and held at the limit`);
  for (const n of built.notes || []) lines.push(`# note: ${n}`);
  // U2-010: the volume distribution when one was run (P90 = low case)
  if (built.distribution) {
    const d = built.distribution;
    lines.push(`# volume distribution: ${d.iterations} trials, seed ${d.seed}; P90 is the low case (10th percentile of outcomes)`);
    lines.push(['zone', 'quantity', 'P90', 'P50', 'P10', 'mean'].join(','));
    for (const z of d.zones) {
      for (const [qn, st] of Object.entries(z.stats)) {
        lines.push([z.name, `${qn.replace('_m3', '')} (${volumeUnitLabel(qn, volumeUnits)})`, ...['p90', 'p50', 'p10', 'mean'].map((k) => { const x = volumeValue(st[k], qn, volumeUnits); return x === null ? '' : x.toFixed(4); })].map(q).join(','));
      }
    }
  }
  return { text: latin1(`${lines.join('\n')}\n`), fileName };
}
