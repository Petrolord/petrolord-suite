// Cement job report PDF + placement CSV (jsPDF NAMED import — WD6 gotcha).

import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  pressureOut, pressureLabel, volumeOut, volumeLabel, emwOut, emwLabel,
  depthOut, depthLabel,
} from './cmtRun';

export function placementCsv(placement, depthUnit) {
  const rows = placement.series.map((r) => ({
    [`Pumped (${volumeLabel(depthUnit)})`]: volumeOut(r.pumpedM3, depthUnit).toFixed(2),
    [`Pump pressure (${pressureLabel(depthUnit)})`]: pressureOut(r.pumpPressurePa, depthUnit).toFixed(0),
    [`ECD prev shoe (${emwLabel(depthUnit)})`]: r.ecdPrevShoeKgM3 != null ? emwOut(r.ecdPrevShoeKgM3, depthUnit).toFixed(3) : '',
    'Free fall': r.freeFall ? 'yes' : '',
  }));
  return Papa.unparse(rows);
}

export function exportPlacementCsv(placement, depthUnit, baseName = 'cement-placement') {
  const blob = new Blob([placementCsv(placement, depthUnit)], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${baseName}.csv`);
}

export function buildJobReportPdf({
  vols, placement, checklist, standoff, caseRow, wellboreName, depthUnit,
}) {
  const doc = new jsPDF();
  const P = (pa) => `${pressureOut(pa, depthUnit).toFixed(0)} ${pressureLabel(depthUnit)}`;
  const V = (m3) => `${volumeOut(m3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`;
  const E = (kgm3) => `${emwOut(kgm3, depthUnit).toFixed(2)} ${emwLabel(depthUnit)}`;
  const D = (m) => `${depthOut(m, depthUnit).toFixed(0)} ${depthLabel(depthUnit)}`;

  doc.setFontSize(14);
  doc.text('Cement Job Report - Cementing Studio', 14, 16);
  doc.setFontSize(10);
  doc.text(`${wellboreName || ''}  /  ${caseRow.name || ''}`, 14, 23);

  autoTable(doc, {
    startY: 28,
    head: [['Job design', 'Value']],
    body: [
      ['Casing', caseRow.casing?.label || `${((caseRow.casing?.odM || 0) / 0.0254).toFixed(3)} in`],
      ['Shoe MD', D(caseRow.casing?.shoeMd || 0)],
      ['Float collar MD', D(caseRow.casing?.floatCollarMd || 0)],
      ['Target TOC', D(caseRow.job?.tocMd || 0)],
      ['Open-hole excess', `${caseRow.job?.excessOpenHolePct ?? 0} %`],
      ['Slurry (lead / tail)', `${V(vols.leadM3)} / ${V(vols.tailM3)}`],
      ['Sacks', vols.sacks != null ? vols.sacks.toFixed(0) : 'n/a'],
      ['Displacement', V(vols.displacementM3)],
      ['Job time at rate', vols.jobTimeS != null ? `${(vols.jobTimeS / 60).toFixed(0)} min` : 'n/a'],
    ],
    styles: { fontSize: 8 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Pumped fluid', `Density (${emwLabel(depthUnit)})`, `Volume (${volumeLabel(depthUnit)})`]],
    body: (caseRow.fluids?.program || []).map((f) => [
      f.kind, emwOut(f.densityKgM3, depthUnit).toFixed(2),
      f.volumeM3 != null ? volumeOut(f.volumeM3, depthUnit).toFixed(1) : 'auto',
    ]),
    styles: { fontSize: 8 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Placement result', 'Value']],
    body: [
      ['End pump pressure', P(placement.endPumpPressurePa)],
      ['Max ECD at previous shoe', placement.maxEcdPrevShoeKgM3 != null ? E(placement.maxEcdPrevShoeKgM3) : 'n/a'],
      ['Achieved TOC', placement.achievedTocMd != null ? D(placement.achievedTocMd) : 'n/a'],
      ['Float differential', P(placement.floatDiffPa)],
      ['Free fall during job', placement.freeFall ? 'yes' : 'no'],
      ...(standoff ? [['Min standoff', `${(100 * standoff.profile.minStandoff).toFixed(0)} %`]] : []),
    ],
    styles: { fontSize: 8 },
  });

  if (checklist) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Check', 'Result']],
      body: checklist.items.map((i) => [i.detail, i.ok ? 'PASS' : 'REVIEW']),
      styles: { fontSize: 8 },
    });
  }
  if (placement.warnings.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Warnings']],
      body: placement.warnings.map((w) => [w]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [185, 28, 28] },
    });
  }
  doc.setFontSize(7);
  doc.text('Plug-flow planning model (no intermixing; free-fall rate not modeled). Verify with the service company job design.', 14, doc.lastAutoTable.finalY + 8);
  return doc;
}

export function exportJobReportPdf(args, baseName = 'cement-job-report') {
  buildJobReportPdf(args).save(`${baseName}.pdf`);
}
