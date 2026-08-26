// Mud-window CSV + MEM report PDF (jsPDF NAMED import — WD6 gotcha).

import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { emwOut, emwLabel, depthOut, depthLabel } from './gmRun';

export function windowCsv(win, depthUnit) {
  const rows = win.rows.map((r) => ({
    [`MD (${depthLabel(depthUnit)})`]: depthOut(r.md, depthUnit).toFixed(0),
    [`TVD (${depthLabel(depthUnit)})`]: depthOut(r.tvd, depthUnit).toFixed(0),
    'Inc (deg)': r.incDeg.toFixed(1),
    [`PP (${emwLabel(depthUnit)})`]: emwOut(r.ppEmwKgM3, depthUnit).toFixed(3),
    [`Collapse (${emwLabel(depthUnit)})`]: emwOut(r.collapseEmwKgM3, depthUnit).toFixed(3),
    [`Frac init (${emwLabel(depthUnit)})`]: emwOut(r.fracInitEmwKgM3, depthUnit).toFixed(3),
  }));
  return Papa.unparse(rows);
}

export function exportWindowCsv(win, depthUnit, baseName = 'mud-window') {
  const blob = new Blob([windowCsv(win, depthUnit)], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${baseName}.csv`);
}

export function buildMemReportPdf({ mem, win, caseRow, wellboreName, depthUnit }) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Geomechanics & Wellbore Stability Studio', 14, 16);
  doc.setFontSize(10);
  doc.text(`${wellboreName || ''}  /  ${caseRow.name || ''}`, 14, 23);
  autoTable(doc, {
    startY: 28,
    head: [['Model', 'Value']],
    body: [
      ['PP / Sv source', mem.baseProvenance],
      ['UCS', mem.ucsProvenance],
      ['Regime', caseRow.params?.regime ?? 'NF'],
      ['SHmax azimuth', `${caseRow.params?.shmaxAzimuthDeg ?? 0} deg`],
      ['Poisson / Biot / friction', `${caseRow.params?.nu ?? 0.25} / ${caseRow.params?.alphaBiot ?? 1} / ${caseRow.params?.frictionAngleDeg ?? 30} deg`],
      ['Quality score', String(mem.quality.score)],
      ['Frictional clamps', String(mem.clampedCount)],
    ],
    styles: { fontSize: 8 },
  });
  if (win) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [[`MD (${depthLabel(depthUnit)})`, 'Inc (deg)', `PP (${emwLabel(depthUnit)})`, `Collapse (${emwLabel(depthUnit)})`, `Frac init (${emwLabel(depthUnit)})`]],
      body: win.rows.filter((_, i) => i % 4 === 0).map((r) => [
        depthOut(r.md, depthUnit).toFixed(0),
        r.incDeg.toFixed(0),
        emwOut(r.ppEmwKgM3, depthUnit).toFixed(2),
        emwOut(r.collapseEmwKgM3, depthUnit).toFixed(2),
        emwOut(r.fracInitEmwKgM3, depthUnit).toFixed(2),
      ]),
      styles: { fontSize: 8 },
    });
    const warnings = [...mem.warnings, ...win.warnings];
    if (warnings.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [['Warnings']],
        body: warnings.map((w) => [w]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [185, 28, 28] },
      });
    }
  }
  doc.setFontSize(7);
  doc.text('1D MEM planning model (zero-breakout-width Mohr-Coulomb, isothermal). Calibrate to offset data before operational use.', 14, doc.lastAutoTable.finalY + 8);
  return doc;
}

export function exportMemReportPdf(args, baseName = 'geomechanics-report') {
  buildMemReportPdf(args).save(`${baseName}.pdf`);
}
