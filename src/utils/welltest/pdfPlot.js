/**
 * Vector plots for the Well Test Analysis Studio PDF report (tester round 2,
 * 2026-10-02). The route the other Suite reports take (Pore Pressure
 * prognosis, Basin burial history, Rock Physics): lines and symbols drawn
 * straight into the jsPDF page, so the plot prints sharp and its axis
 * titles, legend and annotations are text that pdftotext reads back. No
 * screenshot, no canvas.
 *
 * House chart standard: white panel, light grid, series colours dark enough
 * for white (the studio's own LINE palette), the Petrolord mark in the
 * bottom right corner of the plot area. Linear or log axes, an optional
 * second Y axis, shaded X bands for flow-regime and fit windows.
 *
 * Pure drawing on a passed document; all text goes through pdfText so
 * nothing outside Latin-1 reaches the standard fonts.
 */

// Symbols the screen uses that the report spells out.
const SPELL = [
  [/Δ/g, 'd'], [/[μµ]/g, 'mu'], [/[φϕΦ]/g, 'phi'], [/√/g, 'sqrt'], [/²/g, '2'], [/³/g, '3'],
  [/·/g, ' '], [/[—–−]/g, '-'], [/[“”]/g, '"'], [/[‘’]/g, "'"], [/…/g, '...'], [/≥/g, '>='], [/≤/g, '<='],
  [/×/g, 'x'], [/°/g, 'deg '], [/π/g, 'pi'], [/→/g, 'to'],
];

/** Text safe for jsPDF's standard fonts: symbols spelled out, anything outside Latin-1 replaced. */
export function pdfText(value) {
  let s = value == null ? '' : String(value);
  for (const [re, to] of SPELL) s = s.replace(re, to);
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x00-\xff]/g, '?');
}

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

const GRID = [226, 232, 240];
const FRAME = [100, 116, 139];
const TEXT = [51, 65, 85];
const MUTED = [71, 85, 105];

// The studio's chart colours (components/welltest/primitives LINE), as RGB.
export const PLOT_RGB = Object.freeze({
  dp: [37, 99, 235],
  derivative: [220, 38, 38],
  model: [5, 150, 105],
  modelDeriv: [124, 58, 237],
  fit: [217, 119, 6],
  rate: [8, 145, 178],
  pressure: [51, 65, 85],
  temperature: [190, 24, 93],
});

const finitePts = (pts, log) => (pts || []).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!log.x || p[0] > 0) && (!log.y || p[1] > 0));

const axisRange = (values, log) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(lo <= hi)) return null;
  const ticks = log ? decadeTicks(lo, hi) : niceTicks(lo, hi, 6);
  return { lo: Math.min(lo, ticks[0] ?? lo), hi: Math.max(hi, ticks[ticks.length - 1] ?? hi), ticks };
};

/**
 * Draw one plot in the box (mm).
 * @param {object} doc jsPDF document
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {{xTitle: string, yTitle: string, y2Title?: string, xLog?: boolean,
 *   yLog?: boolean, xReversed?: boolean, xInclude?: number[],
 *   series: Array<{name: string, type?: 'line'|'scatter', rgb: number[],
 *     pts: Array<[number, number]>, axis?: 'y'|'y2', width?: number, dash?: number[]}>,
 *   bands?: Array<{x0: number, x1: number, label?: string, rgb?: number[]}>,
 *   notes?: string[], logo?: {dataUrl: string, w: number, h: number}}} spec
 * @returns {{drawn: Object<string, number>, total: number, bands: number,
 *   xRange: ?number[], yRange: ?number[], y2Range: ?number[], logo: boolean}}
 */
