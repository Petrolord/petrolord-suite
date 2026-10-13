// Well Design Studio report pack (WD6): the three deliverable PDFs —
// wall plot, survey listing, anti-collision report — on the house
// jsPDF + autotable pattern (ReservoirCalcPro ReportGenerator is the
// exemplar: brand header with the transparent watermark logo, fitted
// text, footer page numbers, jest-tested against a mocked jsPDF).
// Charts are drawn as VECTORS (lines into the page, never rasterized
// DOM) so wall plots stay crisp at print scale.
//
// All generators take prepared data (a trajectory contract, EOU
// overlays, a serialized wp_ac_runs row) and return the jsPDF doc —
// the caller saves it.

// Named import: the default export is not a constructor in node ESM
// (the e2e spec runs this module in node to recompute expectations).
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { minOf, maxOf, extentOf } from './extent';
import { exaggerationLabel } from './sectionScale';
import { EMPTY_VALUE } from '../../../../lib/emptyValue.js';

// ---------------------------------------------------------------------------
// brand chrome
// ---------------------------------------------------------------------------

// Transparent-background brand mark (petrolord-icon.png is a JPEG with
// a baked-in dark background — never use it on report surfaces).
let _logoPromise;
function loadPetrolordLogo() {
  if (_logoPromise) return _logoPromise;
  _logoPromise = (async () => {
    try {
      const resp = await fetch('/petrolord-chart-watermark.png');
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = dataUrl;
      });
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const targetH = 240;
      if (h > targetH) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round((w / h) * targetH);
          canvas.height = targetH;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
        } catch { /* fall back to the original */ }
      }
      return { dataUrl, w, h };
    } catch {
      return null;
    }
  })();
  return _logoPromise;
}

function brandHeader(doc, { logo, title, subtitle }) {
  const pageWidth = doc.internal.pageSize.width;
  doc.setFillColor(15, 23, 42); // slate-900 band
  doc.rect(0, 0, pageWidth, 18, 'F');
  if (logo) {
    const h = 10;
    const w = (logo.w / logo.h) * h;
    doc.addImage(logo.dataUrl, 'PNG', 6, 4, w, h);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(title, logo ? 6 + (logo.w / logo.h) * 10 + 4 : 8, 9);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text(subtitle, logo ? 6 + (logo.w / logo.h) * 10 + 4 : 8, 14);
  doc.setTextColor(30, 41, 59);
}

function footer(doc, note) {
  const pages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 140);
    doc.text(note, 8, pageHeight - 5);
    doc.text(`Page ${i} of ${pages}`, pageWidth - 8, pageHeight - 5, { align: 'right' });
  }
}

const fmtNum = (v, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : EMPTY_VALUE);
// convergence and declination to 4 decimals, as the app shows them (the
// header printed 0.07291183644136559)
const fmtAngle = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? EMPTY_VALUE : Number(v).toFixed(4));

// ---------------------------------------------------------------------------
// depth unit (2026-10-13): the report pack prints depths and lengths in the
// wellbore's depth unit, as the app shows them. Site coordinates (easting,
// northing of the wellhead) stay in the CRS metres. Geometry is drawn in
// metres: a uniform scale does not change a true-scale chart.
// ---------------------------------------------------------------------------

const FT_PER_M = 1 / 0.3048;

/**
 * Display helpers for a depth unit.
 * @param {'m'|'ft'} unit
 * @returns {{unit: string, len: function(number): number, dls: function(number): number, dlsLabel: string}}
 */
export function reportUnits(unit = 'm') {
  const ft = unit === 'ft';
  return {
    unit: ft ? 'ft' : 'm',
    len: (m) => (Number.isFinite(m) ? (ft ? m * FT_PER_M : m) : m),
    // dogleg severity: deg per 30 m becomes deg per 100 ft
    dls: (d30m) => (Number.isFinite(d30m) ? (ft ? (d30m * 30.48) / 30 : d30m) : d30m),
    dlsLabel: ft ? 'deg/100ft' : 'deg/30m',
  };
}
const unitOfContract = (contract) => (contract?.wellbore?.depthUnit === 'ft' ? 'ft' : 'm');

