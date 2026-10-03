/**
 * PL10 for Decline Curve Analysis: twenty years of DAILY rates (7,305 rows,
 * the largest history a well file usually holds) through the import door,
 * the fit, the forecast and the report. The bounds are loose (a loaded CI
 * runner); the measured times are printed for the upgrade doc.
 */
import { readProductionTable } from '@/utils/declineCurve/productionImport';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { collectDcaReportArgs, buildDcaPdf } from '@/utils/declineCurve/dcaReport';

jest.setTimeout(240000);

test('twenty years of daily rates: door, fit, forecast and report', () => {
  const t0 = Date.UTC(2005, 0, 1);
  const lines = ['date,oil_rate_bopd,gas_rate_mscfd'];
  for (let d = 0; d < 7305; d += 1) {
    const q = 900 / (1 + 0.6 * 0.0009 * d) ** (1 / 0.6) * (1 + 0.03 * Math.sin(d / 9));
    lines.push(`${new Date(t0 + d * 86400000).toISOString().slice(0, 10)},${q.toFixed(3)},${(q * 0.8).toFixed(3)}`);
  }
  const text = lines.join('\n');
  const times = {};
  let t = Date.now();
  const door = readProductionTable(text);
  times.door = Date.now() - t;
  expect(door.ok).toBe(true);
  expect(door.rows).toHaveLength(7305);
  let well = { id: 'big', name: 'BIG-1', data: door.rows, analysis: { fitWindow: { startDate: door.rows[0].date, endDate: door.rows[7304].date } } };
  t = Date.now();
  const f = fitWell(well, 'oil');
  times.fit = Date.now() - t;
  expect(f.ok).toBe(true);
  well = withStreamResults(well, 'oil', { fitResults: f.fit });
  t = Date.now();
  well = withStreamResults(well, 'oil', { forecastResults: forecastWell(well, 'oil') });
  times.forecast = Date.now() - t;
  t = Date.now();
  const built = buildDcaPdf(collectDcaReportArgs({ well, stream: 'oil' }));
  times.report = Date.now() - t;
  expect(built.pages).toBeGreaterThan(4);
  console.log(`PL10 timings (ms): ${JSON.stringify(times)}; report pages ${built.pages}`);
  expect(times.door + times.fit + times.forecast + times.report).toBeLessThan(120000);
});
