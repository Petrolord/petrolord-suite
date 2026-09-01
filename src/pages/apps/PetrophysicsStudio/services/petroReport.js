// Interpretation summary PDF (Petrophysics Studio PS2, audit A1) on
// the house jsPDF + autotable pattern with the shared pdfBrand header
// (src/lib/pdfBrand.js). One page-flowing document: well header,
// parameter table, methods with the engines' own literature citations
// (METHOD_CITATIONS — the report never carries its own copies), zone
// summaries, provenance block. Returns the jsPDF doc; the caller saves.

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { METHOD_CITATIONS, PIPELINE_VERSION } from '../engine/pipeline';

const num = (v, d = 3) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '—');

const PARAM_ROWS = [
  ['GR clean (API)', 'grClean'], ['GR clay (API)', 'grClay'], ['Vsh model', 'vshMethod'],
  ['Matrix density (g/cc)', 'rhoMa'], ['Fluid density (g/cc)', 'rhoFl'],
  ['Matrix slowness (us/m)', 'dtMa'], ['Fluid slowness (us/m)', 'dtFl'],
  ['Sonic model', 'sonicMethod'], ['N-D combine', 'ndMethod'], ['Porosity source', 'phiSource'],
  ['Sw model', 'swMethod'], ['a', 'a'], ['m', 'm'], ['n', 'n'],
  ['Rw (ohm.m)', 'rw'], ['Rsh (ohm.m)', 'rsh'],
  ['Cutoff phi >=', 'cutPhi'], ['Cutoff Vsh <=', 'cutVsh'], ['Cutoff Sw <=', 'cutSw'],
];

/** Methods actually in play for this parameter set, with citations. */
export function methodLines(params) {
  const lines = [];
  const vsh = METHOD_CITATIONS.vsh[params.vshMethod];
  if (vsh) lines.push(`Shale volume: ${vsh}`);
  const phi = METHOD_CITATIONS.phi[params.phiSource];
  if (phi) lines.push(`Porosity: ${phi}`);
  if (params.phiSource === 'sonic') {
    const sonic = METHOD_CITATIONS.sonic[params.sonicMethod];
    if (sonic) lines.push(`Sonic model: ${sonic}`);
  }
  const sw = METHOD_CITATIONS.sw[params.swMethod];
  if (sw) lines.push(`Water saturation: ${sw}`);
  lines.push('Net pay: midpoint sample thickness; pay where phi, Vsh and Sw pass their cutoffs; net-thickness-weighted zone averages.');
  return lines;
}

/**
 * @param {Object} args
 * @param {string} args.wellName
 * @param {{curves: Object, inventory: Array}} args.wellData
 * @param {Object} args.params applied parameter set
 * @param {Array} args.zones registry zone rows
 * @param {Object} args.summaries zoneId -> live summary
 * @param {string} args.projectId
 * @returns {Promise<jsPDF>}
 */
export async function buildReport({
  wellName, wellData, params, zones, summaries, projectId,
}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const logo = await loadPetrolordLogo();
  let y = drawBrandHeader(doc, {
    logo,
    margin,
    pageWidth,
    appTitle: 'Petrophysics Studio',
    subtitle: 'Interpretation summary report',
    rightLines: [wellName],
  }) + 10;

  const depth = wellData.curves.DEPT;
  const mapped = wellData.inventory.filter((e) => e.log).map((e) => e.key);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Well: ${wellName}`, margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 70, 90);
  doc.text(
    `Interval ${num(depth[0], 1)} to ${num(depth[depth.length - 1], 1)} m MD · ${depth.length} samples · inputs: ${mapped.join(', ')}`,
    margin, y,
  );
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Parameters', margin, y);
  y += 3;
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Parameter', 'Value', 'Parameter', 'Value']],
    body: Array.from({ length: Math.ceil(PARAM_ROWS.length / 2) }, (_, r) => {
      const a = PARAM_ROWS[2 * r];
      const b = PARAM_ROWS[2 * r + 1];
      const cell = (row) => (row ? [row[0], String(params[row[1]] ?? '—')] : ['', '']);
      return [...cell(a), ...cell(b)];
    }),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 23, 42] },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Methods', margin, y);
  y += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 70, 90);
  for (const line of methodLines(params)) {
    const wrapped = doc.splitTextToSize(`• ${line}`, pageWidth - 2 * margin);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4 + 1;
  }
  y += 4;

  const zoneRows = zones.filter((z) => summaries[z.id]);
  if (zoneRows.length) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Zone summaries', margin, y);
    y += 3;
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Zone', 'Top (m)', 'Base (m)', 'Gross (m)', 'Net (m)', 'N/G', 'phi avg', 'Vsh avg', 'Sw avg']],
      body: zoneRows.map((z) => {
        const s = summaries[z.id];
        return [
          z.name, num(z.top_md_m, 1), num(z.base_md_m, 1),
          num(s.gross_m, 2), num(s.net_m, 2), num(s.ntg),
          num(s.phi_avg), num(s.vsh_avg), num(s.sw_avg),
        ];
      }),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 23, 42] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Provenance', margin, y);
  y += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 70, 90);
  for (const line of [
    'Engine: petrophysics-studio (validated against an independent literature oracle at 1e-12).',
    `Pipeline version: ${PIPELINE_VERSION} · Project: ${projectId || '—'}`,
    `Generated: ${new Date().toISOString()}`,
  ]) {
    doc.text(line, margin, y);
    y += 4.5;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
  return doc;
}