// ---------------------------------------------------------------------------
// vector chart primitives
// ---------------------------------------------------------------------------

/** Fit world points into a page rect. flipY: world +y draws upward.
 *  equalAspect fixes y mm-per-unit to `ratio` times x mm-per-unit
 *  (1 = true scale). */
function makeMapper(rect, xs, ys, {
  flipY = true, equalAspect = false, ratio = 1, pad = 0.06,
} = {}) {
  const ex = extentOf(xs); const ey = extentOf(ys);
  let minX = ex.min; let maxX = ex.max;
  let minY = ey.min; let maxY = ey.max;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  minX -= spanX * pad; maxX += spanX * pad;
  minY -= spanY * pad; maxY += spanY * pad;
  let sx = rect.w / (maxX - minX);
  let sy = rect.h / (maxY - minY);
  if (equalAspect) {
    const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    const s = Math.min(sx, sy / r);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    minX = cx - rect.w / s / 2; maxX = cx + rect.w / s / 2;
    minY = cy - rect.h / (s * r) / 2; maxY = cy + rect.h / (s * r) / 2;
    sx = s; sy = s * r;
  }
  return {
    x: (wx) => rect.x + (wx - minX) * sx,
    y: (wy) => (flipY ? rect.y + rect.h - (wy - minY) * sy : rect.y + (wy - minY) * sy),
    sx,
    sy,
    minX,
    maxX,
    minY,
    maxY,
  };
}

function frameRect(doc, rect, title) {
  doc.setDrawColor(148, 163, 184);
  doc.rect(rect.x, rect.y, rect.w, rect.h);
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(title, rect.x + 1.5, rect.y - 1.5);
}

function polyline(doc, pts) {
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
}

// how an offset was scanned, as the AC report prints it
const OFFSET_KIND_LABEL = { geo: 'registry', 'wp-plan': 'plan', 'wp-actual': 'actual survey' };

/** Plan view: N vs E path + targets + EOU ellipses (all metres). */
export function drawPlanView(doc, rect, { stations, targets = [], ellipses = [], unit = 'm' }) {
  frameRect(doc, rect, `Plan view (N vs E, ${unit})`);
  const xs = stations.map((s) => s.e).concat(targets.map((t) => t.e));
  const ys = stations.map((s) => s.n).concat(targets.map((t) => t.n));
  const m = makeMapper(rect, xs.length ? xs : [0], ys.length ? ys : [0], { equalAspect: true });
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(exaggerationLabel(1), rect.x + 2, rect.y + 4);
  // EOU ellipses (approximated as 24-gon vectors)
  doc.setDrawColor(2, 132, 199);
  for (const el of ellipses) {
    const az = ((el.azimuthDeg || 0) * Math.PI) / 180;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const th = (i / 24) * 2 * Math.PI;
      const u = el.semiMajor * Math.cos(th);
      const v = el.semiMinor * Math.sin(th);
      const dn = u * Math.cos(az) - v * Math.sin(az);
      const de = u * Math.sin(az) + v * Math.cos(az);
      pts.push([m.x(el.e + de), m.y(el.n + dn)]);
    }
    polyline(doc, pts);
  }
  // targets
  doc.setDrawColor(180, 83, 9);
  for (const t of targets) {
    const r = (t.radius || 0) * m.sx;
    if (r > 0.5) doc.circle(m.x(t.e), m.y(t.n), r);
    doc.circle(m.x(t.e), m.y(t.n), 0.6, 'F');
    doc.setFontSize(6);
    doc.text(String(t.name || ''), m.x(t.e) + 1.5, m.y(t.n) - 1);
  }
  // path
  doc.setDrawColor(22, 101, 52);
  doc.setLineWidth(0.5);
  polyline(doc, stations.map((s) => [m.x(s.e), m.y(s.n)]));
  doc.setLineWidth(0.2);
  return m;
}

