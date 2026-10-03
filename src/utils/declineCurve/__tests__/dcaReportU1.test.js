/**
 * DCA-U1-002: the Decline Curve Analysis report, read back from the PDF.
 *
 * Built from the app's sample well (Ekene-1 primary decline, a planted
 * exponential of 120 bopd and 0.0012 per day) through the same path the app
 * takes: fitWell, forecastWell, collectDcaReportArgs, buildDcaPdf. Read back
 * with the Report Kit's test kit (pdftotext, pdfinfo, the content stream).
 */
import path from 'path';
import { readPdf, chartLogo, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit';
import { sampleWell, SAMPLE_TRUTH } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { collectDcaReportArgs, buildDcaPdf, engineInputsOf } from '@/utils/declineCurve/dcaReport';
import { createDcaUnits, DCA_METRIC_VIEW } from '@/utils/declineCurve/dcaUnits';
import { runMonteCarloSimulation } from '@/utils/dcaMonteCarlo';
import { analysisOf } from '@/utils/declineCurve/dcaModel';

const AT = new Date('2026-10-03T12:00:00Z');
const BUILD = 'Petrolord Suite test (dca-u1)';
const GOLDEN_DIR = path.join(__dirname, '__fixtures__', 'reportGolden');
const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
const logo = chartLogo();

const fitted = (mutate = (w) => w) => {
  let w = mutate({ ...sampleWell('p1'), id: 'sample-1' });
  w.identification = { ...w.identification, company: 'Petrolord Sample Co', analyst: 'A. Analyst' };
  const f = fitWell(w, 'oil', { now: AT });
  if (!f.ok) throw new Error(f.error);
  w = withStreamResults(w, 'oil', { fitResults: f.fit });
  const fc = forecastWell(w, 'oil', { now: AT });
  return withStreamResults(w, 'oil', { forecastResults: fc });
};
const model = (well, opts = {}) => collectDcaReportArgs({ project: { name: 'Sample project' }, well, stream: 'oil', organizationName: 'Org from context', build: BUILD, generatedAt: AT, ...opts });

describe('the sample well reproduces its truth', () => {
  it('the fit returns the planted parameters', () => {
    const w = fitted();
    const fit = analysisOf(w).streams.oil.fitResults;
    expect(fit.modelType).toBe('Exponential');
    expect(fit.qi).toBeCloseTo(SAMPLE_TRUTH.qi, 6);
    expect(fit.Di).toBeCloseTo(SAMPLE_TRUTH.diPerDay, 10);
  });

  it('EUR to 10 bopd is the closed form within the daily-sum and trapezoid error', () => {
    const m = model(fitted());
    expect(m.ok).toBe(true);
    expect(Math.abs(m.headline.eur - SAMPLE_TRUTH.eurClosedForm) / SAMPLE_TRUTH.eurClosedForm).toBeLessThan(0.005);
    // the parts close on the total exactly
    expect(m.headline.produced + m.headline.remaining).toBeCloseTo(m.headline.eur, 6);
    expect(m.closes).toBe(true);
  });
});

describe('RL1: every engine input has a row with unit and source', () => {
  it('the completeness guard is empty, and fails when a row goes', () => {
    const w = fitted();
    const m = model(w);
    expect(m.missing).toEqual([]);
    const without = m.inputs.filter((r) => r.key !== 'econLimit');
    expect(missingInputRows(engineInputsOf(w, 'oil'), without)).toEqual(['forecast.config.economicLimit', 'forecast.config.stopAtLimit']);
    for (const r of m.inputs) {
      expect(r.value).toBeTruthy();
      expect(r.source.length).toBeGreaterThan(3);
    }
  });
});

describe('the PDF, read back', () => {
  let built; let pdf; let text;
  beforeAll(() => {
    built = buildDcaPdf(model(fitted()), { logo });
    pdf = readPdf(built.doc, { ink: true });
    text = flat(pdf.text);
  });
  afterAll(() => pdf?.close?.());

  it('RL4: identification on page one', () => {
    const p1 = flat(pdf.pageText[0]);
    for (const s of ['Decline Curve Analysis Report', 'Company Petrolord Sample Co', 'Field Ekene (sample)', 'Well Ekene-1 (sample)', 'Data cut-off 2022-12-01',
      'Analyst A. Analyst', 'Software build Petrolord Suite test (dca-u1)', 'Data dates 2020-01-01 to 2022-12-01', 'Sample data Yes']) {
      expect(p1).toContain(s);
    }
    expect(p1).toMatch(/Display units Oilfield \(bbl\/d, Mscf\/d, bbl, Mscf, Di/);
    expect(p1).toContain('nominal %/yr)');
    expect(p1).toMatch(/The forecast reaches the economic limit on 2025-09-0\d/);
  });

  it('RL3: EUR in its parts, closing on the total', () => {
    const grab = (label) => Number((text.match(new RegExp(`${label} ([\\d,]+) bbl`)) || [])[1]?.replace(/,/g, ''));
    const produced = grab('Produced to the data cut-off \\(2022-12-01\\)');
    const remaining = grab('Remaining, data cut-off to the economic limit');
    const eur = grab('EUR \\(produced \\+ remaining\\)');
    expect(produced).toBeGreaterThan(70000);
    expect(remaining).toBeGreaterThan(10000);
    expect(Math.abs(produced + remaining - eur)).toBeLessThanOrEqual(1); // printed to the barrel
    expect(text).toContain('EUR is the sum of the two rows above it.');
  });

  it('RL7: the decline basis is printed beside the decline', () => {
    expect(text).toMatch(/Di, initial decline \(nominal\) 0\.0012 per day; 43\.83 %\/yr/);
    expect(text).toMatch(/Nominal, per year 43\.83 %\/yr/);
    expect(text).toMatch(/Effective, first year 35\.49 %\/yr/);
    expect(text).toContain('a year is 365.25 days');
    expect(text).toMatch(/percentiles are exceedance|Not run: the forecast is deterministic/);
  });

  it('RL5: every row counted, with the reasons', () => {
    expect(text).toMatch(/Rows imported 36/);
    expect(text).toMatch(/Used in the fit 36/);
    expect(text).toContain('Production data');
  });

  it('RL6: the figures are drawn from the screen series, with the fit window and the limit', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toEqual([
      'Rate against time (log rate)', 'Rate against cumulative production', 'Cumulative production against time', 'EUR distribution (Monte Carlo)',
    ]);
    const counts = pointCounts(built.figures);
    const s = built.model.series;
    expect(counts['rate-time'][0]).toEqual({ 'Data used in the fit': s.used.length, 'Fitted model': s.fitted.length, Forecast: s.forecast.length });
    expect(counts['rate-cum'][0]['Data']).toBe(s.rateCumHistory.length);
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    expect(built.figures.find((f) => f.id === 'rate-time').panels[0].bands).toBe(1);
    expect(text).toMatch(/Economic limit 10\.00 bbl\/d/);
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'eur-distribution'), /Does not apply: the forecast is deterministic/);
  });

  it('RL9: the limits and the flags', () => {
    expect(text).toContain('Limits of this analysis');
    expect(text).toContain('boundary-dominated flow');
    expect(text).toContain('b above 1');
    expect(text).toContain('This is the sample well');
  });

  it('a golden of the sample report', () => {
    checkGolden(built, { dir: GOLDEN_DIR, name: 'dca-sample-oilfield', update: UPDATE });
  });
});

