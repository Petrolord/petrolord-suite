// The section plotted to scale as a PDF (AppUpgrade WC-U2-006, PL7): the
// correlation panel a reviewer signs. The drawn window is rendered offscreen
// at the exact height that makes its depth span measure span / N on paper
// (96 css px per inch), placed on a page of that physical size, so a ruler
// on the printout reads the scale printed on it. The header carries the PNG
// caption (field, analyst, wells, datum, reference and unit, scale, spacing,
// template, date, build), a legend of the shown tops and the zone fill, and a
// vector scale bar. Latin-1 text only (jsPDF standard fonts).

import { jsPDF } from 'jspdf';
import { latin1 } from '@/pages/apps/WellDataManager/services/wellSheet';

export const MM_PER_CSS_PX = 25.4 / 96;
/** Metric 1:N choices, and imperial ones as "1 in = X ft" (N = 12 X). */
export const PDF_SCALES_M = [200, 500, 1000, 2000, 5000];
export const PDF_SCALES_FT = [240, 480, 600, 1200, 2400];
export const MAX_PAGE_MM = 5000; // jsPDF's page limit is 14,400 pt (5,080 mm)
const MARGIN = 10;
const MAX_CANVAS_PX = 16000;

export const scaleLabel = (n, unit = 'm') => (unit === 'ft' && n % 12 === 0
  ? `1:${n.toLocaleString('en-US')} (1 in = ${n / 12} ft)`
  : `1:${n.toLocaleString('en-US')} (1 cm = ${n / 100} m)`);

/**
 * Size of the print render for a depth window at 1:N.
 * @param {{vTop: number, vBase: number, scaleN: number, contentW: number, plotTop: number, padBottom: number, headerMm?: number}} p
 *   depths in metres, widths in css px
 * @returns {{plotHcss: number, plotHmm: number, wCss: number, hCss: number, pixelRatio: number, pageWmm: number, pageHmm: number, problem: ?string}}
 */
export function printPlan({ vTop, vBase, scaleN, contentW, plotTop, padBottom, headerMm = 48 }) {
  const span = Math.abs(Number(vBase) - Number(vTop));
  const n = Number(scaleN);
  if (!(span > 0) || !(n > 0)) return { problem: 'There is no depth window to plot.' };
  const plotHmm = (span * 1000) / n;
  const plotHcss = plotHmm / MM_PER_CSS_PX;
  const wCss = Math.ceil(contentW);
  const hCss = plotTop + plotHcss + padBottom; // fractional: the plot band is exactly span / N
  const imgWmm = wCss * MM_PER_CSS_PX;
  const pageWmm = Math.max(210, imgWmm + 2 * MARGIN + 22);
  const pageHmm = headerMm + hCss * MM_PER_CSS_PX + 2 * MARGIN;
  let problem = null;
  if (pageHmm > MAX_PAGE_MM || pageWmm > MAX_PAGE_MM) {
    problem = `At 1:${n.toLocaleString('en-US')} the ${Math.round(span)} m window is ${(plotHmm / 1000).toFixed(2)} m of paper, more than a PDF page can hold (5 m). Pick a smaller scale or zoom the depth window.`;
  }
  const pixelRatio = Math.max(0.5, Math.min(2, MAX_CANVAS_PX / hCss, MAX_CANVAS_PX / wCss));
  return { plotHcss, plotHmm, wCss, hCss, pixelRatio, pageWmm, pageHmm, problem };
}

