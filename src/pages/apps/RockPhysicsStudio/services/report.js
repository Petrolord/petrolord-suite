// The report a reviewer can sign (U2-004, PL7, 2026-10-01). U1 gave the
// substitution a CSV with a reviewer header; a reviewer signs a page, so
// this is the page: the same header block (substitutionCsv.reportHeader,
// one source), the interval means before and after, both fluids, the AVO
// of the zone top in situ and substituted, and three vector plots (velocity
// against depth with depth downward, impedance against Vp/Vs, reflectivity
// against angle). Estimated inputs say estimated. Latin-1 text only, so
// jsPDF's standard fonts print it and pdftotext reads it back.

import { drawBrandHeader } from '@/lib/pdfBrand';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { reportHeader } from './substitutionCsv';
import { describeFluid } from './publish';
import { impedanceDisplay, impedanceAxis } from './elastic';
import {
  fmtVelocity, fmtDensity, velocityToDisplay, depthToDisplay, velocityLabel,
} from './units';
import { crossplotPoints } from './crossplot';
import { drawXY } from './reportPlot';
import { zoeppritzRpp, shuey, avoClass } from '../engine/avo';
import { meanAt } from './prep';

export const latin1 = (t) => String(t ?? '')
  .replace(/[‒-―−]/g, '-')
  .replace(/[•·]/g, '.')
  .replace(/φ/g, 'phi').replace(/θ/g, 'theta').replace(/ρ/g, 'rho')
  .replace(/10⁶/g, '1e6').replace(/³/g, '3').replace(/²/g, '2').replace(/⁶/g, '6')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?');

const num = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);
const PLOT_MAX = 400;

/** Halfspaces across the zone top (mean logs within windowM either side) and their AVO. */
export function zoneTopAvo(model, logs, zone, windowM = 10) {
  const up = []; const lo = [];
  for (let i = 0; i < model.depth.length; i++) {
    const d = model.depth[i];
    if (d >= zone.top_md_m - windowM && d < zone.top_md_m) up.push(i);
    else if (d >= zone.top_md_m && d <= Math.min(zone.base_md_m, zone.top_md_m + windowM)) lo.push(i);
  }
  const u = [meanAt(model.vp, up), meanAt(model.vs, up), meanAt(model.rho, up)];
  const l = [meanAt(logs.vp, lo), meanAt(logs.vs, lo), meanAt(logs.rho, lo)];
  if (![...u, ...l].every(Number.isFinite)) return null;
  try {
    const { a, b } = shuey(...u, ...l, 0);
    const curve = [];
    for (let th = 0; th <= 40; th += 2) curve.push([th, zoeppritzRpp(...u, ...l, th).re]);
    return { a, b, cls: avoClass(a, b), curve, upper: u, lower: l };
  } catch { return null; }
}

