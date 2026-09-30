// Stratigraphic summary PDF per well (AppUpgrade STRAT-U2-006): the page a
// reviewer signs (PL7). House pattern (the WDM well data sheet): jsPDF +
// autotable with the shared Petrolord brand header, Latin-1 text only,
// numbers to the precision the screen shows, every depth labelled with its
// unit and reference, the assumptions stated. It holds, for one well:
//   - the reviewer header: well, field, section, prepared by and on, build,
//     timescale and terms, depth basis and unit;
//   - the typed tops with MD and TVD, type, unit, age, ICS stage, the chart
//     each age was entered under, and the tract below;
//   - the age-depth plot drawn as vector (depth down) and its rates and hiatuses;
//   - the Wheeler cells of the well (time down, with their tract);
//   - the stratigraphic column drawn as vector against age, and its units.
// Returns the jsPDF document; the caller saves it. The same builder runs in
// jest (pdftotext reads its output) and in the browser.

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { loadPetrolordLogo, drawBrandHeader } from '@/lib/pdfBrand';
import { buildLabel } from '@/lib/platformBuild';
import { latin1 } from '@/pages/apps/WellDataManager/services/wellSheet';
import { ageDepthModel, sortDated } from '@/lib/stratigraphy/ageDepth';
import { wheelerChart } from '@/lib/stratigraphy/wheeler';
import { withSectionTracts, sequenceTracts, tractBelowEach } from '@/lib/stratigraphy/sequenceTracts';
import { unitAt, TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';
import { displayLabel, normalizeSurfaceType } from '@/lib/stratigraphy/vocabulary';
import { orderedUnits } from '@/lib/stratigraphy/column';
import { verticalDepthOf } from '@/lib/basinHandoff';
import { chartOf } from '@/lib/stratigraphy/ageCharts';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const FT = 0.3048;
const SCHEME_LABEL = { catuneanu: 'Catuneanu', exxon: 'Exxon (display; stored Catuneanu)' };
const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || ''));
  if (!m) return [148, 163, 184];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * @param {Object} p
 * @param {Object} p.well registry row (survey, KB)
 * @param {Array} p.tops the well's tops (typed)
 * @param {Array} [p.intervals] the well's intervals (recorded tracts win)
 * @param {Array} [p.units] the stratigraphic column
 * @param {'m'|'ft'} [p.unit] display unit
 * @param {'catuneanu'|'exxon'} [p.scheme]
 * @param {{field?: string, analyst?: string}} [p.report]
 * @param {?string} [p.section] the open section's name
 * @param {Object} [p.ageCharts] strat_projects.view.ageCharts (the chart each age was entered under)
 * @param {Date} [p.now]
 * @returns {Promise<{doc: jsPDF, fileName: string}>}
 */
