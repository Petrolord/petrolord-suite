// Data Quality Studio (Data & AI D1): the QC report, as CSV and as PDF.
//
// Layout only. Every score, flag, rule and reason is the engine's, taken
// from runQcProfile; every parameter is the profile text the run used.
// Reasons are written exactly as the engine printed them, every figure at
// full round-trip precision (the screen shortens them; exports do not), and
// a flag row's value column carries the engine's flagged value unrounded.
import { SCORE_BASIS, dimensionLabel } from '@/utils/dataAi/qcProfile';

const q = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Profile leaves as [path, value] pairs, for the parameter table. */
export function flattenProfile(profile, prefix = '') {
  const out = [];
  Object.entries(profile || {}).forEach(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenProfile(v, path));
    else out.push([path, Array.isArray(v) ? v.join(' ') : v]);
  });
  return out;
}

export const CSV_COLUMNS = ['record', 'dimension', 'method', 'channel', 'at', 'sample', 'rule', 'reason', 'value'];

/**
 * One CSV, one row per record: meta, parameter, score and flag rows under a
 * shared header, so a spreadsheet filter on the first column separates them.
 */
export function buildReportCsv({ runName, dataset, profile, run }) {
  const lines = [CSV_COLUMNS.join(',')];
  const row = (cells) => lines.push(CSV_COLUMNS.map((c) => q(cells[c])).join(','));
  row({ record: 'meta', rule: 'run', value: runName || 'Unsaved QC run' });
  row({ record: 'meta', rule: 'dataset', value: dataset?.label || '' });
  row({ record: 'meta', rule: 'source', value: dataset?.source || '' });
  row({ record: 'meta', rule: 'samples', value: run?.dataset?.n ?? '' });
  row({ record: 'meta', rule: 'channels', value: (run?.dataset?.channels || []).join(' ') });
  row({ record: 'meta', rule: 'engine', value: 'packages/engines/engines/dataai/quality.js (Data & AI D1)' });
  row({ record: 'meta', rule: 'generated', value: new Date().toISOString() });
  flattenProfile(profile).forEach(([k, v]) => row({ record: 'parameter', rule: k, value: v }));
  const sc = run?.scorecard;
  if (sc && !sc.error) {
    sc.dimensions.forEach((d) => row({
      record: 'score', dimension: d.name, rule: `checked ${d.checked ?? ''} failed ${d.failed ?? ''} weight ${d.weight}`, value: d.score,
    }));
    row({ record: 'score', dimension: 'total', rule: `weakest ${sc.weakest}`, value: sc.total });
  } else if (sc && sc.error) {
    row({ record: 'score', dimension: 'total', reason: sc.error });
  }
  (run?.flags || []).forEach((f) => row({
    record: 'flag', dimension: f.dimension, method: f.method, channel: f.channel, at: f.at,
    sample: f.index === null || f.index === undefined ? '' : f.index + 1, rule: f.rule, reason: f.reason,
    value: f.value === null || f.value === undefined ? '' : String(f.value),
  }));
  (run?.results || []).filter((r) => r.result && r.result.error).forEach((r) => row({
    record: 'refused', dimension: r.dimension, method: r.method, channel: r.channel, reason: r.result.error,
  }));
  return `${lines.join('\n')}\n`;
}

export const PDF_FLAG_LIMIT = 2000;

/** The QC report as a branded PDF (jsPDF + autotable, the shared banner). */
export async function generateQcPdf({ runName, dataset, profile, run }) {
  const [{ default: JsPdf }, { default: autoTable }, brand] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('@/lib/pdfBrand'),
  ]);
  const doc = new JsPdf();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 14;
  const logo = await brand.loadPetrolordLogo();
  let y = brand.drawBrandHeader(doc, {
    logo, margin, pageWidth, appTitle: 'Data Quality Studio', subtitle: 'QC report', rightLines: [runName || 'Unsaved QC run'],
  }) + 10;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  const intro = doc.splitTextToSize(`Dataset: ${dataset?.label || ''}. ${run?.dataset?.n ?? 0} samples; channels ${(run?.dataset?.channels || []).join(', ')}.`, pageWidth - 2 * margin);
  doc.text(intro, margin, y);
  y += intro.length * 5 + 3;

  const sc = run?.scorecard;
  if (sc && !sc.error) {
    autoTable(doc, {
      startY: y,
      head: [['Dimension', 'Checked', 'Failed', 'Weight', 'Score']],
      body: [
        ...sc.dimensions.map((d) => [dimensionLabel(d.name), d.checked ?? '', d.failed ?? '', d.weight.toFixed(4), d.score.toFixed(4)]),
        ['Total', '', '', '', sc.total.toFixed(4)],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = doc.lastAutoTable.finalY + 4;
  } else {
    doc.text(sc?.error ? `Scorecard refused: ${sc.error}` : 'No scorecard: nothing was checked.', margin, y);
    y += 6;
  }
  doc.setFontSize(7);
  const basis = doc.splitTextToSize(SCORE_BASIS.join(' '), pageWidth - 2 * margin);
  doc.text(basis, margin, y + 2);
  y += basis.length * 3.2 + 4;

  const flags = run?.flags || [];
  autoTable(doc, {
    startY: y,
    head: [['Dimension', 'Method', 'Channel', 'At', 'Rule', 'Reason']],
    body: flags.slice(0, PDF_FLAG_LIMIT).map((f) => [f.dimension, f.method, f.channel || '', f.at || '', f.rule, f.reason]),
    styles: { fontSize: 7, cellPadding: 1 },
    columnStyles: { 5: { cellWidth: 70 } },
    headStyles: { fillColor: [15, 23, 42] },
  });
  y = doc.lastAutoTable.finalY + 4;
  if (flags.length > PDF_FLAG_LIMIT) {
    doc.setFontSize(8);
    doc.text(`${flags.length - PDF_FLAG_LIMIT} further flags are in the CSV export.`, margin, y);
    y += 5;
  }
  const refused = (run?.results || []).filter((r) => r.result && r.result.error);
  if (refused.length) {
    autoTable(doc, {
      startY: y,
      head: [['Refused check', 'Channel', 'Engine reason']],
      body: refused.map((r) => [`${r.dimension}: ${r.method}`, r.channel || '', r.result.error]),
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [120, 53, 15] },
    });
    y = doc.lastAutoTable.finalY + 4;
  }
  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value (blank = engine default)']],
    body: flattenProfile(profile).map(([k, v]) => [k, v === undefined || v === null ? '' : String(v)]),
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  return doc;
}