/** Section view: TVD (down) vs VS + optional EOU band rows. True
 *  scale by default (the on-screen tester case: independent axis fits
 *  drew a 3 deg/30 m build as a corner); `ratio` (TVD mm-per-unit over
 *  VS mm-per-unit) exaggerates, and the factor is printed on the plot
 *  either way. */
export function drawSectionView(doc, rect, {
  stations, band = null, ratio = 1, unit = 'm',
}) {
  frameRect(doc, rect, `Section view (TVD vs VS, ${unit})`);
  const xs = stations.map((s) => s.vs).concat([0]);
  const ys = stations.map((s) => s.tvd)
    .concat(band ? band.down.map((r) => r.tvd) : [])
    .concat(band ? band.up.map((r) => r.tvd) : []);
  const m = makeMapper(rect, xs, ys, { flipY: false, equalAspect: true, ratio });
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text(exaggerationLabel(ratio), rect.x + 2, rect.y + 4);
  if (band) {
    doc.setDrawColor(2, 132, 199);
    polyline(doc, band.up.map((r) => [m.x(r.vs), m.y(r.tvd)]));
    polyline(doc, band.down.map((r) => [m.x(r.vs), m.y(r.tvd)]));
  }
  doc.setDrawColor(22, 101, 52);
  doc.setLineWidth(0.5);
  polyline(doc, stations.map((s) => [m.x(s.vs), m.y(s.tvd)]));
  doc.setLineWidth(0.2);
  return m;
}

/** SF ladder: per-offset SF vs reference MD + thresholds. */
export function drawSfLadder(doc, rect, { results, thresholds, unit = '' }) {
  frameRect(doc, rect, `Separation factor vs reference MD${unit ? ` (${unit})` : ''}, SF clipped at 5`);
  const CLIP = 5;
  const allMd = results.flatMap((r) => r.md);
  const m = makeMapper(rect, allMd.length ? allMd : [0, 1], [0, CLIP], { flipY: true, pad: 0.03 });
  doc.setDrawColor(185, 28, 28);
  doc.setLineDashPattern?.([1.2, 1.2], 0);
  doc.line(rect.x, m.y(thresholds.noGo), rect.x + rect.w, m.y(thresholds.noGo));
  doc.setDrawColor(217, 119, 6);
  doc.line(rect.x, m.y(thresholds.review), rect.x + rect.w, m.y(thresholds.review));
  doc.setLineDashPattern?.([], 0);
  const palette = [[29, 78, 216], [180, 83, 9], [15, 118, 110], [124, 58, 237], [190, 24, 93]];
  results.forEach((r, i) => {
    const c = palette[i % palette.length];
    doc.setDrawColor(c[0], c[1], c[2]);
    polyline(doc, r.md.map((md, j) => [m.x(md), m.y(Math.min(r.sf[j], CLIP))]));
  });
  // legend under the frame (2026-10-13: drawn inside the top left it sat
  // over the curves, which start high on the left)
  doc.setFontSize(6);
  let lx = rect.x;
  let ly = rect.y + rect.h + 4;
  results.forEach((r, i) => {
    const c = palette[i % palette.length];
    const label = String(r.label);
    const w = (typeof doc.getTextWidth === 'function' ? doc.getTextWidth(label) : label.length * 1.1) + 9;
    if (lx + w > rect.x + rect.w && lx > rect.x) { lx = rect.x; ly += 3.5; }
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(0.6);
    doc.line(lx, ly - 1, lx + 5, ly - 1);
    doc.setLineWidth(0.2);
    doc.setTextColor(15, 23, 42);
    doc.text(label, lx + 6, ly);
    lx += w;
  });
  m.legendBottom = results.length ? ly + 1 : rect.y + rect.h;
  return m;
}

// ---------------------------------------------------------------------------
// report generators
// ---------------------------------------------------------------------------

