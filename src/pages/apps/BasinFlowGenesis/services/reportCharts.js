// The plots in the Basin report (AppUpgrade BF-U2-011, PL7). The PDF said
// what the model computed and showed none of it; a reviewer signs the
// burial history, the maturity and the events chart, so the report draws
// them: vector shapes in jsPDF (sharp in print, every label is text that
// pdftotext reads), on the house chart standard (white panel, the
// Petrolord mark in the corner). Time runs from the oldest age on the left
// to the present on the right; depth runs downward. Latin-1 text only.

import { depthToDisplay } from './units';
import { burialChartRows, erodedSections, layerKey, eventsChartRows, MATURITY_WINDOWS, SERIES_COLORS } from './resultsView';

const LITH_RGB = {
  sandstone: [244, 162, 97], shale: [69, 105, 144], limestone: [42, 157, 143], salt: [233, 196, 106], coal: [49, 54, 59], mixed: [148, 163, 184],
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));

/** Round ticks (1, 2, 2.5, 5 x 10^k) covering [lo, hi] with about n ticks. */
export function niceTicks(lo, hi, n = 6) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  const out = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9 * step; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

function frame(doc, box, { title, xTitle, yTitle, x0, x1, y0, y1, xt, yt, logo }) {
  const pad = { l: 16, r: 4, t: 12, b: 11 };
  const px = (v) => box.x + pad.l + ((x0 - v) / (x0 - x1 || 1)) * (box.w - pad.l - pad.r); // age: old left
  const py = (v) => box.y + pad.t + ((v - y0) / (y1 - y0 || 1)) * (box.h - pad.t - pad.b);
  doc.setFillColor(255, 255, 255); doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
  doc.rect(box.x, box.y, box.w, box.h, 'FD');
  doc.setFontSize(8); doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold');
  doc.text(title, box.x + box.w / 2, box.y + 4.5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(71, 85, 105); doc.setDrawColor(226, 232, 240);
  for (const t of xt) { if ((t - x1) * (t - x0) > 1e-9) continue; doc.line(px(t), py(y0), px(t), py(y1)); doc.text(String(t), px(t), py(y1) + 3.3, { align: 'center' }); }
  for (const t of yt) { if ((t - y0) * (t - y1) > 1e-9) continue; doc.line(px(x0), py(t), px(x1), py(t)); doc.text(String(t), px(x0) - 1.2, py(t) + 1, { align: 'right' }); }
  doc.setDrawColor(100, 116, 139); doc.rect(px(x0), py(y0), px(x1) - px(x0), py(y1) - py(y0));
  doc.setFontSize(7); doc.setTextColor(51, 65, 85);
  doc.text(xTitle, (px(x0) + px(x1)) / 2, box.y + box.h - 1.8, { align: 'center' });
  doc.text(yTitle, box.x + 3.5, (py(y0) + py(y1)) / 2, { angle: 90, align: 'center' });
  const mark = () => {
    if (logo?.dataUrl) {
      const h = 5; const w = h * (logo.w && logo.h ? logo.w / logo.h : 3);
      try { doc.addImage(logo.dataUrl, 'PNG', px(x1) - w - 1, py(y1) - h - 1, w, h); return; } catch { /* decoration */ }
    }
    doc.setFontSize(6); doc.setTextColor(148, 163, 184);
    doc.text('Petrolord', px(x1) - 1, py(y1) - 1.5, { align: 'right' });
  };
  return { px, py, mark };
}

function polygon(doc, pts, rgb, style = 'F') {
  if (pts.length < 3) return false;
  const [x, y] = pts[0];
  const d = []; for (let i = 1; i < pts.length; i++) d.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  doc.setFillColor(...rgb);
  doc.lines(d, x, y, [1, 1], style, true);
  return true;
}

function legend(doc, items, x, y, maxX) {
  doc.setFontSize(6.5);
  let lx = x; let ly = y;
  for (const [name, rgb, kind] of items) {
    const w = 7 + doc.getTextWidth(name);
    if (lx + w > maxX) { lx = x; ly += 3.4; }
    if (kind === 'box') { doc.setFillColor(...rgb); doc.rect(lx, ly - 1.2, 4, 2.2, 'F'); } else { doc.setDrawColor(...rgb); doc.setLineWidth(0.6); doc.line(lx, ly, lx + 4, ly); }
    doc.setTextColor(51, 65, 85); doc.text(name, lx + 5, ly + 1);
    lx += w;
  }
  return ly;
}

/** Burial history: each layer filled between its top and base through time; the eroded section hatched grey. */
export function drawBurialChart(doc, box, { results, units, latin1 = (t) => t, logo = null }) {
  const zU = units.depth;
  const rows = burialChartRows(results, (m) => depthToDisplay(m, zU));
  const ages = rows.map((r) => r.age);
  const x0 = Math.max(...ages); const x1 = 0;
  const depths = rows.flatMap((r) => Object.values(r).filter(Array.isArray).flat());
  const y1 = Math.max(...depths, 1);
  const xt = niceTicks(0, x0, 8); const yt = niceTicks(0, y1, 7);
  const { px, py, mark } = frame(doc, box, { title: latin1('Burial history'), xTitle: 'Age (Ma)', yTitle: latin1(`Depth (${zU})`), x0, x1, y0: 0, y1: Math.max(y1, yt[yt.length - 1] || y1), xt, yt, logo });
  const drawn = { layers: 0, eroded: 0 };
  const series = (key) => rows.filter((r) => Array.isArray(r[key])).map((r) => [r.age, r[key]]);
  results.meta.layers.forEach((l, li) => {
    const s = series(layerKey(l, li));
    const pts = [...s.map(([a, v]) => [px(a), py(v[0])]), ...s.slice().reverse().map(([a, v]) => [px(a), py(v[1])])];
    if (polygon(doc, pts, LITH_RGB[l.lithology] || [100, 116, 139])) drawn.layers += 1;
  });
  for (const e of erodedSections(results)) {
    const s = series(e.key);
    const pts = [...s.map(([a, v]) => [px(a), py(v[0])]), ...s.slice().reverse().map(([a, v]) => [px(a), py(v[1])])];
    if (polygon(doc, pts, [226, 232, 240])) {
      drawn.eroded += 1;
      doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.3);
      if (doc.setLineDashPattern) doc.setLineDashPattern([1, 0.8], 0);
      doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'S', true);
      if (doc.setLineDashPattern) doc.setLineDashPattern([], 0);
    }
  }
  const items = results.meta.layers.map((l) => [latin1(l.name), LITH_RGB[l.lithology] || [100, 116, 139], 'box']);
  for (const e of erodedSections(results)) items.push([latin1(`Eroded section (removed at ${e.erodeAge} Ma)`), [203, 213, 225], 'box']);
  legend(doc, items, px(x0), box.y + 8, box.x + box.w - 2);
  mark();
  return drawn;
}

