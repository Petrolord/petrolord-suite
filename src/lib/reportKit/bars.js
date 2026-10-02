/**
 * Report Kit: a vector bar chart drawn straight into the jsPDF page, on the
 * same house chart standard as ./plot.js (white panel, light grid, series
 * colours dark enough for white, the Petrolord mark in the bottom right of
 * the plot area). Added in the Reservoir round for Risked Reserves
 * Valuation (the chance factors and their product); it also serves any
 * report that compares a few named quantities (drive indices, recovery
 * ranges, stage volumes).
 *
 * Categories run along X, one group of bars per category, one bar per
 * series. Each bar is a filled and stroked rectangle, so the test kit can
 * count the bars in the file apart from the markers of a line plot. The
 * value is printed over each bar as text that pdftotext reads back.
 *
 * A figure panel asks for it with `kind: 'bars'`:
 *
 *   r.figure({ id: 'chance', title: 'Chance factors', caption: '...',
 *     panels: [{ kind: 'bars', height: 70, spec: {
 *       yTitle: 'Chance, %', categories: ['Trap', 'Seal', 'Pg'],
 *       series: [{ name: 'Chance', values: [60, 70, 42] }] } }] });
 */
import { pdfText } from './text.js';
import { niceTicks, tickText } from './plot.js';
import {
  PLOT_GRID as GRID, PLOT_FRAME as FRAME, PLOT_TEXT as TEXT, PLOT_MUTED as MUTED, SERIES_CYCLE,
} from './theme.js';

/**
 * Draw one bar chart in the box (mm).
 * @param {object} doc jsPDF document
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {{xTitle?: string, yTitle?: string, categories: string[],
 *   series: Array<{name: string, values: number[], rgb?: number[], rgbs?: Array<?number[]>}>,
 *   yInclude?: number[], valueText?: (function(number, number, number): string)|false,
 *   lines?: Array<{y: number, label?: string, rgb?: number[], dash?: number[]}>,
 *   notes?: string[], logo?: {dataUrl: string, w: number, h: number}}} spec
 *   `values[i]` belongs to `categories[i]`; a value that is not a finite
 *   number draws no bar. `rgbs[i]` colours one bar apart from its series
 *   (the product beside its factors). `valueText(value, seriesIndex,
 *   categoryIndex)` words the label over a bar; false prints none. The Y
 *   axis always includes zero. `lines` are reference lines at one Y.
 * @returns {{drawn: Object<string, number>, total: number,
 *   marks: {segments: number, markers: number, bars: number}, bands: number,
 *   yBands: number, lines: number, xRange: null, yRange: ?number[],
 *   plotArea: ?{x: number, y: number, w: number, h: number}, logo: boolean}}
 *   `drawn` is the number of bars per series and `marks.bars` their total,
 *   which the test kit holds against the rectangles in the file.
 */
