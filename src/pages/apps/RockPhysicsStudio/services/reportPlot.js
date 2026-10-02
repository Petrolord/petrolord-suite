// Vector plots for the PDF report (U2-004, PL7): jsPDF lines and text on a
// white panel with the Petrolord mark, so they print sharp and pdftotext
// reads their labels (the Pore Pressure Studio report's pattern). Pure
// drawing on a passed jsPDF document; Latin-1 text only.

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

/**
 * Draw an x-y plot in the box (mm).
 * @param {object} doc jsPDF document
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {{title?: string, xTitle: string, yTitle: string, yDown?: boolean, logo?: object,
 *   series: Array<{name: string, rgb: number[], pts: number[][], kind?: 'line'|'points'|'diamonds', width?: number, dash?: number[]}>}} p
 * @returns {{drawn: Object<string, number>, x: number[], y: number[]}} points drawn per series and the axis ranges
 */
export function drawXY(doc, box, { title = '', xTitle, yTitle, yDown = false, series, logo = null, xDigits = null }) {
  const all = series.flatMap((s) => s.pts).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const drawn = {};
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(box.x, box.y, box.w, box.h, 'FD');
  if (!all.length) {
    doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text('No data to plot', box.x + box.w / 2, box.y + box.h / 2, { align: 'center' });
    return { drawn, x: [], y: [] };
  }
  const ext = (k) => [Math.min(...all.map((p) => p[k])), Math.max(...all.map((p) => p[k]))];
  const [xMin, xMax] = ext(0); const [yMin, yMax] = ext(1);
  const xt = niceTicks(xMin, xMax, 5); const yt = niceTicks(yMin, yMax, 7);
  const x0 = Math.min(xt[0] ?? xMin, xMin); const x1 = Math.max(xt[xt.length - 1] ?? xMax, xMax);
  const y0 = Math.min(yt[0] ?? yMin, yMin); const y1 = Math.max(yt[yt.length - 1] ?? yMax, yMax);
  const pad = { l: 15, r: 4, t: title ? 13 : 10, b: 11 };
  const px = (v) => box.x + pad.l + ((v - x0) / (x1 - x0 || 1)) * (box.w - pad.l - pad.r);
  const py = (v) => (yDown
    ? box.y + pad.t + ((v - y0) / (y1 - y0 || 1)) * (box.h - pad.t - pad.b)
    : box.y + box.h - pad.b - ((v - y0) / (y1 - y0 || 1)) * (box.h - pad.t - pad.b));
  const yTop = Math.min(py(y0), py(y1)); const yBot = Math.max(py(y0), py(y1));
  const fmtX = (t) => (xDigits === null ? String(t) : t.toFixed(xDigits));

  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.setDrawColor(226, 232, 240);
  for (const t of xt) {
    if (t < x0 || t > x1) continue;
    doc.line(px(t), yTop, px(t), yBot);
    doc.text(fmtX(t), px(t), yBot + 3.2, { align: 'center' });
  }
  for (const t of yt) {
    if (t < y0 || t > y1) continue;
    doc.line(px(x0), py(t), px(x1), py(t));
    doc.text(String(t), px(x0) - 1.2, py(t) + 1, { align: 'right' });
  }
  doc.setDrawColor(100, 116, 139);
  doc.rect(px(x0), yTop, px(x1) - px(x0), yBot - yTop);
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text(xTitle, (px(x0) + px(x1)) / 2, box.y + box.h - 2, { align: 'center' });
  // rotated text: jsPDF applies `align` before the rotation, so centre it by hand
  doc.text(yTitle, box.x + 3.8, (yTop + yBot) / 2 + doc.getTextWidth(yTitle) / 2, { angle: 90 });
  if (title) { doc.setFont('helvetica', 'bold'); doc.text(title, box.x + 2, box.y + 4); doc.setFont('helvetica', 'normal'); }

  for (const s of series) {
    const q = s.pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    drawn[s.name] = q.length;
    if (s.kind === 'points' || s.kind === 'diamonds') {
      for (const p of q) {
        const X = px(p[0]); const Y = py(p[1]);
        if (s.kind === 'diamonds') {
          doc.setDrawColor(...s.rgb); doc.setLineWidth(0.25);
          doc.line(X, Y - 0.8, X + 0.8, Y); doc.line(X + 0.8, Y, X, Y + 0.8); doc.line(X, Y + 0.8, X - 0.8, Y); doc.line(X - 0.8, Y, X, Y - 0.8);
        } else { doc.setFillColor(...s.rgb); doc.circle(X, Y, 0.55, 'F'); }
      }
      continue;
    }
    if (q.length < 2) continue;
    doc.setDrawColor(...s.rgb);
    doc.setLineWidth(s.width || 0.4);
    if (s.dash && doc.setLineDashPattern) doc.setLineDashPattern(s.dash, 0);
    for (let k = 1; k < q.length; k++) doc.line(px(q[k - 1][0]), py(q[k - 1][1]), px(q[k][0]), py(q[k][1]));
    if (s.dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
  }

  // legend under the title
  doc.setFontSize(6.5);
  let lx = px(x0); let ly = box.y + (title ? 8 : 5);
  for (const s of series) {
    const wName = 7 + doc.getTextWidth(s.name);
    if (lx + wName > box.x + box.w - 2) { lx = px(x0); ly += 3.2; }
    if (s.kind === 'points' || s.kind === 'diamonds') { doc.setFillColor(...s.rgb); doc.circle(lx + 2, ly, 0.6, 'F'); } else { doc.setDrawColor(...s.rgb); doc.setLineWidth(0.6); doc.line(lx, ly, lx + 4, ly); }
    doc.setTextColor(51, 65, 85);
    doc.text(s.name, lx + 5, ly + 1);
    lx += wName;
  }
  // the Petrolord mark in the bottom right of the plot area
  if (logo?.dataUrl) {
    const h = 4; const w = h * (logo.w && logo.h ? logo.w / logo.h : 3);
    try { doc.addImage(logo.dataUrl, 'PNG', px(x1) - w - 1, yBot - h - 1, w, h); } catch { /* the mark is decoration */ }
  } else {
    doc.setFontSize(6); doc.setTextColor(148, 163, 184);
    doc.text('Petrolord', px(x1) - 1, yBot - 1.2, { align: 'right' });
  }
  return { drawn, x: [x0, x1], y: [y0, y1] };
}
