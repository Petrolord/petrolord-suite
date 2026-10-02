// Risked Reserves Valuation PDF report (upgrade U1, 2026-10-02), on the
// shared Report Kit (src/lib/reportKit). Pure formatting: every row and
// every plotted point comes from buildRrvReportModel, the builder the Report
// tab on the screen shows, so the page and the screen cannot disagree.
// Text is Latin-1 only (the kit's filter).

import { createReport } from '@/lib/reportKit';
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { buildRrvReportModel } from './rrvReportModel';

const KEY_VALUE = { 0: { cellWidth: 52, fontStyle: 'bold' } };

/**
 * Build the report document from a report model.
 * @param {object} model buildRrvReportModel(...)
 * @param {{logo?: ?object, generatedAt?: Date}} [o]
 * @returns {{doc: object, figures: Array, pages: number, model: object}}
 */
export function buildRrvReport(model, { logo = null, generatedAt = new Date() } = {}) {
  if (!model.valued) throw new Error(`This prospect cannot be reported yet: ${model.problem || 'its inputs are not complete'}`);
  // a report with no figure entries is a failed export (RL6)
  if (!model.figures?.length) throw new Error('The report has no figures to print.');
  const r = createReport({ title: model.title, appName: model.appName, logo });
  r.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  r.table('Headline results', model.headline.head, model.headline.body, {
    note: model.headline.note, emptyValue: null, columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 26, halign: 'right' }, 2: { cellWidth: 22 } },
  });
  r.inputsTable(model.inputs.rows, { title: 'Inputs, with unit and source', note: model.inputs.note });
  if (model.handoff) {
    r.table('Handoff from ReservoirCalc Pro', ['Item', 'As recorded'], model.handoff, {
      columnStyles: KEY_VALUE, note: 'What the source application handed over and when. A value changed on this screen after the handoff is named here and on its row of the inputs table.',
    });
  } else {
    r.section('Handoff from ReservoirCalc Pro', 'None: this prospect was typed in Risked Reserves Valuation. Its sources are the ones stated in the inputs table.');
  }
  if (model.chance.rows) {
    r.table('Chance of success', ['Factor', 'Chance (fraction)', 'Chance (%)'], model.chance.rows, { note: model.chance.note, columnStyles: { 0: { cellWidth: 70 } } });
  } else {
    r.section('Chance of success', model.chance.statement);
  }
  r.table('Volumes: unrisked and risked', model.volumes.head, model.volumes.body, { note: model.volumes.note, columnStyles: { 0: { cellWidth: 58 } } });
  r.table('Economics: the MEFS and the value of a discovery', ['Item', 'As used'], model.economics.basis, { columnStyles: KEY_VALUE });
  r.table('Value by field size', model.economics.table.head, model.economics.table.body, { note: model.economics.table.note, columnStyles: { 0: { cellWidth: 34 } } });
  r.table('Expected monetary value, in its parts', model.value.head, model.value.body, { note: model.value.note, columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 24, halign: 'right' } } });
  r.table('Outcomes of the exploration well', model.outcomes.head, model.outcomes.body, { note: model.outcomes.note, columnStyles: { 0: { cellWidth: 62 } } });
  if (model.portfolio) r.table('Portfolio context', model.portfolio.head, model.portfolio.body, { note: model.portfolio.note });

  // Limits of this analysis (RL9): what the method assumes, then the flags on this prospect
  r.heading('Limits of this analysis', 30);
  r.layout.y += 5;
  for (const line of model.limits.assumptions) r.paragraph(`- ${line}`, { gap: 1.5 });
  r.layout.y += 3;
  r.heading('Flags on this prospect', 14);
  r.layout.y += 5;
  if (model.limits.flags.length) for (const line of model.limits.flags) r.paragraph(`- ${line}`, { gap: 1.5 });
  else r.paragraph(model.limits.noFlagsText, { gap: 1.5 });
  r.layout.y += 4;

  r.figures(model.figures);
  const built = r.finish({ footer: model.footer });
  return { ...built, model };
}

/** What the Export button calls: model, logo, document. */
export async function exportRrvReport(args, { generatedAt = new Date() } = {}) {
  const model = buildRrvReportModel(args);
  const logo = await loadPetrolordLogo();
  return buildRrvReport(model, { logo, generatedAt });
}

/** "risked-valuation_Ekene_North.pdf" */
export const reportFileName = (name) => `risked-valuation_${String(name || 'prospect').trim().replace(/[^A-Za-z0-9_-]+/g, '_') || 'prospect'}.pdf`;
