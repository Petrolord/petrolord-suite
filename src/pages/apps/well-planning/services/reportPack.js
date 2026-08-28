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

const fmtNum = (v, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : '—');

// ---------------------------------------------------------------------------
// vector chart primitives
// ---------------------------------------------------------------------------

/** Fit world points into a page rect. flipY: world +y draws upward. */
function makeMapper(rect, xs, ys, { flipY = true, equalAspect = false, pad = 0.06 } = {}) {
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
    const s = Math.min(sx, sy);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    minX = cx - rect.w / s / 2; maxX = cx + rect.w / s / 2;
    minY = cy - rect.h / s / 2; maxY = cy + rect.h / s / 2;
    sx = s; sy = s;
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

/** Plan view: N vs E path + targets + EOU ellipses (all metres). */
export function drawPlanView(doc, rect, { stations, targets = [], ellipses = [] }) {
  frameRect(doc, rect, 'Plan view (N vs E, m)');
  const xs = stations.map((s) => s.e).concat(targets.map((t) => t.e));
  const ys = stations.map((s) => s.n).concat(targets.map((t) => t.n));
  const m = makeMapper(rect, xs.length ? xs : [0], ys.length ? ys : [0], { equalAspect: true });
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

/** Section view: TVD (down) vs VS + optional EOU band rows. */
export function drawSectionView(doc, rect, { stations, band = null }) {
  frameRect(doc, rect, 'Section view (TVD vs VS, m)');
  const xs = stations.map((s) => s.vs);
  const ys = stations.map((s) => s.tvd)
    .concat(band ? band.down.map((r) => r.tvd) : []);
  const m = makeMapper(rect, xs, ys, { flipY: false });
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
export function drawSfLadder(doc, rect, { results, thresholds }) {
  frameRect(doc, rect, 'Separation factor vs reference MD (SF clipped at 5)');
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
    doc.setFontSize(6);
    doc.text(String(r.label), rect.x + 2, rect.y + 3 + i * 3);
  });
  return m;
}

// ---------------------------------------------------------------------------
// report generators
// ---------------------------------------------------------------------------

function headerRowsFromContract(contract, magRef) {
  return [
    ['Well', contract.wellbore.name ?? '—', 'Site', contract.site?.name ?? '—'],
    ['UWI', contract.wellbore.uwi ?? '—', 'Site CRS', contract.site?.crs ?? 'unset'],
    ['Wellhead', `${fmtNum(contract.wellbore.headX)} E, ${fmtNum(contract.wellbore.headY)} N`, 'KB elevation', `${fmtNum(contract.wellbore.kbElevM)} m`],
    ['Design', contract.design ? `${contract.design.name} r${contract.design.revision} (${contract.design.status})` : '—', 'Source', contract.source],
    ['Azimuth ref', `${contract.wellbore.azimuthReference} (listing: grid)`, 'Convergence', `${contract.wellbore.gridConvergenceDeg ?? '—'} deg`],
    ['Declination', `${contract.wellbore.magDeclinationDeg ?? '—'} deg`, 'Geomagnetics',
      magRef ? `WMM2025: ${fmtNum(magRef.bTotalNT, 0)} nT, dip ${fmtNum(magRef.dipDeg)} deg` : '—'],
  ];
}

/**
 * Wall plot: A4 landscape — title block, plan + section vectors with
 * EOU, key-station table, target table.
 */
export async function generateWallPlot({
  contract, targets = [], uncertainty = null, magRef = null, generatedAt = '',
}) {
  const logo = await loadPetrolordLogo();
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  brandHeader(doc, {
    logo,
    title: `Wall plot — ${contract.wellbore.name ?? 'well'}`,
    subtitle: `${contract.design ? `${contract.design.name} r${contract.design.revision}` : ''} · generated ${generatedAt}`,
  });

  // title block (left column)
  doc.autoTable({
    startY: 22,
    margin: { left: 8 },
    tableWidth: 90,
    head: [['Well header', '', '', '']],
    body: headerRowsFromContract(contract, magRef),
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
  });
  drawSectionView(doc, { x: 104, y: 26, w: pageWidth - 104 - 74, h: pageHeight - 26 - 12 }, {
    stations: contract.stations,
    band: uncertainty?.band || null,
  });

  // key stations (right column): first + every ~10th + TD
  const key = contract.stations.filter((s, i) => i === 0
    || i === contract.stations.length - 1
    || i % Math.max(1, Math.floor(contract.stations.length / 18)) === 0);
  doc.autoTable({
    startY: 26,
    margin: { left: pageWidth - 70 },
    tableWidth: 62,
    head: [['MD', 'Inc', 'Azi', 'TVD', 'N', 'E']],
    body: key.map((s) => [
      fmtNum(s.md, 0), fmtNum(s.inc), fmtNum(s.azi), fmtNum(s.tvd, 0),
      fmtNum(s.n, 0), fmtNum(s.e, 0),
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
      head: [['Target', 'TVDSS', 'N', 'E']],
      body: targets.map((t) => [t.name, fmtNum(t.tvdss, 0), fmtNum(t.n, 0), fmtNum(t.e, 0)]),
      styles: { fontSize: 5.8, cellPadding: 0.6 },
      headStyles: { fillColor: [120, 53, 15], fontSize: 6 },
      theme: 'grid',
    });
  }

  footer(doc, `Petrolord Well Design Studio · petrolord-trajectory v${contract.version} · minimum-curvature engine, ISCWSA MWD Rev4 uncertainty (2σ)`);
  return doc;
}

/** Survey listing: portrait, full station table. */
export async function generateSurveyListing({ contract, magRef = null, generatedAt = '' }) {
  const logo = await loadPetrolordLogo();
  const doc = new jsPDF();
  brandHeader(doc, {
    logo,
    title: `Survey listing — ${contract.wellbore.name ?? 'well'}`,
    subtitle: `${contract.design ? `${contract.design.name} r${contract.design.revision} (${contract.design.status})` : ''} · generated ${generatedAt}`,
  });
  doc.autoTable({
    startY: 22,
    head: [['Well header', '', '', '']],
    body: headerRowsFromContract(contract, magRef),
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 41, 59] },
    theme: 'grid',
  });
  doc.autoTable({
    startY: (doc.lastAutoTable?.finalY ?? 60) + 4,
    head: [['MD (m)', 'Inc (deg)', 'Azi grid (deg)', 'TVD (m)', 'TVDSS (m)', 'N (m)', 'E (m)', 'DLS (deg/30m)', 'VS (m)']],
    body: contract.stations.map((s) => [
      fmtNum(s.md, 2), fmtNum(s.inc, 2), fmtNum(s.azi, 2), fmtNum(s.tvd, 2),
      fmtNum(s.tvdss, 2), fmtNum(s.n, 2), fmtNum(s.e, 2), fmtNum(s.dls30m, 2), fmtNum(s.vs, 2),
    ]),
    styles: { fontSize: 6.5, cellPadding: 0.8 },
    headStyles: { fillColor: [30, 41, 59], fontSize: 7 },
    theme: 'striped',
  });
  const td = contract.stations[contract.stations.length - 1];
  doc.setFontSize(8);
  doc.text(
    `TD: ${fmtNum(td.md, 1)} m MD / ${fmtNum(td.tvd, 1)} m TVD · closure ${fmtNum(Math.hypot(td.n, td.e), 1)} m · max DLS ${fmtNum(maxOf(contract.stations, (s) => s.dls30m), 2)} deg/30m`,
    8,
    (doc.lastAutoTable?.finalY ?? 250) + 6,
  );
  footer(doc, `Petrolord Well Design Studio · petrolord-trajectory v${contract.version} · minimum-curvature engine (oracle-gated)`);
  return doc;
}

