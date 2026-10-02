/**
 * Material Balance Studio: the PDF report, on the shared Report Kit
 * (src/lib/reportKit), and the series CSV.
 *
 * Rebuilt in the Material Balance round of the app upgrade programme
 * (MBAL-U1). The report before it was two pages of tables with no plot, no
 * PVT value and no aquifer input. This one is what a reviewer signs against:
 * identification, every engine input with unit and source, the pressure
 * datum, the data the analysis used and left out, the results with the
 * regression statement, the in-place volume by each method, the drive
 * indices with their convention and closure, the terms that make up Et, the
 * PVT the engine used, the limits of the method, and the plots, drawn as
 * vectors from the same models the Plots tab draws.
 *
 * Pure formatting: every row and every plotted point arrives already built
 * by lib/reportModel.js collectMbalReportArgs and lib/plotModels.js. Nothing
 * is fetched and nothing is recalculated here.
 *
 * A report pairs the inputs with the run made on them (H4). When an input
 * changed after the run there is no such pair, so nothing is exported.
 */
import { createReport } from '@/lib/reportKit';
import { loadPetrolordLogo } from '@/lib/pdfBrand';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { staleRunMessage } from '@/pages/apps/reservoir-balance/lib/runStaleness';
import {
  REPORT_TITLE, REPORT_APP_NAME, collectMbalReportArgs, DATUM_NOTE, INPUTS_NOTE, CROSS_CHECK_NOTE, TIER_LABELS, shortReference,
} from '@/pages/apps/reservoir-balance/lib/reportModel';
import { buildPlotModels, toKitFigures } from '@/pages/apps/reservoir-balance/lib/plotModels';
import { buildRunRows } from '@/pages/apps/reservoir-balance/lib/mbalSeries';

export { collectMbalReportArgs };

// Input, Value, Unit: the value column holds method names as well as numbers
const INPUT_COLUMNS = Object.freeze({ 0: { cellWidth: 54 }, 1: { cellWidth: 42 }, 2: { cellWidth: 20 } });

/** Rows of the data table before the report says where the rest is. */
export const MAX_DATA_ROWS = 150;

/**
 * Build the report document.
 * @param {object} args the studio's report inputs: { caseData, result, runConfig, run, study,
 *   organizationName, build, units, staleness }, or the model collectMbalReportArgs made of them
 * @param {{logo?: ?{dataUrl: string, w: number, h: number}, generatedAt?: Date}} [opts]
 * @returns {{doc: object, figures: Array, pages: number, model: object, plots: Array}}
 */
