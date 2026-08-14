import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

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

/**
 * Exports scenarios comparison to Excel
 */
export const exportScenarioComparison = (scenarios, wellName) => {
  if (!scenarios || scenarios.length === 0) return;

  const wb = XLSX.utils.book_new();
  
  // 1. Summary Sheet
  const summaryData = scenarios.map(s => ({
    'Scenario Name': s.name,
    'Model Type': s.fitResults?.modelType || 'N/A',
    'Initial Rate (qi)': s.fitResults?.qi || 0,
    'Decline Rate (Di)': s.fitResults?.Di || 0,
    'b-Factor': s.fitResults?.b || 0,
    'EUR': s.forecastResults?.eur || 0,
    'Remaining Reserves': s.forecastResults?.eur || 0, 
    'Economic Limit': s.config?.economicLimit || 0
  }));

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