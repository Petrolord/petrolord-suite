// A map a reviewer can print and sign (Mapping & Surface Studio upgrade
// U2-002, 2026-09-30; finding MAP-U1-026). One page, plotted to a stated
// scale: 1 mm on paper is N/1000 metres on the ground, whatever the XY unit
// of the frame (metres, feet or US survey feet). Vector contours with
// labels, fault and boundary polygons, wells, a coordinate grid in the
// map's own CRS units with labelled ticks, a scale bar in metres, a grid
// north arrow, a legend and a title block with the reviewer header
// (mapReport.mapCaption). Latin-1 text only (jsPDF standard fonts).
//
// planMapPlot is the pure geometry (tested for scale); buildMapPdf draws it.
// The same builder runs in jest (pdftotext reads its output) and in the
// browser.

import { jsPDF } from 'jspdf';
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { gridCorners } from '@/lib/gridding/gridmath';
import { niceStepUp } from '@/lib/gridding/numeric';
import { contourPaths } from '@/components/maps/mapPainter';
import { EMPTY_VALUE } from '@/lib/emptyValue';

export const STANDARD_SCALES = Object.freeze([1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000]);
export const PAPERS = Object.freeze({ A4: [297, 210], A3: [420, 297], A2: [594, 420] });

const LATIN1_SWAPS = [[/[‒-―]/g, '-'], [/[‘’]/g, "'"], [/[“”]/g, '"'], [/…/g, '...'], [/≤/g, '<='], [/≥/g, '>='], [/→/g, '->'], [/ /g, ' ']];
/** Text safe for jsPDF's standard fonts. */
export function latin1(value) {
  let s = String(value ?? '');
  for (const [re, to] of LATIN1_SWAPS) s = s.replace(re, to);
  return s.replace(/[^\u0000-ÿ]/g, '?');
}

const fmtScale = (n) => `1:${Math.round(n).toLocaleString('en-US')}`;

/** Page layout in mm for a paper and orientation (landscape by default). */
export function pageLayout(paper = 'A3', orientation = 'landscape') {
  const p = PAPERS[paper];
  if (!p) throw new Error(`Unknown paper size "${paper}" (A4, A3 or A2).`);
  const [w, h] = orientation === 'portrait' ? [p[1], p[0]] : p;
  const margin = 12;
  const header = 30;
  const titleBlock = 46;
  return {
    pageW: w, pageH: h, margin,
    frame: { x: margin + 6, y: header + 8, w: w - 2 * margin - 12, h: h - header - 8 - titleBlock - 6 },
    titleY: h - titleBlock,
  };
}

/**
 * The plot geometry: which scale, where every world point lands on paper.
 * @param {{spec:{x0,y0,dx,dy,nx,ny,rotation_deg?}, xyToM?:number, paper?:string,
 *   orientation?:'landscape'|'portrait', scale?:?number}} p
 *   scale: the N of 1:N; null picks the largest standard scale that fits.
 * @returns {{scale:number, auto:boolean, mmPerUnit:number, layout, bbox, worldToPage:(x,y)=>{x,y},
 *   gridStepUnits:number, scaleBarM:number, scaleBarMm:number, mapMm:{w:number,h:number}}}
 */
