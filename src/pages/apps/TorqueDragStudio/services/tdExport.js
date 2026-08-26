// CSV / PDF export for T&D runs (the legacy torqueDragExport pattern,
// rebuilt on the real engine outputs). jsPDF is a NAMED import — the default
// is not a constructor under node ESM (the WD6 report-pack gotcha).

import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { forceOut, torqueOut, depthOut, forceLabel, torqueLabel, depthLabel } from './tdRun';

const OP_LABELS = {
  trip_out: 'Trip out', trip_in: 'Trip in', rotate_off_bottom: 'Rotate off bottom',
  rotate_on_bottom: 'Rotate on bottom', slide_drill: 'Slide drill', backream: 'Backream',
};

export function runCsv(results, depthUnit) {
  const rows = [];
  for (const [op, res] of Object.entries(results)) {
    for (const r of res.profile) {
      rows.push({
        Operation: OP_LABELS[op] || op,
        [`MD (${depthLabel(depthUnit)})`]: depthOut(r.md, depthUnit).toFixed(1),
        [`Tension (${forceLabel(depthUnit)})`]: forceOut(r.tensionN, depthUnit).toFixed(2),
        [`Torque (${torqueLabel(depthUnit)})`]: torqueOut(r.torqueNm, depthUnit).toFixed(2),
        'Side force (kN/m)': (r.sideForceNPerM / 1e3).toFixed(4),
        Buckling: r.buckling,
      });
    }
  }
  return Papa.unparse(rows);
}

export function exportRunCsv(results, depthUnit, baseName = 'torque-drag') {
  const blob = new Blob([runCsv(results, depthUnit)], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${baseName}.csv`);
}

export function buildRunPdf({ results, wear, caseName, wellboreName, depthUnit }) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Torque & Drag Studio', 14, 16);
  doc.setFontSize(10);
  doc.text(`${wellboreName || ''}  /  ${caseName || ''}`, 14, 23);
  const summaryRows = Object.entries(results).map(([op, res]) => ([
    OP_LABELS[op] || op,
    forceOut(res.summary.hookloadN, depthUnit).toFixed(1),
    torqueOut(res.summary.surfaceTorqueNm, depthUnit).toFixed(2),
    forceOut(res.summary.maxTensionN, depthUnit).toFixed(1),
    forceOut(res.summary.minTensionN, depthUnit).toFixed(1),
    res.summary.bucklingFirstMd != null
      ? depthOut(res.summary.bucklingFirstMd, depthUnit).toFixed(0)
      : 'none',
  ]));
  autoTable(doc, {
    startY: 28,
    head: [[
      'Operation', `Hookload (${forceLabel(depthUnit)})`, `Torque (${torqueLabel(depthUnit)})`,
      `Max T (${forceLabel(depthUnit)})`, `Min T (${forceLabel(depthUnit)})`,
      `Buckling from (${depthLabel(depthUnit)})`,
    ]],
    body: summaryRows,
    styles: { fontSize: 8 },
  });
  const warnings = Object.values(results).flatMap((r) => r.summary.warnings.map((w) => [r.operation, w]));
  if (warnings.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Operation', 'Warning']],
      body: warnings,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [185, 28, 28] },
    });
  }
  if (wear) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Casing wear', 'Value']],
      body: [
        ['Max wear depth (mm)', (wear.summary.maxWearDepthM * 1000).toFixed(2)],
        ['Max wall loss (%)', wear.summary.maxWallLossPct.toFixed(1)],
        ['Min remaining wall (mm)', (wear.summary.minRemainingWallM * 1000).toFixed(2)],
        ['Worst interval (m MD)', `${wear.summary.worstFromMd.toFixed(0)} - ${wear.summary.worstToMd.toFixed(0)}`],
        ['Collapse note', wear.summary.collapseNote],
      ],
      styles: { fontSize: 8 },
    });
  }
  return doc;
}

export function exportRunPdf(args, baseName = 'torque-drag') {
  buildRunPdf(args).save(`${baseName}.pdf`);
}
