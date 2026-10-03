import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { nominalAnnualPct } from '@/utils/declineCurve/declineDisplay';
import { describeTypedDecline } from '@/utils/declineCurve/declineInput';
import { DCA_OILFIELD_UNITS } from '@/utils/declineCurve/dcaUnits';
import { EMPTY_VALUE } from '@/lib/emptyValue';

/**
 * The forecast as CSV (DCA-U1-015, RL1 and RL7). The file used to hold four
 * bare columns (Date, Days, Rate, Cumulative) with no well, unit or
 * parameter. It now opens with '#' lines that say what it is (well, stream,
 * model and parameters with the decline basis, the fit start and window, the
 * economic limit, the units, the build) and its columns carry their units.
 * Values are in the display units of `u`; without one, in the state's
 * oilfield units.
 * @returns {string} the CSV text (also saved when `save` is true)
 */
export const buildForecastCsv = (forecastData, wellName, stream, { u = DCA_OILFIELD_UNITS, results = null, fit = null, config = null, build = null } = {}) => {
  const rateU = u.rateLabel(stream);
  const volU = u.volumeLabel(stream);
  const meta = [
    `# Decline Curve Analysis forecast, Petrolord Suite${build ? ` build ${build}` : ''}`,
    `# Well: ${wellName || EMPTY_VALUE}; stream: ${stream}`,
    fit ? `# Model: ${fit.modelType}; qi ${fmtNum(u.rateTo(stream, fit.qi))} ${rateU} at ${String(fit.t0 || '').slice(0, 10) || EMPTY_VALUE}; Di ${fmtNum(nominalAnnualPct(fit.Di))} %/yr nominal (${fmtNum(fit.Di)} 1/d nominal; a year is 365.25 days); b ${fmtNum(fit.b)}` : '# Model: not fitted',
    fit?.basis?.window ? `# Fit window: ${fit.basis.window.startDate || EMPTY_VALUE} to ${fit.basis.window.endDate || EMPTY_VALUE}; points used ${fit.points?.used ?? EMPTY_VALUE}` : null,
    config ? `# Economic limit: ${config.stopAtLimit && config.economicLimit > 0 ? `${fmtNum(u.rateTo(stream, config.economicLimit))} ${rateU}` : 'none'}; facility limit: ${config.facilityLimit > 0 ? `${fmtNum(u.rateTo(stream, config.facilityLimit))} ${rateU}` : 'none'}` : null,
    results?.terminalDecline ? `# Terminal decline Dmin: ${describeTypedDecline(results.terminalDecline.entered)}; switch to exponential ${results.terminalDecline.fromStart ? 'from the fit start' : `on ${results.terminalDecline.switchDate}`}` : null,
    results ? `# Last data: ${String(results.historyEndDate || '').slice(0, 10) || EMPTY_VALUE}; produced to date ${fmtNum(u.volumeTo(stream, results.produced))} ${volU}; remaining ${fmtNum(u.volumeTo(stream, results.remaining ?? results.eur))} ${volU}; EUR ${fmtNum(u.volumeTo(stream, results.eurTotal))} ${volU}` : null,
    `# Rates are daily rates at stock-tank conditions; the forecast starts the day after the last data.`,
  ].filter(Boolean);
  const headers = ['Date', 'Days after last data', `Rate (${rateU})`, `Cumulative after last data (${volU})`];
  const rows = (forecastData || []).map((row, i) => {
    const dateStr = row.date ? new Date(row.date).toISOString().split('T')[0] : '';
    const days = typeof row.t === 'number' ? row.t : i + 1;
    const cum = typeof row.cum === 'number' ? row.cum : (row.cumulative || 0);
    return `${dateStr},${days},${(u.rateTo(stream, row.rate || 0)).toFixed(3)},${(u.volumeTo(stream, cum)).toFixed(2)}`;
  });
  return [...meta, headers.join(','), ...rows].join('\n');
};