export function planMapPlot({ spec, xyToM = 1, paper = 'A3', orientation = 'landscape', scale = null }) {
  if (!(xyToM > 0) || !Number.isFinite(xyToM)) throw new Error('A map in a geographic CRS (degrees) cannot be plotted to a scale. Set a projected CRS.');
  const layout = pageLayout(paper, orientation);
  const cs = gridCorners(spec);
  const bbox = {
    x0: Math.min(...cs.map((c) => c.x)), x1: Math.max(...cs.map((c) => c.x)),
    y0: Math.min(...cs.map((c) => c.y)), y1: Math.max(...cs.map((c) => c.y)),
  };
  const wM = (bbox.x1 - bbox.x0) * xyToM;
  const hM = (bbox.y1 - bbox.y0) * xyToM;
  const need = Math.max((wM * 1000) / layout.frame.w, (hM * 1000) / layout.frame.h);
  let n;
  let auto = false;
  if (scale == null || scale === '') {
    n = STANDARD_SCALES.find((s) => s >= need);
    if (!n) throw new Error(`The map is ${(wM / 1000).toFixed(1)} by ${(hM / 1000).toFixed(1)} km: too large for 1:1,000,000 on ${paper}. Pick a larger paper.`);
    auto = true;
  } else {
    n = Number(scale);
    if (!(n > 0) || !Number.isFinite(n)) throw new Error('Type the scale as the N of 1:N, for example 25000.');
    if (n < need) {
      const fit = STANDARD_SCALES.find((s) => s >= need);
      throw new Error(`At ${fmtScale(n)} the map needs ${Math.round((wM * 1000) / n)} by ${Math.round((hM * 1000) / n)} mm; the ${paper} ${orientation} frame is ${Math.floor(layout.frame.w)} by ${Math.floor(layout.frame.h)} mm. ${fit ? `Use ${fmtScale(fit)} on ${paper}, or a larger paper.` : 'Use a larger paper.'}`);
    }
  }
  const mmPerUnit = (xyToM * 1000) / n;
  const mapMm = { w: wM * 1000 / n, h: hM * 1000 / n };
  const ox = layout.frame.x + (layout.frame.w - mapMm.w) / 2;
  const oy = layout.frame.y + (layout.frame.h + mapMm.h) / 2; // page y of bbox.y0 (paper y runs down)
  const worldToPage = (x, y) => ({ x: ox + (x - bbox.x0) * mmPerUnit, y: oy - (y - bbox.y0) * mmPerUnit });
  // grid lines about 40 mm apart, a round number of map units
  const gridStepUnits = niceStepUp((40 / 1000) * n / xyToM);
  // a scale bar about a quarter of the frame, a round number of metres
  const scaleBarM = niceStepUp((layout.frame.w / 4 / 1000) * n) / 2;
  return { scale: n, auto, mmPerUnit, layout, bbox, worldToPage, gridStepUnits, scaleBarM, scaleBarMm: (scaleBarM * 1000) / n, mapMm };
}

const fmtCoord = (v) => Math.round(v).toLocaleString('en-US');
const fmtLen = (m) => (m >= 1000 ? `${Number((m / 1000).toFixed(2))} km` : `${Number(m.toFixed(1))} m`);

/**
 * @param {Object} p
 * @param {Object} p.surface display meta (name, kind, z_domain, crs, xy_unit, provenance)
 * @param {Float32Array} p.grid values in DATA units (metres for lengths)
 * @param {Object} p.spec frame
 * @param {{title:string, caption:string[]}} p.caption mapCaption output
 * @param {{stepM:?number, stepText:string, format:(v:number)=>string}} p.contours the display contour plan
 * @param {Array<{name:string, x:number, y:number}>} [p.wells]
 * @param {Array<{name:string, kind:string, rings:Array<Array<[number,number]>>}>} [p.polygons]
 * @param {number} [p.xyToM] @param {string} [p.paper] @param {string} [p.orientation] @param {?number} [p.scale]
 * @param {string} [p.xyUnitLabel] e.g. 'metres', 'US survey feet'
 * @returns {Promise<{doc: jsPDF, plan: object, fileName: string, contourLevels: number}>}
 */
