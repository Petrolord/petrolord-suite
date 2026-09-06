// Report rendering (WS7, WS8): a report model to a PDF (jsPDF with the
// Suite brand header) and to a DOCX (the browser OOXML writer). The
// build and export halves are split so a document is testable without a
// DOM save. Depths render in the display unit; the model stays metres.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawBrandHeader, loadPetrolordLogo } from '@/lib/pdfBrand';
import { buildDocxBlob, docxFileName } from '@/utils/reportAutopilotDocx';
import { fmtDepth } from './units';
import { toRigLocal } from '@/lib/wellsite/time';
import { reportTitle, periodText } from './reportText';

const cellText = (c, unit) => {
  if (c == null) return '';
  if (typeof c === 'object' && 'value_m' in c) return Number.isFinite(c.value_m) ? fmtDepth(c.value_m, unit) : '';
  return String(c);
};
const kvText = (r, unit) => (r.text != null ? r.text : Number.isFinite(r.value_m) ? `${fmtDepth(r.value_m, unit)}${Number.isFinite(r.tvd_m) ? ` (TVD ${fmtDepth(r.tvd_m, unit)})` : ''}` : '');

export { reportTitle, periodText };

/** The PDF document for a model. signoffs: [{user_name, role, signed_at, local_offset_min, content_hash, countersignature}] */
export async function buildReportPdf(model, { unit = 'ft', offsetMin = 0, signoffs = [], logo: logoIn } = {}) {
  const doc = new jsPDF();
  const logo = logoIn === undefined ? await loadPetrolordLogo().catch(() => null) : logoIn;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = drawBrandHeader(doc, { logo, margin, pageWidth, appTitle: 'Wellsite Studio', subtitle: reportTitle(model), rightLines: [model.well.field ? `${model.well.field}${model.well.rig ? `, ${model.well.rig}` : ''}` : '', periodText(model, offsetMin)] }) + 8;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${toRigLocal(Date.parse(model.generated_at), offsetMin).iso.replace('T', ' ')} rig time from the well record. Template ${model.template.name} v${model.template.version}. Depths in ${unit}.`, margin, y);
  y += 6;
  const ensure = (h) => { if (y + h > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); y = 14; } };
  for (const s of model.sections) {
    ensure(12);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text(s.title, margin, y); y += 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (s.kind === 'kv') {
      autoTable(doc, { startY: y + 2, margin: { left: margin, right: margin }, styles: { fontSize: 8, cellPadding: 1.2 }, theme: 'plain', body: s.rows.map((r) => [r.label, kvText(r, unit)]), columnStyles: { 0: { cellWidth: 55, textColor: [100, 116, 139] } } });
      y = doc.lastAutoTable.finalY + 4;
    } else if (s.kind === 'table') {
      if (s.summary) {
        const sums = Array.isArray(s.summary) ? s.summary : [s.summary];
        doc.setTextColor(71, 85, 105);
        doc.text(sums.map((x) => `${x.label}: ${x.text}`).join('; '), margin, y + 4); y += 6;
      }
      if (s.rows.length) {
        autoTable(doc, { startY: y + 2, margin: { left: margin, right: margin }, styles: { fontSize: 7.5, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] }, head: [s.columns], body: s.rows.map((r) => r.cells.map((c) => cellText(c, unit))) });
        y = doc.lastAutoTable.finalY + 4;
      } else { doc.setTextColor(148, 163, 184); doc.text('None in the period.', margin, y + 4); y += 8; }
    } else if (s.kind === 'list') {
      for (const r of s.rows) { ensure(6); doc.setTextColor(30, 41, 59); doc.text(`- ${r.text}`, margin, y + 4); y += 5; }
      if (!s.rows.length) { doc.setTextColor(148, 163, 184); doc.text('None.', margin, y + 4); y += 8; }
      y += 2;
    } else if (s.kind === 'narrative') {
      const lines = doc.splitTextToSize(s.text || 'Not written.', pageWidth - 2 * margin);
      ensure(lines.length * 4.5 + 4);
      doc.setTextColor(s.text ? 30 : 148, s.text ? 41 : 163, s.text ? 59 : 184);
      doc.text(lines, margin, y + 4); y += lines.length * 4.5 + 5;
    }
  }
  ensure(30);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Sign-off', margin, y + 4); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  if (!signoffs.length) { doc.setTextColor(148, 163, 184); doc.text('Not signed.', margin, y + 4); y += 6; }
  for (const so of signoffs) {
    ensure(14);
    doc.setTextColor(30, 41, 59);
    doc.text(`Signed by ${so.user_name || so.user_id} (${String(so.role).replace(/_/g, ' ')}) at ${toRigLocal(Date.parse(so.signed_at), so.local_offset_min ?? offsetMin).iso.replace('T', ' ')} rig time (${so.signed_at} UTC), report version ${so.report_version}.`, margin, y + 4);
    doc.text(`Content hash ${so.content_hash}. ${so.countersignature ? `Countersigned by Petrolord (key ${so.countersignature.key_id}) at ${so.countersigned_at}, certificate ${so.countersignature.certificate_no || ''}.` : 'Platform countersignature pending until synchronised.'}`, margin, y + 8);
    y += 12;
  }
  return doc;
}

export async function exportReportPdf(model, opts) {
  const doc = await buildReportPdf(model, opts);
  doc.save(`${reportTitle(model).replace(/[^\w]+/g, '-').toLowerCase()}-${model.period.start.slice(0, 10)}.pdf`);
}

/** The DOCX report (sections as headings and paragraphs). */
export function docxReport(model, { unit = 'ft', offsetMin = 0, signoffs = [] } = {}) {
  const sections = model.sections.map((s) => {
    let content = '';
    if (s.kind === 'kv') content = s.rows.map((r) => `${r.label}: ${kvText(r, unit)}`).join('\n');
    else if (s.kind === 'table') content = [s.summary ? (Array.isArray(s.summary) ? s.summary : [s.summary]).map((x) => `${x.label}: ${x.text}`).join('; ') : '', s.rows.length ? s.rows.map((r) => r.cells.map((c) => cellText(c, unit)).join(' | ')).join('\n') : 'None in the period.'].filter(Boolean).join('\n');
    else if (s.kind === 'list') content = s.rows.length ? s.rows.map((r) => `- ${r.text}`).join('\n') : 'None.';
    else if (s.kind === 'narrative') content = s.text || 'Not written.';
    return { title: s.title, content };
  });
  sections.push({ title: 'Sign-off', content: signoffs.length ? signoffs.map((so) => `Signed by ${so.user_name || so.user_id} (${String(so.role).replace(/_/g, ' ')}) at ${so.signed_at} UTC, report version ${so.report_version}, content hash ${so.content_hash}. ${so.countersignature ? `Countersigned by Petrolord (key ${so.countersignature.key_id}).` : 'Platform countersignature pending until synchronised.'}`).join('\n') : 'Not signed.' });
  return { title: reportTitle(model), meta: [periodText(model, offsetMin), `Generated from the well record; template ${model.template.name} v${model.template.version}; depths in ${unit}.`], sections, footNote: 'Petrolord Suite, Wellsite Studio. Every value above traces to a record on the well.' };
}

export async function exportReportDocx(model, opts) {
  const report = docxReport(model, opts);
  const blob = await buildDocxBlob(report);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = docxFileName(report.title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