/** Maturity (%Ro) through time per layer, on the oil, wet gas and dry gas windows. */
export function drawMaturityChart(doc, box, { results, latin1 = (t) => t, logo = null }) {
  const { data, meta } = results;
  const all = data.maturity.flat().map((e) => e.value).filter(Number.isFinite);
  const top = Math.max(2.5, Math.ceil(((all.length ? Math.max(...all) : 0) + 0.25) * 2) / 2);
  const x0 = Math.max(...data.timeSteps);
  const { px, py, mark } = frame(doc, box, { title: latin1('Maturity (Easy%Ro)'), xTitle: 'Age (Ma)', yTitle: 'Vitrinite reflectance (%Ro)', x0, x1: 0, y0: top, y1: 0, xt: niceTicks(0, x0, 8), yt: niceTicks(0, top, 6), logo });
  for (const w of MATURITY_WINDOWS) {
    const a = py(Math.min(w.to, top)); const b = py(w.from);
    const rgb = hex(w.fill).map((c) => Math.round(255 - (255 - c) * 0.18));
    doc.setFillColor(...rgb); doc.rect(px(x0), a, px(0) - px(x0), b - a, 'F');
    doc.setFontSize(6); doc.setTextColor(71, 85, 105); doc.text(latin1(w.label), px(x0) + 1, a + 2.5);
  }
  let n = 0;
  meta.layers.forEach((l, li) => {
    const s = (data.maturity[li] || []).filter((e) => Number.isFinite(e.value));
    if (s.length < 2) return;
    doc.setDrawColor(...hex(SERIES_COLORS[li % SERIES_COLORS.length])); doc.setLineWidth(0.45);
    for (let k = 1; k < s.length; k++) doc.line(px(s[k - 1].age), py(Math.min(top, s[k - 1].value)), px(s[k].age), py(Math.min(top, s[k].value)));
    n += 1;
  });
  legend(doc, meta.layers.map((l, li) => [latin1(l.name), hex(SERIES_COLORS[li % SERIES_COLORS.length]), 'line']), px(x0), box.y + 8, box.x + box.w - 2);
  mark();
  return { lines: n };
}