export const exportForecastToCSV = (forecastData, wellName, stream, opts = {}) => {
  if (!forecastData || forecastData.length === 0) return;
  const csvContent = buildForecastCsv(forecastData, wellName, stream, opts);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${wellName}_${stream}_forecast.csv`);
};

const fmtNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(parseFloat(v.toPrecision(6))) : EMPTY_VALUE);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : EMPTY_VALUE);

/**
 * The rows of the "Comparison Summary" sheet, one per scenario (H3).
 *
 * EUR is the cumulative produced to date plus the remaining volume after the
 * last history date, to the economic limit when the curve reaches it inside
 * the horizon and to the horizon otherwise. The sheet used to write the
 * remaining volume into both the EUR and the Remaining Reserves column. A
 * scenario saved before the fix holds only the remaining volume, so its EUR
 * and cumulative cells read EMPTY_VALUE instead of a wrong number.
 */
export const buildScenarioSummaryRows = (scenarios, u = DCA_OILFIELD_UNITS) => (scenarios || []).map((s) => {
  const fc = s.forecastResults || {};
  const remaining = fc.remaining ?? fc.eur;
  const config = s.forecastConfig || s.config || {};
  const stream = s.stream || 'oil';
  const vol = (v) => num(typeof v === 'number' ? u.volumeTo(stream, v) : v);
  const rate = (v) => num(typeof v === 'number' ? u.rateTo(stream, v) : v);
  return {
    'Scenario Name': s.name,
    'Well': s.wellName ?? EMPTY_VALUE,
    'Stream': s.stream ?? EMPTY_VALUE,
    'Model Type': s.fitResults?.modelType || EMPTY_VALUE,
    'Rate unit': u.rateLabel(stream),
    'Volume unit': u.volumeLabel(stream),
    'Initial Rate (qi)': rate(s.fitResults?.qi),
    'qi at (fit start)': s.fitResults?.t0 ? String(s.fitResults.t0).slice(0, 10) : EMPTY_VALUE,
    // H2: the fit holds Di per day; the sheet states both bases and the unit
    'Di (nominal, %/yr)': nominalAnnualPct(s.fitResults?.Di) ?? EMPTY_VALUE,
    'Di (nominal, 1/day)': s.fitResults?.Di ?? EMPTY_VALUE,
    'b-Factor': num(s.fitResults?.b),
    'Cumulative to date': vol(fc.produced),
    'Remaining Reserves': vol(remaining),
    'EUR': vol(fc.eurTotal),
    'Remaining ends at': fc.limitReached == null ? EMPTY_VALUE : fc.limitReached ? 'economic limit' : 'forecast horizon',
    'Economic Limit': rate(config.economicLimit),
    // DCA U2-001: the terminal decline the scenario's forecast ran with
    'Terminal decline Dmin': fc.terminalDecline ? describeTypedDecline(fc.terminalDecline.entered) : 'none',
  };
});

/**
 * Exports scenarios comparison to Excel
 */
export const exportScenarioComparison = (scenarios, wellName, u = DCA_OILFIELD_UNITS) => {
  if (!scenarios || scenarios.length === 0) return;

  const wb = XLSX.utils.book_new();
  
  // 1. Summary Sheet
  const summaryData = buildScenarioSummaryRows(scenarios, u);

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Comparison Summary');

  XLSX.writeFile(wb, `${wellName}_scenarios_comparison.xlsx`);
};

/**
 * Exports a chart DOM element as PNG
 */
export const exportChartAsImage = async (elementId, fileName) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    // scrollHeight captures the element's full laid-out size even if an
    // ancestor is scrolled/clipping it; white background matches the chart
    // surface (the default transparent PNG looks broken in viewers).
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      width: element.scrollWidth,
      height: element.scrollHeight,
    });
    canvas.toBlob((blob) => {
      saveAs(blob, `${fileName}.png`);
    });
  } catch (err) {
    console.error("Failed to export chart image:", err);
  }
};