describe('RL8: no report of an out-of-date fit or forecast', () => {
  it('a window edit after the fit refuses the report, with the reason', () => {
    const w = fitted();
    const a = analysisOf(w);
    const edited = { ...w, analysis: { ...a, fitWindow: { ...a.fitWindow, startDate: '2020-06-01' } } };
    const m = model(edited);
    expect(m.ok).toBe(false);
    expect(m.refusal).toMatch(/This fit is out of date: the fit window changed/);
    expect(() => buildDcaPdf(m)).toThrow(/out of date/);
  });

  it('a well with no forecast is refused', () => {
    const w = sampleWell('p1');
    const f = fitWell(w, 'oil', { now: AT });
    const m = model(withStreamResults(w, 'oil', { fitResults: f.fit }));
    expect(m.ok).toBe(false);
    expect(m.refusal).toMatch(/Run the forecast first/);
  });
});

describe('the metric view and a probabilistic run', () => {
  it('SI units convert with the registry factors and the labels follow', async () => {
    const u = createDcaUnits(DCA_METRIC_VIEW);
    let w = fitted((x) => ({ ...x, analysis: { ...x.analysis, streams: { oil: { forecastConfig: { probabilisticMode: true, economicLimit: 10, stopAtLimit: true, durationDays: 3653, mcSeed: 42, economicLimitUncertainty: 0 } } } } }));
    const s = analysisOf(w).streams.oil;
    const fit = s.fitResults;
    const fc = s.forecastResults;
    const histDays = Math.round((Date.parse(fc.historyEndDate) - Date.parse(fit.t0)) / 86400000);
    const mc = await runMonteCarloSimulation({ qi: fit.qi, Di: fit.Di, b: fit.b }, fit.confidenceIntervals.hasIntervals ? fit.confidenceIntervals : { qi: 5, Di: 0.0001, b: 0 },
      { ...s.forecastConfig, forecastDurationDays: histDays + 3653, startDate: fit.t0 }, 200, null, 42);
    w = withStreamResults(w, 'oil', { forecastResults: { ...fc, probabilistic: { ...mc, economicLimitUncertainty: 0 } } });
    const m = model(w, { u });
    expect(m.ok).toBe(true);
    const built = buildDcaPdf(m, { logo });
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    // 120 bbl/d is 19.08 sm3/d (0.158987294928 m3 per bbl)
    expect(t).toMatch(/qi, initial rate at the fit start 19\.08 sm3\/d/);
    expect(t).toMatch(/Display units SI \/ metric/);
    expect(t).toMatch(/P90 \(low case: 90% chance of at least this\) [\d,]+ sm3/);
    expect(listCaptions(pdf).map((c) => c.title)).toContain('EUR distribution (Monte Carlo)');
    const dist = built.figures.find((f) => f.id === 'eur-distribution');
    expect(dist.plotted).toBe(true);
    checkGolden(built, { dir: GOLDEN_DIR, name: 'dca-sample-metric-mc', update: UPDATE });
    pdf.close?.();
  });
});
