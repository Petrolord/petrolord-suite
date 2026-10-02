/**
 * Report Kit: vector plots drawn straight into the jsPDF page (taken from
 * the Well Test Analysis report, tester round 2, 2026-10-02). Lines and
 * symbols are PDF vectors, so a plot prints sharp and its axis titles,
 * legend and annotations are text that pdftotext reads back. No screenshot,
 * no canvas, no chart library.
 *
 * House chart standard: white panel, light grid, series colours dark enough
 * for white, the Petrolord mark (ChartLogo) in the bottom right corner of
 * the plot area. Linear or log axes, either axis reversed, an optional
 * second Y axis, shaded bands with labels along X or Y, reference lines,
 * annotation text.
 *
 * Pure drawing on a passed document; all text goes through pdfText so
 * nothing outside Latin-1 reaches the standard fonts. drawPlot returns the
 * number of points it drew per series, so a test can hold the drawing
 * against the series the screen shows.
 */
import { pdfText } from './text.js';
import {
  PLOT_GRID as GRID, PLOT_FRAME as FRAME, PLOT_TEXT as TEXT, PLOT_MUTED as MUTED, BAND_RGB, SERIES_CYCLE,
} from './theme.js';

/** Round tick steps (1, 2, 2.5, 5 x 10^k) covering [lo, hi] with about `n` ticks. */
export function niceTicks(lo, hi, n = 6) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) { const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.05 : 1; lo -= pad; hi += pad; }
  const raw = (hi - lo) / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  const out = [];
  for (let t = Math.floor(lo / step + 1e-9) * step; t <= hi + step * (1 - 1e-9); t += step) out.push(Number(t.toPrecision(12)));
  return out;
}

/** Powers of ten spanning the positive values. */
export function decadeTicks(lo, hi) {
  if (!(lo > 0) || !(hi > 0)) return [];
  let a = Math.floor(Math.log10(lo) + 1e-12);
  let b = Math.ceil(Math.log10(hi) - 1e-12);
  if (b <= a) b = a + 1;
  return Array.from({ length: b - a + 1 }, (_, i) => 10 ** (a + i));
}

export const tickText = (v) => {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(0).replace('+', '');
  return String(parseFloat(v.toPrecision(6)));
};

const finitePts = (pts, log) => (pts || []).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!log.x || p[0] > 0) && (!log.y || p[1] > 0));

const axisRange = (values, log) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(lo <= hi)) return null;
  const ticks = log ? decadeTicks(lo, hi) : niceTicks(lo, hi, 6);
  return { lo: Math.min(lo, ticks[0] ?? lo), hi: Math.max(hi, ticks[ticks.length - 1] ?? hi), ticks };
};

const hasLine = (type) => type === 'line' || type === 'both';
const hasMarkers = (type) => type === 'scatter' || type === 'both';

/**
 * Draw one plot in the box (mm).
 * @param {object} doc jsPDF document
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {{xTitle: string, yTitle: string, y2Title?: string, xLog?: boolean,
 *   yLog?: boolean, xReversed?: boolean, yReversed?: boolean,
 *   xInclude?: number[], yInclude?: number[],
 *   series: Array<{name: string, type?: 'line'|'scatter'|'both', rgb?: number[],
 *     pts: Array<[number, number]>, axis?: 'y'|'y2', width?: number, dash?: number[],
 *     marker?: 'circle'|'square'}>,
 *   bands?: Array<{x0: number, x1: number, label?: string, rgb?: number[]}>,
 *   yBands?: Array<{y0: number, y1: number, label?: string, rgb?: number[]}>,
 *   lines?: Array<{x?: number, y?: number, label?: string, rgb?: number[], dash?: number[], row?: number}>,
 *   notes?: string[], logo?: {dataUrl: string, w: number, h: number}}} spec
 *   `type` defaults to a line; 'both' is a line with a marker on each
 *   point. `bands` shade a span of X (fit windows, flow regimes), `yBands`
 *   a span of the left Y axis (a target range, a maturity window). `lines`
 *   are straight reference lines at one X or one Y. `xInclude` and
 *   `yInclude` are values the axis must span even when no series reaches
 *   them. `yReversed` puts the smallest value at the top (depth).
 * @returns {{drawn: Object<string, number>, total: number,
 *   marks: {segments: number, markers: number}, bands: number,
 *   yBands: number, lines: number, xRange: ?number[], yRange: ?number[],
 *   y2Range: ?number[], plotArea: ?{x: number, y: number, w: number, h: number},
 *   logo: boolean}}
 *   `drawn` is the number of points per series, `marks` the line segments
 *   and markers that went into the page for them (the test kit counts the
 *   same in the file), `plotArea` the rectangle inside the axes.
 */
