/**
 * SCAL Studio PDF report (SCAL-U1; reviewer lens RL1 to RL12), on the shared
 * Report Kit (src/lib/reportKit). Pure formatting: the rows come from
 * reportModel.js (the rows the Report tab shows) and the figures from
 * reportFigures.js (the series of the screen charts). Nothing is calculated
 * or named here.
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { describeKrContract } from '@/lib/inputProvenance/krContract';
import { buildScalReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';
import { buildScalReportFigures } from './reportFigures.js';

/**
 * Everything the report needs, gathered from the studio state in one place
 * (the Report tab calls this too, so the screen and the PDF are one model).
 */
export function collectScalReportArgs({ state, system, projectName, organizationName, build }) {
  const model = buildScalReportModel(state, { projectName, organizationName, build, system });
  const figures = model ? buildScalReportFigures({ model, state, system }) : [];
  return { model, figures, contract: state?.contract || null };
}

/**
 * @param {{model: object, figures: object[], contract: ?object}} a collectScalReportArgs(...)
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildScalPdf(a, { logo = null, generatedAt = new Date() } = {}) {
  const { model, figures, contract } = a;
  if (!model) throw new Error('SCAL report: there is nothing to report.');
  if (!figures?.length) throw new Error('SCAL report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;

  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  table('Headline results', model.headline.head, model.headline.rows, {
    columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 34 }, 2: { cellWidth: 22 } },
    note: model.headline.note,
    emptyValue: null,
  });

  report.inputsTable(model.inputs.rows, { title: 'Inputs and their sources', note: model.inputs.note });

  if (model.scaling) {
    table('Leverett scaling and height conversion, by component', model.scaling.head, model.scaling.rows, {
      columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 70 } },
      note: model.scaling.note,
      emptyValue: null,
    });
  }

  if (model.samples) {
    table('Core samples', model.samples.props.head, model.samples.props.rows, { note: 'Lab IFT and contact angle are those of the lab fluid system; sigma cos theta scales each sample\'s Pc to J.' });
    table('Sample pedigree', model.samples.pedigree.head, model.samples.pedigree.rows, { note: 'What the laboratory measured and how, as entered. Not stated prints as such.' });
    table('Lab tables imported', model.samples.imports.head, model.samples.imports.rows, { note: model.samples.imports.note });
    if (model.samples.fits) table('Corey fits to the lab kr tables', model.samples.fits.head, model.samples.fits.rows, { note: model.samples.fits.note });
    if (model.samples.goFits) table('Corey fits to the lab gas-oil tables', model.samples.goFits.head, model.samples.goFits.rows, { note: model.samples.goFits.note });
  } else {
    section('Core samples', 'No core sample is loaded: the working curves and the J function were entered, not fitted to lab data.', { need: 16 });
  }

  section('Leverett J from the samples', model.jSection.text, { need: 16 });
  if (model.jSection.table) table('Capillary pressure data by sample', model.jSection.table.head, model.jSection.table.rows);

  table('Model', ['Item', 'As used in this report'], model.model, { columnStyles: { 0: { cellWidth: 50 } } });
  table('Basis and conventions', ['Item', 'As used in this report'], model.basis, { columnStyles: { 0: { cellWidth: 50 } } });

  report.limits({
    assumptions: model.limits.assumptions,
    ranges: { head: model.limits.ranges.head, body: model.limits.ranges.rows, columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 52 } } },
    flags: model.limits.flags,
    noFlagsText: model.limits.noFlagsText,
    flagsTitle: 'Flags on the inputs, the samples and the fits',
  });

  if (model.notes) section('Notes', model.notes, { need: 16 });

  for (const key of ['ow', 'go', 'pc']) {
    const t = model.tables[key];
    if (t) table(t.title, t.head, t.rows, { note: t.note, columnStyles: Object.fromEntries(t.head.map((_, i) => [i, { halign: 'right' }])) });
  }

  if (contract) {
    table('kr-1 block handed to other apps', ['Item', 'Value'], describeKrContract(contract), {
      columnStyles: { 0: { cellWidth: 40 } },
      note: 'Waterflood Design Studio receives this block with the oil-water table and prints it as the source of the curves. Petrophysics, Earth Modeling, Rock Physics and ReservoirCalc Pro read the saturation-height function of the same saved project.',
    });
  }

  report.figures(figures);

  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ projectName } = {}) => {
  const base = String(projectName || 'scal').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `SCAL_Report_${base || 'scal'}.pdf`;
};

/** Build and save the report. @returns {Promise<boolean>} success */
export async function exportScalPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildScalPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('SCAL report export failed:', e);
    return false;
  }
}