/** Anti-collision report from a serialized wp_ac_runs row. */
export async function generateAcReport({ run, wellName = '', designLabel = '', generatedAt = '' }) {
  const logo = await loadPetrolordLogo();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  brandHeader(doc, {
    logo,
    title: `Anti-collision report — ${wellName}`,
    subtitle: `${designLabel} · reference: ${run.reference} · run ${new Date(run.created_at ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')} · generated ${generatedAt}`,
  });

  const p = run.params || {};
  doc.autoTable({
    startY: 22,
    head: [['Separation rule (SPE-187073)', '', '', '']],
    body: [
      ['k (probability factor)', p.k ?? '—', 'σ projection-ahead', `${p.sigmaPa ?? '—'} m`],
      ['Surface margin Sm', `${p.Sm ?? '—'} m`, 'Radii ref / offset', `${p.refRadius ?? '—'} / ${p.offRadius ?? '—'} m`],
      ['No-go below SF', p.noGo ?? 1.0, 'Review below SF', p.review ?? 1.5],
      ['Error model', 'ISCWSA MWD Rev4 (oracle-gated)', 'Overall status', (run.summary?.status ?? '—').toUpperCase()],
    ],
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 41, 59] },
    theme: 'grid',
  });

  doc.autoTable({
    startY: (doc.lastAutoTable?.finalY ?? 60) + 4,
    head: [['Offset well', 'Kind', 'Status', 'Min SF', 'At ref MD (m)', 'Min C-C (m)']],
    body: (run.results || []).map((r) => [
      r.label, r.kind, (r.status || '').toUpperCase(), fmtNum(r.minSf, 2),
      fmtNum(r.minSfMd, 0), fmtNum(minOf(r.distanceCC), 1),
    ]),
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 41, 59] },
    theme: 'striped',
  });

  // vector SF ladder
  const ladderY = (doc.lastAutoTable?.finalY ?? 90) + 8;
  drawSfLadder(doc, { x: 10, y: ladderY, w: pageWidth - 20, h: 70 }, {
    results: run.results || [],
    thresholds: { noGo: p.noGo ?? 1.0, review: p.review ?? 1.5 },
  });

  // violations
  const violations = [];
  for (const r of (run.results || [])) {
    for (let i = 0; i < r.md.length; i++) {
      if (r.sf[i] < (p.review ?? 1.5)) {
        violations.push([
          r.label, fmtNum(r.md[i], 0), fmtNum(r.sf[i], 2), fmtNum(r.distanceCC[i], 1),
          r.sf[i] < (p.noGo ?? 1.0) ? 'NO-GO' : 'REVIEW',
        ]);
      }
    }
  }
  doc.autoTable({
    startY: ladderY + 76,
    head: [['Offset', 'Ref MD (m)', 'SF', 'C-C dist (m)', 'Level']],
    body: violations.length ? violations : [['No stations below the review threshold.', '', '', '', '']],
    styles: { fontSize: 6.5, cellPadding: 0.8 },
    headStyles: { fillColor: [127, 29, 29] },
    theme: 'striped',
  });

  footer(doc, 'Petrolord Well Design Studio · SPE-187073 separation rule, pedal-curve uncertainty, ISCWSA MWD Rev4 (gated on the official ISCWSA example wells)');
  return doc;
}