export function drawPlot(doc, box, spec) {
  const xLog = !!spec.xLog;
  const yLog = !!spec.yLog;
  const series = (spec.series || []).map((s, i) => ({
    ...s, rgb: s.rgb || SERIES_CYCLE[i % SERIES_CYCLE.length], axis: s.axis === 'y2' ? 'y2' : 'y', q: finitePts(s.pts, { x: xLog, y: s.axis === 'y2' ? false : yLog }),
  }));
  const left = series.filter((s) => s.axis === 'y');
  const right = series.filter((s) => s.axis === 'y2');
  // xInclude: values the X axis must span even when no series reaches them
  // (stacked panels share one time axis this way)
  const xExtra = (spec.xInclude || []).filter((v) => Number.isFinite(v) && (!xLog || v > 0));
  const xValues = series.flatMap((s) => s.q.map((p) => p[0]));
  const xr = axisRange(xValues.length ? [...xValues, ...xExtra] : [], xLog);
  const yExtra = (spec.yInclude || []).filter((v) => Number.isFinite(v) && (!yLog || v > 0));
  const yValues = left.flatMap((s) => s.q.map((p) => p[1]));
  const yr = axisRange(yValues.length && yExtra.length ? [...yValues, ...yExtra] : yValues, yLog);
  const y2r = right.length ? axisRange(right.flatMap((s) => s.q.map((p) => p[1])), false) : null;

  // legend rows first: they set the top padding
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const legend = series.filter((s) => s.q.length).map((s) => ({ name: pdfText(s.name), rgb: s.rgb, type: s.type || 'line', dash: s.dash, marker: s.marker }));
  const padL = 17;
  const padR = y2r ? 17 : 5;
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
  const pad = { l: padL, r: padR, t: 4 + rows * 3.6, b: 12 };
  const X0 = box.x + pad.l;
  const X1 = box.x + box.w - pad.r;
  const Y0 = box.y + pad.t; // top of the plot area
  const Y1 = box.y + box.h - pad.b; // bottom

  // white panel and frame (house chart standard)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(box.x, box.y, box.w, box.h, 'FD');

  const result = {
    drawn: {}, total: 0, marks: { segments: 0, markers: 0 }, bands: 0, yBands: 0, lines: 0,
    xRange: xr ? [xr.lo, xr.hi] : null, yRange: yr ? [yr.lo, yr.hi] : null, y2Range: y2r ? [y2r.lo, y2r.hi] : null,
    plotArea: null, logo: false,
  };
  if (!xr || (!yr && !y2r)) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('No data to plot', box.x + box.w / 2, box.y + box.h / 2, { align: 'center' });
    return result;
  }
  result.plotArea = { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };

  const frac = (v, r, log) => (log
    ? (Math.log10(v) - Math.log10(r.lo)) / ((Math.log10(r.hi) - Math.log10(r.lo)) || 1)
    : (v - r.lo) / ((r.hi - r.lo) || 1));
  const px = (v) => {
    const f = frac(v, xr, xLog);
    return X0 + (spec.xReversed ? 1 - f : f) * (X1 - X0);
  };
  const up = (f) => (spec.yReversed ? 1 - f : f);
  const py = (v) => Y1 - up(frac(v, yr, yLog)) * (Y1 - Y0);
  const py2 = (v) => Y1 - up(frac(v, y2r, false)) * (Y1 - Y0);
  const clampX = (v) => Math.min(Math.max(v, xr.lo), xr.hi);
  const tint = (rgb) => rgb.map((v) => Math.round(255 - (255 - v) * 0.16));

  // shaded X bands (flow-regime windows, fit windows), under everything else
  doc.setFontSize(5.5);
  (spec.bands || []).forEach((b, i) => {
    if (!Number.isFinite(b.x0) || !Number.isFinite(b.x1) || (xLog && !(b.x0 > 0 && b.x1 > 0))) return;
    const a = px(clampX(Math.min(b.x0, b.x1)));
    const c = px(clampX(Math.max(b.x0, b.x1)));
    const xa = Math.min(a, c);
    const wBand = Math.abs(c - a);
    if (!(wBand > 0)) return;
    const rgb = b.rgb || BAND_RGB;
    // a pale tint of the band colour
    doc.setFillColor(...tint(rgb));
    doc.rect(xa, Y0, wBand, Y1 - Y0, 'F');
    doc.setDrawColor(...rgb);
    doc.setLineWidth(0.15);
    doc.line(xa, Y0, xa, Y1);
    doc.line(xa + wBand, Y0, xa + wBand, Y1);
    if (b.label) {
      doc.setTextColor(...MUTED);
      doc.text(pdfText(b.label), xa + 0.8, Y0 + 2.4 + (i % 3) * 2.4);
    }
    result.bands += 1;
  });

  // shaded Y bands (a target range, a window of the left axis)
  if (yr && spec.yBands?.length) {
    const clampY = (v) => Math.min(Math.max(v, yr.lo), yr.hi);
    spec.yBands.forEach((b) => {
      if (!Number.isFinite(b.y0) || !Number.isFinite(b.y1) || (yLog && !(b.y0 > 0 && b.y1 > 0))) return;
      const a = py(clampY(Math.min(b.y0, b.y1)));
      const c = py(clampY(Math.max(b.y0, b.y1)));
      const ya = Math.min(a, c);
      const hBand = Math.abs(c - a);
      if (!(hBand > 0)) return;
      const rgb = b.rgb || BAND_RGB;
      doc.setFillColor(...tint(rgb));
      doc.rect(X0, ya, X1 - X0, hBand, 'F');
      doc.setDrawColor(...rgb);
      doc.setLineWidth(0.15);
      doc.line(X0, ya, X1, ya);
      doc.line(X0, ya + hBand, X1, ya + hBand);
      if (b.label) {
        doc.setTextColor(...MUTED);
        doc.text(pdfText(b.label), X1 - 0.8, ya + 2.2, { align: 'right' });
      }
      result.yBands += 1;
    });
  }

  // grid, ticks and tick labels
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.15);
  for (const t of xr.ticks) {
    if (t < xr.lo || t > xr.hi) continue;
    doc.line(px(t), Y0, px(t), Y1);
    doc.text(tickText(t), px(t), Y1 + 3.2, { align: 'center' });
  }
  if (yr) {
    for (const t of yr.ticks) {
      if (t < yr.lo || t > yr.hi) continue;
      doc.line(X0, py(t), X1, py(t));
      doc.text(tickText(t), X0 - 1.2, py(t) + 0.9, { align: 'right' });
    }
  }
  if (y2r) {
    for (const t of y2r.ticks) {
      if (t < y2r.lo || t > y2r.hi) continue;
      doc.text(tickText(t), X1 + 1.2, py2(t) + 0.9);
    }
  }
  doc.setDrawColor(...FRAME);
  doc.setLineWidth(0.25);
  doc.rect(X0, Y0, X1 - X0, Y1 - Y0);

  // axis titles
  doc.setFontSize(7);
  doc.setTextColor(...TEXT);
  doc.text(pdfText(spec.xTitle), (X0 + X1) / 2, box.y + box.h - 2.2, { align: 'center' });
  // Rotated titles are placed by hand: jsPDF applies `align` along the page
  // X axis even when the text is turned, which throws a centred vertical
  // title sideways out of the panel. Turned 90 degrees the text runs up the
  // page from its anchor, so the anchor sits half a text width below centre.
  const vertical = (text, x) => {
    const t = pdfText(text);
    doc.text(t, x, (Y0 + Y1) / 2 + doc.getTextWidth(t) / 2, { angle: 90 });
  };
  if (spec.yTitle) vertical(spec.yTitle, box.x + 4.6);
  if (y2r && spec.y2Title) vertical(spec.y2Title, box.x + box.w - 1.8);

  // reference lines at one X or one Y of the left axis, with their labels
  if (spec.lines?.length) {
    doc.setFontSize(5.5);
    for (const l of spec.lines) {
      const rgb = l.rgb || FRAME;
      const atX = Number.isFinite(l.x) && (!xLog || l.x > 0) && l.x >= xr.lo && l.x <= xr.hi;
      const atY = !atX && yr && Number.isFinite(l.y) && (!yLog || l.y > 0) && l.y >= yr.lo && l.y <= yr.hi;
      if (!atX && !atY) continue;
      doc.setDrawColor(...rgb);
      doc.setLineWidth(0.3);
      if (l.dash && doc.setLineDashPattern) doc.setLineDashPattern(l.dash, 0);
      if (atX) doc.line(px(l.x), Y0, px(l.x), Y1);
      else doc.line(X0, py(l.y), X1, py(l.y));
      if (l.dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
      if (l.label) {
        doc.setTextColor(...MUTED);
        // `row` drops a label by one line per step, so neighbours do not overprint
        if (atX) doc.text(pdfText(l.label), px(l.x) + 0.8, Y0 + 2.4 + (l.row || 0) * 2.4);
        else doc.text(pdfText(l.label), X0 + 0.8, py(l.y) - 0.8);
      }
      result.lines += 1;
    }
  }

  // series
  const mark = (s, x, y, r) => (s.marker === 'square' ? doc.rect(x - r, y - r, 2 * r, 2 * r, 'F') : doc.circle(x, y, r, 'F'));
  for (const s of series) {
    const yOf = s.axis === 'y2' ? py2 : py;
    const type = s.type || 'line';
    doc.setDrawColor(...s.rgb);
    doc.setFillColor(...s.rgb);
    if (hasLine(type)) {
      doc.setLineWidth(s.width || 0.45);
      if (s.dash && doc.setLineDashPattern) doc.setLineDashPattern(s.dash, 0);
      for (let k = 1; k < s.q.length; k += 1) doc.line(px(s.q[k - 1][0]), yOf(s.q[k - 1][1]), px(s.q[k][0]), yOf(s.q[k][1]));
      if (s.dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
      result.marks.segments += Math.max(0, s.q.length - 1);
    }
    if (hasMarkers(type)) {
      for (const p of s.q) mark(s, px(p[0]), yOf(p[1]), 0.5);
      result.marks.markers += s.q.length;
    }
    result.drawn[s.name] = s.q.length;
    result.total += s.q.length;
  }

  // legend across the top
  doc.setFontSize(6.5);
  for (const item of legend) {
    const lx = X0 + item.x;
    const ly = box.y + 3.4 + item.row * 3.6;
    doc.setDrawColor(...item.rgb);
    doc.setFillColor(...item.rgb);
    if (hasLine(item.type)) { doc.setLineWidth(0.6); doc.line(lx, ly, lx + 4, ly); }
    if (hasMarkers(item.type)) mark(item, lx + 2, ly, 0.6);
    doc.setTextColor(...TEXT);
    doc.text(item.name, lx + 5, ly + 0.9);
  }

  // annotations inside the plot, bottom left
  if (spec.notes?.length) {
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT);
    spec.notes.forEach((n, i) => doc.text(pdfText(n), X0 + 1.5, Y1 - 1.6 - (spec.notes.length - 1 - i) * 3));
  }

  // the Petrolord mark (ChartLogo) in the bottom right of the plot area
  if (spec.logo?.dataUrl) {
    const hLogo = 5;
    const wLogo = hLogo * (spec.logo.w && spec.logo.h ? spec.logo.w / spec.logo.h : 3);
    try {
      doc.addImage(spec.logo.dataUrl, 'PNG', X1 - wLogo - 1, Y1 - hLogo - 1, wLogo, hLogo, 'petrolord-chart-mark', 'FAST');
      result.logo = true;
    } catch { /* the mark is decoration; the plot stands without it */ }
  }
  if (!result.logo) {
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text('Petrolord', X1 - 1, Y1 - 1.5, { align: 'right' });
  }
  return result;
}
