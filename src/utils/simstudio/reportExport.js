/**
 * Reservoir Simulation PDF report (SIM-U1; reviewer lens RL1 to RL12) on the
 * shared Report Kit (src/lib/reportKit). Pure formatting: the rows come from
 * reportModel.js (the rows the Report tab shows), the figures from
 * reportFigures.js (the series of the Results charts).
 */
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { createReport } from '@/lib/reportKit';
import { buildSimReportModel, REPORT_TITLE, APP_NAME } from './reportModel.js';
import { buildSimReportFigures, buildCompareFigure } from './reportFigures.js';
import { compareRuns } from './runCompare.js';

/** Everything the report needs (the Report tab calls this too). */
export function collectSimReportArgs(a) {
  const model = buildSimReportModel(a);
  const sch = model?.deckSummary?.schedule;
  const historyEnd = sch?.historyControls && sch.lastDate ? sch.lastDate : null;
  const figures = model ? buildSimReportFigures({ summary: a.summary, opts: model.opts, historyEnd, bhp: model.bhpMatchRaw }) : [];
  // SIM-U2-005: the runs compared on the Results tab (the first is the base)
  if (model && (a.compare || []).length >= 2) {
    model.compare = compareRuns({ entries: a.compare, system: a.system || 'oilfield' });
    if (model.compare.ok) figures.push(buildCompareFigure({ entries: a.compare, system: a.system || 'oilfield' }));
  }
  return { model, figures };
}

const KV = { 0: { cellWidth: 58 } };

/**
 * @param {{model: object, figures: object[]}} a collectSimReportArgs(...)
 * @param {{logo?: ?object, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: object[], pages: number}}
 */
export function buildSimPdf(a, { logo = null, generatedAt = new Date() } = {}) {
  const { model, figures } = a;
  if (!model) throw new Error('Simulation report: there is no completed run to report.');
  if (!figures?.length) throw new Error('Simulation report: the figure list is empty.');
  const report = createReport({ title: REPORT_TITLE, appName: APP_NAME, logo });
  const { table, section } = report;

  report.header({ identification: model.identification, displayUnits: model.displayUnits, generatedAt });

  table('Headline results', model.headline.head, model.headline.rows, {
    columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 26, halign: 'right' }, 2: { cellWidth: 18 } },
    note: `End of the run. Numbers from the simulator's summary vectors, shown in the display units; the deck's numbers were read as ${model.deckSystem} (${model.unitBasis}).`,
    emptyValue: null,
  });

  if (model.materialBalance.reported) {
    table('Material balance (from the simulator\'s PRT)', model.materialBalance.head, model.materialBalance.rows, {
      columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { halign: 'right' }])),
      note: `${model.materialBalance.text} Error = (originally in place - in place at the end) - (produced - injected), per component at surface conditions, as the simulator printed its balance sheet and well totals.`,
      fontSize: 7,
    });
  } else section('Material balance', model.materialBalance.text, { need: 14 });

  if (model.convergence.reported) {
    table('Convergence (from the simulator\'s PRT)', ['Quantity', 'Value'], model.convergence.rows, { columnStyles: KV, note: model.convergence.text });
    if (model.convergence.chops?.length) section('Time steps cut', model.convergence.chops.map((c) => `- ${c}`).join('\n'), { need: 14 });
  } else section('Convergence', model.convergence.text, { need: 14 });

  // SIM-U2-001: the bottomhole pressure match of the history phase
  if (model.bhpMatch.applies) {
    table('Bottomhole pressure match (history phase)', model.bhpMatch.head, model.bhpMatch.rows, {
      columnStyles: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, { halign: 'right' }])), note: model.bhpMatch.text, fontSize: 7,
    });
  } else if (model.deckSummary?.schedule?.historyControls) section('Bottomhole pressure match', model.bhpMatch.text, { need: 14 });

  table('Run provenance', ['Item', 'Value'], model.provenance, { columnStyles: KV });
  table('What the deck holds', ['Item', 'As read from the main deck'], model.deck, { columnStyles: KV });
  if (model.wells.length) table('Wells in the deck', model.wellsHead, model.wells, { fontSize: 7 });

  if (model.inputs) report.inputsTable(model.inputs.rows, { title: 'Model Builder inputs and their sources', note: model.inputs.note });
  else section('Model Builder inputs', `Not shown: ${model.inputsWhy} The deck itself, summarised above, is the record of this run's inputs.`, { need: 14 });

  // SIM-U2-005: the run comparison
  if (model.compare?.ok) {
    const n = model.compare.head.length;
    table('Run comparison', model.compare.head, model.compare.rows, {
      columnStyles: Object.fromEntries(Array.from({ length: n - 2 }, (_, i) => [i + 2, { halign: 'right' }])),
      fontSize: 6.5,
      note: `The first run is the base; a difference is the run minus the base. Each run read in its own deck units, shown in the display units. ${model.compare.notes.join(' ')}`.trim(),
    });
  }

  report.limits({
    assumptions: model.limits.assumptions,
    flags: model.limits.flags,
    noFlagsText: model.limits.noFlagsText,
    flagsTitle: 'Flags on this run',
  });

  report.figures(figures);
  return report.finish({ footer: `${REPORT_TITLE}${model.footerWho ? `, ${model.footerWho}` : ''}` });
}

export const reportFileName = ({ caseName } = {}) => {
  const base = String(caseName || 'simulation').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  return `Simulation_Report_${base || 'simulation'}.pdf`;
};

/** Build and save the report. @returns {Promise<boolean>} success */
export async function exportSimPdf(args, names = {}) {
  try {
    const logo = await loadPetrolordLogo();
    const { doc } = buildSimPdf(args, { logo });
    doc.save(reportFileName(names));
    return true;
  } catch (e) {
    console.error('Simulation report export failed:', e);
    return false;
  }
}