/** The report's text blocks (exported so tests and the CSV can read the same words). */
export function reportBlocks(args) {
  const { model, zone, result, scenario, rock, units } = args;
  const vU = units.velocity; const dU = units.density;
  const header = reportHeader({ ...args, sub: result.sub, indices: result.indices });
  const row = (label, s) => [label, fmtVelocity(s.vp, vU, 1), fmtVelocity(s.vs, vU, 1), fmtDensity(s.rho, dU, 1),
    impedanceDisplay(s.ai, vU, dU).text, num(s.vpvs, 3), num(s.pr, 3)];
  const interval = {
    head: ['Interval mean', velocityLabel(vU).replace('Velocity', 'Vp').replace('Slowness', 'DTp'), velocityLabel(vU).replace('Velocity', 'Vs').replace('Slowness', 'DTs'),
      `Density (${dU})`, `AI (${impedanceDisplay(1, vU, dU).unit})`, 'Vp/Vs', 'Poisson'],
    rows: [row('before (fluid A)', result.before), row('after (fluid B)', result.after)],
  };
  const avoA = zoneTopAvo(model, model, zone);
  const avoB = zoneTopAvo(model, result.merged, zone);
  const avo = {
    head: ['Zone top AVO', 'Intercept A', 'Gradient B', 'Class'],
    rows: [
      ['in situ', num(avoA?.a, 4), num(avoA?.b, 4), avoA ? avoA.cls : EMPTY_VALUE],
      [`zone with ${describeFluid(scenario.fluidB)}`, num(avoB?.a, 4), num(avoB?.b, 4), avoB ? avoB.cls : EMPTY_VALUE],
    ],
    avoA,
    avoB,
  };
  const notes = [];
  if (model.vsSource === 'estimated') notes.push(`Vs is ESTIMATED (${model.vsMethod === 'iterative' ? 'Greenberg-Castagna, iterated through brine in hydrocarbon samples' : 'Greenberg-Castagna on the VSH sand and shale split'}): there is no shear log on this well, so Vp/Vs, Poisson's ratio and the gradient B rest on that regression.`);
  if (model.vpSource === 'estimated') notes.push(`Vp is ESTIMATED (${model.vpNote || 'pseudo-sonic'}): there is no sonic log on this well, so every velocity, impedance and reflectivity here is indicative only.`);
  if (rock.phiConst && !model.phiCurve) notes.push(`Porosity is the constant ${rock.phiConst}: the well has no porosity curve.`);
  notes.push('Gassmann assumes connected pores, a uniform frame and low frequency; it does not hold in shale or tight rock, which is why samples outside the limits keep their in-situ values.');
  return { header, interval, avo, notes: notes.map(latin1) };
}

/**
 * The PDF document (not saved: the caller saves it or reads its bytes).
 * @param {Function} JsPDF the jsPDF constructor
 * @param {{well, zone, model, result, scenario, rock, units, reviewer?, now?, build?}} args
 *   result = computeZoneResult's output (indices, sub, merged, before, after)
 */