export async function buildMapPdf({
  surface, grid, spec, caption, contours, wells = [], polygons = [], xyToM = 1,
  paper = 'A3', orientation = 'landscape', scale = null, xyUnitLabel = 'metres', logo = undefined,
}) {
  const plan = planMapPlot({ spec, xyToM, paper, orientation, scale });
  const { layout, worldToPage: w2p, bbox } = plan;
  const doc = new jsPDF({ orientation, unit: 'mm', format: paper.toLowerCase() });
  const brandLogo = logo === undefined ? await loadPetrolordLogo() : logo;
  drawBrandHeader(doc, {
    logo: brandLogo, margin: layout.margin, pageWidth: layout.pageW, appTitle: 'Mapping & Surface Studio',
    subtitle: latin1(caption.title), rightLines: [`Scale ${fmtScale(plan.scale)} on ${paper} ${orientation}`, 'Print at 100%, no fit to page'],
  });

  // map frame
  const f = layout.frame;
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.3);
  doc.rect(f.x, f.y, f.w, f.h);
  const inFrame = (p) => p.x >= f.x - 0.01 && p.x <= f.x + f.w + 0.01 && p.y >= f.y - 0.01 && p.y <= f.y + f.h + 0.01;

  // coordinate grid in the CRS units, ticks labelled on the frame edges
  doc.setFontSize(6.5);
  doc.setTextColor(90, 90, 90);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.1);
  const g = plan.gridStepUnits;
  const left = bbox.x0 - (f.w / plan.mmPerUnit); const right = bbox.x1 + (f.w / plan.mmPerUnit);
  const bottom = bbox.y0 - (f.h / plan.mmPerUnit); const top = bbox.y1 + (f.h / plan.mmPerUnit);
  let eastings = 0;
  for (let x = Math.ceil(left / g) * g; x <= right; x += g) {
    const p = w2p(x, 0);
    if (p.x < f.x || p.x > f.x + f.w) continue;
    doc.line(p.x, f.y, p.x, f.y + f.h);
    doc.text(fmtCoord(x), p.x, f.y + f.h + 3.2, { align: 'center' });
    eastings += 1;
  }
  for (let y = Math.ceil(bottom / g) * g; y <= top; y += g) {
    const p = w2p(0, y);
    if (p.y < f.y || p.y > f.y + f.h) continue;
    doc.line(f.x, p.y, f.x + f.w, p.y);
    doc.text(fmtCoord(y), f.x - 1.2, p.y + 1, { align: 'right' });
  }

  // contours (vector), majors heavier and labelled
  const cp = contourPaths(grid, spec, { step: contours?.stepM || null });
  const majorEvery = 5;
  cp.paths.forEach((polys, li) => {
    const lvl = cp.levels[li];
    const major = Math.abs(Math.round(lvl / cp.step)) % majorEvery === 0;
    doc.setDrawColor(major ? 20 : 90, major ? 20 : 90, major ? 20 : 90);
    doc.setLineWidth(major ? 0.35 : 0.15);
    for (const pts of polys) {
      for (let k = 2; k < pts.length; k += 2) {
        const a = w2p(pts[k - 2], pts[k - 1]); const b = w2p(pts[k], pts[k + 1]);
        if (inFrame(a) && inFrame(b)) doc.line(a.x, a.y, b.x, b.y);
      }
      if (major && pts.length >= 8) {
        const m = Math.floor(pts.length / 4) * 2;
        const at = w2p(pts[m], pts[m + 1]);
        if (inFrame(at)) {
          doc.setFontSize(6);
          doc.setTextColor(20, 20, 20);
          doc.text(latin1(contours?.format ? contours.format(lvl) : String(lvl)), at.x, at.y - 0.6, { align: 'center' });
        }
      }
    }
  });

  // polygons: faults and boundaries
  for (const poly of polygons) {
    const fault = poly.kind === 'fault_polygon';
    doc.setDrawColor(fault ? 180 : 0, fault ? 120 : 130, fault ? 0 : 160);
    doc.setLineWidth(fault ? 0.4 : 0.3);
    for (const ring of poly.rings || []) {
      for (let k = 0; k < ring.length; k++) {
        const a = w2p(ring[k][0], ring[k][1]); const b = w2p(ring[(k + 1) % ring.length][0], ring[(k + 1) % ring.length][1]);
        if (inFrame(a) && inFrame(b)) doc.line(a.x, a.y, b.x, b.y);
      }
    }
  }

  // wells
  doc.setFontSize(6.5);
  let wellsDrawn = 0;
  for (const wl of wells) {
    if (!Number.isFinite(wl.x) || !Number.isFinite(wl.y)) continue;
    const p = w2p(wl.x, wl.y);
    if (!inFrame(p)) continue;
    doc.setDrawColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
    doc.circle(p.x, p.y, 0.8, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(latin1(wl.name), p.x + 1.4, p.y - 1);
    wellsDrawn += 1;
  }

  // north arrow (grid north: the frame is the CRS grid)
  const nx = f.x + f.w - 10; const ny = f.y + 6;
  doc.setDrawColor(0, 0, 0); doc.setFillColor(0, 0, 0); doc.setLineWidth(0.3);
  doc.triangle(nx, ny, nx - 2.5, ny + 8, nx + 2.5, ny + 8, 'F');
  doc.setFontSize(8); doc.setTextColor(0, 0, 0);
  doc.text('N', nx, ny + 12, { align: 'center' });
  doc.setFontSize(5.5);
  doc.text('Grid north', nx, ny + 15, { align: 'center' });

  // title block
  const ty = layout.titleY;
  const tx = layout.margin;
  const tw = layout.pageW - 2 * layout.margin;
  doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.3);
  doc.rect(tx, ty, tw, 40);
  doc.line(tx + tw * 0.62, ty, tx + tw * 0.62, ty + 40);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text(latin1(caption.title), tx + 3, ty + 7);
  doc.setFontSize(8);
  const capW = tw * 0.62 - 6;
  let cy = ty + 13;
  for (const line of caption.caption) {
    for (const l of doc.splitTextToSize(latin1(line), capW)) {
      if (cy > ty + 38) break;
      doc.text(l, tx + 3, cy);
      cy += 4;
    }
  }
  // legend and scale in the right cell
  const rx = tx + tw * 0.62 + 4;
  doc.setFontSize(8);
  doc.text(`Scale ${fmtScale(plan.scale)}   XY in ${latin1(xyUnitLabel)}   grid every ${fmtCoord(g)} map units`, rx, ty + 6);
  // scale bar in metres, four segments
  const barY = ty + 11;
  const seg = plan.scaleBarMm / 2;
  doc.setLineWidth(0.2);
  for (let i = 0; i < 2; i++) {
    doc.setFillColor(i % 2 ? 255 : 0, i % 2 ? 255 : 0, i % 2 ? 255 : 0);
    doc.rect(rx + i * seg, barY, seg, 1.6, 'FD');
  }
  doc.setFontSize(6.5);
  doc.text('0', rx, barY + 4.6, { align: 'center' });
  doc.text(fmtLen(plan.scaleBarM / 2), rx + seg, barY + 4.6, { align: 'center' });
  doc.text(fmtLen(plan.scaleBarM), rx + 2 * seg, barY + 4.6, { align: 'center' });
  // legend rows
  let ly = ty + 22;
  const legend = (draw, text) => { draw(rx, ly - 1); doc.setTextColor(0, 0, 0); doc.text(latin1(text), rx + 10, ly); ly += 4; };
  doc.setFontSize(7);
  legend((x, y) => { doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.35); doc.line(x, y, x + 8, y); },
    `Contour, every ${majorEvery}th labelled (interval ${latin1(contours?.stepText || EMPTY_VALUE)})`);
  if (polygons.some((p) => p.kind === 'fault_polygon')) legend((x, y) => { doc.setDrawColor(180, 120, 0); doc.setLineWidth(0.4); doc.line(x, y, x + 8, y); }, 'Fault polygon');
  if (polygons.some((p) => p.kind === 'boundary')) legend((x, y) => { doc.setDrawColor(0, 130, 160); doc.setLineWidth(0.3); doc.line(x, y, x + 8, y); }, 'Boundary');
  if (wellsDrawn) legend((x, y) => { doc.setFillColor(0, 0, 0); doc.circle(x + 4, y, 0.8, 'F'); }, `Well (${wellsDrawn})`);

  const safe = String(surface?.name || 'map').replace(/[^\w-]+/g, '_');
  return { doc, plan, fileName: `${safe}-${paper}-1_${plan.scale}.pdf`, contourLevels: cp.levels.length, wellsDrawn, eastings };
}