function headerRowsFromContract(contract, magRef, u = reportUnits(unitOfContract(contract))) {
  return [
    ['Well', contract.wellbore.name ?? EMPTY_VALUE, 'Site', contract.site?.name ?? EMPTY_VALUE],
    ['UWI', contract.wellbore.uwi ?? EMPTY_VALUE, 'Site CRS', contract.site?.crs ?? 'unset'],
    ['Wellhead', `${fmtNum(contract.wellbore.headX)} E, ${fmtNum(contract.wellbore.headY)} N`, 'KB elevation', `${fmtNum(u.len(contract.wellbore.kbElevM))} ${u.unit}`],
    ['Design', contract.design ? `${contract.design.name} r${contract.design.revision} (${contract.design.status})` : EMPTY_VALUE, 'Source', contract.source],
    ['Azimuth ref', `${contract.wellbore.azimuthReference} (listing: grid)`, 'Convergence', `${fmtAngle(contract.wellbore.gridConvergenceDeg)} deg`],
    ...(u.unit === 'ft' ? [['Depth unit', 'feet (depths, offsets, VS)', 'Wellhead coordinates', 'site CRS metres']] : []),
    ['Declination', `${fmtAngle(contract.wellbore.magDeclinationDeg)} deg`, 'Geomagnetics',
      magRef ? `WMM2025: ${fmtNum(magRef.bTotalNT, 0)} nT, dip ${fmtNum(magRef.dipDeg)} deg` : EMPTY_VALUE],
  ];
}

/**
 * Wall plot: A4 landscape — title block, plan + section vectors with
 * EOU, key-station table, target table.
 */
export async function generateWallPlot({
  contract, targets = [], uncertainty = null, magRef = null, generatedAt = '', depthUnit = null,
}) {
  const u = reportUnits(depthUnit || unitOfContract(contract));
  const logo = await loadPetrolordLogo();
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  brandHeader(doc, {
    logo,
    title: `Wall plot: ${contract.wellbore.name ?? 'well'}`,
    subtitle: `${contract.design ? `${contract.design.name} r${contract.design.revision}` : ''} · generated ${generatedAt}`,
  });

  // title block (left column)
  doc.autoTable({
    startY: 22,
    margin: { left: 8 },
    tableWidth: 90,
    head: [['Well header', '', '', '']],
    body: headerRowsFromContract(contract, magRef, u),
    styles: { fontSize: 6.5, cellPadding: 0.8 },
    headStyles: { fillColor: [30, 41, 59], fontSize: 7 },
    theme: 'grid',
  });

  // charts: plan (left under header) + section (right half)
  const chartTop = (doc.lastAutoTable?.finalY ?? 60) + 6;
  drawPlanView(doc, { x: 8, y: chartTop, w: 90, h: pageHeight - chartTop - 12 }, {
    stations: contract.stations,
    targets,
    ellipses: uncertainty?.ellipses || [],
    unit: u.unit,
  });
  drawSectionView(doc, { x: 104, y: 26, w: pageWidth - 104 - 74, h: pageHeight - 26 - 12 }, {
    stations: contract.stations,
    band: uncertainty?.band || null,
    unit: u.unit,
  });

  // key stations (right column): first + every ~10th + TD
  const key = contract.stations.filter((s, i) => i === 0
    || i === contract.stations.length - 1
    || i % Math.max(1, Math.floor(contract.stations.length / 18)) === 0);
  doc.autoTable({
    startY: 26,
    margin: { left: pageWidth - 70 },
    tableWidth: 62,
    head: [u.unit === 'ft' ? ['MD ft', 'Inc', 'Azi', 'TVD ft', 'N ft', 'E ft'] : ['MD', 'Inc', 'Azi', 'TVD', 'N', 'E']],
    body: key.map((s) => [
      fmtNum(u.len(s.md), 0), fmtNum(s.inc), fmtNum(s.azi), fmtNum(u.len(s.tvd), 0),
      fmtNum(u.len(s.n), 0), fmtNum(u.len(s.e), 0),
    ]),
    styles: { fontSize: 5.8, cellPadding: 0.6 },
    headStyles: { fillColor: [30, 41, 59], fontSize: 6 },
    theme: 'grid',
  });
  if (targets.length) {
    doc.autoTable({
      startY: (doc.lastAutoTable?.finalY ?? 100) + 3,
      margin: { left: pageWidth - 70 },
      tableWidth: 62,
      head: [u.unit === 'ft' ? ['Target', 'TVDSS ft', 'N ft', 'E ft', 'Radius ft'] : ['Target', 'TVDSS', 'N', 'E']],
      body: targets.map((t) => (u.unit === 'ft'
        ? [t.name, fmtNum(u.len(t.tvdss), 1), fmtNum(u.len(t.n), 0), fmtNum(u.len(t.e), 0), t.radius ? fmtNum(u.len(t.radius), 0) : EMPTY_VALUE]
        : [t.name, fmtNum(t.tvdss, 0), fmtNum(t.n, 0), fmtNum(t.e, 0)])),
      styles: { fontSize: 5.8, cellPadding: 0.6 },
      headStyles: { fillColor: [120, 53, 15], fontSize: 6 },
      theme: 'grid',
    });
  }

  footer(doc, `Petrolord Well Design Studio · petrolord-trajectory v${contract.version} · minimum-curvature engine, ISCWSA MWD Rev4 uncertainty (2 sigma)`);
  return doc;
}