export function substitutionPdf(JsPDF, args, { logo = null } = {}) {
  const { well, zone, model, result, scenario, units } = args;
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const blocks = reportBlocks(args);
  drawBrandHeader(doc, {
    logo, margin, pageWidth: pageW, appTitle: 'Rock Physics Studio', subtitle: 'Gassmann fluid substitution and AVO',
    rightLines: [latin1(`${well?.name || ''} | ${zone.name}`)],
  });
  let y = 37;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  // reviewer block: label in bold, text wrapped
  for (const [k, v] of blocks.header) {
    if (k === 'Report') continue;
    const label = latin1(`${k}: `);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(latin1(v || 'not given'), pageW - 2 * margin - 34);
    doc.text(wrapped, margin + 34, y);
    y += 3.7 * wrapped.length;
  }
  y += 2;
  const table = (t, widths) => {
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = (pageW - 2 * margin) / total;
    const xs = widths.map((_, k) => margin + widths.slice(0, k + 1).reduce((a, b) => a + b, 0) * scale);
    doc.setFont('helvetica', 'bold');
    t.head.forEach((h, k) => (k === 0 ? doc.text(latin1(h), margin, y) : doc.text(latin1(h), xs[k] - 1, y, { align: 'right' })));
    doc.setFont('helvetica', 'normal');
    y += 1.2;
    doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 3.4;
    for (const r of t.rows) {
      r.forEach((c, k) => (k === 0 ? doc.text(latin1(c), margin, y) : doc.text(latin1(c), xs[k] - 1, y, { align: 'right' })));
      y += 4;
    }
    y += 2;
  };
  table(blocks.interval, [34, 24, 24, 26, 34, 18, 18]);
  table(blocks.avo, [70, 30, 30, 20]);

  // plots: velocity against depth, impedance against Vp/Vs, reflectivity against angle
  const zU = units.depth;
  const vU = units.velocity;
  const step = Math.max(1, Math.ceil(result.indices.length / PLOT_MAX));
  const idx = result.indices.filter((_, k) => k % step === 0);
  const vd = (x) => velocityToDisplay(x, vU);
  const depthPts = (arr) => idx.map((i) => [vd(arr[i]), depthToDisplay(model.depth[i], zU)]);
  const gap = 4;
  const plotH = Math.min(92, pageH - y - 30);
  const w3 = (pageW - 2 * margin - 2 * gap) / 3;
  const drawn = {};
  drawn.depth = drawXY(doc, { x: margin, y, w: w3, h: plotH }, {
    title: 'Velocity against depth',
    xTitle: latin1(velocityLabel(vU)),
    yTitle: `MD (${zU}), downward`,
    yDown: true,
    logo,
    series: [
      { name: 'Vp in situ', rgb: [2, 132, 199], pts: depthPts(model.vp), width: 0.4 },
      { name: 'Vp substituted', rgb: [220, 38, 38], pts: depthPts(result.sub.vp), width: 0.4 },
      { name: 'Vs in situ', rgb: [2, 132, 199], pts: depthPts(model.vs), width: 0.3, dash: [1, 0.8] },
      { name: 'Vs substituted', rgb: [220, 38, 38], pts: depthPts(result.sub.vs), width: 0.3, dash: [1, 0.8] },
    ],
  });
  const axis = impedanceAxis(vU, units.density);
  const xp = crossplotPoints(model, result.indices, result.sub, 'depth', PLOT_MAX);
  drawn.crossplot = drawXY(doc, { x: margin + w3 + gap, y, w: w3, h: plotH }, {
    title: 'Impedance against Vp/Vs',
    xTitle: latin1(`AI (${axis.unit})`),
    yTitle: 'Vp/Vs',
    logo,
    xDigits: axis.digits,
    series: [
      { name: 'in situ', rgb: [15, 23, 42], kind: 'points', pts: xp.inSitu.map((p) => [p.ai * axis.factor, p.vpvs]) },
      { name: 'substituted', rgb: [217, 119, 6], kind: 'diamonds', pts: xp.substituted.map((p) => [p.ai * axis.factor, p.vpvs]) },
    ],
  });
  drawn.avo = drawXY(doc, { x: margin + 2 * (w3 + gap), y, w: w3, h: plotH }, {
    title: 'Zone top reflectivity',
    xTitle: 'Incidence angle (deg)',
    yTitle: 'Rpp (exact Zoeppritz)',
    logo,
    series: [
      { name: 'in situ', rgb: [15, 23, 42], pts: blocks.avo.avoA?.curve || [], width: 0.45 },
      { name: 'substituted', rgb: [217, 119, 6], pts: blocks.avo.avoB?.curve || [], width: 0.45 },
    ],
  });
  y += plotH + 5;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(7.5);
  if (step > 1) {
    doc.text(latin1(`Plots draw every ${step}th of ${result.indices.length} zone samples; the tables and the CSV use every sample.`), margin, y);
    y += 3.6;
  }
  for (const n of blocks.notes) {
    const wrapped = doc.splitTextToSize(n, pageW - 2 * margin);
    if (y + 3.4 * wrapped.length > pageH - 16) { doc.addPage(); y = 16; }
    doc.text(wrapped, margin, y);
    y += 3.4 * wrapped.length + 0.6;
  }
  // signature line
  y = Math.max(y + 6, pageH - 22);
  if (y > pageH - 10) { doc.addPage(); y = 30; }
  doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.2);
  doc.line(margin, y, margin + 70, y);
  doc.line(pageW - margin - 70, y, pageW - margin, y);
  doc.setFontSize(7);
  doc.text(latin1(`Prepared by: ${args.reviewer?.analyst || ''}`), margin, y + 3.5);
  doc.text('Reviewed by:', pageW - margin - 70, y + 3.5);
  args.plotsDrawn = drawn;
  args.fluidsLine = latin1(`${describeFluid(scenario.fluidA)} to ${describeFluid(scenario.fluidB)}`);
  return doc;
}

/** File name: rock-physics_<well>_<zone>.pdf (safe characters only). */
export const substitutionPdfName = (well, zone) => `rock-physics_${String(well?.name || 'well').replace(/[^A-Za-z0-9-]+/g, '_')}_${String(zone?.name || 'zone').replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`;
