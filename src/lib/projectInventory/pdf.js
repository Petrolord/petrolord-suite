// Project Data Inventory as a PDF: A4 landscape, drawn as vectors in jsPDF
// (the Suite's PDF stack) so the matrix stays sharp at any zoom. Page 1 is
// the board (score, tiles, readiness, matrix, legend); then seismic and
// interpretation; then the notes in full. Report Kit colours and its
// Latin-1 text filter; the Petrolord mark on every page.
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { textFilter } from '@/lib/reportKit/text.js';
import { NAVY, SLATE } from '@/lib/reportKit/theme.js';
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { STATUS } from './status';
import { LEVEL } from './readiness';
import { SEVERITY_LABEL } from './rules';
import { fmtDepth } from './coverage';
import { fmtBytes } from './seismic';

const W = 297;
const H = 210;
const M = 10;

/** The state glyph as vector shapes at (cx, cy), radius r (mm). */
function glyph(doc, key, cx, cy, r) {
  const s = STATUS[key] || STATUS.unrecorded;
  const [R, G, B] = s.rgb;
  doc.setLineCap('round');
  switch (s.icon) {
    case 'check':
      doc.setFillColor(R, G, B); doc.circle(cx, cy, r, 'F');
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(r * 0.28);
      doc.lines([[r * 0.38, r * 0.38], [r * 0.64, -r * 0.78]], cx - r * 0.5, cy, [1, 1], 'S');
      break;
    case 'half':
      doc.setFillColor(255, 255, 255); doc.setDrawColor(R, G, B); doc.setLineWidth(r * 0.22); doc.circle(cx, cy, r * 0.88, 'FD');
      doc.setFillColor(R, G, B);
      // left half as a polygon fan
      {
        const pts = [];
        for (let a = 90; a <= 270; a += 15) pts.push([cx + r * 0.88 * Math.cos((a * Math.PI) / 180), cy - r * 0.88 * Math.sin((a * Math.PI) / 180)]);
        const rel = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
        doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'F', true);
      }
      break;
    case 'spark': {
      doc.setFillColor(R, G, B);
      const k = 0.32;
      const p = [[0, -r], [r * k, -r * k], [r, 0], [r * k, r * k], [0, r], [-r * k, r * k], [-r, 0], [-r * k, -r * k]];
      const rel = p.slice(1).map((q, i) => [q[0] - p[i][0], q[1] - p[i][1]]);
      doc.lines(rel, cx + p[0][0], cy + p[0][1], [1, 1], 'F', true);
      break;
    }
    case 'doc':
      doc.setFillColor(255, 255, 255); doc.setDrawColor(R, G, B); doc.setLineWidth(r * 0.2);
      doc.rect(cx - r * 0.62, cy - r, r * 1.3, r * 2, 'FD');
      doc.setLineWidth(r * 0.16);
      doc.line(cx - r * 0.32, cy - r * 0.1, cx + r * 0.38, cy - r * 0.1);
      doc.line(cx - r * 0.32, cy + r * 0.32, cx + r * 0.38, cy + r * 0.32);
      break;
    case 'cross':
      doc.setFillColor(255, 255, 255); doc.setDrawColor(R, G, B); doc.setLineWidth(r * 0.22); doc.circle(cx, cy, r * 0.88, 'FD');
      doc.line(cx - r * 0.36, cy - r * 0.36, cx + r * 0.36, cy + r * 0.36);
      doc.line(cx + r * 0.36, cy - r * 0.36, cx - r * 0.36, cy + r * 0.36);
      break;
    case 'dash':
      doc.setFillColor(R, G, B); doc.circle(cx, cy, r, 'F');
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(r * 0.3); doc.line(cx - r * 0.5, cy, cx + r * 0.5, cy);
      break;
    default: {
      const [r2, g2, b2] = s.ink;
      doc.setDrawColor(r2, g2, b2); doc.setLineWidth(r * 0.16); doc.setLineDashPattern([r * 0.3, r * 0.25], 0); doc.circle(cx, cy, r * 0.85, 'S'); doc.setLineDashPattern([], 0);
    }
  }
}

