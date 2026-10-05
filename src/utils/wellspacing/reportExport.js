/**
 * Well Spacing PDF report (WS-U1; reviewer lens RL1 to RL12) on the shared
 * Report Kit (src/lib/reportKit). Pure formatting: the rows come from
 * reportModel.js, the one model of the Report tab and the PDF.
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { buildWellSpacingReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';

export const collectWellSpacingReportArgs = (inputs, opts) => ({ model: buildWellSpacingReportModel(inputs, opts) });

const SMALL = 6.5;

/**
 * @param {{model: object}} a
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildWellSpacingPdf({ model }, { logo = null, generatedAt = new Date() } = {}) {
  if (!model) throw new Error('Well Spacing report: there is nothing to report.');
  if (!model.figures?.length) throw new Error('Well Spacing report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;
  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  if (model.hasResults) {
    table('Spacing cases', model.cases.head, model.cases.rows, { note: model.cases.note, fontSize: SMALL });
    table('Economics of each case, by part', model.economics.head, model.economics.rows, { note: model.economics.note, fontSize: SMALL });
    table('Incremental economics: the added wells', model.incremental.head, model.incremental.rows, { note: model.incremental.note, fontSize: SMALL });
    table('Rate limit: before and after', model.rateLimit.head, model.rateLimit.rows, { note: model.rateLimit.note, fontSize: SMALL });
  } else {
    section('Spacing cases', 'No case has been computed: the inputs are incomplete. The inputs table below says which are missing.');
  }
  report.inputsTable(model.inputs.rows, { title: 'Inputs and their sources', note: model.inputs.note });
  if (model.hasResults) table('Drainage geometry, timing and deliverability', model.drainage.head, model.drainage.rows, { note: model.drainage.note, fontSize: SMALL });
  table('Cross-checks', model.cross.head, model.cross.rows, { note: model.cross.note, columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 30 } } });
  table('Methods and references', model.methods.head, model.methods.rows, { columnStyles: { 0: { cellWidth: 36 } }, fontSize: 7 });

  report.limits({
    assumptions: model.limits.assumptions,
    flags: model.limits.flags,
    noFlagsText: model.limits.noFlagsText,
    flagsTitle: 'Flags on the inputs and the cases',
  });
  if (model.notes) section('Notes', model.notes, { need: 16 });

  report.figures(model.figures);
  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ projectName } = {}) => {
  const base = String(projectName || 'spacing').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `Well_Spacing_Report_${base || 'spacing'}.pdf`;
};

/** Build and save the report. @returns {Promise<boolean>} success */
export async function exportWellSpacingPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildWellSpacingPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('Well Spacing report export failed:', e);
    return false;
  }
}
