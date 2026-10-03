/**
 * Fluid Systems Studio PDF report (FLUID-U1; reviewer lens RL1 to RL12),
 * on the shared Report Kit (src/lib/reportKit). Pure formatting: the rows
 * come from reportModel.js (the same rows the Report tab shows) and the
 * figures from reportFigures.js (the series of the screen charts). Nothing
 * is calculated or named here.
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { describePvtContract } from '@/lib/inputProvenance/pvtContract';
import { buildFluidReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';
import { buildFluidReportFigures } from './reportFigures.js';

/**
 * Everything the report needs, gathered from the page state in one place
 * (the Report tab calls this too, so the screen and the PDF are one model).
 */
export function collectFluidReportArgs({ inputs, results, eos, envelope, system, projectName, organizationName, build, contract }) {
  const model = buildFluidReportModel({ inputs, results, eos, system, projectName, organizationName, build });
  const figures = model ? buildFluidReportFigures({ model, inputs, results, eos, envelope, system }) : [];
  return { model, figures, contract: contract || null };
}

/**
 * @param {{model: object, figures: object[], contract: ?object}} a collectFluidReportArgs(...)
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildFluidPdf(a, { logo = null, generatedAt = new Date() } = {}) {
  const { model, figures, contract } = a;
  if (!model) throw new Error('Fluid report: there is no result to report.');
  if (!figures?.length) throw new Error('Fluid report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;

  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  table('Headline results', model.headline.head, model.headline.rows, {
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 26 }, 2: { cellWidth: 20 } },
    note: model.headline.note,
    emptyValue: null,
  });

  report.inputsTable(model.inputs.rows, { title: 'Inputs and their sources', note: model.inputs.note });

  table('Method used for each property', model.methods.head, model.methods.rows, {
    columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 52 }, 2: { cellWidth: 34 } },
    note: 'The method names are written by the engine beside the calculation that used them.',
    emptyValue: null,
  });

  table('Basis and conventions', ['Item', 'As used in this report'], model.basis, { columnStyles: { 0: { cellWidth: 50 } } });

  if (model.separator) {
    table(model.separator.title, model.separator.head, model.separator.rows, { note: model.separator.note, emptyValue: null });
  }

  // lab tuning: what was matched to which data, and the error after tuning
  section('Lab tuning', model.tuning.text, { need: 20 });
  if (model.tuning.table) {
    table('Lab values matched', model.tuning.table.head, model.tuning.table.rows, {
      note: model.tuning.tableNote || 'Errors are model minus measured: percent, or API degrees for the stock-tank gravity.',
    });
  }
  if (model.tuning.parameters) {
    table('Tuning parameters', model.tuning.parameters.head, model.tuning.parameters.rows, model.tuning.parameters.note ? { note: model.tuning.parameters.note } : {});
  }

  // the laboratory tables and the misfit of the model against them
  if (model.lab) {
    table('Laboratory tables loaded', model.lab.tables.head, model.lab.tables.rows, { columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 14 }, 2: { cellWidth: 26 } } });
    table('Laboratory data against the model', model.lab.misfit.head, model.lab.misfit.rows, { note: model.lab.misfit.note });
    if (model.lab.notes.length) section('Notes on the laboratory comparison', model.lab.notes.map((n) => `- ${n}`).join('\n'), { need: 16 });
    const qc = model.lab.qc;
    section('Quality checks of the laboratory tables', [
      `Checked: ${qc.checked.join('; ')}.`,
      qc.flags.length ? `Flagged (${qc.flags.length}), not corrected:\n${qc.flags.map((f) => `- ${f}`).join('\n')}` : 'Nothing was flagged.',
    ].join('\n'), { need: 16 });
    if (qc.massBalance) table('Mass balance of the differential liberation', qc.massBalance.head, qc.massBalance.rows, { note: qc.massBalance.note });
  }

  report.limits({
    assumptions: model.limits.assumptions,
    ranges: { head: model.limits.ranges.head, body: model.limits.ranges.rows, note: model.limits.rangesNote, columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 56 } } },
    flags: model.limits.flags,
  });

  if (model.warnings.length) {
    section('Notes from the engine', model.warnings.map((w) => `- ${w}`).join('\n'), { need: 16 });
  }

  if (model.flowAssurance) {
    table('Flow assurance screening', model.flowAssurance.head, model.flowAssurance.rows, { columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 50 } }, note: model.flowAssurance.note });
  }
  if (model.batch) {
    table(model.batch.title, model.batch.head, model.batch.rows, { note: model.batch.note });
  }

  table('PVT table', model.pvtTable.head, model.pvtTable.rows, {
    columnStyles: Object.fromEntries(model.pvtTable.head.map((_, i) => [i, { halign: i === model.pvtTable.head.length - 1 ? 'left' : 'right', fontSize: 7, cellPadding: 0.9 }])),
    note: 'The rows are the rows of the table the app exports and hands to other apps, in the units of the header of this report. Oil compressibility is reported above the saturation pressure only.',
  });

  if (contract) {
    table('PVT contract handed to other apps', ['Item', 'Value'], describePvtContract(contract), {
      columnStyles: { 0: { cellWidth: 40 } },
      note: 'Other Petrolord apps receive this block with the table and print it as the source of the fluid properties they take.',
    });
  }

  report.figures(figures);

  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ projectName, sampleName } = {}) => {
  const base = String(sampleName || projectName || 'fluid').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `Fluid_Report_${base || 'fluid'}.pdf`;
};

/**
 * Build and save the report. The Petrolord mark for the plots is loaded
 * first; the report still builds without it.
 * @returns {Promise<boolean>} success
 */
export async function exportFluidPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildFluidPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('Fluid report export failed:', e);
    return false;
  }
}
