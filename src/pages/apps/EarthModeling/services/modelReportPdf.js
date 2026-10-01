// The model report a reviewer signs (Earth Modeling upgrade U2-003,
// 2026-10-01; finding EM-U1-021, PL7). A4 portrait, Latin-1 only (jsPDF
// standard fonts):
//   page 1  brand header; reviewer header (field, analyst, date, build,
//           model, CRS, XY unit, depth reference, frame); the in-place
//           volumes per zone in the chosen units; contacts and FVFs as the
//           build used them (per block, trap and saturation-height notes);
//           flags (open legs, clamped properties, fall-backs, mis-ties,
//           total porosity, door notes); a signature line.
//   page 2+ volumes per fault block; population provenance; well ties;
//           the map and section pictures when the page passes them.
// The same builder runs in jest (pdftotext reads the output) and in the
// browser.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { buildLabel } from '@/lib/platformBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { fmtVolume, volumeUnitLabel } from './units';
import { describeProvenance } from './propertyKriging';
import { describeTraps } from './trapBound';

const LATIN1_SWAPS = [[/[‒-―]/g, '-'], [/[‘’]/g, "'"], [/[“”]/g, '"'], [/…/g, '...'], [/≤/g, '<='], [/≥/g, '>='], [/→/g, '->'], [/×/g, 'x'], [/³/g, '3'], [/²/g, '2'], [/φ/g, 'phi']];
/** Text safe for jsPDF's standard fonts. */
export function latin1(value) {
  let s = String(value ?? '');
  for (const [re, to] of LATIN1_SWAPS) s = s.replace(re, to);
  return s.replace(/[^\u0000-ÿ]/g, '?');
}

const depthM = (m) => (Number.isFinite(m) ? `${m.toFixed(1)} m` : EMPTY_VALUE);

/** One zone's contacts and FVFs as the build used them, in words. */
export function zoneFluidLines(z) {
  const f = z.fluids || {};
  const out = [];
  out.push(`${z.name}: ${Number.isFinite(f.goc) ? `GOC ${depthM(f.goc)}` : 'no GOC'}; ${Number.isFinite(f.owc) ? `OWC ${depthM(f.owc)}` : (z.shm?.fwlAsContact ? `no OWC, the FWL ${depthM(z.shm.fwlM)} bounds the leg` : 'no OWC (the whole zone counts as hydrocarbon)')}; Bo ${Number.isFinite(f.bo) ? `${f.bo} rb/stb` : EMPTY_VALUE}; Bg ${Number.isFinite(f.bg) ? `${Number(f.bg).toPrecision(4)} rm3/sm3` : EMPTY_VALUE}${f.gasZone ? '; gas zone' : ''}`);
  for (const [lab, b] of Object.entries(f.blocks || {})) {
    out.push(`  block ${lab}:${Number.isFinite(b.goc) ? ` GOC ${depthM(b.goc)}` : ''}${Number.isFinite(b.owc) ? ` OWC ${depthM(b.owc)}` : ''}`);
  }
  if (z.trap) out.push(`  leg bounded by the closure and spill: ${describeTraps(z.trap)}`);
  if (z.shm) out.push(`  Sw from saturation-height (${z.shm.project}), FWL ${depthM(z.shm.fwlM)}, rock from ${z.shm.rock === 'model' ? 'the modelled porosity' : 'the project'}`);
  return out;
}

/** Every flag a reviewer must see, in words. */
export function modelFlags(built) {
  const flags = [];
  for (const z of built.zones) {
    if (z.openEdge?.open) flags.push(z.openEdge.spillAtEdge ? `${z.name}: the trap spills at the model edge; the volume is a minimum.` : `${z.name}: the hydrocarbon leg reaches the model edge at ${z.openEdge.nodes} nodes; the volume depends on where the frame stops.`);
    const hasOwc = Number.isFinite(z.fluids?.owc) || Object.values(z.fluids?.blocks || {}).some((b) => Number.isFinite(b?.owc)) || z.shm?.fwlAsContact;
    if (!hasOwc) flags.push(`${z.name}: no OWC, the whole zone counts as hydrocarbon.`);
  }
  for (const c of built.propertyClamps || []) flags.push(`${c.zone} ${c.prop}: ${c.nodes} nodes extrapolated outside 0 to 1 and held at the limit.`);
  for (const f of built.fallbacks || []) flags.push(`${f.zone} ${f.prop} block ${f.block} fell back to ${f.used} (${f.wells} wells).`);
  for (const t of built.misties || []) flags.push(`${t.well} ${t.top} misses its surface by ${t.residualM.toFixed(1)} m.`);
  const tp = [...new Set((built.totalPhi || []).map((t) => t.well))];
  if (tp.length) flags.push(`Porosity from ${tp.join(', ')} is total porosity (published before 2026-09-07).`);
  for (const n of built.notes || []) flags.push(n);
  return flags;
}

