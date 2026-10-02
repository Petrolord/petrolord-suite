import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { nominalAnnualPct } from '@/utils/declineCurve/declineDisplay';
import { EMPTY_VALUE } from '@/lib/emptyValue';

/**
 * Exports forecast data to CSV
 */
export const exportForecastToCSV = (forecastData, wellName, stream) => {
  if (!forecastData || forecastData.length === 0) return;

  const headers = ['Date', 'Days', 'Rate', 'Cumulative'];
  const csvContent = [
    headers.join(','),
    // generateForecast rows are {date, rate, cumulative} (day index implicit);
    // older callers passed {date, t, rate, cum} — accept both shapes.
    ...forecastData.map((row, i) => {
      const dateStr = row.date ? new Date(row.date).toISOString().split('T')[0] : '';
      const days = typeof row.t === 'number' ? row.t : i + 1;
      const cum = typeof row.cum === 'number' ? row.cum : (row.cumulative || 0);
      return `${dateStr},${days.toFixed(2)},${(row.rate || 0).toFixed(2)},${cum.toFixed(2)}`;
    })
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${wellName}_${stream}_forecast.csv`);
};

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
export const buildScenarioSummaryRows = (scenarios) => (scenarios || []).map((s) => {
  const fc = s.forecastResults || {};
  const remaining = fc.remaining ?? fc.eur;
  const config = s.forecastConfig || s.config || {};
  return {
    'Scenario Name': s.name,
    'Stream': s.stream ?? EMPTY_VALUE,
    'Model Type': s.fitResults?.modelType || EMPTY_VALUE,
    'Initial Rate (qi)': num(s.fitResults?.qi),
    // H2: the fit holds Di per day; the sheet states both bases and the unit
    'Di (nominal, %/yr)': nominalAnnualPct(s.fitResults?.Di) ?? EMPTY_VALUE,
    'Di (nominal, 1/day)': s.fitResults?.Di ?? EMPTY_VALUE,
    'b-Factor': num(s.fitResults?.b),
    'Cumulative to date': num(fc.produced),
    'Remaining Reserves': num(remaining),
    'EUR': num(fc.eurTotal),
    'Remaining ends at': fc.limitReached == null ? EMPTY_VALUE : fc.limitReached ? 'economic limit' : 'forecast horizon',
    'Economic Limit': num(config.economicLimit),
  };
});

/**
 * Exports scenarios comparison to Excel
 */
export const exportScenarioComparison = (scenarios, wellName) => {
  if (!scenarios || scenarios.length === 0) return;

  const wb = XLSX.utils.book_new();
  
  // 1. Summary Sheet
  const summaryData = buildScenarioSummaryRows(scenarios);

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

/**
 * Exports type curve data to CSV
 */
export const exportTypeCurveToCSV = (typeCurve) => {
  if (!typeCurve || !typeCurve.normalizedData) return;

  const headers = ['Normalized Time (Days)', 'Normalized Rate'];
  const csvContent = [
    headers.join(','),
    ...typeCurve.normalizedData.map(row => {
      return `${row.t_normalized.toFixed(2)},${row.rate_normalized.toFixed(4)}`;
    })
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${typeCurve.name}_type_curve.csv`);
};