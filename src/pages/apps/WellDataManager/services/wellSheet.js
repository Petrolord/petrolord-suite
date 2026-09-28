// Well data sheet PDF (AppUpgrade WDM-U2-011, finding WDM-U1-033): a
// one-well summary a manager can attach to a meeting pack and a reviewer
// can sign (PL7). House pattern: jsPDF + autotable with the shared Petrolord
// brand header (src/lib/pdfBrand.js), Latin-1 text only (jsPDF's standard
// fonts), numbers to the precision the screen shows, every depth labelled
// with its unit and reference, and the assumptions stated (the datum).
//
// Returns the jsPDF document; the caller saves it. The same builder runs in
// jest (pdftotext reads its output) and in the browser.

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { buildLabel } from '@/lib/platformBuild';
import { crsDisplayName, datumTransformInfo, rowDatumTransform } from '@/lib/crs';
import { makeDepthFrame } from '../engine/checkshots';
import { fmtDepth, unitText } from '../engine/displayUnits';
import { wellInventory, FLAG_BY_CODE } from '../engine/inventory';
import { curveOrigin } from '../engine/provenance';
import { fileStem } from '../engine/wellExport';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const LATIN1_SWAPS = [
  [/[‒-―]/g, '-'], [/[‘’]/g, "'"], [/[“”]/g, '"'], [/…/g, '...'],
  [/†/g, '+'], [/≤/g, '<='], [/≥/g, '>='], [/→/g, '->'], [/ /g, ' '],
];
/** Text safe for jsPDF's standard fonts: common typography swapped, anything else outside Latin-1 as '?'. */
export function latin1(value) {
  let s = String(value ?? '');
  for (const [re, to] of LATIN1_SWAPS) s = s.replace(re, to);
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\u0000-ÿ]/g, '?');
}

const STATUS = {
  planned: 'Planned', drilling: 'Drilling', oil: 'Oil', gas: 'Gas', oil_gas: 'Oil and gas', water: 'Water', dry: 'Dry',
  injector_water: 'Water injector', injector_gas: 'Gas injector', suspended: 'Suspended', abandoned: 'Abandoned',
};

/**
 * @param {Object} p
 * @param {Object} p.well registry row @param {Object[]} p.logs @param {Object[]} p.tops @param {Object[]} [p.zones]
 * @param {'m'|'ft'} [p.unit] @param {string} [p.analyst] "prepared by" @param {Date} [p.now]
 * @returns {Promise<{doc: jsPDF, fileName: string}>}
 */