/**
 * @param {Object} p
 * @param {Object} p.built the built model
 * @param {string} p.name model name
 * @param {'metric'|'field'} [p.volumeUnits]
 * @param {{field?: string, analyst?: string}} [p.report]
 * @param {Array<{title: string, dataUrl: string, w: number, h: number}>} [p.images] map / section pictures (PNG)
 * @param {Date} [p.now] @param {string} [p.build] @param {*} [p.logo] (null skips the logo)
 * @returns {Promise<{doc: jsPDF, fileName: string, pages: number}>}
 */
export async function buildModelReportPdf({ built, name = 'Earth model', volumeUnits = 'metric', report = {}, images = [], now = new Date(), build = buildLabel(), logo = undefined }) {
  if (!built?.zones?.length) throw new Error('Build the model first; there is nothing to report.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const M = 14;
  const brandLogo = logo === undefined ? await loadPetrolordLogo() : logo;
  const header = () => drawBrandHeader(doc, {
    logo: brandLogo, margin: M, pageWidth: W, appTitle: 'Earth Modeling', subtitle: latin1(`Model report: ${name}`),
    rightLines: [latin1(`Field ${String(report.field || '').trim() || 'not given'}`), latin1(`Analyst ${String(report.analyst || '').trim() || 'not given'}`)],
  });
  header();
  let y = 36;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(latin1(name), M, y);
  doc.setFont('helvetica', 'normal');
  y += 3;
  const frameM = built.specM || built.spec;
  const kv = [
    ['Field', String(report.field || '').trim() || 'not given'],
    ['Analyst', String(report.analyst || '').trim() || 'not given'],
    ['Date', now.toISOString().slice(0, 10)],
    ['Build', build],
    ['CRS', built.crs || 'not recorded'],
    ['XY unit', built.xyUnit || 'm'],
    ['Depth reference', 'TVDSS, metres below mean sea level, positive down'],
    ['Frame', `${built.spec.nx} x ${built.spec.ny} nodes at ${frameM.dx.toFixed(2)} x ${frameM.dy.toFixed(2)} m${built.boundary ? `, clipped to ${built.boundary.name}` : ''}`],
    ['Zones', built.zones.map((z) => z.name).join(', ')],
    ['Volume units', `${volumeUnits}: rock in ${volumeUnitLabel('bulk_m3', volumeUnits)}, pore in ${volumeUnitLabel('pore_m3', volumeUnits)}, oil in ${volumeUnitLabel('stoiip_m3', volumeUnits)}, gas in ${volumeUnitLabel('giip_m3', volumeUnits)}`],
  ];
  autoTable(doc, {
    startY: y + 1, margin: { left: M, right: M }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1 },
    columnStyles: { 0: { cellWidth: 34, textColor: [90, 100, 115] } },
    body: kv.map(([k, v]) => [latin1(k), latin1(v)]),
  });
  y = doc.lastAutoTable.finalY + 4;

  // in-place volumes per zone (totals)
  const cols = ['bulk_m3', 'net_m3', 'pore_m3', 'hcpv_m3', 'stoiip_m3', 'giip_m3'];
  const heads = ['Zone', 'GRV', 'NRV', 'PV', 'HCPV', 'STOIIP', 'GIIP (free gas)'];
  const v = (x, c) => fmtVolume(x, c, volumeUnits);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('In-place volumes per zone', M, y); doc.setFont('helvetica', 'normal');
  autoTable(doc, {
    startY: y + 2, margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] },
    head: [heads.map((h, i) => (i === 0 ? h : `${h} (${latin1(volumeUnitLabel(cols[i - 1], volumeUnits))})`))],
    body: built.zones.map((z) => [latin1(z.name), ...cols.map((c) => v(z.volumes?.total?.[c], c))]),
  });
  y = doc.lastAutoTable.finalY + 4;
  // the P90/P50/P10 of a volume distribution, when one was run (U2-010)
  if (built.distribution) {
    const d = built.distribution;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(latin1(`Volume distribution (${d.iterations} trials, seed ${d.seed})`), M, y); doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] },
      head: [['Zone', 'Quantity', 'P90 (low)', 'P50', 'P10 (high)', 'Mean']],
      body: d.zones.flatMap((zz) => Object.entries(zz.stats).map(([q, s]) => [latin1(zz.name), q.replace('_m3', '').toUpperCase(), v(s.p90, q), v(s.p50, q), v(s.p10, q), v(s.mean, q)])),
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Contacts and FVFs as used', M, y); doc.setFont('helvetica', 'normal');
  y += 4.5;
  doc.setFontSize(8);
  const para = (lines, gap = 3.6) => {
    for (const line of lines) {
      for (const l of doc.splitTextToSize(latin1(line), W - 2 * M)) {
        if (y > 280) { doc.addPage(); header(); y = 38; doc.setFontSize(8); doc.setTextColor(0, 0, 0); }
        doc.text(l, M, y); y += gap;
      }
    }
  };
  para(built.zones.flatMap(zoneFluidLines));
  y += 2;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); para(['Flags']); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const flags = modelFlags(built);
  para(flags.length ? flags.map((f) => `- ${f}`) : ['None.']);
  y += 6;
  if (y > 262) { doc.addPage(); header(); y = 40; }
  doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.2);
  doc.line(M, y + 8, M + 70, y + 8); doc.line(W - M - 70, y + 8, W - M, y + 8);
  doc.setFontSize(8); doc.setTextColor(60, 60, 60);
  doc.text('Prepared by (analyst)', M, y + 12); doc.text('Reviewed by', W - M - 70, y + 12);
  doc.setTextColor(0, 0, 0);

  // page 2: per block, provenance, ties
  doc.addPage(); header(); y = 38;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Volumes per zone and fault block', M, y); doc.setFont('helvetica', 'normal');
  const body = [];
  for (const z of built.zones) {
    const keys = Object.keys(z.volumes || {}).sort((a, b) => (a === 'total' ? 1 : b === 'total' ? -1 : a.localeCompare(b)));
    for (const k of keys) body.push([latin1(z.name), k === 'total' ? 'TOTAL' : `Block ${k}`, String(z.volumes[k].cells), ...cols.map((c) => v(z.volumes[k][c], c))]);
  }
  autoTable(doc, {
    startY: y + 2, margin: { left: M, right: M }, styles: { fontSize: 7.5, cellPadding: 1 }, headStyles: { fillColor: [30, 41, 59] },
    head: [['Zone', 'Block', 'Cells', ...heads.slice(1)]], body,
  });
  y = doc.lastAutoTable.finalY + 5;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); para(['Population provenance']); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  para(built.zones.flatMap((z) => Object.entries(z.provenance || {}).map(([prop, rows]) => `${z.name} ${prop}: ${describeProvenance(rows)}`)));
  y += 3;
  if (built.ties?.length) {
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Well ties (pick TVDSS minus surface)', M, y); doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M }, styles: { fontSize: 7.5, cellPadding: 1 }, headStyles: { fillColor: [30, 41, 59] },
      head: [['Well', 'Top', 'Residual (m)', 'Before adjustment (m)']],
      body: built.ties.map((t) => [latin1(t.well), latin1(t.top), Number.isFinite(t.residualM) ? t.residualM.toFixed(2) : EMPTY_VALUE, Number.isFinite(t.residualBeforeM) ? t.residualBeforeM.toFixed(2) : EMPTY_VALUE]),
    });
    y = doc.lastAutoTable.finalY + 5;
  }
  for (const img of images || []) {
    if (!img?.dataUrl || !(img.w > 0) || !(img.h > 0)) continue;
    const wMm = W - 2 * M; const hMm = Math.min(150, wMm * (img.h / img.w));
    if (y + hMm + 8 > 287) { doc.addPage(); header(); y = 38; }
    doc.setFontSize(9); doc.text(latin1(img.title), M, y); y += 2;
    try { doc.addImage(img.dataUrl, 'PNG', M, y, wMm, hMm); } catch { /* a picture that will not embed is skipped */ }
    y += hMm + 6;
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(110, 110, 110);
    doc.text(latin1(`${name} - page ${p} of ${pages} - ${build}`), W / 2, 292, { align: 'center' });
  }
  const fileName = `${String(name).replace(/[^\w-]+/g, '_') || 'earth-model'}-report.pdf`;
  return { doc, fileName, pages };
}