/** A vector scale bar length: a round depth whose bar is 20 to 80 mm long. */
export function scaleBar(scaleN, unit = 'm') {
  const perUnitMm = (unit === 'ft' ? 0.3048 : 1) * 1000 / scaleN; // mm per display unit
  for (const v of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) {
    const mm = v * perUnitMm;
    if (mm >= 20 && mm <= 80) return { value: v, mm };
  }
  const v = Math.max(1, Math.round(50 / perUnitMm));
  return { value: v, mm: v * perUnitMm };
}

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : 0x64748b;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * @param {Object} p
 * @param {string} p.imageDataUrl PNG of the print render
 * @param {{wCss: number, hCss: number, plotHmm: number, pageWmm: number, pageHmm: number}} p.plan printPlan output
 * @param {number} p.plotTopCss where the plot band starts in the image
 * @param {{title: string, caption: string[]}} p.header sectionCaption output (at the print scale)
 * @param {number} p.scaleN @param {'m'|'ft'} p.depthUnit
 * @param {Array<{name: string, color: string}>} p.legend shown tops
 * @param {string} p.fillNote zone fill in words
 * @returns {{doc: jsPDF, fileName: string}}
 */
export function buildSectionPdf({ imageDataUrl, plan, plotTopCss, header, scaleN, depthUnit = 'm', legend = [], fillNote = '' }) {
  const imgWmm = plan.wCss * MM_PER_CSS_PX;
  const imgHmm = plan.hCss * MM_PER_CSS_PX;
  const W = plan.pageWmm;
  // the header block, drawn on a scratch page first to learn its height, then
  // on the real page sized to hold it and the panel at full scale
  const drawHeader = (doc) => {
    let y = MARGIN + 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
    doc.text(latin1(`Petrolord Suite - ${header.title}`), MARGIN, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(51, 65, 85);
    for (const line of header.caption) {
      for (const part of doc.splitTextToSize(latin1(line), W - 2 * MARGIN)) { y += 4.2; doc.text(part, MARGIN, y); }
    }
    y += 4.2;
    doc.setFont('helvetica', 'bold');
    doc.text(latin1(`Plotted to scale: vertical ${scaleLabel(scaleN, depthUnit)} when printed at 100 %; horizontal not to scale (fixed column width).`), MARGIN, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
    let x = MARGIN;
    doc.text('Tops:', x, y); x += 10;
    for (const t of legend) {
      const label = latin1(t.name);
      const w = doc.getTextWidth(label) + 7;
      if (x + w > W - MARGIN) { x = MARGIN + 10; y += 4.2; }
      doc.setFillColor(...hexRgb(t.color)); doc.rect(x, y - 2.4, 3, 2.6, 'F');
      doc.text(label, x + 4, y); x += w;
    }
    if (!legend.length) doc.text('none shown', x, y);
    if (fillNote) { y += 4.2; doc.text(latin1(`Fill: ${fillNote}`), MARGIN, y); }
    return y + 4;
  };
  const imgTop = drawHeader(new jsPDF({ unit: 'mm', format: [W, 400] }));
  const pageH = imgTop + imgHmm + MARGIN;
  const doc = new jsPDF({ unit: 'mm', format: [W, pageH], orientation: W > pageH ? 'l' : 'p' });
  drawHeader(doc);
  doc.addImage(imageDataUrl, 'PNG', MARGIN, imgTop, imgWmm, imgHmm);
  // vector scale bar to the right of the panel, at the top of the plot band
  const bar = scaleBar(scaleN, depthUnit);
  const bx = MARGIN + imgWmm + 8;
  const by = imgTop + plotTopCss * MM_PER_CSS_PX;
  doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.4);
  doc.line(bx, by, bx, by + bar.mm);
  doc.line(bx - 1.5, by, bx + 1.5, by); doc.line(bx - 1.5, by + bar.mm, bx + 1.5, by + bar.mm);
  doc.setFontSize(7);
  doc.text(`${bar.value} ${depthUnit === 'ft' ? 'ft' : 'm'}`, bx + 2, by + bar.mm / 2);
  doc.text('scale bar', bx + 2, by + bar.mm / 2 + 3);
  const stem = latin1(header.title).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'section';
  return { doc, fileName: `${stem}_1-${scaleN}.pdf`, imgTop, pageH };
}