function cell(doc, key, x, y, w, h, coverage) {
  const s = STATUS[key] || STATUS.unrecorded;
  doc.setFillColor(...s.fill);
  doc.setDrawColor(...s.rgb);
  doc.setLineWidth(0.15);
  doc.roundedRect(x, y, w, h, 0.8, 0.8, 'FD');
  // the pattern, as in the screen cell
  doc.setDrawColor(...s.rgb);
  if (s.pattern === 'hatch' || s.pattern === 'cross') {
    doc.setLineWidth(0.12);
    for (let k = -h; k < w; k += 1.4) {
      const x1 = Math.max(x, x + k); const y1 = y + (x1 - (x + k));
      const x2 = Math.min(x + w, x + k + h); const y2 = y + (x2 - (x + k));
      if (x2 > x1) doc.line(x1, y1, x2, y2);
      if (s.pattern === 'cross') {
        const xa = Math.max(x, x + k); const ya = y + h - (xa - (x + k));
        const xb = Math.min(x + w, x + k + h); const yb = y + h - (xb - (x + k));
        if (xb > xa) doc.line(xa, ya, xb, yb);
      }
    }
  } else if (s.pattern === 'lines') {
    doc.setLineWidth(0.1);
    for (let yy = y + 1; yy < y + h; yy += 1.1) doc.line(x + 0.3, yy, x + w - 0.3, yy);
  } else if (s.pattern === 'dots') {
    doc.setFillColor(...s.rgb);
    for (let yy = y + 0.9; yy < y + h; yy += 1.3) for (let xx = x + 0.9; xx < x + w; xx += 1.3) doc.circle(xx, yy, 0.12, 'F');
  }
  const bar = Number.isFinite(coverage) && ['complete', 'partial', 'derived'].includes(key);
  glyph(doc, key, x + w / 2, y + (bar ? h * 0.42 : h / 2), Math.min(w, h) * 0.3);
  if (bar) {
    doc.setFillColor(226, 232, 240); doc.rect(x + 0.8, y + h - 1.2, w - 1.6, 0.6, 'F');
    doc.setFillColor(...s.rgb); doc.rect(x + 0.8, y + h - 1.2, Math.max(0.3, (w - 1.6) * Math.min(1, coverage)), 0.6, 'F');
  }
}

/**
 * @returns {Promise<jsPDF>} the document (the caller saves it)
 */
