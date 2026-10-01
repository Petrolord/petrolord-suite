// The prognosis plot in the PDF (AppUpgrade PP-U2-011, PL7). A reviewer
// signs the curve, so the report draws it: vector lines in jsPDF (no
// screenshot, so it prints sharp and its labels are text pdftotext reads),
// on the house chart standard (white panel, the Petrolord mark in the
// corner). Depth runs downward in the chosen depth frame; pressure in the
// display unit (an EMW unit against the stated datum). Overburden,
// hydrostatic, pore and fracture pressure, the drilling window margins and
// the casing shoes when designed, and the calibration points by kind.
// Pure drawing on a passed jsPDF document; Latin-1 text only.

import {
  depthToDisplay, pressureToDisplay, pressureFromDisplay, emwReferenceDepthM, emwDatumLabel, isEmw, pressureLabel,
} from './units';
import { thinIndices } from './thin';
import { comparesTo } from './calibrationImport';
import { refLabel } from './depthRef';

/** Round tick steps (1, 2, 2.5, 5 x 10^k) covering [lo, hi] with about `n` ticks. */
export function niceTicks(lo, hi, n = 6) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) { hi = lo + 1; }
  const raw = (hi - lo) / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  const out = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9 * step; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

const SERIES = [
  { key: 'overburdenPa', name: 'Overburden', rgb: [49, 54, 59], width: 0.35 },
  { key: 'hydrostaticPa', name: 'Hydrostatic', rgb: [42, 157, 143], width: 0.35 },
  { key: 'porePressurePa', name: 'Pore pressure', rgb: [193, 18, 31], width: 0.6 },
  { key: 'fracPressurePa', name: 'Fracture pressure', rgb: [69, 105, 144], width: 0.45 },
];

/**
 * Draw the plot in the box (mm). Returns the drawn extent for tests.
 * @param {object} doc jsPDF document
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {{input, result, params, units, calibration?, casing?, mapper?, logo?}} a
 */