export function buildMbalPdf(args, { logo = null, generatedAt = new Date() } = {}) {
  if (args?.staleness?.stale) {
    throw new Error(`The report was not exported. ${staleRunMessage(args.staleness)}`);
  }
  if (!args?.result?.plot_data?.timestep_index?.length) {
    throw new Error('The report was not exported. Run the engine first: there is no result to report.');
  }
  const model = args.identification ? args : collectMbalReportArgs(args);
  const u = model.units;
  const plots = buildPlotModels({ series: model.series, result: model.result, units: u });
  const report = createReport({ title: REPORT_TITLE, appName: REPORT_APP_NAME, logo });
  const { table, section } = report;

  // ---- who, what, when (RL4) ----
  report.header({ identification: model.identification, displayUnits: u.displayUnits(), generatedAt });

  // ---- headline (RL8) ----
  table('Headline results', ['Quantity', 'Value'], model.headline.rows, {
    columnStyles: { 0: { cellWidth: 92 } },
    note: model.headline.tier.reference
      ? `Engine path validation, ${TIER_LABELS[model.headline.tier.tier] ?? model.headline.tier.tier}: ${shortReference(model.headline.tier.reference)}`
      : undefined,
  });
  section('Regression statement', model.regressionText);

  if (model.historyMatch) {
    table(model.historyMatch.title, model.historyMatch.head, model.historyMatch.rows, { note: model.historyMatch.note });
  }

  table('In-place volume by each method', ['Method', 'In place', 'Against the headline', 'Basis'],
    model.crossCheck.map((r) => [r.method, r.text, r.difference, r.basis]), {
      columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 30 }, 2: { cellWidth: 24 } },
      note: CROSS_CHECK_NOTE,
    });

  // ---- drive indices: split, convention named, closure stated (RL3, RL7) ----
  table('Drive indices at the last timestep', model.drive.head, model.drive.rows, {
    columnStyles: { 0: { cellWidth: 64 }, 1: { cellWidth: 60 } },
    note: model.drive.note,
  });

  // ---- inputs: every engine input, with unit and source (RL1) ----
  report.inputsTable(model.inputs, { title: 'Inputs of the analysis', note: INPUTS_NOTE, columnStyles: INPUT_COLUMNS });
  report.inputsTable(model.datum, { title: 'Pressure datum', note: DATUM_NOTE, columnStyles: INPUT_COLUMNS });
  if (model.pvtTable) {
    table('PVT table of the run', model.pvtTable.head, model.pvtTable.body, { note: model.pvtTable.note });
  }
  if (model.pvtUsed.stored) {
    table('PVT used by the engine at each timestep', model.pvtUsed.head, model.pvtUsed.body, { note: model.pvtUsed.note });
  } else {
    section('PVT used by the engine at each timestep', model.pvtUsed.statement);
  }

  // ---- data: what was used and what was left out (RL5) ----
  table('Data summary', ['Quantity', 'Value'], model.data.totals, { columnStyles: { 0: { cellWidth: 92 } } });
  const dataRows = model.data.body;
  table(
    `Pressure and production history${dataRows.length > MAX_DATA_ROWS ? ` (first ${MAX_DATA_ROWS} of ${dataRows.length} timesteps; the series CSV holds them all)` : ''}`,
    model.data.head, dataRows.slice(0, MAX_DATA_ROWS), { note: model.data.note },
  );

  // ---- the terms of the fit (RL2) ----
  table('Withdrawal and expansion terms', model.expansion.head, model.expansion.body.slice(0, MAX_DATA_ROWS), { note: model.expansion.formula });
  if (model.driveTable.body.length) {
    table('Drive indices by timestep', model.driveTable.head, model.driveTable.body.slice(0, MAX_DATA_ROWS));
  }

  // ---- what the engine said, and where the method stops (RL9) ----
  if (model.warnings.length) {
    table('Engine warnings', ['#', 'Warning'], model.warnings.map((w, i) => [String(i + 1), w]), { columnStyles: { 0: { cellWidth: 10 } } });
  } else {
    section('Engine warnings', 'The engine raised no warning on this run.');
  }
  report.limits({
    assumptions: model.limits.assumptions,
    ranges: model.limits.ranges,
    flags: model.limits.flags,
    noFlagsText: model.limits.noFlagsText,
  });

  // ---- the plots (RL6) ----
  const figures = toKitFigures(plots);
  if (!figures.some((f) => f.panels?.length)) {
    throw new Error('The report was not exported: it would have no plot.');
  }
  report.figures(figures);

  const who = [model.caseData?.name, model.caseData?.field_name ? `Field ${model.caseData.field_name}` : null].filter(Boolean).join(', ');
  const built = report.finish({ footer: `${REPORT_TITLE}${who ? `, ${who}` : ''}` });
  return { ...built, model, plots };
}

export const reportFileName = (caseData, date = new Date()) => {
  const base = (caseData?.name ?? 'case').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'case';
  return `mbal-report-${base}-${date.toISOString().slice(0, 10)}.pdf`;
};

/**
 * Build and save the report. The Petrolord mark for the plots is loaded
 * first; the report still builds without it. Throws with the reason when
 * the report cannot be exported (a stale run, no result).
 * @returns {Promise<{pages: number, fileName: string}>}
 */
export async function exportMbalPdf(args) {
  if (args?.staleness?.stale) {
    throw new Error(`The report was not exported. ${staleRunMessage(args.staleness)}`);
  }
  let logo = null;
  try { logo = await loadPetrolordLogo(); } catch { logo = null; }
  const built = buildMbalPdf(args, { logo });
  const fileName = reportFileName(args.caseData);
  built.doc.save(fileName);
  return { pages: built.pages, fileName };
}