export async function buildStratSummary({ well, tops = [], intervals = [], units = [], unit = 'm', scheme = 'catuneanu', report = {}, section = null, ageCharts = {}, now = new Date() }) {
  const u = unit === 'ft' ? 'ft' : 'm';
  const k = u === 'ft' ? 1 / FT : 1;
  const d1 = (m) => (Number.isFinite(Number(m)) ? (Number(m) * k).toFixed(1) : EMPTY_VALUE);
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const logo = await loadPetrolordLogo();
  let y = drawBrandHeader(doc, { logo, margin, pageWidth: pageW, appTitle: 'Stratigraphy Studio', subtitle: 'Stratigraphic summary', rightLines: [latin1(well.name)] }) + 8;

  const vertical = verticalDepthOf(well);
  const basis = vertical.basis === 'tvd' ? 'TVD below KB through the survey' : 'MD below KB (the well has no survey)';
  const sorted = [...tops].sort((a, b) => a.md_m - b.md_m);
  const dated = sortDated(sorted.map((t) => ({ name: t.name, md_m: vertical.tvd(Number(t.md_m)), age_ma: t.age_ma, hiatus_to_ma: t.hiatus_to_ma ?? null, surface_type: normalizeSurfaceType(t.surface_type) })));
  const model = ageDepthModel(dated);

  const kv = [
    ['Well', well.name],
    ['Field', report?.field?.trim() || EMPTY_VALUE],
    ['Section', section || EMPTY_VALUE],
    ['Prepared by', report?.analyst?.trim() || EMPTY_VALUE],
    ['Prepared on', now.toISOString().slice(0, 10)],
    ['Software', buildLabel()],
    ['Timescale', `${TIMESCALE_VERSION} (International Chronostratigraphic Chart, ICS, CC BY 4.0)`],
    ['Terms', SCHEME_LABEL[scheme] || scheme],
    ['Depths', `${u === 'ft' ? 'feet' : 'metres'}; tops in MD below KB with TVD; rates and the age-depth plot in ${basis}`],
    ['Dated surfaces', `${dated.length} of ${sorted.length} tops`],
  ];
  doc.autoTable({ startY: y, margin: { left: margin, right: margin }, body: kv.map(([a, b]) => [latin1(a), latin1(b)]), styles: { fontSize: 8.5, cellPadding: 1.4 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 36 } }, theme: 'grid' });
  y = doc.lastAutoTable.finalY + 7;

  const heading = (text, need = 30) => {
    if (y > pageH - need) { doc.addPage(); y = 18; }
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text(latin1(text), margin, y);
    y += 3;
  };
  const table = (head, body) => {
    doc.autoTable({ startY: y, margin: { left: margin, right: margin }, head: [head.map(latin1)], body: body.map((r) => r.map((c) => latin1(c))), styles: { fontSize: 7.5, cellPadding: 1.2 }, headStyles: { fillColor: [15, 23, 42] }, theme: 'grid' });
    y = doc.lastAutoTable.finalY + 7;
  };
  const note = (text) => { doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105); doc.text(doc.splitTextToSize(latin1(text), pageW - 2 * margin), margin, y + 3); y += 9; };

  // ---- tops ----
  const tract = tractBelowEach(sorted.map((t) => ({ ...t, surface_type: normalizeSurfaceType(t.surface_type) })));
  const unitName = new Map(units.map((x) => [x.id, x.name]));
  heading(`Typed tops (${sorted.length})`);
  if (sorted.length) {
    table(['Top', `MD (${u})`, `TVD (${u})`, 'Surface', 'Unit', 'Age (Ma)', 'ICS stage', 'Age entered on', 'Tract below'], sorted.map((t) => {
      const code = normalizeSurfaceType(t.surface_type);
      const age = Number.isFinite(t.age_ma) ? t.age_ma : null;
      const tr = tract.get(t.id);
      return [
        t.name, d1(t.md_m), vertical.basis === 'tvd' ? d1(vertical.tvd(Number(t.md_m))) : d1(t.md_m),
        code === 'formation_top' ? 'formation top' : displayLabel(code, scheme, { kind: 'surface', short: true }).label,
        unitName.get(t.unit_id) || EMPTY_VALUE,
        age == null ? EMPTY_VALUE : `${age}${t.hiatus_to_ma != null ? ` (hiatus to ${t.hiatus_to_ma})` : ''}`,
        age == null ? EMPTY_VALUE : (unitAt(age)?.name || 'outside the chart'),
        age == null ? EMPTY_VALUE : chartOf(ageCharts, 'tops', t.id, 'age_ma'),
        tr ? `${displayLabel(tr.code, scheme, { kind: 'tract', short: true }).label}${tr.certain ? '' : ' ?'}` : EMPTY_VALUE,
      ];
    }));
  } else note('No tops on this well.');

  // ---- age-depth plot (vector) and rates ----
  heading('Age-depth', 90);
  if (!model) {
    note('Fewer than two dated surfaces: no age-depth model. Give the tops ages in the Tops view.');
  } else {
    const px0 = margin + 16; const pw = 110; const py0 = y + 4; const ph = 70;
    const ages = [...dated.map((p) => p.age_ma), ...dated.map((p) => p.hiatus_to_ma).filter((v) => v != null)];
    const aMin = Math.min(...ages); const aMax = Math.max(...ages);
    const zMin = Math.min(...dated.map((p) => p.md_m)); const zMax = Math.max(...dated.map((p) => p.md_m));
    const xOf = (a) => px0 + ((a - aMin) / Math.max(1e-9, aMax - aMin)) * pw;
    const yOf = (z) => py0 + ((z - zMin) / Math.max(1e-9, zMax - zMin)) * ph; // depth down
    doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.2);
    doc.rect(px0, py0, pw, ph);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85);
    doc.text(latin1(`Age (Ma), ${TIMESCALE_VERSION}`), px0 + pw / 2, py0 - 1.5, { align: 'center' });
    for (const a of [aMin, (aMin + aMax) / 2, aMax]) doc.text(String(Number(a.toFixed(2))), xOf(a), py0 + ph + 3.5, { align: 'center' });
    for (const z of [zMin, (zMin + zMax) / 2, zMax]) doc.text(d1(z), px0 - 1.5, yOf(z) + 1, { align: 'right' });
    doc.text(latin1(`${vertical.basis === 'tvd' ? 'TVD' : 'MD'} (${u}), depth down`), margin, py0 + ph + 8);
    doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.5);
    for (const s of model.segments) doc.line(xOf(s.age_top_ma), yOf(s.top_md_m), xOf(s.age_base_ma), yOf(s.base_md_m));
    doc.setDrawColor(180, 83, 9);
    for (const h of model.hiatuses) doc.line(xOf(h.from_ma), yOf(h.md_m), xOf(h.to_ma), yOf(h.md_m));
    doc.setFillColor(15, 23, 42);
    for (const p of dated) doc.circle(xOf(p.age_ma), yOf(p.md_m), 0.7, 'F');
    y = py0 + ph + 12;
    table(['From', 'To', `${vertical.basis === 'tvd' ? 'TVD' : 'MD'} (${u})`, 'Ages (Ma)', `Rate (${u}/Ma)`], [
      ...model.segments.map((s) => [s.upper || EMPTY_VALUE, s.lower || EMPTY_VALUE, `${d1(s.top_md_m)} to ${d1(s.base_md_m)}`, `${s.age_top_ma} to ${s.age_base_ma}`, s.rate_m_per_ma == null ? 'event' : (s.rate_m_per_ma * k).toFixed(1)]),
      ...model.hiatuses.map((h) => [`hiatus at ${h.name || EMPTY_VALUE}`, EMPTY_VALUE, d1(h.md_m), `${h.from_ma} to ${h.to_ma}`, 'no deposition']),
    ]);
  }

  // ---- Wheeler cells of the well ----
  heading('Wheeler (time down, this well)');
  const tractRows = (intervals || []).some((r) => r.kind === 'systems_tract') ? intervals.filter((r) => r.kind === 'systems_tract') : sequenceTracts(sorted, intervals);
  const chart = withSectionTracts(wheelerChart([{ id: well.id, name: well.name, surfaces: sorted.map((t) => ({ name: t.name, md_m: t.md_m, age_ma: t.age_ma, hiatus_to_ma: t.hiatus_to_ma ?? null, surface_type: normalizeSurfaceType(t.surface_type) })) }]), { [well.id]: tractRows });
  const cells = chart.wells[0]?.cells || [];
  if (cells.length) {
    table(['From (Ma)', 'To (Ma)', 'Kind', 'Between', 'Tract'], cells.map((c) => [String(c.from_ma), String(c.to_ma), c.kind, c.kind === 'hiatus' ? 'removed or not deposited' : `${d1(c.top_md_m)} to ${d1(c.base_md_m)} ${u} MD`,
      c.tract ? `${displayLabel(c.tract, scheme, { kind: 'tract', short: true }).label}${c.certain ? '' : ' ?'}` : EMPTY_VALUE]));
  } else note(chart.skipped[0]?.reason ? `Not placed: ${chart.skipped[0].reason}.` : 'No Wheeler cells.');

  // ---- stratigraphic column (vector) and units ----
  const col = orderedUnits(units).filter((x) => Number.isFinite(x.age_top_ma) && Number.isFinite(x.age_base_ma));
  heading(`Stratigraphic column (${units.length} unit${units.length === 1 ? '' : 's'})`, 80);
  if (col.length) {
    const cx0 = margin + 16; const cy0 = y + 4; const chh = 60; const lanesW = 40;
    const aMin = Math.min(...col.map((x) => x.age_top_ma)); const aMax = Math.max(...col.map((x) => x.age_base_ma));
    const yA = (a) => cy0 + ((a - aMin) / Math.max(1e-9, aMax - aMin)) * chh;
    const maxDepth = Math.max(...col.map((x) => x.depth));
    const laneW = lanesW / (maxDepth + 1);
    doc.setFontSize(6.5); doc.setTextColor(51, 65, 85);
    for (const a of [aMin, aMax]) doc.text(`${Number(a.toFixed(2))} Ma`, cx0 - 1.5, yA(a) + 1, { align: 'right' });
    for (const x of col) {
      const [r, g, b] = hex(x.colour);
      doc.setFillColor(r, g, b); doc.setDrawColor(71, 85, 105); doc.setLineWidth(0.15);
      doc.rect(cx0 + x.depth * laneW, yA(x.age_top_ma), laneW, Math.max(0.4, yA(x.age_base_ma) - yA(x.age_top_ma)), 'FD');
    }
    y = cy0 + chh + 6;
    table(['Unit', 'Rank', 'Top (Ma)', 'Base (Ma)', 'Entered on'], orderedUnits(units).map((x) => [`${'  '.repeat(x.depth)}${x.name}`, x.rank,
      x.age_top_ma == null ? EMPTY_VALUE : String(x.age_top_ma), x.age_base_ma == null ? EMPTY_VALUE : String(x.age_base_ma),
      x.age_top_ma == null && x.age_base_ma == null ? EMPTY_VALUE : chartOf(ageCharts, 'units', x.id, x.age_base_ma != null ? 'age_base_ma' : 'age_top_ma')]));
    note('Lithostratigraphic units are placed by their nominal ages.');
  } else note('No dated units in the column.');

  heading('Reviewed by', 20);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42);
  doc.text('Name: ____________________    Signature: ____________________    Date: ____________', margin, y + 5);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 110, 125);
    doc.text(latin1(`${well.name} stratigraphic summary, ${buildLabel()}. ${TIMESCALE_VERSION}. Depths in ${u}.`), margin, pageH - 6);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 6, { align: 'right' });
  }
  const stem = latin1(well.name).replace(/[^A-Za-z0-9._-]+/g, '_');
  return { doc, fileName: `${stem}_stratigraphic_summary.pdf` };
}
