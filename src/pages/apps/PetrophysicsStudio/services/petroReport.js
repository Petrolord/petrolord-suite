// Interpretation summary PDF (Petrophysics Studio PS2, audit A1) on
// the house jsPDF + autotable pattern with the shared pdfBrand header
// (src/lib/pdfBrand.js). One page-flowing document: well header,
// parameter table, methods with the engines' own literature citations
// (METHOD_CITATIONS — the report never carries its own copies), zone
// summaries, provenance block. Returns the jsPDF doc; the caller saves.

import { jsPDF } from 'jspdf';
import { EXCEEDANCE_DEFINITION, parameterPercentileLabel } from '@/lib/percentileConventions';
import { makeDepthFrame } from '../../WellDataManager/engine/checkshots';
import 'jspdf-autotable';
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { METHOD_CITATIONS, PIPELINE_VERSION } from '../engine/pipeline';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { buildLabel } from '@/lib/platformBuild';
import { FIELDS, visibleField, fieldLabel, RW_METHOD_LABELS } from './paramFields';
import { AVERAGING_NOTE } from './zoneAverages';
import { SENSITIVITY_CUTOFFS, pointsAround, relativeSwing } from './cutoffSensitivity';

// jsPDF's standard fonts are Latin-1: a Greek letter or a math sign in a
// label prints as mojibake with its letters spaced out (PETRO-U1-010,
// "Porosity: Æ shale"). Labels shared with the screen go through here.
const LATIN1_MAP = { 'φ': 'phi', 'ρ': 'rho', 'Δ': 'delta ', '≥': '>=', '≤': '<=', '−': '-', '–': '-', '—': '-', '·': '.', 'Ω': 'ohm' };
export const latin1Safe = (v) => String(v).replace(/[^\u0000-\u00ff]/g, (c) => LATIN1_MAP[c] ?? '?');

const num = (v, d = 3) => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : EMPTY_VALUE);

/**
 * PETRO-U1-009: every parameter the pipeline applied, from the same field
 * list the Parameter panel shows (the hand list left out phi shale,
 * permeability, temperature and the shaly-sand models), with the section
 * name so a reviewer can find it on screen.
 * @returns {Array<[string, string]>} [label, value]
 */
export function parameterRows(params) {
  const rows = [];
  let section = '';
  for (const f of FIELDS) {
    if (f.section) { section = f.section; continue; }
    if (!f.key || !visibleField(f, params)) continue;
    const v = params[f.key];
    rows.push([latin1Safe(`${section}: ${fieldLabel(f, params)}`), v === undefined || v === null || v === '' ? EMPTY_VALUE : latin1Safe(v)]);
  }
  if (params.rwMethod && RW_METHOD_LABELS[params.rwMethod]) rows.push(['Sw: Rw from', RW_METHOD_LABELS[params.rwMethod]]);
  return rows;
}

/** Per-zone overrides as rows: [zone, 'key = value; ...']. */
export function overrideRows(zones, zoneParams = {}) {
  const labelOf = (key) => {
    const f = FIELDS.find((x) => x.key === key);
    return f ? fieldLabel(f, {}) : key;
  };
  return (zones || [])
    .filter((z) => zoneParams[z.id] && Object.keys(zoneParams[z.id]).length)
    .map((z) => [latin1Safe(z.name), latin1Safe(Object.entries(zoneParams[z.id]).map(([k, v]) => `${labelOf(k)} ${v}`).join('; '))]);
}

