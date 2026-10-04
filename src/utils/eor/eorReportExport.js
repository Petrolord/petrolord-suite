/**
 * EOR Screening PDF report (EOR-U1; reviewer lens RL1 to RL12) on the
 * shared Report Kit (src/lib/reportKit). Pure formatting: the rows come
 * from reportModel.js, the one model of the Report tab and the PDF.
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { buildEorReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';

export const collectEorReportArgs = (inputs, opts) => ({ model: buildEorReportModel(inputs, opts) });

/**
 * @param {{model: object}} a
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildEorPdf({ model }, { logo = null, generatedAt = new Date() } = {}) {
  if (!model) throw new Error('EOR report: there is nothing to report.');
  if (!model.figures?.length) throw new Error('EOR report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;
  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  table('Ranking of the methods', model.ranking.head, model.ranking.rows, {
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 46 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    note: model.ranking.note,
  });
  report.inputsTable(model.inputs.rows, { title: 'Inputs and their sources', note: model.inputs.note });
  table('Criteria used: edition', model.edition.head, model.edition.rows, { columnStyles: { 0: { cellWidth: 24 } } });
  table('CO2 miscible: minimum depth by oil gravity', model.co2DepthTable.head, model.co2DepthTable.rows, { note: model.co2DepthTable.note });
  table('CO2 miscibility: MMP against reservoir pressure', model.mmp.head, model.mmp.rows, { columnStyles: { 0: { cellWidth: 44 } }, note: model.mmp.note });

  report.heading('Each method, criterion by criterion', 30);
  report.layout.y += 5;
  for (const m of model.methods) {
    table(m.title, m.head, m.rows, {
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 26 }, 2: { cellWidth: 17 }, 3: { cellWidth: 19 }, 4: { cellWidth: 15 }, 6: { cellWidth: 26 } },
      note: m.note,
      fontSize: 6.5,
    });
  }

  report.limits({
    assumptions: model.limits.assumptions,
    flags: model.limits.flags,
    noFlagsText: model.limits.noFlagsText,
    flagsTitle: 'Flags on the inputs',
  });
  if (model.notes) section('Notes', model.notes, { need: 16 });

  report.figures(model.figures);
  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ projectName } = {}) => {
  const base = String(projectName || 'eor').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `EOR_Screening_Report_${base || 'eor'}.pdf`;
};

/** Build and save the report. @returns {Promise<boolean>} success */
export async function exportEorPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildEorPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('EOR report export failed:', e);
    return false;
  }
}
