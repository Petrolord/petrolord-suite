// CSV / PDF export for hydraulics runs (tdExport pattern; jsPDF NAMED
// import — the default is not a constructor under node ESM).

import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  pressureOut, pressureLabel, emwOut, emwLabel, depthOut, depthLabel,
  flowOut, flowLabel,
} from './hydRun';

export function runCsv(hyd, depthUnit) {
  const rows = hyd.elements.map((el) => ({
    Path: el.path,
    [`From (${depthLabel(depthUnit)})`]: depthOut(el.fromMd, depthUnit).toFixed(1),
    [`To (${depthLabel(depthUnit)})`]: depthOut(el.toMd, depthUnit).toFixed(1),
    'Velocity (m/s)': el.velocityMs.toFixed(3),
    Regime: el.regime,
    [`dP (${pressureLabel(depthUnit)})`]: pressureOut(el.dpPa, depthUnit).toFixed(2),
  }));
  return Papa.unparse(rows);
}

export function exportRunCsv(hyd, depthUnit, baseName = 'hydraulics') {
  const blob = new Blob([runCsv(hyd, depthUnit)], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${baseName}.csv`);
}

export function buildRunPdf({ hyd, surge, cleaning, caseName, wellboreName, flowRateM3s, depthUnit }) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Drilling Fluids & Hydraulics Studio', 14, 16);
  doc.setFontSize(10);
  doc.text(`${wellboreName || ''}  /  ${caseName || ''}  at ${flowOut(flowRateM3s, depthUnit).toFixed(0)} ${flowLabel(depthUnit)}`, 14, 23);
  autoTable(doc, {
    startY: 28,
    head: [['Quantity', 'Value']],
    body: [
      [`Pump pressure (${pressureLabel(depthUnit)})`, pressureOut(hyd.summary.pumpPressurePa, depthUnit).toFixed(0)],
      [`Bit pressure drop (${pressureLabel(depthUnit)})`, pressureOut(hyd.summary.bitDpPa, depthUnit).toFixed(0)],
      [`ECD at TD (${emwLabel(depthUnit)})`, emwOut(hyd.summary.ecdAtTdKgM3, depthUnit).toFixed(3)],
      ['Min annular velocity (m/s)', hyd.summary.minAnnularVelocityMs.toFixed(2)],
      ...(hyd.bit ? [
        ['Jet velocity (m/s)', hyd.bit.jetVelocityMs.toFixed(1)],
        ['Bit hydraulic power (kW)', (hyd.bit.hydraulicPowerW / 1000).toFixed(1)],
        ['Impact force (kN)', (hyd.bit.impactForceN / 1000).toFixed(2)],
      ] : []),
    ],
    styles: { fontSize: 8 },
  });
  if (surge) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Trip speed (m/s)', `Surge (${emwLabel(depthUnit)})`, `Swab (${emwLabel(depthUnit)})`]],
      body: surge.sweep.map((r) => [
        r.tripSpeedMs.toFixed(2),
        emwOut(r.surgeEmwKgM3, depthUnit).toFixed(3),
        emwOut(r.swabEmwKgM3, depthUnit).toFixed(3),
      ]),
      styles: { fontSize: 8 },
    });
  }
  if (cleaning) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Hole cleaning', 'Value']],
      body: [
        ['Min transport ratio', cleaning.summary.minTransportRatio.toFixed(3)],
        ['Max cuttings concentration (%)', cleaning.summary.maxCuttingsConcPct.toFixed(2)],
        ...cleaning.summary.warnings.map((w) => ['Warning', w]),
      ],
      styles: { fontSize: 8 },
    });
  }
  const warnings = hyd.summary.warnings;
  if (warnings.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Warnings']],
      body: warnings.map((w) => [w]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [185, 28, 28] },
    });
  }
  return doc;
}

export function exportRunPdf(args, baseName = 'hydraulics') {
  buildRunPdf(args).save(`${baseName}.pdf`);
}