/** The header block a reviewer signs against (PL7). */
export function headerRows({ wellName, well = null, header = {}, projectName = null, projectId = null, depthUnit = 'm', generatedAt = new Date() }) {
  const t = (v) => (v === undefined || v === null || String(v).trim() === '' ? EMPTY_VALUE : latin1Safe(String(v).trim()));
  const kb = Number(well?.kb_m);
  const xy = Number.isFinite(Number(well?.surface_x)) && well?.surface_x !== null && Number.isFinite(Number(well?.surface_y)) && well?.surface_y !== null
    ? `${Number(well.surface_x).toFixed(1)}, ${Number(well.surface_y).toFixed(1)}${well?.crs ? ` (${well.crs})` : (well?.crs_note ? ` (${well.crs_note})` : ' (CRS not recorded)')}`
    : EMPTY_VALUE;
  return [
    ['Company', t(header.company)], ['Field', t(header.field)],
    ['Well', t(wellName)], ['UWI', t(well?.uwi)],
    ['Surface X, Y', xy], ['Depth reference', Number.isFinite(kb) ? `MD below KB; KB ${kb.toFixed(2)} m above the vertical datum` : 'MD below KB; KB not recorded'],
    ['Analyst', t(header.analyst)], ['Interpretation', projectName ? `${projectName}${projectId ? ` (${projectId})` : ''}` : t(projectId)],
    ['Units', `depths ${depthUnit === 'ft' ? 'ft' : 'm'}; porosity, Vsh and Sw v/v; k mD; resistivity ohm.m`],
    ['Software', `Petrophysics Studio, pipeline v${PIPELINE_VERSION}, ${buildLabel()}`],
    ['Generated', generatedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
  ];
}

/** Methods actually in play for this parameter set, with citations. */
export function methodLines(params) {
  const lines = [];
  const vsh = METHOD_CITATIONS.vsh[params.vshMethod];
  if (vsh) lines.push(`Shale volume: ${vsh}`);
  const phi = METHOD_CITATIONS.phi[params.phiSource];
  if (phi) lines.push(`Porosity: ${phi}`);
  if (params.phiSource === 'sonic') {
    const sonic = METHOD_CITATIONS.sonic[params.sonicMethod];
    if (sonic) lines.push(`Sonic model: ${sonic}`);
  }
  const sw = METHOD_CITATIONS.sw[params.swMethod];
  if (sw) lines.push(`Water saturation: ${sw}`);
  lines.push(`Net pay: midpoint sample thickness; pay where phi, Vsh and Sw pass their cutoffs; net reservoir where phi and Vsh pass. ${AVERAGING_NOTE}`);
  return lines;
}

/**
 * PETRO-U2-005: the cutoff sensitivity as table rows, per zone and cutoff:
 * [zone, cutoff, "value: net / HCPV" for two grid steps either side of the
 * current value (current marked *), swing]. Thickness in the report unit.
 */
export function sensitivityRows(zones, sensitivities = {}, depthUnit = 'm') {
  const toU = (v) => (depthUnit === 'ft' ? v / 0.3048 : v);
  const rows = [];
  for (const z of zones || []) {
    const s = sensitivities[z.id];
    if (!s) continue;
    for (const def of SENSITIVITY_CUTOFFS) {
      const sweep = s.sweeps[def.key];
      const pts = pointsAround(sweep, 2);
      const swing = relativeSwing(sweep);
      rows.push([
        latin1Safe(z.name), latin1Safe(def.label),
        pts.map((p) => `${p.isCurrent ? '*' : ''}${p.value}: ${num(toU(p.net_m), 2)} / ${num(toU(p.hcpv_m), 3)}`).join('   '),
        swing === null ? EMPTY_VALUE : `${(swing * 100).toFixed(0)} %`,
      ]);
    }
  }
  return rows;
}

/**
 * @param {Object} args
 * @param {string} args.wellName
 * @param {{curves: Object, inventory: Array}} args.wellData
 * @param {Object} args.params applied parameter set
 * @param {Array} args.zones registry zone rows
 * @param {Object} args.summaries zoneId -> live summary
 * @param {string} args.projectId
 * @returns {Promise<jsPDF>}
 */
export async function buildReport({
  wellName, wellData, params, zones, summaries, projectId, depthUnit = 'm', well = null, columns = ['md'], probabilistic = null,
  projectName = null, header = {}, zoneParams = {}, generatedAt = new Date(), sensitivities = null,
  cpi = null,
}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const logo = await loadPetrolordLogo();
  let y = drawBrandHeader(doc, {
    logo,
    margin,
    pageWidth,
    appTitle: 'Petrophysics Studio',
    subtitle: 'Interpretation summary report',
    rightLines: [wellName, ...(projectName ? [projectName] : [])],
  }) + 10;

  const depth = wellData.curves.DEPT;
  const mapped = wellData.inventory.filter((e) => e.log).map((e) => e.key);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Well: ${wellName}`, margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 70, 90);
  const uTxt = depthUnit === 'ft' ? 'ft' : 'm';
  const toU = (v) => (depthUnit === 'ft' ? v / 0.3048 : v);
  const frame = makeDepthFrame({ deviation: well?.deviation, kbM: well?.kb_m ?? 0, tdMdM: well?.td_md_m });
  const depthIn = (md, key) => {
    if (key === 'md') return toU(md);
    try { const r = frame.mdToTvdss(md); return toU(key === 'tvd' ? r.tvd : r.tvdss); } catch (e) { return NaN; }
  };
  const extraKeys = (columns || []).filter((k) => k === 'tvd' || k === 'tvdss');
  doc.text(
    `Interval ${num(toU(depth[0]), 1)} to ${num(toU(depth[depth.length - 1]), 1)} ${uTxt} MD · ${depth.length} samples · inputs: ${mapped.join(', ')}`
    + (extraKeys.length ? ` · TVD from ${frame.isVertical ? 'a vertical assumption' : 'the deviation survey'}, KB ${num(well?.kb_m ?? 0, 2)} m` : ''),
    margin, y,
  );
  y += 8;

  const hdr = headerRows({ wellName, well, header, projectName, projectId, depthUnit, generatedAt });
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    body: Array.from({ length: Math.ceil(hdr.length / 2) }, (_, r) => [...(hdr[2 * r] || ['', '']), ...(hdr[2 * r + 1] || ['', ''])]),
    styles: { fontSize: 8, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Parameters', margin, y);
  y += 3;
  const prow = parameterRows(params);
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Parameter', 'Value', 'Parameter', 'Value']],
    body: Array.from({ length: Math.ceil(prow.length / 2) }, (_, r) => [...(prow[2 * r] || ['', '']), ...(prow[2 * r + 1] || ['', ''])]),
    styles: { fontSize: 7.5, cellPadding: 1.2 },
    headStyles: { fillColor: [15, 23, 42] },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 6;
  const orows = overrideRows(zones, zoneParams);
  if (orows.length) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Zone parameter overrides (these zones did not use the values above)', margin, y);
    y += 2;
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Zone', 'Overrides']],
      body: orows,
      styles: { fontSize: 7.5, cellPadding: 1.2 },
      headStyles: { fillColor: [15, 23, 42] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  y += 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Methods', margin, y);
  y += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 70, 90);
  for (const line of methodLines(params)) {
    const wrapped = doc.splitTextToSize(`• ${line}`, pageWidth - 2 * margin);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4 + 1;
  }
  y += 4;

  const zoneRows = zones.filter((z) => summaries[z.id]);
  const zoneHead = ['Zone', `Top MD (${uTxt})`, `Base MD (${uTxt})`,
    ...extraKeys.flatMap((k) => [`Top ${k.toUpperCase()} (${uTxt})`, `Base ${k.toUpperCase()} (${uTxt})`]),
    `Gross (${uTxt})`, `Net res (${uTxt})`, `Net pay (${uTxt})`, 'N/G', `Net pay TVT (${uTxt})`, `HCPV (${uTxt})`, 'phie avg', 'Vsh avg', 'Sw avg', 'k gm (mD)'];
  const zoneRow = (z) => {
    const s = summaries[z.id];
    return [
      latin1Safe(z.name), num(toU(z.top_md_m), 1), num(toU(z.base_md_m), 1),
      ...extraKeys.flatMap((k) => [num(depthIn(z.top_md_m, k), 1), num(depthIn(z.base_md_m, k), 1)]),
      num(toU(s.gross_m), 2), num(toU(s.net_res_m), 2), num(toU(s.net_m), 2), num(s.ntg),
      num(toU(s.net_tvt_m), 2), num(toU(s.hcpv_m), 3),
      num(s.phi_avg), num(s.vsh_avg), num(s.sw_avg), num(s.k_gm_md, 1),
    ];
  };
  if (zoneRows.length) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Zone summaries', margin, y);
    y += 3;
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [zoneHead],
      body: zoneRows.map(zoneRow),
      styles: { fontSize: 6.8, cellPadding: 1.1 },
      headStyles: { fillColor: [15, 23, 42] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // PETRO-U2-005: how far each zone's net pay moves with each cutoff
  const srows = sensitivityRows(zones, sensitivities || {}, depthUnit);
  if (srows.length) {
    if (y > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Cutoff sensitivity', margin, y);
    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 70, 90);
    const intro = doc.splitTextToSize(`Net pay and HCPV (${uTxt}) with one cutoff moved and the other two at the zone's own values (Worthington and Cosentino 2005, SPE 84387). * marks the cutoff used above. Swing: change in net pay across the neighbouring grid values as a fraction of the current net pay.`, pageWidth - 2 * margin);
    doc.text(intro, margin, y);
    y += intro.length * 3.6 + 1;
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Zone', 'Cutoff', `Cutoff value: net pay / HCPV (${uTxt})`, 'Swing']],
      body: srows,
      styles: { fontSize: 7, cellPadding: 1.1 },
      headStyles: { fillColor: [15, 23, 42] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // PT10d: the probabilistic block when a run exists. Outcomes carry
  // P90 / P50 / P10 under the exceedance meaning; parameters read as
  // percentiles; the definition sentence follows the table.
  if (probabilistic?.zones?.length) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Probabilistic zone cases (${probabilistic.draws.n} realisations, seed ${probabilistic.draws.seed})`, margin, y);
    y += 3;
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Zone', `Net P90 (${uTxt})`, `Net P50 (${uTxt})`, `Net P10 (${uTxt})`, 'N/G P50',
        parameterPercentileLabel('phi', 'q10'), parameterPercentileLabel('phi', 'q90'),
        parameterPercentileLabel('Sw', 'q10'), parameterPercentileLabel('Sw', 'q90'),
        parameterPercentileLabel('k gm', 'q50')]],
      body: probabilistic.zones.map((z) => [
        z.name, num(toU(z.outcomes.net_m.p90), 2), num(toU(z.outcomes.net_m.p50), 2), num(toU(z.outcomes.net_m.p10), 2), num(z.outcomes.ntg.p50),
        num(z.parameters.phi_avg.q10), num(z.parameters.phi_avg.q90), num(z.parameters.sw_avg.q10), num(z.parameters.sw_avg.q90), num(z.parameters.k_gm_md.q50, 1),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 23, 42] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 70, 90);
    doc.text(EXCEEDANCE_DEFINITION, margin, y);
    y += 8;
  }

  // PETRO-U2-003: one log plot (CPI) page per zone: the tracks over the
  // zone with the header block and the zone's own row on the same page
  const cpiPages = (cpi?.pages || []).filter((pg) => zones.some((z) => z.id === pg.zoneId));

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Provenance', margin, y);
  y += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 70, 90);
  for (const line of [
    'Engine: petrophysics-studio (validated against an independent literature oracle at 1e-12).',
    `Pipeline version: ${PIPELINE_VERSION} · Interpretation: ${projectName || EMPTY_VALUE} · Project: ${projectId || EMPTY_VALUE}`,
    `Generated: ${generatedAt.toISOString()} · ${buildLabel()}`,
    ...(wellData.inputNotes || []).map((n) => `Input: ${n}`),
    ...(cpi && !cpiPages.length ? [`Log plot pages: not included (${cpi.reason || 'no zone had a log plot'}).`] : []),
    ...(cpi?.skipped?.length ? [`Log plot pages skipped for ${cpi.skipped.join(', ')}: outside the logged interval.`] : []),
  ]) {
    const wrapped = doc.splitTextToSize(line, pageWidth - 2 * margin);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4 + 0.5;
  }

  const pageH = doc.internal.pageSize.getHeight();
  for (const pg of cpiPages) {
    const z = zones.find((x) => x.id === pg.zoneId);
    doc.addPage();
    let cy = drawBrandHeader(doc, {
      logo, margin, pageWidth, appTitle: 'Petrophysics Studio', subtitle: 'Log plot (CPI)', rightLines: [wellName, ...(projectName ? [projectName] : [])],
    }) + 7;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(latin1Safe(`Log plot (CPI): ${z.name}, ${num(toU(z.top_md_m), 1)} to ${num(toU(z.base_md_m), 1)} ${uTxt} MD`), margin, cy);
    cy += 3;
    const h = hdr.filter(([k]) => ['Company', 'Field', 'Well', 'UWI', 'Analyst', 'Interpretation', 'Depth reference', 'Generated'].includes(k));
    doc.autoTable({
      startY: cy,
      margin: { left: margin, right: margin },
      body: Array.from({ length: Math.ceil(h.length / 2) }, (_, r) => [...(h[2 * r] || ['', '']), ...(h[2 * r + 1] || ['', ''])]),
      styles: { fontSize: 7, cellPadding: 0.9 },
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
      theme: 'grid',
    });
    cy = doc.lastAutoTable.finalY + 2;
    if (summaries[z.id]) {
      doc.autoTable({
        startY: cy,
        margin: { left: margin, right: margin },
        head: [zoneHead],
        body: [zoneRow(z)],
        styles: { fontSize: 6.3, cellPadding: 0.9 },
        headStyles: { fillColor: [15, 23, 42] },
        theme: 'grid',
      });
      cy = doc.lastAutoTable.finalY + 3;
    }
    const caption = latin1Safe(`Tracks as laid out on screen; window ${num(toU(pg.top), 1)} to ${num(toU(pg.base), 1)} ${uTxt} MD, the zone band shaded.`);
    const availH = pageH - cy - 14;
    const availW = pageWidth - 2 * margin;
    const ratio = pg.width / pg.height;
    const iw = Math.min(availW, availH * ratio);
    const ih = iw / ratio;
    doc.addImage(pg.dataUrl, 'PNG', margin + (availW - iw) / 2, cy, iw, ih);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 70, 90);
    doc.text(caption, margin, cy + ih + 4);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 150);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
  return doc;
}