export function drawPrognosisPlot(doc, box, a) {
  const { input, result, params, units } = a;
  const zU = units.depth; const pU = units.pressure;
  const mapZ = (zBml) => depthToDisplay(a.mapper ? a.mapper.fromBml(zBml) : zBml, zU);
  const conv = (pa, zBml) => pressureToDisplay(pa, pU, emwReferenceDepthM(zBml, params));
  const idx = thinIndices(input.zBmlM.length);
  const pts = SERIES.map((s) => idx.map((i) => [conv(result[s.key][i], input.zBmlM[i]), mapZ(input.zBmlM[i])]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  const cas = a.casing && !a.casing.error ? a.casing : null;
  const casPts = cas ? ['mudPpg', 'designFgPpg'].map((k) => cas.zBmlM.map((z, j) => [conv(pressureFromDisplay(cas[k][j], 'ppg', emwReferenceDepthM(z, params)), z), mapZ(z)])) : [];
  const cal = (a.calibration || []).filter((c) => Number.isFinite(c.z) && Number.isFinite(c.pMpa))
    .map((c) => ({ kind: comparesTo(c), p: [conv(c.pMpa * 1e6, c.z), mapZ(c.z)] }));
  const all = [...pts.flat(), ...casPts.flat(), ...cal.map((c) => c.p)].filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  let xMin = Math.min(...all.map((p) => p[0])); let xMax = Math.max(...all.map((p) => p[0]));
  const yMin = Math.min(...all.map((p) => p[1])); const yMax = Math.max(...all.map((p) => p[1]));
  if (isEmw(pU)) { xMin = Math.max(xMin, Math.min(...pts[1].map((p) => p[0])) - 1); }
  const xt = niceTicks(xMin, xMax, 6); const yt = niceTicks(yMin, yMax, 8);
  const x0 = Math.min(xt[0] ?? xMin, xMin); const x1 = Math.max(xt[xt.length - 1] ?? xMax, xMax);
  const y0 = Math.min(yt[0] ?? yMin, yMin); const y1 = Math.max(yt[yt.length - 1] ?? yMax, yMax);
  const pad = { l: 16, r: 4, t: 14, b: 12 };
  const px = (v) => box.x + pad.l + ((v - x0) / (x1 - x0 || 1)) * (box.w - pad.l - pad.r);
  const py = (d) => box.y + pad.t + ((d - y0) / (y1 - y0 || 1)) * (box.h - pad.t - pad.b); // depth downward
  const inBox = (p) => p[0] >= x0 - 1e-9 && p[0] <= x1 + 1e-9;

  // white panel and frame (house chart standard)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(box.x, box.y, box.w, box.h, 'FD');
  // grid and ticks
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.setDrawColor(226, 232, 240);
  for (const t of xt) {
    if (t < x0 || t > x1) continue;
    doc.line(px(t), py(y0), px(t), py(y1));
    doc.text(String(t), px(t), py(y1) + 3.5, { align: 'center' });
  }
  for (const t of yt) {
    if (t < y0 || t > y1) continue;
    doc.line(px(x0), py(t), px(x1), py(t));
    doc.text(String(t), px(x0) - 1.2, py(t) + 1, { align: 'right' });
  }
  doc.setDrawColor(100, 116, 139);
  doc.rect(px(x0), py(y0), px(x1) - px(x0), py(y1) - py(y0));
  // axis titles
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  const xTitle = isEmw(pU) ? `${pressureLabel(pU)} below ${emwDatumLabel(params)}` : pressureLabel(pU);
  doc.text(xTitle, (px(x0) + px(x1)) / 2, box.y + box.h - 2, { align: 'center' });
  const yTitle = `Depth (${zU} ${a.mapper ? refLabel(a.mapper.key) : 'below mudline'})`;
  doc.text(yTitle, box.x + 3.5, (py(y0) + py(y1)) / 2, { angle: 90, align: 'center' });

  const poly = (p, rgb, width, dash = null) => {
    const q = p.filter(inBox);
    if (q.length < 2) return 0;
    doc.setDrawColor(...rgb);
    doc.setLineWidth(width);
    if (dash && doc.setLineDashPattern) doc.setLineDashPattern(dash, 0);
    for (let k = 1; k < q.length; k++) doc.line(px(q[k - 1][0]), py(q[k - 1][1]), px(q[k][0]), py(q[k][1]));
    if (dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
    return q.length;
  };
  const drawn = {};
  SERIES.forEach((s, k) => { drawn[s.key] = poly(pts[k], s.rgb, s.width); });
  if (cas) {
    drawn.mud = poly(casPts[0], [124, 58, 237], 0.35, [1.2, 0.8]);
    drawn.designFg = poly(casPts[1], [69, 105, 144], 0.3, [0.6, 0.8]);
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.4);
    doc.setFontSize(6.5);
    cas.seats.forEach((s, k) => {
      const yy = py(mapZ(s.zBmlM));
      doc.line(px(x0), yy, px(x1), yy);
      doc.text(`Shoe ${k + 1}`, px(x1) - 1, yy - 0.8, { align: 'right' });
    });
    drawn.seats = cas.seats.length;
  }
  // calibration points: circles for pressures, squares for LOT/FIT, small dots for mud weights
  doc.setLineWidth(0.25);
  drawn.cal = 0;
  for (const c of cal) {
    if (!inBox(c.p)) continue;
    const X = px(c.p[0]); const Y = py(c.p[1]);
    if (c.kind === 'fg') { doc.setFillColor(29, 78, 216); doc.rect(X - 0.9, Y - 0.9, 1.8, 1.8, 'F'); } else if (c.kind === 'mw') { doc.setFillColor(161, 98, 7); doc.circle(X, Y, 0.5, 'F'); } else { doc.setFillColor(231, 111, 81); doc.circle(X, Y, 0.9, 'F'); }
    drawn.cal += 1;
  }
  // legend across the top
  doc.setFontSize(6.5);
  let lx = px(x0);
  const legend = [...SERIES.map((s) => [s.name, s.rgb]), ...(cas ? [['Mud weight (PP + trip)', [124, 58, 237]], ['Design FG (FG - kick)', [69, 105, 144]]] : []),
    ...(cal.some((c) => c.kind === 'pp') ? [['Calibration', [231, 111, 81]]] : []), ...(cal.some((c) => c.kind === 'fg') ? [['LOT/FIT', [29, 78, 216]]] : [])];
  let ly = box.y + 4;
  for (const [name, rgb] of legend) {
    const wName = 7 + doc.getTextWidth(name);
    if (lx + wName > box.x + box.w - 2) { lx = px(x0); ly += 3.5; }
    doc.setDrawColor(...rgb); doc.setLineWidth(0.6);
    doc.line(lx, ly, lx + 4, ly);
    doc.setTextColor(51, 65, 85);
    doc.text(name, lx + 5, ly + 1);
    lx += wName;
  }
  // the Petrolord mark (ChartLogo) in the bottom right of the plot area
  if (a.logo?.dataUrl) {
    const h = 5; const w = h * (a.logo.w && a.logo.h ? a.logo.w / a.logo.h : 3);
    try { doc.addImage(a.logo.dataUrl, 'PNG', px(x1) - w - 1, py(y1) - h - 1, w, h); } catch { /* the mark is decoration */ }
  } else {
    doc.setFontSize(6); doc.setTextColor(148, 163, 184);
    doc.text('Petrolord', px(x1) - 1, py(y1) - 1.5, { align: 'right' });
  }
  return { xRange: [x0, x1], yRange: [y0, y1], xTicks: xt, yTicks: yt, drawn, xTitle, yTitle };
}
