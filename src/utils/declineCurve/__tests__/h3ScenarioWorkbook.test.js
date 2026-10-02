/**
 * H3 (Reservoir honesty sweep): the scenario comparison workbook wrote one
 * field into two columns, "EUR" and "Remaining Reserves". Since the T1 fix
 * that field is the volume still to come, so the EUR column was short by
 * everything already produced. EUR is cumulative to date plus the remaining
 * volume to the economic limit (or the horizon), and the two columns differ
 * for any well with history.
 */
import { fitArpsModel } from '@/utils/declineCurve/dcaEngine';
import { forecastFromHistory, scenarioForecastSnapshot } from '@/utils/declineCurve/forecastFromHistory';
import { buildScenarioSummaryRows } from '@/utils/declineCurve/dcaExport';

jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('html2canvas', () => jest.fn());

// Three years of an exponential well: 1000 bbl/d, 0.001 per day.
const history = Array.from({ length: 36 }, (_, m) => ({
  date: new Date(Date.UTC(2022, m, 1)).toISOString(),
  oilRate: 1000 * Math.exp(-0.001 * m * 30.4375),
}));

function scenario() {
  const fit = fitArpsModel(history.map((p) => ({ date: p.date, rate: p.oilRate })), 'Exponential');
  const config = { forecastDurationDays: 3650, economicLimit: 50, stopAtLimit: true };
  const fc = forecastFromHistory(fit, config, history, 'oil');
  return {
    fc,
    scenario: {
      id: 's1', name: 'Base', stream: 'oil',
      fitResults: { qi: fit.qi, Di: fit.Di, b: fit.b, modelType: fit.modelType },
      forecastConfig: config,
      forecastResults: scenarioForecastSnapshot(fc),
    },
  };
}

describe('H3: EUR and Remaining Reserves are different quantities in the workbook', () => {
  it('the saved scenario keeps produced, remaining and EUR', () => {
    const { fc, scenario: s } = scenario();
    expect(s.forecastResults.remaining).toBe(fc.remaining);
    expect(s.forecastResults.produced).toBe(fc.produced);
    expect(s.forecastResults.eurTotal).toBe(fc.eurTotal);
    expect(s.forecastResults.limitReached).toBe(fc.limitReached);
    // the legacy key the panels read is still the remaining volume
    expect(s.forecastResults.eur).toBe(fc.remaining);
  });

  it('EUR = cumulative to date + remaining, and differs from remaining', () => {
    const { fc, scenario: s } = scenario();
    const [row] = buildScenarioSummaryRows([s]);
    expect(fc.produced).toBeGreaterThan(100000); // the case discriminates
    expect(row['Cumulative to date']).toBe(fc.produced);
    expect(row['Remaining Reserves']).toBe(fc.remaining);
    expect(row.EUR).toBe(fc.produced + fc.remaining);
    expect(row.EUR).not.toBe(row['Remaining Reserves']);
    expect(row.EUR - row['Remaining Reserves']).toBeCloseTo(row['Cumulative to date'], 6);
    // closed form for the exponential, to the 50 bbl/d limit: (q_last - 50) / D
    const qLast = 1000 * Math.exp(-0.001 * 35 * 30.4375);
    expect(row['Remaining Reserves'] / ((qLast - 50) / 0.001)).toBeGreaterThan(0.95);
    expect(row['Remaining Reserves'] / ((qLast - 50) / 0.001)).toBeLessThan(1.05);
    expect(row['Remaining ends at']).toBe('economic limit');
    // the limit is read from the config the scenario saved
    expect(row['Economic Limit']).toBe(50);
  });

  it('a scenario saved before this fix has no EUR to print, and says so', () => {
    const { scenario: s } = scenario();
    const old = { ...s, forecastResults: { eur: s.forecastResults.eur, timeToLimit: 100 } };
    const [row] = buildScenarioSummaryRows([old]);
    expect(row['Remaining Reserves']).toBe(s.forecastResults.eur);
    expect(row.EUR).toBe('n/a');
    expect(row['Cumulative to date']).toBe('n/a');
  });
});