/** Survey listing: portrait, full station table. */
export async function generateSurveyListing({
  contract, magRef = null, generatedAt = '', depthUnit = null,
}) {
  const u = reportUnits(depthUnit || unitOfContract(contract));
  const U = u.unit;
  const logo = await loadPetrolordLogo();
  const doc = new jsPDF();
  brandHeader(doc, {
    logo,
    title: `Survey listing: ${contract.wellbore.name ?? 'well'}`,
    subtitle: `${contract.design ? `${contract.design.name} r${contract.design.revision} (${contract.design.status})` : ''} · generated ${generatedAt}`,
  });
  doc.autoTable({
    startY: 22,
    head: [['Well header', '', '', '']],
    body: headerRowsFromContract(contract, magRef, u),
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 41, 59] },
    theme: 'grid',
  });
  doc.autoTable({
    startY: (doc.lastAutoTable?.finalY ?? 60) + 4,
    head: [[`MD (${U})`, 'Inc (deg)', 'Azi grid (deg)', `TVD (${U})`, `TVDSS (${U})`, `N (${U})`, `E (${U})`, `DLS (${u.dlsLabel})`, `VS (${U})`]],
    body: contract.stations.map((s) => [
      fmtNum(u.len(s.md), 2), fmtNum(s.inc, 2), fmtNum(s.azi, 2), fmtNum(u.len(s.tvd), 2),
      fmtNum(u.len(s.tvdss), 2), fmtNum(u.len(s.n), 2), fmtNum(u.len(s.e), 2), fmtNum(u.dls(s.dls30m), 2), fmtNum(u.len(s.vs), 2),
    ]),
    styles: { fontSize: 6.5, cellPadding: 0.8 },
    headStyles: { fillColor: [30, 41, 59], fontSize: 7 },
    theme: 'striped',
  });
  const td = contract.stations[contract.stations.length - 1];
  doc.setFontSize(8);
  doc.text(
    `TD: ${fmtNum(u.len(td.md), 1)} ${U} MD / ${fmtNum(u.len(td.tvd), 1)} ${U} TVD · closure ${fmtNum(u.len(Math.hypot(td.n, td.e)), 1)} ${U} · max DLS ${fmtNum(u.dls(maxOf(contract.stations, (s) => s.dls30m)), 2)} ${u.dlsLabel}`,
    8,
    (doc.lastAutoTable?.finalY ?? 250) + 6,
  );
  footer(doc, `Petrolord Well Design Studio · petrolord-trajectory v${contract.version} · minimum-curvature engine (oracle-gated)`);
  return doc;
}