/** Petroleum-system events chart (Magoon and Dow): bars by element, critical moment marked. */
export function drawEventsChart(doc, box, { results, latin1 = (t) => t, logo = null }) {
  const { rows, criticalMoment } = eventsChartRows(results);
  const x0 = Math.max(...results.data.timeSteps);
  const pad = { l: 30, r: 4, t: 9, b: 10 };
  const px = (a) => box.x + pad.l + ((x0 - a) / (x0 || 1)) * (box.w - pad.l - pad.r);
  doc.setFillColor(255, 255, 255); doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
  doc.rect(box.x, box.y, box.w, box.h, 'FD');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text(latin1('Petroleum system events'), box.x + box.w / 2, box.y + 4.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  const rowH = (box.h - pad.t - pad.b) / Math.max(1, rows.length);
  let bars = 0;
  rows.forEach((r, i) => {
    const y = box.y + pad.t + i * rowH;
    doc.setFontSize(6.5); doc.setTextColor(51, 65, 85);
    doc.text(latin1(r.label), box.x + 2, y + rowH / 2 + 1);
    doc.setFillColor(...hex(r.color));
    for (const iv of r.intervals) {
      const [a, b] = iv.interval;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      doc.rect(px(a), y + rowH * 0.2, Math.max(0.4, px(b) - px(a)), rowH * 0.6, 'F');
      bars += 1;
    }
  });
  doc.setFontSize(6.5); doc.setTextColor(71, 85, 105); doc.setDrawColor(203, 213, 225);
  for (const t of niceTicks(0, x0, 8)) doc.text(String(t), px(t), box.y + box.h - 5, { align: 'center' });
  doc.text('Age (Ma)', box.x + pad.l + (box.w - pad.l - pad.r) / 2, box.y + box.h - 1.5, { align: 'center' });
  if (criticalMoment != null) {
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.5);
    doc.line(px(criticalMoment), box.y + pad.t, px(criticalMoment), box.y + box.h - pad.b);
    doc.setTextColor(220, 38, 38); doc.text(latin1(`Critical moment ${criticalMoment} Ma`), px(criticalMoment) + 1, box.y + pad.t - 1);
  }
  if (logo?.dataUrl) {
    try { doc.addImage(logo.dataUrl, 'PNG', box.x + box.w - 17, box.y + box.h - 7, 15, 5); } catch { /* decoration */ }
  } else { doc.setFontSize(6); doc.setTextColor(148, 163, 184); doc.text('Petrolord', box.x + box.w - 2, box.y + box.h - 1.5, { align: 'right' }); }
  return { bars, criticalMoment };
}
