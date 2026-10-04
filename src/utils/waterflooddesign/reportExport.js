/**
 * Waterflood Design Studio PDF report (WF-U1; reviewer lens RL1 to RL12), on
 * the shared Report Kit (src/lib/reportKit). Pure formatting: the rows come
 * from reportModel.js (the rows the Report tab shows) and the figures from
 * reportFigures.js (the series of the screen charts).
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { buildWaterfloodReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';
import { buildWaterfloodReportFigures } from './reportFigures.js';

/** Everything the report needs from the studio state (the Report tab calls this too). */
export function collectWaterfloodReportArgs({ state, system, projectName, organizationName, build }) {
  const model = buildWaterfloodReportModel(state, { projectName, organizationName, build, system });
  const figures = model ? buildWaterfloodReportFigures({ model, state }) : [];
  return { model, figures };
}

/**
 * @param {{model: object, figures: object[]}} a collectWaterfloodReportArgs(...)
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildWaterfloodPdf(a, { logo = null, generatedAt = new Date() } = {}) {
  const { model, figures } = a;
  if (!model) throw new Error('Waterflood report: there is nothing to report.');
  if (!figures?.length) throw new Error('Waterflood report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;

  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  table('Headline results', model.headline.head, model.headline.rows, {
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 34 }, 2: { cellWidth: 18 } },
    emptyValue: null,
  });
  if (model.split) table('Recovery of the pattern, by its parts', model.split.head, model.split.rows, { columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 22 } }, note: model.split.note });
  else section('Recovery of the pattern, by its parts', 'Not split: the pattern forecast did not run.', { need: 14 });
  if (model.mobility) table('Mobility ratio, by its components', model.mobility.head, model.mobility.rows, { columnStyles: { 0: { cellWidth: 90 } }, note: model.mobility.note });

  report.inputsTable(model.inputs.rows, { title: 'Inputs and their sources', note: model.inputs.note });

  if (model.forecastTable) table('Injection plan and forecast, year by year', model.forecastTable.head, model.forecastTable.rows, { note: model.forecastTable.note, columnStyles: Object.fromEntries(model.forecastTable.head.map((_, i) => [i, { halign: i ? 'right' : 'left' }])) });

  if (model.surveillance) {
    section('Surveillance data: the file as read', model.surveillance.source.join(' '), { need: 18 });
    section('Data quality', model.surveillance.quality, { need: 12 });
    table('Wells of the history', model.surveillance.wells.head, model.surveillance.wells.rows, { note: model.surveillance.wells.note });
  } else {
    section('Surveillance data', 'No injection and production history was loaded: the VRR, Hall and Chan results do not apply.', { need: 14 });
  }
  if (model.hall) table('Hall plot slope windows', model.hall.head, model.hall.rows, { note: model.hall.note, columnStyles: { 0: { cellWidth: 20 } } });
  if (model.layeredTable) table('Layered sweep: breakthrough stages', model.layeredTable.head, model.layeredTable.rows, { note: model.layeredTable.note });

  table('Model', ['Item', 'As used in this report'], model.model, { columnStyles: { 0: { cellWidth: 40 } } });
  table('Basis and conventions', ['Item', 'As used in this report'], model.basis, { columnStyles: { 0: { cellWidth: 40 } } });

  report.limits({
    assumptions: model.limits.assumptions,
    ranges: { head: model.limits.ranges.head, body: model.limits.ranges.rows, columnStyles: { 0: { cellWidth: 80 } } },
    flags: model.limits.flags,
    noFlagsText: 'No input is outside a published range and nothing was edited after an intake.',
    flagsTitle: 'Flags on the inputs and the methods',
  });

  if (model.krBlock) table('kr-1 block received from SCAL Studio', ['Item', 'Value'], model.krBlock, { columnStyles: { 0: { cellWidth: 40 } } });
  else section('Relative permeability source', 'No SCAL Studio intake: the curves were entered in this app.', { need: 12 });
  if (model.pvtBlock) table('pvt-1 block received from Fluid Systems Studio', ['Item', 'Value'], model.pvtBlock, { columnStyles: { 0: { cellWidth: 40 } } });
  else section('PVT source', 'No Fluid Systems Studio intake: the viscosities and volume factors were entered in this app.', { need: 12 });

  if (model.notes) section('Notes', model.notes, { need: 16 });

  report.figures(figures);
  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ projectName } = {}) => {
  const base = String(projectName || 'waterflood').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `Waterflood_Report_${base || 'waterflood'}.pdf`;
};

/** Build and save the report. @returns {Promise<boolean>} success */
export async function exportWaterfloodPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildWaterfloodPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('Waterflood report export failed:', e);
    return false;
  }
}