/** Anti-collision report from a serialized wp_ac_runs row. */
export async function generateAcReport({
  run, wellName = '', designLabel = '', generatedAt = '', depthUnit = 'm',
}) {
  const u = reportUnits(depthUnit);
  const U = u.unit;
  const L = (m, dp) => fmtNum(u.len(Number(m)), dp);
  const logo = await loadPetrolordLogo();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  brandHeader(doc, {
    logo,
    title: `Anti-collision report: ${wellName}`,
    subtitle: `${designLabel} · reference: ${run.reference} · run ${new Date(run.created_at ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')} · generated ${generatedAt}`,
  });

  const p = run.params || {};
  doc.autoTable({
    startY: 22,
    head: [['Separation rule (SPE-187073)', '', '', '']],
    body: [
      ['k (probability factor)', p.k ?? EMPTY_VALUE, 'sigma pa (projection ahead)',
        U === 'ft' ? `${p.sigmaPa != null ? L(p.sigmaPa, 2) : EMPTY_VALUE} ft` : `${p.sigmaPa ?? EMPTY_VALUE} m`],
      ['Surface margin Sm', U === 'ft' ? `${p.Sm != null ? L(p.Sm, 2) : EMPTY_VALUE} ft` : `${p.Sm ?? EMPTY_VALUE} m`, 'Radii ref / offset',
        U === 'ft'
          ? `${p.refRadius != null ? L(p.refRadius, 2) : EMPTY_VALUE} / ${p.offRadius != null ? L(p.offRadius, 2) : EMPTY_VALUE} ft`
          : `${p.refRadius ?? EMPTY_VALUE} / ${p.offRadius ?? EMPTY_VALUE} m`],
      ['No-go below SF', p.noGo ?? 1.0, 'Review below SF', p.review ?? 1.5],
      ['Error model', 'ISCWSA MWD Rev4 (oracle-gated)', 'Overall status', (run.summary?.status ?? EMPTY_VALUE).toUpperCase()],
    ],
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 41, 59] },
    theme: 'grid',
  });

  doc.autoTable({
    startY: (doc.lastAutoTable?.finalY ?? 60) + 4,
    head: [['Offset well', 'Kind', 'Status', 'Min SF', `At ref MD (${U})`, `Min C-C (${U})`]],
    body: (run.results || []).map((r) => [
      r.label, OFFSET_KIND_LABEL[r.kind] || r.kind || '', (r.status || '').toUpperCase(), fmtNum(r.minSf, 2),
      L(r.minSfMd, 0), L(minOf(r.distanceCC), 1),
    ]),
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 41, 59] },
    theme: 'striped',
  });

  // vector SF ladder
  const ladderY = (doc.lastAutoTable?.finalY ?? 90) + 8;
  const ladder = drawSfLadder(doc, { x: 10, y: ladderY, w: pageWidth - 20, h: 70 }, {
    results: run.results || [],
    thresholds: { noGo: p.noGo ?? 1.0, review: p.review ?? 1.5 },
    unit: U,
  });

  // violations
  const violations = [];
  for (const r of (run.results || [])) {
    for (let i = 0; i < r.md.length; i++) {
      if (r.sf[i] < (p.review ?? 1.5)) {
        violations.push([
          r.label, L(r.md[i], 0), fmtNum(r.sf[i], 2), L(r.distanceCC[i], 1),
          r.sf[i] < (p.noGo ?? 1.0) ? 'NO-GO' : 'REVIEW',
        ]);
      }
    }
  }
  doc.autoTable({
    startY: Math.max(ladderY + 76, (ladder?.legendBottom ?? 0) + 4),
    head: [['Offset', `Ref MD (${U})`, 'SF', `C-C dist (${U})`, 'Level']],
    body: violations.length ? violations : [['No stations below the review threshold.', '', '', '', '']],
    styles: { fontSize: 6.5, cellPadding: 0.8 },
    headStyles: { fillColor: [127, 29, 29] },
    theme: 'striped',
  });

  footer(doc, 'Petrolord Well Design Studio · SPE-187073 separation rule, pedal-curve uncertainty, ISCWSA MWD Rev4 (gated on the official ISCWSA example wells)');
  return doc;
}
