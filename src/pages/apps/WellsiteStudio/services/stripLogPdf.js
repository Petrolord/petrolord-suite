// The strip log as a PDF (upgrade U2-001, PL7): the same tracks the screen
// draws, as vectors, to a stated vertical scale, one page after another
// down the hole. Every page carries what a reviewer needs before signing:
// well, field, operator, rig, the depth reference and KB, the interval and
// scale, who prepared it and with which build. Text is Latin-1 only (the
// jsPDF standard fonts). Loaded on demand by the view: jsPDF must stay out
// of the workstation's mount graph.
import { jsPDF } from 'jspdf';
import { drawBrandHeader, loadPetrolordLogo } from '@/lib/pdfBrand';
import { depthTicks } from '../components/striplog/geometry';

const MARGIN = 10;
const HEAD_H = 14;
const MAX_PAGES = 60;
const latin = (t) => String(t == null ? '' : t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x00-\xff]/g, '?');
const rgb = (hex) => { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const fmt = (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : String(Number(v.toPrecision(3))));

/** The paper scale and the pages a window needs: 1:N, or the N that fits the window on one page. */
export function pdfLayout({ topM, baseM, scale, bodyMm }) {
  const span = baseM - topM;
  if (!(span > 0)) throw new Error('The depth window needs a base below its top.');
  const fitted = scale === 'fit' || !(Number(scale) > 0);
  const n = fitted ? Math.max(1, Math.ceil((span * 1000) / bodyMm)) : Number(scale);
  const mPerPage = (bodyMm * n) / 1000;
  const pages = Math.max(1, Math.ceil(span / mPerPage - 1e-9));
  if (pages > MAX_PAGES) throw new Error(`At 1:${n} this interval needs ${pages} pages. Choose a smaller scale or a shorter depth window (the limit is ${MAX_PAGES} pages).`);
  return { n, fitted, mPerPage, pages, mmPerM: 1000 / n };
}

/**
 * The PDF of a strip log model.
 * @param {Object} model { win, tracks, markers, notes, legend } from buildStripLog
 * @param {Object} o { well, unit, toDisplay, scale, window, reviewer: {kbElevM, preparedBy, build}, logo }
 */
export async function buildStripLogPdf(model, { well, unit = 'm', toDisplay = (m) => m, scale = 'fit', window: win = null, reviewer = {}, logo: logoIn } = {}) {
  if (!model || !model.win || !model.tracks.length) throw new Error('There is nothing to draw yet.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = logoIn === undefined ? await loadPetrolordLogo().catch(() => null) : logoIn;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const topM = win ? win.topM : model.win.topM;
  const baseM = win ? win.baseM : model.win.baseM;
  const h = (well && well.header) || {};
  const kb = Number.isFinite(reviewer.kbElevM) ? `${toDisplay(reviewer.kbElevM).toFixed(1)} ${unit} above MSL` : 'not set';
  const idLines = [
    `Well ${well ? well.name : 'n/a'}; field ${h.field || 'n/a'}; operator ${h.operator || 'n/a'}; rig ${h.rig || 'n/a'}.`,
    `Depths in ${unit}, measured depth (MD) below KB, increasing downward; KB ${kb}.`,
    `Prepared by ${reviewer.preparedBy || 'n/a'}; ${reviewer.build || 'Petrolord Suite, Wellsite Studio'}.`,
  ];
  const legend = model.legend || [];
  const notes = model.notes || [];
  const bodyTop = 30 + 6 + idLines.length * 4 + 4 + (legend.length ? 5 : 0) + notes.length * 3.5 + 4 + HEAD_H;
  const bodyMm = pageH - bodyTop - 12;
  const lay = pdfLayout({ topM, baseM, scale, bodyMm });
  const totalPx = model.tracks.reduce((a, t) => a + t.width, 0);
  const k = (pageW - 2 * MARGIN) / totalPx;
  let x = MARGIN;
  const tracks = model.tracks.map((t) => { const p = { ...t, x0: x, w: t.width * k }; x += p.w; return p; });

  for (let page = 0; page < lay.pages; page += 1) {
    if (page > 0) doc.addPage();
    const pTop = topM + page * lay.mPerPage;
    const pBase = Math.min(baseM, pTop + lay.mPerPage);
    const y = (mdM) => bodyTop + (mdM - pTop) * lay.mmPerM;
    const bodyH = (pBase - pTop) * lay.mmPerM;
    let ty = drawBrandHeader(doc, { logo, margin: MARGIN, pageWidth: pageW, appTitle: 'Wellsite Studio', subtitle: latin(`Strip log, ${well ? well.name : ''}`), rightLines: [latin(`${h.field || ''}${h.rig ? `, ${h.rig}` : ''}`), `Page ${page + 1} of ${lay.pages}`] }) + 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 41, 59);
    for (const line of idLines) { doc.text(latin(line), MARGIN, ty); ty += 4; }
    doc.text(latin(`Interval ${fmt(toDisplay(topM))} to ${fmt(toDisplay(baseM))} ${unit} MD; this page ${fmt(toDisplay(pTop))} to ${fmt(toDisplay(pBase))} ${unit}; vertical scale 1:${lay.n}${lay.fitted ? ' (fitted to one page)' : ''}.`), MARGIN, ty); ty += 4;
    if (legend.length) {
      let lx = MARGIN;
      doc.setFontSize(7);
      for (const l of legend) { doc.setFillColor(...rgb(l.color)); doc.setDrawColor(71, 85, 105); doc.rect(lx, ty - 2.4, 3, 3, 'FD'); doc.text(latin(l.name), lx + 4, ty); lx += 6 + doc.getTextWidth(latin(l.name)) + 3; }
      ty += 5;
    }
    doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
    for (const n of notes) { doc.text(latin(n), MARGIN, ty); ty += 3.5; }

    const headY = bodyTop - HEAD_H;
    const dTicks = depthTicks(toDisplay(pTop), toDisplay(pBase), (bodyH / 25.4) * 96).ticks;
    const fromDisp = (v) => pTop + ((v - toDisplay(pTop)) / (toDisplay(pBase) - toDisplay(pTop))) * (pBase - pTop);
    for (const t of tracks) {
      doc.setDrawColor(148, 163, 184); doc.setFillColor(248, 250, 252); doc.setLineWidth(0.2);
      doc.rect(t.x0, headY, t.w, HEAD_H, 'FD');
      doc.rect(t.x0, bodyTop, t.w, bodyH);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(15, 23, 42);
      doc.text(latin(t.title), t.x0 + t.w / 2, headY + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(51, 65, 85);
      if (t.unit) doc.text(latin(t.unit), t.x0 + t.w / 2, headY + 6.5, { align: 'center' });
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.1);
      for (const v of dTicks) { const yy = y(fromDisp(v)); doc.line(t.x0, yy, t.x0 + t.w, yy); }
      if (t.type === 'depth') {
        doc.setFontSize(6.5); doc.setTextColor(51, 65, 85);
        for (const v of dTicks) doc.text(fmt(v), t.x0 + t.w - 1, Math.min(bodyTop + bodyH - 0.5, y(fromDisp(v)) + 0.8), { align: 'right' });
      } else if (t.type === 'curve' && t.scale) {
        doc.setFontSize(5.5);
        doc.text(fmt(t.scale.min), t.x0 + 0.8, headY + HEAD_H - 1);
        doc.text(fmt(t.scale.max), t.x0 + t.w - 0.8, headY + HEAD_H - 1, { align: 'right' });
        const lo = t.scale.log ? Math.log10(t.scale.min) : t.scale.min; const hi = t.scale.log ? Math.log10(t.scale.max) : t.scale.max;
        const vx = (v) => (t.scale.log ? (v > 0 ? ((Math.log10(v) - lo) / (hi - lo)) * t.w : NaN) : ((v - lo) / (hi - lo)) * t.w);
        (t.series || []).forEach((s, i) => {
          const c = rgb(s.color);
          doc.setDrawColor(...c); doc.setTextColor(...c); doc.setLineWidth(s.dashed ? 0.2 : 0.3);
          doc.text(latin(s.label), t.x0 + 1 + i * (t.w / t.series.length), headY + 9.8);
          if (s.dashed) doc.setLineDashPattern([1, 0.8], 0); else doc.setLineDashPattern([], 0);
          let prev = null;
          for (const p of s.points) {
            if (p.mdM < pTop - 1e-9 || p.mdM > pBase + 1e-9) { prev = null; continue; }
            const px = vx(p.v);
            if (!Number.isFinite(px)) { prev = null; continue; }
            const cur = { x: t.x0 + Math.max(0, Math.min(t.w, px)), y: y(p.mdM) };
            if (prev && !s.markerOnly) doc.line(prev.x, prev.y, cur.x, cur.y);
            if (s.markers || s.markerOnly) { doc.setFillColor(...(p.flag ? [220, 38, 38] : c)); doc.circle(cur.x, cur.y, p.flag ? 0.6 : 0.4, 'F'); }
            prev = cur;
          }
          doc.setLineDashPattern([], 0);
        });
      } else if (t.type === 'lith') {
        for (const iv of t.intervals || []) {
          const y0 = Math.max(bodyTop, y(iv.topM)); const y1 = Math.min(bodyTop + bodyH, y(iv.baseM));
          if (!(y1 > y0)) continue;
          let lx = t.x0;
          for (const part of iv.parts) { const w = part.fraction * t.w; doc.setFillColor(...rgb(part.color)); doc.setDrawColor(71, 85, 105); doc.setLineWidth(0.05); doc.rect(lx, y0, w, y1 - y0, 'FD'); lx += w; }
        }
      } else if (t.type === 'text') {
        doc.setFontSize(5.5);
        let lastY = bodyTop;
        for (const it of t.items || []) {
          if (it.mdM < pTop - 1e-9 || it.mdM >= pBase) continue;
          const lines = doc.splitTextToSize(latin(it.text), t.w - 3);
          const yy = Math.max(y(it.mdM) + 2, lastY + 2);
          if (yy + (lines.length - 1) * 2.2 > bodyTop + bodyH) break;
          doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.15); doc.line(t.x0, y(it.mdM), t.x0 + 1.2, y(it.mdM));
          doc.setTextColor(...(it.color ? rgb(it.color) : [30, 41, 59]));
          doc.text(lines, t.x0 + 1.8, yy);
          lastY = yy + (lines.length - 1) * 2.2 + 0.4;
        }
      }
    }
    const labelTrack = tracks.find((t) => t.type === 'markers') || null;
    let lastLabelY = -Infinity;
    for (const m of model.markers || []) {
      if (m.mdM < pTop - 1e-9 || m.mdM > pBase + 1e-9) continue;
      const yy = y(m.mdM); const c = rgb(m.color);
      doc.setDrawColor(...c); doc.setLineWidth(0.3);
      if (m.dashed) doc.setLineDashPattern([1.5, 1], 0); else doc.setLineDashPattern([], 0);
      doc.line(MARGIN, yy, pageW - MARGIN, yy);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...c);
      const label = latin(`${m.label} ${fmt(toDisplay(m.mdM))} ${unit}`);
      // labels sit in their own track, each on its own line (a label pushed down keeps its line at the true depth)
      const ly = Math.max(yy - 0.6, lastLabelY + 2.3, bodyTop + 2.2);
      doc.setFontSize(5.5);
      if (labelTrack) { const lines = doc.splitTextToSize(label, labelTrack.w - 2); doc.text(lines, labelTrack.x0 + 1, ly); lastLabelY = ly + (lines.length - 1) * 2.2; } else { doc.text(label, pageW - MARGIN - 1, ly, { align: 'right' }); lastLabelY = ly; }
      doc.setFont('helvetica', 'normal');
    }
    doc.setFontSize(6); doc.setTextColor(100, 116, 139);
    doc.text(latin(`Petrolord Suite, Wellsite Studio. ${well ? well.name : ''} strip log, page ${page + 1} of ${lay.pages}.`), MARGIN, pageH - 6);
  }
  return doc;
}

export async function exportStripLogPdf(model, opts) {
  const doc = await buildStripLogPdf(model, opts);
  const name = `${String(opts.well ? opts.well.name : 'well').replace(/[^\w]+/g, '-').toLowerCase()}-strip-log.pdf`;
  doc.save(name);
  return name;
}