export async function inventoryPdf(inv, { projectName = '', appLabel = '', generatedAt = new Date() } = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const t = textFilter(false);
  const logo = await loadPetrolordLogo().catch(() => null);
  const date = generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5); doc.setTextColor(...SLATE);
      doc.text(t(`Project Data Inventory, ${projectName || 'Untitled project'}. Built by Petrolord from the project registries; notes come from fixed rules.`), M, H - 5);
      doc.text(`Page ${i} of ${n}`, W - M, H - 5, { align: 'right' });
      if (logo) doc.addImage(logo.dataUrl, 'PNG', W - M - 28, H - 15, 26, (26 * logo.h) / logo.w);
    }
  };

  // ---- page 1: the board
  doc.setFontSize(8); doc.setTextColor(29, 78, 216); doc.setFont('helvetica', 'bold');
  doc.text('PROJECT DATA INVENTORY', M, 13);
  doc.setFontSize(18); doc.setTextColor(...NAVY);
  doc.text(t(projectName || 'Untitled project'), M, 21);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
  const s = inv.summary;
  const intervalLabel = inv.interval?.mode === 'zones' ? inv.interval.names.join(', ') : 'logged interval of each well';
  doc.text(t(`${s.wells} wells, ${s.volumes} seismic volumes, ${s.horizons} horizons${appLabel ? `, ${appLabel}` : ''}. Interval: ${intervalLabel}. Depths in ${inv.unit} MD. ${date}.`), M, 26.5);
  // score
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text(`${s.score}`, W - M - 26, 21, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  doc.text('/100 readiness', W - M - 25, 21);
  // tiles
  const tiles = [
    ['Wells', `${s.wells}`, `${s.curves} curves`],
    ['Completeness', `${Math.round((s.completeness || 0) * 100)}%`, 'well data cells'],
    ['Seismic', `${s.volumes}`, `${s.angleStacks} angle stacks, ${s.gathers} gather sets`],
    ['Interpretation', `${s.horizons}`, `horizons, ${s.faults} faults`],
    ['Open notes', `${s.notes}`, `${s.high} high severity`],
  ];
  const tw = (W - 2 * M - 4 * 3) / 5;
  tiles.forEach(([label, value, sub], i) => {
    const x = M + i * (tw + 3);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.25); doc.roundedRect(x, 30, tw, 15, 1.5, 1.5, 'S');
    doc.setFontSize(6.5); doc.setTextColor(...SLATE); doc.text(label.toUpperCase(), x + 3, 34);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(t(value), x + 3, 40.5);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text(t(sub), x + 3 + doc.getTextWidth(t(value)) * 1.9 + 2, 40.5);
  });
  // readiness strip
  const rw = (W - 2 * M - 6 * 2) / 7;
  inv.readiness.workflows.forEach((wf, i) => {
    const x = M + i * (rw + 2);
    const st = STATUS[LEVEL[wf.level].status];
    doc.setFillColor(...st.fill); doc.setDrawColor(...st.rgb); doc.setLineWidth(0.2);
    doc.roundedRect(x, 48, rw, 17, 1.2, 1.2, 'FD');
    glyph(doc, LEVEL[wf.level].status, x + 3.2, 51.6, 1.5);
    doc.setFontSize(6.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(t(wf.label), rw - 7)[0], x + 5.6, 52.3);
    doc.setTextColor(...st.ink); doc.text(LEVEL[wf.level].label.toUpperCase(), x + 5.6, 55.4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(60, 60, 60);
    doc.text(doc.splitTextToSize(t(wf.reason), rw - 3).slice(0, 3), x + 1.6, 58.3);
  });
  // matrix
  const cols = inv.columns;
  const nameW = 30;
  const remW = 52;
  const cw = (W - 2 * M - nameW - remW) / cols.length;
  let y = 69;
  doc.setFontSize(6); doc.setFont('helvetica', 'bold');
  let x = M + nameW;
  for (const g of inv.groups) {
    const gw = g.columns.length * cw;
    doc.setFillColor(241, 245, 249); doc.rect(x + 0.2, y, gw - 0.4, 4, 'F');
    doc.setTextColor(...NAVY); doc.text(doc.splitTextToSize(t(g.label.toUpperCase()), gw - 1)[0], x + gw / 2, y + 2.8, { align: 'center' });
    x += gw;
  }
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
  doc.text('Well', M, y + 2.5);
  cols.forEach((c, i) => doc.text(t(c.label), M + nameW + i * cw + cw / 2, y + 2.5, { align: 'center' }));
  doc.text('Remarks', W - M - remW + 1, y + 2.5);
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.35); doc.line(M, y + 3.6, W - M, y + 3.6);
  y += 4.6;
  const rh = Math.max(5, Math.min(8, (H - 32 - y) / Math.max(1, inv.rows.length)));
  for (const r of inv.rows) {
    doc.setFontSize(7.2); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text(t(r.wellName), M, y + rh * 0.45);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6); doc.setTextColor(...SLATE);
    if (r.interval) doc.text(`${fmtDepth(r.interval.top, inv.unit)}-${fmtDepth(r.interval.base, inv.unit)} ${inv.unit}`, M, y + rh * 0.8);
    cols.forEach((c, i) => { const k = r.cells[c.key]; cell(doc, k.status, M + nameW + i * cw + 0.3, y + 0.3, cw - 0.6, rh - 0.6, k.coverage); });
    doc.setFontSize(6); doc.setTextColor(60, 60, 60);
    doc.text(doc.splitTextToSize(t(r.remark), remW - 2).slice(0, 2), W - M - remW + 1, y + rh * 0.4);
    y += rh;
  }
  // legend
  y += 3;
  let lx = M;
  doc.setFontSize(6.5);
  for (const k of inv.statusesShown) {
    cell(doc, k, lx, y, 6, 4.2, null);
    doc.setTextColor(...NAVY); doc.text(t(STATUS[k].label), lx + 7.2, y + 2.9);
    lx += 9 + doc.getTextWidth(t(STATUS[k].label)) + 4;
  }

  // ---- page 2: seismic and interpretation
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text('Seismic', M, 15);
  doc.autoTable({
    startY: 18, margin: { left: M, right: M },
    head: [['Volume', 'Type', 'Domain', 'Format', 'Inline', 'Crossline', 'Bin, area', 'Sample, record', 'CRS', 'Size']],
    body: inv.seismic.rows.map((v) => [
      v.name, v.type, v.domain || '', v.format ? `${v.format}${v.bits ? `, ${v.bits}-bit` : ''}` : '',
      v.il ? `${v.il.min}-${v.il.max}` : '', v.xl ? `${v.xl.min}-${v.xl.max}` : '',
      v.binIl ? `${v.binIl.toFixed(1)} x ${v.binXl.toFixed(1)} m, ${v.areaKm2.toFixed(1)} km2` : (v.bins ? `${v.bins} offset bins of ${v.binWidthM} m` : ''),
      v.dtMs ? `${v.dtMs} ms, ${Math.round(v.recordMs)} ${v.recordUnit}` : '', v.crs || (v.store ? 'worker store' : 'not set'), fmtBytes(v.bytes),
    ].map((c) => t(String(c)))),
    styles: { fontSize: 7, cellPadding: 1.2 }, headStyles: { fillColor: NAVY },
  });
  let yy = doc.lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text('Interpretation', M, yy);
  doc.autoTable({
    startY: yy + 3, margin: { left: M, right: M },
    head: [['Item', 'State', 'Detail']],
    body: inv.interpretations.map((r) => [r.label, STATUS[r.status]?.label || r.status, r.text].map((c) => t(String(c)))),
    styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: NAVY }, columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 28 } },
  });
  if (inv.manual.length) {
    yy = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text('Other project data (outside Petrolord)', M, yy);
    doc.autoTable({
      startY: yy + 3, margin: { left: M, right: M },
      head: [['Item', 'Kind', 'Well', 'State', 'Source', 'Date', 'Note']],
      body: inv.manual.map((m) => [m.title || m.kindLabel, m.kindLabel, m.well || 'Project', m.stateLabel, m.source, m.date, m.note].map((c) => t(String(c || '')))),
      styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: NAVY },
    });
  }

  // ---- notes
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text('Notes: impact, workaround, uncertainty and mitigation', M, 15);
  doc.autoTable({
    startY: 18, margin: { left: M, right: M, bottom: 18 },
    head: [['Severity', 'Finding', 'Impact', 'Workaround', 'Uncertainty', 'Mitigation']],
    body: inv.findings.filter((f) => !f.dismissed).map((f) => [SEVERITY_LABEL[f.severity], `${f.title}${f.comment ? `\nComment: ${f.comment}` : ''}`, f.impact, f.workaround, f.uncertainty, f.mitigation].map((c) => t(c))),
    styles: { fontSize: 6.8, cellPadding: 1.3, valign: 'top' }, headStyles: { fillColor: NAVY },
    columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 48, fontStyle: 'bold' } },
  });
  footer();
  return doc;
}