export async function buildWellSheet({ well, logs = [], tops = [], zones = [], unit = 'm', analyst = '', now = new Date() }) {
  const u = unitText(unit);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const logo = await loadPetrolordLogo();
  let y = drawBrandHeader(doc, {
    logo, margin, pageWidth, appTitle: 'Well Data Manager', subtitle: 'Well data sheet', rightLines: [latin1(well.name)],
  }) + 8;

  const frame = makeDepthFrame({ deviation: well.deviation, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m });
  const dt = rowDatumTransform(well);
  const dtInfo = dt ? datumTransformInfo(well.crs, dt) : null;
  const xyUnit = well.xy_unit || 'm';
  const cs = well.checkshots || [];
  const csIn = well.checkshots_provenance?.units_in;
  const inv = wellInventory(well, logs, tops);
  const kv = [
    ['Well', well.name],
    ['UWI', well.uwi || EMPTY_VALUE],
    ['Status', STATUS[well.status] || EMPTY_VALUE],
    ['Sharing', well.organization_id ? 'shared with the organization' : 'private'],
    ['Coordinate system', well.crs ? `${crsDisplayName(well.crs)} (${well.crs})` : 'not assigned'],
    ['Surface X, Y', well.surface_x != null && well.surface_y != null ? `${Number(well.surface_x).toFixed(2)}, ${Number(well.surface_y).toFixed(2)} ${xyUnit}` : EMPTY_VALUE],
    ...(dtInfo ? [['Datum transformation', `${dtInfo.transform.name} (${dtInfo.transform.code}), site choice`]] : []),
    ['Depth unit', `${u === 'ft' ? 'feet' : 'metres'} (the registry stores metres)`],
    ['Vertical datum', 'mean sea level (assumed; not stored per well)'],
    ['KB', Number(well.kb_m) > 0 ? `${fmtDepth(well.kb_m, u, 2)} ${u} above datum` : `not set (TVDSS equals TVD)`],
    ['TD', well.td_md_m != null ? `${fmtDepth(well.td_md_m, u, 1)} ${u} MD` : EMPTY_VALUE],
    ['Deviation survey', frame.isVertical ? 'none (treated as vertical)' : `${(well.deviation || []).length} stations, grid azimuths, minimum curvature`],
    ['Checkshots', cs.length ? `${cs.length} pairs${csIn ? `, entered as ${String(csIn.depth_ref).toUpperCase()} ${csIn.depth_unit} / ${String(csIn.time).toUpperCase()}` : ' (legacy, TVDSS / TWT)'}` : EMPTY_VALUE],
    ['QC flags', inv.flags.length ? inv.flags.map((c) => FLAG_BY_CODE[c].label).join('; ') : 'none'],
    ['Prepared by', analyst.trim() || EMPTY_VALUE],
    ['Prepared on', now.toISOString().slice(0, 10)],
    ['Software', buildLabel()],
  ];
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    body: kv.map(([k, v]) => [latin1(k), latin1(v)]),
    styles: { fontSize: 8.5, cellPadding: 1.4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 7;

  const heading = (text) => {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(latin1(text), margin, y);
    y += 3;
  };
  const table = (head, body) => {
    doc.autoTable({
      startY: y, margin: { left: margin, right: margin }, head: [head.map(latin1)], body: body.map((r) => r.map(latin1)),
      styles: { fontSize: 7.5, cellPadding: 1.2 }, headStyles: { fillColor: [15, 23, 42] }, theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 7;
  };

  heading(`Formation tops (${tops.length})`);
  if (tops.length) {
    table(['Top', `MD (${u})`, `TVD (${u})`, `TVDSS (${u})`, 'Type', 'Interpreter'], [...tops].sort((a, b) => a.md_m - b.md_m).map((t) => {
      let p = null;
      try { p = frame.mdToPosition(Number(t.md_m)); } catch (e) { p = null; }
      return [t.name, fmtDepth(t.md_m, u), p ? fmtDepth(p.tvd, u) : EMPTY_VALUE, p ? fmtDepth(p.tvdss, u) : EMPTY_VALUE, (t.surface_type || EMPTY_VALUE).replace(/_/g, ' '), t.interpreter || EMPTY_VALUE];
    }));
  } else { doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.text('No tops on this well.', margin, y + 3); y += 9; }

  heading(`Curve inventory (${logs.length})`);
  if (logs.length) {
    table(['Curve', 'Unit', `From (${u} MD)`, `To (${u} MD)`, `Step (${u})`, 'Samples', 'Nulls', 'Origin', 'Source'], logs.map((l) => [
      l.mnemonic, l.unit || EMPTY_VALUE, fmtDepth(Math.min(l.start_md_m, l.stop_md_m), u), fmtDepth(Math.max(l.start_md_m, l.stop_md_m), u),
      l.step_m == null ? 'irregular' : fmtDepth(l.step_m, u, 4), String(l.n_samples ?? EMPTY_VALUE), String(l.null_count ?? EMPTY_VALUE),
      curveOrigin(l)?.label || 'measured', l.source_file || EMPTY_VALUE,
    ]));
  } else { doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.text('No logs on this well.', margin, y + 3); y += 9; }

  const pub = (zones || []).filter((z) => z.properties?.published_at);
  if ((zones || []).length) {
    heading(`Zones (${zones.length}, ${pub.length} published by Petrophysics Studio)`);
    table(['Zone', `Top (${u} MD)`, `Base (${u} MD)`, `Net (${u})`, 'N/G', 'PHIE avg', 'Sw avg', 'Published'], zones.map((z) => {
      const p = z.properties || {};
      const ok = !!p.published_at;
      const f = (v, d) => (ok && v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(d) : EMPTY_VALUE);
      return [z.name, fmtDepth(z.top_md_m, u), fmtDepth(z.base_md_m, u), ok ? fmtDepth(p.net_m, u, 2) : EMPTY_VALUE, f(p.ntg, 2), f(p.phi_avg, 3), f(p.sw_avg, 3),
        ok ? `${String(p.published_at).slice(0, 10)}${p.interpretation_name ? ` ${p.interpretation_name}` : ''}` : 'not published'];
    }));
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 110, 125);
    doc.text(latin1(`${well.name} well data sheet, ${buildLabel()}. Depths in ${u}, MD below KB unless stated.`), margin, doc.internal.pageSize.getHeight() - 6);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
  return { doc, fileName: `${fileStem(latin1(well.name))}_data_sheet.pdf` };
}
