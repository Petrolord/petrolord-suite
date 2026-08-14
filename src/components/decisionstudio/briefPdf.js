// One-page decision brief PDF (D5). Renders the briefModel.js output with
// the shared Petrolord banner (src/lib/pdfBrand.js). Layout only; every
// number and provenance line comes from the model.

import jsPDF from 'jspdf';
import { drawBrandHeader, loadPetrolordLogo, fitText } from '@/lib/pdfBrand';

const MARGIN = 14;

export async function generateBriefPdf(model) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const logo = await loadPetrolordLogo();

  let y = drawBrandHeader(doc, {
    logo,
    margin: MARGIN,
    pageWidth,
    appTitle: 'Decision Studio',
    subtitle: 'Decision brief',
    rightLines: model.preparedBy ? [`Prepared by: ${model.preparedBy}`] : [],
  }) + 12;

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(fitText(doc, model.title, pageWidth - 2 * MARGIN), MARGIN, y);
  y += 8;

  // Recommendation box
  if (model.recommendation) {
    doc.setFillColor(236, 253, 245); // emerald 50
    doc.setDrawColor(5, 150, 105);   // emerald 600
    const recLines = doc.splitTextToSize(model.recommendation, pageWidth - 2 * MARGIN - 8);
    const boxH = 10 + recLines.length * 5;
    doc.roundedRect(MARGIN, y - 4, pageWidth - 2 * MARGIN, boxH, 1.5, 1.5, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(4, 120, 87);
    doc.text('RECOMMENDATION', MARGIN + 4, y + 1);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(recLines, MARGIN + 4, y + 7);
    y += boxH + 4;
  }

  // Sections
  for (const section of model.sections) {
    if (y > pageHeight - 50) break; // one-page brief by design

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(section.heading, MARGIN, y);
    doc.setDrawColor(203, 213, 225);
    doc.line(MARGIN, y + 1.5, pageWidth - MARGIN, y + 1.5);
    y += 7;

    // Two-column metric rows
    doc.setFontSize(9.5);
    const colW = (pageWidth - 2 * MARGIN) / 2;
    section.rows.forEach((row, i) => {
      const col = i % 2;
      const x = MARGIN + col * colW;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(fitText(doc, row[0], colW * 0.62), x, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(String(row[1]), x + colW - 6, y, { align: 'right' });
      if (col === 1 || i === section.rows.length - 1) y += 5.5;
    });

    if (section.note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      const noteLines = doc.splitTextToSize(section.note, pageWidth - 2 * MARGIN);
      doc.text(noteLines, MARGIN, y + 1);
      y += noteLines.length * 4 + 2;
    }

    // Provenance line
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const provLines = doc.splitTextToSize(section.provenance, pageWidth - 2 * MARGIN);
    doc.text(provLines, MARGIN, y + 1);
    y += provLines.length * 3.6 + 8;
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  const footerLines = doc.splitTextToSize(
    `${model.footer} Generated ${new Date(model.generatedAt).toLocaleString()}.`,
    pageWidth - 2 * MARGIN,
  );
  doc.text(footerLines, MARGIN, pageHeight - 10 - (footerLines.length - 1) * 3.6);

  return doc;
}

export async function downloadBriefPdf(model) {
  const doc = await generateBriefPdf(model);
  const name = model.title.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  doc.save(`${name || 'decision-brief'}.pdf`);
}