export function drawPlot(doc, box, spec) {
  const xLog = !!spec.xLog;
  const yLog = !!spec.yLog;
  const series = (spec.series || []).map((s) => ({
    ...s, axis: s.axis === 'y2' ? 'y2' : 'y', q: finitePts(s.pts, { x: xLog, y: s.axis === 'y2' ? false : yLog }),
  }));
  const left = series.filter((s) => s.axis === 'y');
  const right = series.filter((s) => s.axis === 'y2');
  // xInclude: values the X axis must span even when no series reaches them
  // (stacked panels share one time axis this way)
  const xExtra = (spec.xInclude || []).filter((v) => Number.isFinite(v) && (!xLog || v > 0));
  const xValues = series.flatMap((s) => s.q.map((p) => p[0]));
  const xr = axisRange(xValues.length ? [...xValues, ...xExtra] : [], xLog);
  const yr = axisRange(left.flatMap((s) => s.q.map((p) => p[1])), yLog);
  const y2r = right.length ? axisRange(right.flatMap((s) => s.q.map((p) => p[1])), false) : null;

  // legend rows first: they set the top padding
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const legend = series.filter((s) => s.q.length).map((s) => ({ name: pdfText(s.name), rgb: s.rgb, type: s.type || 'line', dash: s.dash }));
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

  const result = { drawn: {}, total: 0, bands: 0, xRange: xr ? [xr.lo, xr.hi] : null, yRange: yr ? [yr.lo, yr.hi] : null, y2Range: y2r ? [y2r.lo, y2r.hi] : null, logo: false };
  if (!xr || (!yr && !y2r)) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('No data to plot', box.x + box.w / 2, box.y + box.h / 2, { align: 'center' });
    return result;
  }

  const frac = (v, r, log) => (log
    ? (Math.log10(v) - Math.log10(r.lo)) / ((Math.log10(r.hi) - Math.log10(r.lo)) || 1)
    : (v - r.lo) / ((r.hi - r.lo) || 1));
  const px = (v) => {
    const f = frac(v, xr, xLog);
    return X0 + (spec.xReversed ? 1 - f : f) * (X1 - X0);
  };
  const py = (v) => Y1 - frac(v, yr, yLog) * (Y1 - Y0);
  const py2 = (v) => Y1 - frac(v, y2r, false) * (Y1 - Y0);
  const clampX = (v) => Math.min(Math.max(v, xr.lo), xr.hi);

  // shaded X bands (flow-regime windows, fit windows), under everything else
  doc.setFontSize(5.5);
  (spec.bands || []).forEach((b, i) => {
    if (!Number.isFinite(b.x0) || !Number.isFinite(b.x1) || (xLog && !(b.x0 > 0 && b.x1 > 0))) return;
    const a = px(clampX(Math.min(b.x0, b.x1)));
    const c = px(clampX(Math.max(b.x0, b.x1)));
    const xa = Math.min(a, c);
    const wBand = Math.abs(c - a);
    if (!(wBand > 0)) return;
    const rgb = b.rgb || [148, 163, 184];
    // a pale tint of the band colour
    doc.setFillColor(...rgb.map((v) => Math.round(255 - (255 - v) * 0.16)));
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

  // series
  for (const s of series) {
    const yOf = s.axis === 'y2' ? py2 : py;
    doc.setDrawColor(...s.rgb);
    doc.setFillColor(...s.rgb);
    if ((s.type || 'line') === 'scatter') {
      for (const p of s.q) doc.circle(px(p[0]), yOf(p[1]), 0.5, 'F');
    } else {
      doc.setLineWidth(s.width || 0.45);
      if (s.dash && doc.setLineDashPattern) doc.setLineDashPattern(s.dash, 0);
      for (let k = 1; k < s.q.length; k += 1) doc.line(px(s.q[k - 1][0]), yOf(s.q[k - 1][1]), px(s.q[k][0]), yOf(s.q[k][1]));
      if (s.dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
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
    if (item.type === 'scatter') doc.circle(lx + 2, ly, 0.6, 'F');
    else { doc.setLineWidth(0.6); doc.line(lx, ly, lx + 4, ly); }
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
