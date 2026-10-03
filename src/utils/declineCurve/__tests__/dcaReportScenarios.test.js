/**
 * DCA U2-008: scenarios in the report. The scenarios saved for the reported
 * well and stream print as a table (parameters with their basis, the
 * terminal decline, the limit, produced, remaining and EUR) and a figure of
 * their forecasts, drawn from the scenario snapshots the app saves
 * (scenarioForecastSnapshot). A scenario of another well or stream is left
 * out and counted; a scenario saved before produced and EUR were kept apart
 * prints n/a, not a wrong number. Negative control: with no scenario the
 * figure is the one-line statement and the table says none.
 */
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { scenarioForecastSnapshot } from '@/utils/declineCurve/forecastFromHistory';
import { analysisOf } from '@/utils/declineCurve/dcaModel';
import { collectDcaReportArgs, buildDcaPdf } from '@/utils/declineCurve/dcaReport';
import { readPdf, chartLogo, flat, expectFigureDrawn, expectFigureStatement, pointCounts, listCaptions } from '@/lib/reportKit/testKit';

const AT = new Date('2026-10-03T12:00:00Z');
const logo = chartLogo();

const forecastWith = (w, patch = {}) => {
  const a = analysisOf(w);
  let x = { ...w, analysis: { ...a, streams: { ...a.streams, oil: { ...a.streams.oil, forecastConfig: { ...a.streams.oil.forecastConfig, ...patch } } } } };
  const f = fitWell(x, 'oil', { now: AT });
  x = withStreamResults(x, 'oil', { fitResults: f.fit });
  return withStreamResults(x, 'oil', { forecastResults: forecastWell(x, 'oil', { now: AT }) });
};
const scenarioOf = (w, name, id) => {
  const s = analysisOf(w).streams.oil;
  return { id, name, stream: 'oil', wellId: w.id, wellName: w.name, createdAt: '2026-10-02T09:00:00Z', fitResults: { ...s.fitResults }, forecastConfig: { ...s.forecastConfig }, forecastResults: scenarioForecastSnapshot(s.forecastResults) };
};

describe('scenarios in the report', () => {
  const base = forecastWith({ ...sampleWell('p1'), id: 'w1' });
  const low = forecastWith(base, { economicLimit: 20 });
  const scenarios = [
    scenarioOf(base, 'Limit 10', 's1'),
    scenarioOf(low, 'Limit 20', 's2'),
    { ...scenarioOf(base, 'Other well', 's3'), wellId: 'w2' },
    { ...scenarioOf(base, 'Gas', 's4'), stream: 'gas' },
    { ...scenarioOf(base, 'Before H3', 's5'), forecastResults: { eur: 19000, rates: scenarioOf(base, 'x', 'x').forecastResults.rates } },
  ];

  it('the table holds this well and stream only, with every volume from the snapshot', () => {
    const m = collectDcaReportArgs({ well: base, stream: 'oil', generatedAt: AT, scenarios });
    expect(m.scenarios.rows.map((r) => r[0])).toEqual(['Limit 10', 'Limit 20', 'Before H3']);
    const s1 = scenarios[0].forecastResults;
    expect(m.scenarios.rows[0][10]).toBe(Math.round(s1.eurTotal).toLocaleString('en-US'));
    expect(m.scenarios.rows[1][7]).toBe('20.0');
    // the pre-H3 scenario: remaining from `eur`, produced and EUR not invented
    expect(m.scenarios.rows[2][8]).toBe('n/a');
    expect(m.scenarios.rows[2][9]).toBe('19,000');
    expect(m.scenarios.rows[2][10]).toBe('n/a');
    expect(m.scenarios.note).toMatch(/2 scenario\(s\) of other wells or streams in this project are not shown/);
  });

  it('the PDF prints the table and draws one line per scenario', () => {
    const m = collectDcaReportArgs({ well: base, stream: 'oil', generatedAt: AT, scenarios });
    const built = buildDcaPdf(m, { logo });
    const pdf = readPdf(built.doc, { ink: true });
    const t = flat(pdf.text);
    expect(t).toMatch(/Scenarios compared/);
    expect(t).toMatch(/Limit 10 2026-10-02 Exponential/);
    expect(listCaptions(pdf).map((c) => c.title)).toContain('Scenarios: forecast rate against time');
    const fig = built.figuresBuilt.find((f) => f.id === 'scenarios');
    expect(Object.keys(pointCounts(built.figuresBuilt).scenarios[0])).toEqual(['Limit 10', 'Limit 20', 'Before H3']);
    expectFigureDrawn(pdf, fig, { logo: true });
    pdf.close();
  });

  it('negative control: no scenario, a statement and no table', () => {
    const m = collectDcaReportArgs({ well: base, stream: 'oil', generatedAt: AT, scenarios: [] });
    const built = buildDcaPdf(m, { logo });
    const pdf = readPdf(built.doc);
    expect(flat(pdf.text)).toMatch(/Scenarios compared None saved for this well and stream\./);
    expectFigureStatement(pdf, built.figuresBuilt.find((f) => f.id === 'scenarios'), 'Does not apply: no scenario is saved');
    pdf.close();
  });
});