const csvCell = (v) => {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV of the run's per-timestep series, for spreadsheet work. The first
 * lines (starting with #) say what the file is and in which units; the
 * columns are in the engine's units whatever the display units, and each
 * column head names its unit.
 * @param {object} lastResult the rb_results row
 * @param {{caseData?: object, runConfig?: object, generatedAt?: Date}} [o]
 * @returns {?string} null when there is no result
 */
export const buildPlotDataCsv = (lastResult, { caseData = null, runConfig = null, generatedAt = new Date() } = {}) => {
  const plot = lastResult?.plot_data;
  if (!plot?.timestep_index?.length) return null;
  const rows = buildRunRows(plot, { productionData: caseData?.production_data });
  const isGas = caseData?.fluid_system === 'gas';
  const cols = [
    ['timestep_index', (r) => r.timestep_index],
    ['observation_date', (r) => (r.date ? String(r.date).slice(0, 10) : null)],
    ['pressure_psia', (r) => r.pressure],
    ['cum_oil_stb', (r) => r.cum_oil_stb],
    ['cum_gas_scf', (r) => r.cum_gas_scf],
    ['cum_water_stb', (r) => r.cum_water_stb],
    ['cum_water_inj_stb', (r) => r.cum_water_inj_stb],
    ['cum_gas_inj_scf', (r) => r.cum_gas_inj_scf],
    ['F_rb', (r) => r.F],
    [isGas ? 'Et_rb_per_scf' : 'Et_rb_per_stb', (r) => r.Et],
    ['Eo_rb_per_stb', (r) => r.Eo],
    ['Eg_gas_cap_rb_per_stb', (r) => r.Eg_oil],
    ['Eg_rb_per_mscf', (r) => r.Eg_rb_mscf],
    [isGas ? 'Efw_rb_per_scf' : 'Efw_rb_per_stb', (r) => r.Efw],
    ['We_rb', (r) => r.We],
    ['p_over_z_psia', (r) => r.p_over_z],
    ['Bo_rb_per_stb', (r) => r.Bo],
    ['Rs_scf_per_stb', (r) => r.Rs],
    ['Bg_rb_per_mscf', (r) => r.Bg_rb_mscf],
    ['z', (r) => r.z],
    ['Bw_rb_per_stb', (r) => r.Bw],
    ['ddi', (r) => r.ddi],
    ['gdi', (r) => r.gdi],
    ['wdi', (r) => r.wdi],
    // cdi carries the rock and connate water expansion for both fluid systems
    // since engines #167. Oil results stored before it have that array under
    // `sdi` with `cdi` present but all null; buildRunRows picks whichever
    // holds the data.
    ['cdi', (r) => r.cdi],
    ['drive_index_sum', (r) => r.drive_index_sum],
    ['in_fit', (r) => (r.point_in_fit ? 1 : 0)],
    ['simulated_pressure_psia', (r) => r.simulated_pressure],
    ['pressure_residual_psi', (r) => r.residual],
  ].filter(([name, get]) => ['timestep_index', 'pressure_psia', 'cdi', 'in_fit'].includes(name) || rows.some((r) => get(r) != null));
  const head = [
    '# Material Balance Studio, per-timestep series of one engine run',
    `# Case: ${caseData?.name ?? EMPTY_VALUE}${caseData?.field_name ? `, field ${caseData.field_name}` : ''}${caseData?.reservoir_name ? `, reservoir ${caseData.reservoir_name}` : ''}`,
    `# Fluid system: ${caseData?.fluid_system ?? EMPTY_VALUE}; aquifer model: ${runConfig?.aquifer_model ?? EMPTY_VALUE}`,
    `# Generated: ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '# Units: the engine units named in each column head, whatever the display units of the studio. Pressures are absolute (psia). rb is a reservoir barrel, stb a stock-tank barrel.',
    '# Drive indices are fractions of the hydrocarbon voidage (F minus Wp Bw for oil, Gp Bg for gas).',
  ];
  const lines = [...head, cols.map(([name]) => name).join(',')];
  for (const r of rows) lines.push(cols.map(([, get]) => csvCell(get(r))).join(','));
  return lines.join('\n');
};
