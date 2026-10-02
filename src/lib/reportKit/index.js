/**
 * Report Kit: the shared reviewer-signable PDF report of the Suite.
 * Design, API and status: docs/scope/ReportKit-DESIGN-AND-STATUS.md.
 *
 * The test side (reading a built PDF back) is in ./testKit and is imported
 * from there by jest tests only: it uses node's fs and child_process.
 */
export { createReport, headerPairs, pairRows, inputsBody, INPUTS_HEAD } from './report.js';
export { createLayout } from './layout.js';
export { engineInputKeys, missingInputRows } from './completeness.js';
export { drawPlot, niceTicks, decadeTicks, tickText, dateTicks, dateTickText } from './plot.js';
export { drawBars } from './bars.js';
export { pdfText, unprintable, isPrintable, assertPrintable, textFilter } from './text.js';
export {
  EMPTY_VALUE, sig, fixed, sci, plain, compact, thousands, percent, range, orNA, withUnit, timestampUtc,
} from './format.js';
export { reportUnits, displayUnitsText } from './units.js';
export {
  NAVY, SLATE, BODY, PAGE, SERIES_RGB, SERIES_CYCLE,
} from './theme.js';
