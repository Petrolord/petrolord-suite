// Kill sheet PDF + CSV export (jsPDF NAMED import — the WD6 gotcha).

import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  pressureOut, pressureLabel, volumeOut, volumeLabel, emwOut, emwLabel,
  depthOut, depthLabel,
} from './wcRun';

export function scheduleCsv(killSheet, depthUnit) {
  const rows = killSheet.schedule.map((r) => ({
    Strokes: r.strokes.toFixed(0),
    [`Standpipe (${pressureLabel(depthUnit)})`]: pressureOut(r.pressurePa, depthUnit).toFixed(0),
  }));
  return Papa.unparse(rows);
}

export function exportScheduleCsv(killSheet, depthUnit, baseName = 'kill-schedule') {
  const blob = new Blob([scheduleCsv(killSheet, depthUnit)], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${baseName}.csv`);
}

export function buildKillSheetPdf({
  ks, kt, caseRow, wellboreName, volumes, depthUnit, method,
}) {
  const doc = new jsPDF();
  const P = (pa) => `${pressureOut(pa, depthUnit).toFixed(0)} ${pressureLabel(depthUnit)}`;
  const V = (m3) => `${volumeOut(m3, depthUnit).toFixed(1)} ${volumeLabel(depthUnit)}`;
  const E = (kgm3) => `${emwOut(kgm3, depthUnit).toFixed(2)} ${emwLabel(depthUnit)}`;
  const D = (m) => `${depthOut(m, depthUnit).toFixed(0)} ${depthLabel(depthUnit)}`;

  doc.setFontSize(14);
  doc.text('Kill Sheet - Well Control Studio', 14, 16);
  doc.setFontSize(10);
  doc.text(`${wellboreName || ''}  /  ${caseRow.name || ''}  /  ${method === 'drillers' ? "Driller's method" : 'Wait and weight'}`, 14, 23);

  autoTable(doc, {
    startY: 28,
    head: [['Pre-recorded data', 'Value']],
    body: [
      ['Hole TVD', D(volumes.tvdBhM)],
      ['Shoe TVD', D(volumes.tvdShoeM)],
      ['Original mud density', E(caseRow.mud.densityKgM3)],
      ['Shoe fracture EMW (LOT)', caseRow.shoe?.fracEmwKgM3 ? E(caseRow.shoe.fracEmwKgM3) : 'not set'],
      ['Drillstring volume', V(volumes.stringVolumeM3)],
      ['Annulus volume', V(volumes.annulusVolumeM3)],
      ['Pump output per stroke', `${(caseRow.pump.outputM3PerStroke * 1000).toFixed(2)} L/stk`],
      ['SCR pressure', P(caseRow.pump.scr?.[caseRow.pump.scrIndex ?? 0]?.pressurePa ?? 0)],
    ],
    styles: { fontSize: 8 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Shut-in / calculated', 'Value']],
    body: [
      ['SIDPP', P(caseRow.kick.sidppPa ?? 0)],
      ['SICP', caseRow.kick.sicpPa != null ? P(caseRow.kick.sicpPa) : 'not recorded'],
      ['Pit gain', V(caseRow.kick.pitGainM3 ?? 0)],
      ['Formation pressure', P(ks.formationPressurePa)],
      ['Kill mud density', E(ks.killMudDensityKgM3)],
      ['ICP', P(ks.icpPa)],
      ['FCP', P(ks.fcpPa)],
      ['Strokes to bit', ks.strokesToBit.toFixed(0)],
      ['Bottoms up strokes', ks.bottomsUpStrokes.toFixed(0)],
      ['Total strokes (this method)', (method === 'drillers' ? ks.methods.drillers.totalStrokes : ks.methods.waitAndWeight.totalStrokes).toFixed(0)],
      ...(ks.influx ? [['Influx (informational)', `${ks.influx.kind}, ${E(ks.influx.densityKgM3)}, ${ks.influx.heightM.toFixed(0)} m column`]] : []),
      ...(kt ? [['MAASP', P(kt.maaspPa)], ['Kick tolerance', V(kt.kickToleranceM3)]] : []),
    ],
    styles: { fontSize: 8 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Strokes', `Standpipe (${pressureLabel(depthUnit)})`]],
    body: ks.schedule.map((r) => [r.strokes.toFixed(0), pressureOut(r.pressurePa, depthUnit).toFixed(0)]),
    styles: { fontSize: 8 },
  });

  if (ks.warnings.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Warnings']],
      body: ks.warnings.map((w) => [w]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [185, 28, 28] },
    });
  }
  doc.setFontSize(7);
  doc.text('Planning tool (surface BOP, single-bubble assumptions). Not a substitute for the rig kill sheet or well control certification.', 14, doc.lastAutoTable.finalY + 8);
  return doc;
}

export function exportKillSheetPdf(args, baseName = 'kill-sheet') {
  buildKillSheetPdf(args).save(`${baseName}.pdf`);
}
