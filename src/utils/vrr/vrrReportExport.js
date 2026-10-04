/**
 * Voidage Replacement PDF report (VRR-U1; reviewer lens RL1 to RL12) on the
 * shared Report Kit (src/lib/reportKit). Pure formatting: the rows come from
 * reportModel.js (the rows the Report tab shows) and the figures from
 * reportFigures.js (the series of the screen charts). Nothing is calculated
 * here.
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { deriveVrr } from './workspace.js';
import { buildVrrReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';
import { buildVrrReportFigures } from './reportFigures.js';

/**
 * Everything the report needs from the project inputs (the Report tab calls
 * this too, so the screen and the PDF are one model).
 */
export function collectVrrReportArgs({ inputs, derived = null, system, projectName, organizationName, build }) {
  const d = derived || deriveVrr(inputs);
  const model = buildVrrReportModel(inputs, d, { projectName, organizationName, build, system: system || inputs.unitSystem });
  const figures = model ? buildVrrReportFigures({ model, inputs, d, system: model.system }) : [];
  return { model, figures, d };
}

const RIGHT = (n, from = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + from, { halign: 'right' }]));

/**
 * @param {{model: object, figures: object[]}} a collectVrrReportArgs(...)
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildVrrPdf(a, { logo = null, generatedAt = new Date() } = {}) {
  const { model, figures } = a;
  if (!model) throw new Error('VRR report: there is nothing to report.');
  if (!figures?.length) throw new Error('VRR report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;

  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  table('Headline results', model.headline.head, model.headline.rows, {
    columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 30 }, 2: { cellWidth: 16 } },
    note: model.headline.note,
    emptyValue: null,
  });

  report.inputsTable(model.inputs.rows, { title: 'Inputs and their sources', note: model.inputs.note });

  table('Voidage ledger by period', model.ledger.head, model.ledger.rows, {
    columnStyles: RIGHT(9),
    note: model.ledger.note,
    fontSize: 6.5,
  });
  table('Volumes and FVFs by period', model.periods.head, model.periods.rows, {
    columnStyles: RIGHT(10),
    note: model.periods.note,
    fontSize: 6,
  });

  if (model.imported) {
    table('What the import read', model.imported.head, model.imported.rows, { note: model.imported.note });
  }

  if (model.patterns) {
    table('Patterns', model.patterns.rollup.head, model.patterns.rollup.rows, { columnStyles: RIGHT(2, 2) });
    table('Allocation factors', model.patterns.matrix.head, model.patterns.matrix.rows, { note: model.patterns.matrix.note, columnStyles: RIGHT(model.patterns.matrix.head.length - 1) });
    if (model.patterns.advice) table('Water injection advice by pattern', model.patterns.advice.head, model.patterns.advice.rows, { note: model.patterns.advice.note });
  }

  if (model.wellTable) {
    table('Voidage by well', model.wellTable.head, model.wellTable.rows, { note: model.wellTable.note, columnStyles: RIGHT(4, 3), fontSize: 6.5 });
  }

  table('Model, basis and conventions', ['Item', 'As used in this report'], model.basis, { columnStyles: { 0: { cellWidth: 40 } } });

  report.limits({
    assumptions: model.limits.assumptions,
    flags: model.limits.flags,
    noFlagsText: model.limits.noFlagsText,
    flagsTitle: 'Flags on the inputs, the import and the periods',
  });

  if (model.pvtBlock) {
    table('pvt-1 block the FVFs were taken from', ['Item', 'Value'], model.pvtBlock, { columnStyles: { 0: { cellWidth: 40 } } });
  }
  if (model.notes) section('Notes', model.notes, { need: 16 });

  report.figures(figures);

  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ projectName } = {}) => {
  const base = String(projectName || 'vrr').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `VRR_Report_${base || 'vrr'}.pdf`;
};

/** Build and save the report. @returns {Promise<boolean>} success */
export async function exportVrrPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildVrrPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('VRR report export failed:', e);
    return false;
  }
}
