/**
 * Recovery Factor PDF report (RF-U1-005; reviewer lens RL1 to RL12), on the
 * shared Report Kit (src/lib/reportKit). Pure formatting: the rows come from
 * reportModel.js (the rows the Report tab shows) and the figures from
 * reportFigures.js (the series of the screen chart).
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { buildRfReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';
import { buildRfReportFigures } from './reportFigures.js';

/** Everything the report needs from the estimator state (the Report tab calls this too). */
export function collectRfReportArgs({ state, system, projectName, organizationName, build }) {
  const model = buildRfReportModel(state, { projectName, organizationName, build, system });
  const figures = model ? buildRfReportFigures({ model, state }) : [];
  return { model, figures };
}

/**
 * @param {{model: object, figures: object[]}} a collectRfReportArgs(...)
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildRfPdf(a, { logo = null, generatedAt = new Date() } = {}) {
  const { model, figures } = a;
  if (!model) throw new Error('Recovery Factor report: there is nothing to report.');
  if (!figures?.length) throw new Error('Recovery Factor report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;

  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  table('Headline results', model.headline.head, model.headline.rows, {
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 30 }, 2: { cellWidth: 18 } },
    note: model.headline.note || undefined,
  });
  if (model.uncertainty?.rows) {
    table('Uncertainty: recovery factor x in-place volume', model.uncertainty.head, model.uncertainty.rows, { columnStyles: { 0: { cellWidth: 40 } }, note: model.uncertainty.note });
    table('The uncertainty run', ['Item', 'As run'], model.uncertainty.runRows, { columnStyles: { 0: { cellWidth: 45 } } });
  }
  if (model.inPlaceSplit) table(`${model.phase === 'gas' ? 'OGIP' : 'OOIP'} by its parts`, model.inPlaceSplit.head, model.inPlaceSplit.rows, { columnStyles: { 0: { cellWidth: 70 } }, note: model.inPlaceSplit.note });
  else section('In-place volume by its parts', 'Not split: the in-place volume was entered directly or taken from another app (its source is in the inputs table).', { need: 14 });
  if (model.methodSplit) table('The method by its parts', model.methodSplit.head, model.methodSplit.rows, { columnStyles: { 0: { cellWidth: 70 } }, note: model.methodSplit.note, emptyValue: '' });

  report.inputsTable(model.inputs.rows, { title: 'Inputs and their sources', note: model.inputs.note });

  table('Method', ['Item', 'As used in this report'], model.methodRows, { columnStyles: { 0: { cellWidth: 40 } } });
  table('Basis and conventions', ['Item', 'As used in this report'], model.basis, { columnStyles: { 0: { cellWidth: 40 } } });

  report.limits({
    assumptions: model.limits.assumptions,
    ranges: { head: model.limits.ranges.head, body: model.limits.ranges.rows, columnStyles: { 0: { cellWidth: 45 } } },
    flags: model.limits.flags,
    noFlagsText: 'No input is outside the domain of its method, the estimate is inside the analog range, and nothing was edited after an intake.',
    flagsTitle: 'Flags on the inputs and the result',
    rangesTitle: 'Domain of each method, as checked by the app',
  });

  if (model.inPlaceBlock) table('In-place volume received from another app', ['Item', 'Value'], model.inPlaceBlock, { columnStyles: { 0: { cellWidth: 50 } } });
  if (model.pvtBlock) table('pvt-1 block received from Fluid Systems Studio', ['Item', 'Value'], model.pvtBlock, { columnStyles: { 0: { cellWidth: 40 } } });
  else section('PVT source', 'No Fluid Systems Studio intake: any volume factor, viscosity, pressure or z above was entered in this app.', { need: 12 });

  if (model.notes) section('Notes', model.notes, { need: 16 });

  report.figures(figures);
  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ projectName } = {}) => {
  const base = String(projectName || 'recovery-factor').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `Recovery_Factor_Report_${base || 'recovery-factor'}.pdf`;
};

/** Build and save the report. @returns {Promise<boolean>} success */
export async function exportRfPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildRfPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('Recovery Factor report export failed:', e);
    return false;
  }
}
