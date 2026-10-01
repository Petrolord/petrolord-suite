// One-page prospect summary PDF (ReservoirCalc Pro upgrade U2-011): the
// sheet a committee signs. Reviewer header (field, analyst, date, build,
// units, method), the chance factors and Pg, the success-case volumes
// (P90, P50, P10 and mean, exceedance, unrisked) beside the risked mean,
// and the basis and unit of every number. PRMS: the risked outcome is zero
// with probability 1 - Pg, so no risked percentiles are quoted. Latin-1
// text only (jsPDF standard fonts).

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { RISK_FACTORS, chanceOfSuccess, riskProspect } from './ProspectRiskEngine';
import { VOLUME_UNITS } from './prospectVolumes';
import { latin1 } from './reportInfo';

const fmt = (v, d = 2) => (Number.isFinite(v) ? Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : EMPTY_VALUE);
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : EMPTY_VALUE);

/**
 * The rows the page prints (pure; the tests read them too).
 * @param {{name, factors, unrisked: {mean,p90,p50,p10}, unit, basis}} p
 */
export function prospectSummaryRows(p) {
  const r = riskProspect({ name: p.name, factors: p.factors, unrisked: p.unrisked });
  const u = VOLUME_UNITS[p.unit]?.label || p.unit || 'unit not stated';
  const factorRows = RISK_FACTORS.map((k) => [k[0].toUpperCase() + k.slice(1), pct(Number(p.factors?.[k] ?? 1))]);
  if (p.factors?.other !== undefined && p.factors?.other !== null) factorRows.push(['Other', pct(Number(p.factors.other))]);
  factorRows.push(['Pg (product)', pct(chanceOfSuccess(p.factors))]);
  const volRows = [
    ['P90 (low)', fmt(r.successCase.p90), EMPTY_VALUE],
    ['P50 (best)', fmt(r.successCase.p50), EMPTY_VALUE],
    ['P10 (high)', fmt(r.successCase.p10), EMPTY_VALUE],
    ['Mean', fmt(r.successCase.mean), fmt(r.riskedMean)],
  ];
  return { risked: r, unitLabel: u, factorRows, volRows };
}

/**
 * Build the one-page PDF.
 * @param {{name, factors, unrisked, unit, basis, reviewer?: string[], context?: string[], projectName?: string}} p
 * @returns {Promise<jsPDF>}
 */
export async function buildProspectSummaryPdf(p) {
  const { risked, unitLabel, factorRows, volRows } = prospectSummaryRows(p);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  const logo = await loadPetrolordLogo();
  drawBrandHeader(doc, {
    logo, margin, pageWidth, appTitle: 'ReservoirCalc Pro', subtitle: 'Prospect summary',
    rightLines: [latin1(`Prospect: ${p.name || 'unnamed'}`), p.projectName ? latin1(`Project: ${p.projectName}`) : null].filter(Boolean),
  });
  let y = 38;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(latin1(`Prospect summary: ${p.name || 'unnamed'}`), margin, y);
  y += 6;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
  for (const line of (p.reviewer || [])) {
    const wrapped = doc.splitTextToSize(latin1(line), pageWidth - 2 * margin);
    doc.text(wrapped, margin, y);
    y += 3.6 * wrapped.length;
  }
  y += 3;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text('Geological chance of success', margin, y);
  doc.autoTable({
    startY: y + 2, margin: { left: margin }, tableWidth: 80, theme: 'grid',
    head: [['Factor', 'Chance']], body: factorRows,
    styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [30, 41, 59] },
  });
  const afterFactors = doc.lastAutoTable.finalY;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(latin1(`Volumes (${p.basis === 'in-place' ? 'in place' : 'recoverable, prospective resources'}), ${unitLabel}`), margin + 88, y);
  doc.autoTable({
    startY: y + 2, margin: { left: margin + 88 }, tableWidth: pageWidth - 2 * margin - 88, theme: 'grid',
    head: [['', 'Unrisked', `Risked x ${pct(risked.pg)}`]], body: volRows,
    styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [30, 41, 59] },
  });
  y = Math.max(afterFactors, doc.lastAutoTable.finalY) + 7;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
  const notes = [
    `Chance of failure (dry hole): ${pct(risked.pFailure)}. The risked outcome is zero with that probability, so risked percentiles are not quoted; the risked mean (Pg x success-case mean) is the expected value basis.`,
    'Unrisked volumes are the success case (given a discovery). P90, P50 and P10 are exceedance percentiles of those outcomes (PRMS): the P90 is exceeded with 90 percent probability.',
    p.basis === 'in-place'
      ? 'These are in-place volumes. A valuation needs recoverable volumes: re-run the Monte Carlo (it reports recoverable volumes) or enter recoverable ones.'
      : 'Recoverable volumes as handed to Risked Reserves Valuation.',
    ...(p.context || []),
  ];
  for (const n of notes) {
    const wrapped = doc.splitTextToSize(latin1(n), pageWidth - 2 * margin);
    if (y + 4 * wrapped.length > pageHeight - 18) break;
    doc.text(wrapped, margin, y);
    y += 3.8 * wrapped.length + 1;
  }
  // signature block
  y = Math.min(Math.max(y + 6, 230), pageHeight - 32);
  doc.setDrawColor(148, 163, 184);
  doc.setTextColor(30, 41, 59);
  for (const [i, label] of ['Prepared by', 'Reviewed by', 'Approved by'].entries()) {
    const x = margin + i * ((pageWidth - 2 * margin) / 3);
    doc.line(x, y + 10, x + 50, y + 10);
    doc.text(label, x, y + 14);
  }
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text('Petrolord Suite | ReservoirCalc Pro | Prospect summary', pageWidth - margin, pageHeight - 8, { align: 'right' });
  return doc;
}