export function drawBars(doc, box, spec) {
  const categories = (spec.categories || []).map((c) => pdfText(c));
  const series = (spec.series || []).map((s, i) => ({
    ...s, rgb: s.rgb || SERIES_CYCLE[i % SERIES_CYCLE.length], values: Array.isArray(s.values) ? s.values : [],
  }));
  const finite = series.flatMap((s) => s.values.slice(0, categories.length).filter(Number.isFinite));
  const extra = (spec.yInclude || []).filter(Number.isFinite);
  const lo = Math.min(0, ...finite, ...extra);
  const hi = Math.max(0, ...finite, ...extra);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const legend = series.length > 1 ? series.map((s) => ({ name: pdfText(s.name), rgb: s.rgb })) : [];
  const padL = 17;
  const padR = 5;
  const innerW = box.w - padL - padR;
  let rows = 1;
  let cursor = 0;
  for (const item of legend) {
    const wItem = 8 + doc.getTextWidth(item.name);
    if (cursor + wItem > innerW && cursor > 0) { rows += 1; cursor = 0; }
    item.row = rows - 1;
    item.x = cursor;
    cursor += wItem;
  }
  const pad = { l: padL, r: padR, t: 4 + rows * 3.6, b: spec.xTitle ? 13 : 9 };
  const X0 = box.x + pad.l;
  const X1 = box.x + box.w - pad.r;
  const Y0 = box.y + pad.t;
  const Y1 = box.y + box.h - pad.b;

  // white panel and frame (house chart standard)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(box.x, box.y, box.w, box.h, 'FD');

  const result = {
    drawn: {}, total: 0, marks: { segments: 0, markers: 0, bars: 0 }, bands: 0, yBands: 0, lines: 0,
    xRange: null, yRange: null, plotArea: null, logo: false,
  };
  if (!categories.length || !finite.length) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('No data to plot', box.x + box.w / 2, box.y + box.h / 2, { align: 'center' });
    return result;
  }
  // head room for the value printed over the tallest bar
  const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi + (hi - lo) * 0.08, 5);
  const yLo = Math.min(lo, ticks[0]);
  const yHi = Math.max(hi, ticks[ticks.length - 1]);
  result.yRange = [yLo, yHi];
  result.plotArea = { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
  const py = (v) => Y1 - ((v - yLo) / ((yHi - yLo) || 1)) * (Y1 - Y0);

  // grid, ticks and tick labels
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.15);
  for (const t of ticks) {
    if (t < yLo || t > yHi) continue;
    doc.line(X0, py(t), X1, py(t));
    doc.text(tickText(t), X0 - 1.2, py(t) + 0.9, { align: 'right' });
  }
  doc.setDrawColor(...FRAME);
  doc.setLineWidth(0.25);
  doc.rect(X0, Y0, X1 - X0, Y1 - Y0);

  // axis titles
  doc.setFontSize(7);
  doc.setTextColor(...TEXT);
  if (spec.xTitle) doc.text(pdfText(spec.xTitle), (X0 + X1) / 2, box.y + box.h - 2.2, { align: 'center' });
  if (spec.yTitle) {
    const t = pdfText(spec.yTitle);
    doc.text(t, box.x + 4.6, (Y0 + Y1) / 2 + doc.getTextWidth(t) / 2, { angle: 90 });
  }

  // reference lines at one Y, with their labels
  if (spec.lines?.length) {
    doc.setFontSize(5.5);
    for (const l of spec.lines) {
      if (!Number.isFinite(l.y) || l.y < yLo || l.y > yHi) continue;
      doc.setDrawColor(...(l.rgb || FRAME));
      doc.setLineWidth(0.3);
      if (l.dash && doc.setLineDashPattern) doc.setLineDashPattern(l.dash, 0);
      doc.line(X0, py(l.y), X1, py(l.y));
      if (l.dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
      if (l.label) { doc.setTextColor(...MUTED); doc.text(pdfText(l.label), X0 + 0.8, py(l.y) - 0.8); }
      result.lines += 1;
    }
  }

  // bars: one slot per category, the group centred in it
  const slot = (X1 - X0) / categories.length;
  const groupW = slot * 0.64;
  const barW = groupW / series.length;
  const label = spec.valueText === false ? null : (spec.valueText || ((v) => tickText(Number(v.toPrecision(3)))));
  const y0 = py(0);
  series.forEach((s, si) => {
    let n = 0;
    categories.forEach((_, ci) => {
      const v = s.values[ci];
      if (!Number.isFinite(v)) return;
      const rgb = s.rgbs?.[ci] || s.rgb;
      const x = X0 + ci * slot + (slot - groupW) / 2 + si * barW;
      const top = Math.min(py(v), y0);
      const h = Math.abs(py(v) - y0);
      doc.setFillColor(...rgb);
      doc.setDrawColor(...rgb);
      doc.setLineWidth(0.1);
      doc.rect(x + barW * 0.06, top, barW * 0.88, h, 'FD');
      n += 1;
      if (label) {
        doc.setFontSize(6.5);
        doc.setTextColor(...TEXT);
        doc.text(pdfText(label(v, si, ci)), x + barW / 2, (v >= 0 ? top - 1.1 : top + h + 2.6), { align: 'center' });
      }
    });
    result.drawn[s.name] = n;
    result.total += n;
    result.marks.bars += n;
  });

  // category labels under the axis
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  categories.forEach((c, ci) => {
    const lines = doc.splitTextToSize(c, slot - 1).slice(0, 2);
    doc.text(lines, X0 + (ci + 0.5) * slot, Y1 + 3.2, { align: 'center' });
  });

  // legend across the top, only when there is more than one series
  for (const item of legend) {
    const lx = X0 + item.x;
    const ly = box.y + 3.4 + item.row * 3.6;
    doc.setFillColor(...item.rgb);
    doc.rect(lx, ly - 1, 4, 2, 'F');
    doc.setTextColor(...TEXT);
    doc.text(item.name, lx + 5, ly + 0.9);
  }

  // annotations inside the plot, top left
  if (spec.notes?.length) {
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT);
    spec.notes.forEach((n, i) => doc.text(pdfText(n), X0 + 1.5, Y0 + 3 + i * 3));
  }

  // the Petrolord mark (ChartLogo) in the bottom right of the plot area
  if (spec.logo?.dataUrl) {
    const hLogo = 5;
    const wLogo = hLogo * (spec.logo.w && spec.logo.h ? spec.logo.w / spec.logo.h : 3);
    try {
      doc.addImage(spec.logo.dataUrl, 'PNG', X1 - wLogo - 1, Y0 + 1, wLogo, hLogo, 'petrolord-chart-mark', 'FAST');
      result.logo = true;
    } catch { /* the mark is decoration; the chart stands without it */ }
  }
  if (!result.logo) {
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text('Petrolord', X1 - 1, Y0 + 3, { align: 'right' });
  }
  return result;
}
