/**
 * Tester round 2 (review received 2026-10-02): the Well Test Analysis
 * report. The real provider is mounted, the sample buildup loaded and
 * fitted, the PDF built from the provider's own state with the function the
 * Export button calls, and the file read back with pdfinfo, pdftotext,
 * pdfimages and pdftoppm. One test per tester item, the hostile inputs, and
 * the four strengths the tester asked us to keep.
 */
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { buildWellTestPdf, collectReportArgs, buildCrossCheckRows } from '@/utils/wellTestReportExport';
import { buildReportFigures } from '@/utils/welltest/reportFigures';
import { periodKey } from '@/utils/welltest/reportModel';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import goldens from '@/utils/welltest/__tests__/goldens.json';
import { mountStudio, chartLogo, readPdf } from './reportTestKit';

const AT = new Date('2026-10-02T09:00:00Z');
const logo = chartLogo();
const build = (ctx, opts = {}) => buildWellTestPdf(collectReportArgs(ctx), { logo, generatedAt: AT, ...opts });
const flat = (s) => s.replace(/\s+/g, ' ');

// The reviewer's case: the sample buildup, identified, completed over part
// of the pay, with sources stated and the regression run.
async function reviewedSample() {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  await studio.act((c) => {
    c.setFieldName('Obodo');
    c.setAnalyst('A. Analyst');
    c.setIdentification({ licence: 'OML 143', zone: 'D-3 sand', testDateStart: '2026-09-14', testDateEnd: '2026-09-17', operation: 'dst', registryWellId: '', registryWellName: '' });
    c.setCompletion({ perfTopMd: '9850', perfBaseMd: '9880', payTopMd: '9850', perfTopTvd: '9601', perfBaseTvd: '9630', payTopTvd: '9601', tvdSource: 'Survey of registry well Obodo-7' });
    c.setReservoirField('sw', '0.22');
    c.setReservoirField('apiGravity', '34');
    c.setReservoirField('gor', '650');
    c.setReservoirField('solutionGasGravity', '0.72');
    c.setReservoirField('reservoirTempF', '212');
    c.setInputMetaField('mu', 'source', 'lab');
    c.setInputMetaField('mu', 'note', 'Bottomhole sample 2, OBM contamination 4 percent');
    c.setInputMetaField('B', 'source', 'correlation');
    c.setInputMetaField('B', 'correlation', 'Standing');
    c.setPeriodMetaField(periodKey(0), 'choke', '32');
    c.setPeriodMetaField(periodKey(0), 'recovered', '660');
  });
  await studio.act((c) => c.runAutoFit());
  return studio;
}

describe('the reviewed sample report', () => {
  let studio;
  let built;
  let pdf;
  beforeAll(async () => {
    studio = await reviewedSample();
    built = build(studio.ctx);
    pdf = readPdf(built.doc, { ink: true });
  }, 600000);
  afterAll(() => { pdf?.close?.(); studio?.unmount(); });

  test('the regression ran, so the report can state it', () => {
    expect(studio.ctx.matchMethod.kind).toBe('regression');
    expect(studio.ctx.fitResult.converged).toBe(true);
  });

  test('WTA-R2-001: the reservoir and fluid inputs table lists every input with its unit', () => {
    const t = flat(pdf.text);
    expect(t).toMatch(/Reservoir and fluid inputs/);
    expect(t).toMatch(/Input Value Unit Source and quality/);
    expect(t).toMatch(/Net pay h 45 ft/);
    expect(t).toMatch(/Porosity phi 0\.18 fraction/);
    expect(t).toMatch(/Wellbore radius rw 0\.354 ft/);
    expect(t).toMatch(/Water saturation Sw 0\.22 fraction/);
    expect(t).toMatch(/Total compressibility ct 1\.2e-5 1\/psi .*entered as total/);
    expect(t).toMatch(/Oil viscosity mu_o 0\.9 cp/);
    expect(t).toMatch(/Oil formation volume factor Bo 1\.25 RB\/STB/);
    expect(t).toMatch(/API gravity 34 degAPI/);
    expect(t).toMatch(/Solution GOR 650 scf\/STB/);
    expect(t).toMatch(/Gas gravity 0\.72 air = 1/);
    expect(t).toMatch(/Reservoir temperature 212 degF/);
    expect(t).toMatch(/Initial pressure pi 4800 psia/);
    expect(t).toMatch(/kv\/kh 0\.1 .*Assumed default 0\.1/);
    // the table on the page is the context's own rows
    for (const row of studio.ctx.inputsTable) expect(t).toContain(`${row.label.trim()} ${row.value}`);
  });

  test('WTA-R2-002: each input states its source, and the note travels with it', () => {
    const t = flat(pdf.text);
    expect(t).toMatch(/Measured \(lab\)\. Bottomhole sample 2, OBM contamination 4 percent/);
    expect(t).toMatch(/Correlation: Standing/);
    expect(t).toMatch(/Entered, source not stated/);
  });

  test('WTA-R2-003: total, partial-penetration and mechanical skin are separate, the formula named', () => {
    const t = flat(pdf.text);
    const sb = studio.ctx.skinBreakdown;
    expect(sb.status).toBe('ok');
    expect(sb.basis).toBe('TVD');
    expect(t).toMatch(/Skin components/);
    expect(t).toContain(`Total skin s ${sb.totalSkin.toFixed(2)}`);
    expect(t).toContain(`Partial-penetration pseudo-skin s_pp ${sb.spp.toFixed(2)} Papatzacos (1987)`);
    expect(t).toContain(`Mechanical (damage) skin s_d ${sb.mechanicalSkin.toFixed(2)} s_d = (hp/h) (s - s_pp)`);
    expect(t).toMatch(/Papatzacos \(1987\): s_pp = \(1\/hpD - 1\) ln\(pi\/\(2 rD\)\)/);
    expect(t).toMatch(/Perforated length hp \(ft\) 29 True vertical depth/);
    expect(t).toMatch(/kv\/kh 0\.1 Assumed default 0\.1 \(no value entered\)/);
    // the three numbers on the page satisfy s = (h/hp) s_d + s_pp
    expect((45 / 29) * sb.mechanicalSkin + sb.spp).toBeCloseTo(sb.totalSkin, 10);
  });

  test('WTA-R2-004: well identification heads the report', () => {
    const first = flat(pdf.pageText[0]);
    expect(first).toMatch(/Well Sample well 1/);
    expect(first).toMatch(/Field Obodo/);
    expect(first).toMatch(/Licence OML 143/);
    expect(first).toMatch(/Zone or sand D-3 sand/);
    expect(first).toMatch(/Analyst A\. Analyst/);
    expect(first).toMatch(/Test type Pressure buildup, drill stem test \(DST\)/);
    expect(first).toMatch(/Test dates 2026-09-14 to 2026-09-17/);
    expect(first).toMatch(/Perforations, MD 9850 to 9880 ft/);
    expect(first).toMatch(/Perforations, TVD 9601 to 9630 ft/);
    expect(first).toMatch(/Generated 2026-10-02 09:00 UTC/);
    // PR #810's line is still there
    expect(first).toMatch(/pwf at shut-in \d+\.\d psi at shut-in time 0 hr \(entered\)/);
  });

  test('WTA-R2-005: flow and shut-in summary, one row per period', () => {
    const t = flat(pdf.text);
    expect(t).toMatch(/Flow and shut-in summary/);
    expect(t).toMatch(/1 Flow 0 36 32 450\.0 675\.0 675\.0 660/);
    expect(t).toMatch(/2 Shut-in 36 [\d.]+ n\/a 0\.0 0 675\.0 n\/a/);
    expect(t).toMatch(/Periods from the entered rate history/);
  });

  test('WTA-R2-006..011: the figures are on the page, numbered, captioned, with axis titles and units', () => {
    const t = flat(pdf.text);
    expect(built.figures.map((f) => [f.id, f.plotted])).toEqual([
      ['overview', true], ['loglog', true], ['semilog', true], ['sqrt', false], ['history', true], ['rta', false],
    ]);
    // 6 overview
    expect(t).toMatch(/Figure 1\. Test overview/);
    expect(t).toMatch(/Gauge pressure and rate against test time over the whole gauge record/);
    expect(t).toMatch(/Test time \(hr\)/);
    expect(t).toMatch(/Pressure \(psi\)/);
    expect(t).toMatch(/Rate \(STB\/D\)/);
    expect(t).toMatch(/No temperature column was imported with the gauge data, so temperature is not plotted/);
    // 7 log-log with the model and the regime windows
    expect(t).toMatch(/Figure 2\. Log-log diagnostic plot/);
    expect(t).toMatch(/Agarwal equivalent time \(hr\)/);
    expect(t).toMatch(/dp and derivative \(psi\)/);
    expect(t).toMatch(/Bourdet derivative/);
    expect(t).toMatch(/Model dp/);
    expect(t).toMatch(/Model derivative/);
    expect(t).toMatch(/The lines are the Homogeneous reservoir match \(regression\)/);
    expect(t).toMatch(/Shaded bands mark the detected flow regimes: .*radial flow [\d.]+ to [\d.]+ hr/i);
    // 8 Horner with the line, its window and the slope printed
    expect(t).toMatch(/Figure 3\. Horner semilog plot/);
    expect(t).toMatch(/Horner time ratio \(tp \+ dt\)\/dt/);
    expect(t).toMatch(/Straight line/);
    expect(t).toMatch(/Slope m = \d+\.\d psi\/cycle/);
    // every printed window names its time basis: the fit window is shut-in
    // time, the regimes are equivalent time, and the figure gives both
    const c = studio.ctx;
    const radial = c.regimes.find((r) => r.regime === 'radial');
    const g = (v) => String(parseFloat(Number(v).toPrecision(3)));
    const both = `Fit window ${g(c.semilogResult.windowMin)} to ${g(c.semilogResult.windowMax)} hr shut-in time (${g(radial.xStart)} to ${g(radial.xEnd)} hr equivalent time), the detected radial flow`;
    expect(t).toContain(`${both} (`); // caption, followed by the point count
    expect(t.split(both).length - 1).toBe(2); // and the annotation on the plot
    expect(t).toContain(`Semilog fit window (shut-in time dt, hr) ${Number(c.semilogResult.windowMin).toPrecision(3)} to ${Number(c.semilogResult.windowMax).toPrecision(3)}`);
    expect(t).toMatch(/times are Agarwal equivalent time, which runs behind shut-in time late in a buildup\. The semilog fit window above is in shut-in time/);
    // the two bases really differ on this test, which is why both are stated
    expect(c.semilogResult.windowMax).toBeGreaterThan(radial.xEnd * 1.5);
    expect(t).not.toMatch(/Semilog fit window \(hr\)/);
    // 9 sqrt(t): not claimed on a radial sample, so a statement and no plot
    expect(t).toMatch(/Figure 4\. Square-root-of-time plot Does not apply: no linear flow regime was identified/);
    // 10 history match
    expect(t).toMatch(/Figure 5\. History match/);
    expect(t).toMatch(/Shut-in time \(hr\)/);
    // 11 RTA: not run
    expect(t).toMatch(/Figure 6\. Rate transient analysis plots Rate transient analysis was not run: no production data is loaded/);
  });

  test('the plots are drawn from the context series: every point of the screen series is in the drawing', () => {
    const fig = Object.fromEntries(built.figures.map((f) => [f.id, f]));
    const c = studio.ctx;
    expect(fig.overview.panels[0].drawn['Gauge pressure']).toBe(c.overview.pressure.length);
    expect(fig.overview.panels[0].drawn.Rate).toBe(c.overview.rate.length);
    expect(fig.loglog.panels[0].drawn.dp).toBe(c.loglog.filter((p) => p.dp > 0).length);
    expect(fig.loglog.panels[0].drawn['Bourdet derivative']).toBe(c.loglog.filter((p) => p.derivative > 0).length);
    expect(fig.loglog.panels[0].drawn['Model dp']).toBe(c.modelSeries.filter((p) => p.modelDp > 0).length);
    expect(fig.loglog.panels[0].bands).toBe(c.regimes.length);
    expect(fig.semilog.panels[0].drawn.pws).toBe(c.prepared.points.length);
    expect(fig.semilog.panels[0].bands).toBe(1);
    expect(fig.history.panels[0].drawn.Gauge).toBe(c.historyMatch.points.length);
    expect(fig.history.panels[0].drawn.Model).toBe(c.historyMatch.points.filter((p) => p.model != null).length);
    expect(c.loglog.length).toBeGreaterThan(30);
  });

  test('page count, and each plot is really on its page: ink in the plot box and the Petrolord mark embedded', () => {
    expect(pdf.pages).toBe(built.pages);
    expect(pdf.pages).toBe(5);
    const plotted = built.figures.filter((f) => f.plotted);
    expect(plotted).toHaveLength(4);
    for (const f of plotted) {
      for (const p of f.panels) {
        expect(p.logo).toBe(true);
        expect(p.total).toBeGreaterThan(20);
        const ink = pdf.ink(f.page, p.box);
        // an empty frame with its grid is a few hundred pixels; data adds thousands
        expect(ink.coloured).toBeGreaterThan(1500);
        expect(ink.dark).toBeGreaterThan(150);
      }
      // the mark is an embedded image on that page, with real size
      const marks = pdf.images.filter((im) => im.page === f.page && im.type === 'image');
      expect(marks.length).toBeGreaterThanOrEqual(1);
      expect(marks[0].width).toBeGreaterThan(50);
      expect(marks[0].height).toBeGreaterThan(10);
    }
  });

  test('strengths kept: confidence intervals, regimes with time windows, cross-checks, the regression statement', () => {
    const t = flat(pdf.text);
    const c = studio.ctx;
    // regression statement
    expect(t).toMatch(/Model match: Homogeneous reservoir \(regression converged\)/);
    expect(t).toMatch(/Levenberg-Marquardt regression on pressure and Bourdet derivative in log space: \d+ iterations/);
    // confidence intervals, the fit's own numbers
    expect(t).toMatch(/Parameter Value 95% confidence/);
    const [lo, hi] = c.fitResult.confidence95.k;
    expect(t).toContain(`${Number(lo).toPrecision(3)} to ${Number(hi).toPrecision(3)}`);
    // a real interval: it brackets the fitted value and is narrow on this clean sample
    expect(lo).toBeLessThan(c.fitResult.params.k);
    expect(hi).toBeGreaterThan(c.fitResult.params.k);
    expect((hi - lo) / c.fitResult.params.k).toBeLessThan(0.05);
    // flow regimes with their time windows
    expect(t).toMatch(/Flow regimes observed Regime From \(hr\) To \(hr\) Span \(log cycles\)/);
    for (const r of c.regimes) expect(t).toContain(`${r.label} ${Number(r.xStart).toPrecision(3)} ${Number(r.xEnd).toPrecision(3)}`);
    expect(c.regimes.some((r) => r.regime === 'radial')).toBe(true);
    // cross-check across methods: the match and the Horner line side by side
    expect(t).toMatch(/Cross-check of methods Method k \(md\) Skin Basis/);
    expect(t).toContain(`Model match, Homogeneous reservoir ${Number(c.matchParams.k).toPrecision(3)} ${c.matchParams.skin.toFixed(2)} Regression on pressure and derivative, converged`);
    expect(t).toContain(`Horner straight line ${Number(c.semilogResult.k).toPrecision(3)} ${c.semilogResult.skin.toFixed(2)} Semilog slope`);
    // and the methods agree on the planted truth (k 85 md, skin 6.5)
    expect(Math.abs(c.matchParams.k - 85) / 85).toBeLessThan(0.02);
    expect(Math.abs(c.semilogResult.k - 85) / 85).toBeLessThan(0.06);
  });

  test('jsPDF standard fonts: nothing outside Latin-1, and none of the symbols the screen uses', () => {
    // eslint-disable-next-line no-control-regex
    expect(pdf.text).not.toMatch(/[^\x00-\xff]/);
    expect(pdf.text).not.toMatch(/[ΔμφΦ√²³·—–−]/);
    expect(pdf.text).not.toMatch(/undefined|NaN|\[object/);
  });

  test('report-only inputs do not withdraw the regression; an input the analysis reads does (PL4)', async () => {
    // API gravity, kv/kh, a source note and the completion are for the report
    await studio.act((c) => {
      c.setReservoirField('apiGravity', '36');
      c.setReservoirField('kvkh', '0.2');
      c.setInputMetaField('h', 'source', 'offset');
      c.setCompletionField('payTopTvd', '9600');
    });
    expect(studio.ctx.matchMethod.kind).toBe('regression');
    expect(studio.ctx.fitStale).toBe(false);
    // net pay is read by the analysis: the fit now describes other inputs
    await studio.act((c) => c.setReservoirField('h', '50'));
    expect(studio.ctx.fitStale).toBe(true);
    expect(studio.ctx.matchMethod.kind).toBe('manual');
    expect(flat(readPdf(build(studio.ctx).doc).text)).not.toMatch(/regression converged/);
  });

  test('a manual match loses the regression claims and the intervals, and says so (PL4)', async () => {
    await studio.act((c) => c.setMatchField('k', '70'));
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Model match: Homogeneous reservoir \(manual match\)/);
    expect(t).toMatch(/Manual match: no regression was run on these values, so no confidence intervals are given/);
    expect(t).not.toMatch(/regression converged/);
    expect(t).not.toMatch(/Levenberg-Marquardt/);
    expect(t).toMatch(/Model match, Homogeneous reservoir 70\.0 [\d.]+ Manual match/);
    expect(t).toMatch(/match \(manual match\)/);
  });
});

describe('hostile inputs and the other paths', () => {
  test('sample loaded and nothing else: everything not provided is n/a, the figures say why they are missing', async () => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => { c.setCompletion({ perfTopMd: '', perfBaseMd: '', payTopMd: '', perfTopTvd: '', perfBaseTvd: '', payTopTvd: '', tvdSource: '' }); c.setRateRows([]); });
    const built = build(studio.ctx);
    const t = flat(readPdf(built.doc).text);
    expect(t).toMatch(/Field n\/a/);
    expect(t).toMatch(/Licence n\/a/);
    expect(t).toMatch(/Analyst n\/a/);
    expect(t).toMatch(/Test dates n\/a/);
    expect(t).toMatch(/Perforations, MD n\/a/);
    expect(t).toMatch(/Water saturation Sw n\/a fraction Not provided/);
    expect(t).toMatch(/API gravity n\/a degAPI Not provided/);
    // no interval: the skin is not split, and the report says so
    expect(t).toMatch(/Partial-penetration pseudo-skin s_pp n\/a Not computed/);
    expect(t).toMatch(/Perforated interval not entered\. The skin is reported as a total and is not split\./);
    // no rate history: periods from the test setup, stated
    expect(t).toMatch(/No rate history was entered: the periods are taken from the test setup/);
    expect(t).toMatch(/No rate history was entered: the rate is the test setup rate/);
    // no model matched yet: the report claims no match, and draws none
    expect(t).not.toMatch(/Model match:/);
    expect(t).toMatch(/No model has been matched, so the plot shows the data only/);
    expect(t).toMatch(/Figure 5\. History match No model has been matched yet/);
    expect(built.figures.find((f) => f.id === 'loglog').panels[0].drawn['Model dp']).toBeUndefined();
    expect(t).not.toMatch(/undefined|NaN/);
    studio.unmount();
  }, 300000);

  test('perforation longer than h, and zero kv/kh: refused with the reason, total skin undivided', async () => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => c.setCompletionField('perfBaseMd', '9950'));
    let t = flat(readPdf(build(studio.ctx).doc).text);
    expect(studio.ctx.skinBreakdown.status).toBe('refused');
    expect(t).toMatch(/The perforated length is greater than net pay h\. The skin is not split\./);
    expect(t).toMatch(/Mechanical \(damage\) skin s_d n\/a Not computed/);
    await studio.act((c) => { c.setCompletionField('perfBaseMd', '9880'); c.setReservoirField('kvkh', '0'); });
    t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/kv\/kh is missing or not positive; with no vertical permeability the pseudo-skin is unbounded\. The skin is not split\./);
    studio.unmount();
  }, 300000);

  test('missing h: the report still builds, says what is missing and draws what it can', async () => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => c.setReservoirField('h', ''));
    expect(studio.ctx.reservoirSpec.reservoir).toBeNull();
    const built = build(studio.ctx);
    const t = flat(readPdf(built.doc).text);
    expect(t).toMatch(/Net pay h n\/a ft/);
    expect(t).toMatch(/Permeability k \(md\) n\/a/);
    expect(t).not.toMatch(/undefined|NaN/);
    studio.unmount();
  }, 300000);

  test('WTA-R2-006: an imported temperature column is plotted under the pressure, in the display unit', async () => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => c.setGaugeRows(c.gaugeRows.map((r, i) => ({ ...r, T: 211 + 0.02 * i }))));
    const built = build(studio.ctx);
    const t = flat(readPdf(built.doc).text);
    const fig = built.figures.find((f) => f.id === 'overview');
    expect(fig.panels).toHaveLength(2);
    expect(fig.panels[1].drawn['Gauge temperature']).toBe(studio.ctx.gaugeRows.length);
    expect(t).toMatch(/Temperature \(degF\)/);
    expect(t).toMatch(/The lower panel is the gauge temperature from the imported file/);
    expect(t).not.toMatch(/No temperature column was imported/);
    // SI: the same readings in degC, converted
    await studio.act((c) => c.setUnitSystem('si'));
    const si = build(studio.ctx);
    const tsi = flat(readPdf(si.doc).text);
    expect(tsi).toMatch(/Temperature \(degC\)/);
    expect(tsi).toMatch(/Pressure \(kPa\)/);
    expect(tsi).toMatch(/Net pay h 13\.716 m/);
    expect(tsi).toMatch(/Rate \(m3\/d\)/);
    expect(studio.ctx.overview.temperature[0].T).toBeCloseTo((211 - 32) / 1.8, 1);
    studio.unmount();
  }, 300000);

  test('WTA-R2-009: a claimed linear-flow window brings the sqrt(t) plot in', async () => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => { c.setWindowField('sqrtMin', '0.02'); c.setWindowField('sqrtMax', '0.5'); });
    const built = build(studio.ctx);
    const t = flat(readPdf(built.doc).text);
    const fig = built.figures.find((f) => f.id === 'sqrt');
    expect(fig.plotted).toBe(true);
    expect(fig.panels[0].drawn.dp).toBe(studio.ctx.prepared.points.length);
    expect(t).toMatch(/Figure 4\. Square-root-of-time plot/);
    expect(t).toMatch(/sqrt\(t\) \(hr\^0\.5\)/);
    expect(t).toMatch(/window set by the analyst/);
    expect(t).not.toMatch(/Does not apply/);
    studio.unmount();
  }, 300000);

  test('WTA-R2-011: with production data the flowing material balance and RTA log-log plots are drawn', async () => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => c.setRtaRows(goldens.fixtures.rtaOilDecline.rows.map((r) => ({ t: String(r.t), q: String(r.q), pwf: String(r.pwf) }))));
    expect(studio.ctx.rtaResult.fmb).toBeTruthy();
    const built = build(studio.ctx);
    const t = flat(readPdf(built.doc).text);
    const fig = built.figures.find((f) => f.id === 'rta');
    expect(fig.plotted).toBe(true);
    expect(fig.panels).toHaveLength(2);
    expect(fig.panels[0].drawn.Data).toBeGreaterThan(5);
    expect(fig.panels[0].drawn['FMB line']).toBe(fig.panels[0].drawn.Data);
    expect(t).toMatch(/Figure 6\. Rate transient analysis plots/);
    expect(t).toMatch(/Material-balance time te \(days\)/);
    expect(t).toMatch(/FMB line/);
    expect(t).toMatch(/Rate transient analysis \(production data\)/);
    expect(t).not.toMatch(/Rate transient analysis was not run/);
    studio.unmount();
  }, 300000);

  test('gas: the correlations named are the ones the engine returned, and the plots are in pseudo-pressure', async () => {
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => { c.setReservoirField('fluid', 'gas'); c.setReservoirField('ct', ''); c.setReservoirField('q', '5000'); });
    const src = studio.ctx.reservoirSpec.reservoir.pvtSource;
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Fluid Gas, pseudo-pressure m\(p\)/);
    expect(t).toContain(`Correlation: ${src.z} z-factor, ${src.viscosity} viscosity, ${src.pseudoCriticals} pseudo-criticals (computed by the studio)`);
    expect(t).toMatch(/Gas z-factor at pi/);
    expect(t).toMatch(/dm\(p\) and derivative \(psi2\/cp\)/);
    // eslint-disable-next-line no-control-regex
    expect(t).not.toMatch(/[^\x00-\xff]/);
    studio.unmount();
  }, 300000);

  test('a project saved before this round opens and reports, the new fields n/a', async () => {
    const studio = mountStudio();
    const sample = (await import('@/contexts/WellTestStudioContext')).generateSampleBuildup();
    // the PR #810 payload shape: none of the round 2 fields
    const old = {
      id: 'export', name: 'Saved in September', wellName: 'W-7', fieldName: 'Obodo', analyst: 'A. Analyst',
      reservoirInputs: { h: '45', phi: '0.18', rw: '0.354', B: '1.25', mu: '0.9', ct: '0.000012', q: '450', pi: '4800', fluid: 'oil', gasGravity: '0.65', tempF: '180' },
      testConfig: { testType: 'buildup', tp: '36', pwfShutIn: sample.pwfShutIn.toFixed(1), testStartTime: '', smoothingL: '0.1', pointsPerDecade: '15', spikeTrimOn: true, spikeThreshold: '6', abscissa: 'time' },
      gaugeRows: sample.gaugeRows, rateRows: [{ t: '0', q: '450' }, { t: '36', q: '0' }],
      matchInputs: { modelId: 'homogeneous', k: '85', skin: '6.5', C: '0.015' },
      windows: { semilogMin: '', semilogMax: '', pssMin: '', pssMax: '', sqrtMin: '', sqrtMax: '' },
      deliverabilityInputs: { pr: '', method: 'pressure-squared', rows: [] }, notes: 'Radial flow from 8 hr.', unitSystem: 'oilfield', rtaRows: [], rtaWindows: { linMin: '', linMax: '' },
    };
    await studio.act((c) => c.importProjectPayload(old));
    const c = studio.ctx;
    expect(c.prepared.points.length).toBeGreaterThan(20);
    expect(c.identification.zone).toBe('');
    expect(c.completion.perfTopMd).toBe('');
    expect(c.reservoirInputs.ctMode).toBe('total');
    const built = build(c);
    const t = flat(readPdf(built.doc).text);
    expect(t).toMatch(/Well W-7/);
    expect(t).toMatch(/Zone or sand n\/a/);
    expect(t).toMatch(/Perforations, TVD n\/a/);
    expect(t).toMatch(/Total compressibility ct 1\.2e-5 1\/psi .*entered as total/);
    expect(t).toMatch(/Model match: Homogeneous reservoir \(manual match\)/);
    expect(t).toMatch(/Radial flow from 8 hr\./);
    expect(built.figures.filter((f) => f.plotted).map((f) => f.id)).toEqual(['overview', 'loglog', 'semilog', 'history']);
    // and what is saved now carries the new fields, so export and import round-trip them
    await studio.act((cc) => { cc.setIdentificationField('zone', 'D-3 sand'); cc.setInputMetaField('h', 'source', 'offset'); cc.setCompletionField('perfTopMd', '9850'); });
    const saved = JSON.parse(JSON.stringify(studio.ctx.serializeInputs()));
    expect(saved.identification.zone).toBe('D-3 sand');
    expect(saved.inputMeta.h.source).toBe('offset');
    expect(saved.completion.perfTopMd).toBe('9850');
    const second = mountStudio();
    await second.act((cc) => cc.importProjectPayload({ ...saved, id: 'export', name: 'round trip' }));
    expect(second.ctx.identification.zone).toBe('D-3 sand');
    expect(second.ctx.inputMeta.h.source).toBe('offset');
    expect(second.ctx.completion.perfTopMd).toBe('9850');
    expect(second.ctx.inputsTable.find((r) => r.key === 'h').source).toBe('Offset well');
    second.unmount();
    studio.unmount();
  }, 300000);

  test('WTA-R2-010: a gauge record that holds the flow period is matched over the full test', async () => {
    const { evaluateDrawdown, evaluateBuildup, getModel } = await import('@/utils/welltest/models/modelCatalog');
    const model = getModel('homogeneous');
    const truth = { k: 85, skin: 6.5, C: 0.015 };
    const reservoir = { h: 45, phi: 0.18, rw: 0.354, B: 1.25, mu: 0.9, ct: 0.000012, q: 450, pi: 4800 };
    const flowTimes = Array.from({ length: 24 }, (_, i) => 0.05 * 1.33 ** i).filter((t) => t < 36);
    const flow = evaluateDrawdown({ model, params: truth, reservoir, times: flowTimes });
    const dts = Array.from({ length: 40 }, (_, i) => 10 ** (-2 + (3.8 * i) / 39));
    const shut = evaluateBuildup({ model, params: truth, reservoir, tp: 36, dts });
    // one file on the gauge clock: flowing from 0, shut in at 36 hr
    const gaugeRows = [
      ...flow.map((p) => ({ t: p.t, p: p.pw })),
      { t: 36, p: shut.pwfAtShutIn },
      ...shut.map((p) => ({ t: 36 + p.dt, p: p.pws })),
    ];
    const studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => {
      c.setGaugeRows(gaugeRows);
      c.setTestField('testStartTime', '36');
      c.setTestField('pwfShutIn', '');
      c.setMatchField('k', '85'); c.setMatchField('skin', '6.5'); c.setMatchField('C', '0.015');
    });
    const c = studio.ctx;
    expect(c.prepared.preTestPoints).toBe(flow.length);
    expect(c.prepared.pwfSource.kind).toBe('gauge');
    const hm = c.historyMatch;
    expect(hm.hasPrior).toBe(true);
    const prior = hm.points.filter((p) => p.prior);
    expect(prior).toHaveLength(flow.length);
    expect(prior[0].time).toBeLessThan(-35);
    // the model at the generating parameters reproduces BOTH periods
    for (const p of hm.points) {
      expect(p.model).not.toBeNull();
      expect(Math.abs(p.model - p.observed)).toBeLessThan(0.6);
    }
    // negative control: a model with the wrong permeability misses the flow period by tens of psi
    await studio.act((cc) => cc.setMatchField('k', '40'));
    const off = studio.ctx.historyMatch.points.filter((p) => p.prior);
    expect(Math.max(...off.map((p) => Math.abs(p.model - p.observed)))).toBeGreaterThan(30);
    await studio.act((cc) => cc.setMatchField('k', '85'));
    // the overview puts the shut-in at 36 hr on the test clock and starts at the first reading
    expect(studio.ctx.overview.anchor).toBe(36);
    expect(studio.ctx.overview.pressure[0].t).toBeCloseTo(flowTimes[0], 6);
    const built = build(studio.ctx);
    const t = flat(readPdf(built.doc).text);
    const fig = built.figures.find((f) => f.id === 'history');
    expect(fig.panels[0].drawn.Gauge).toBe(studio.ctx.historyMatch.points.length);
    expect(fig.panels[0].drawn.Model).toBe(studio.ctx.historyMatch.points.length);
    expect(t).toMatch(/including the period before the shut-in held in the gauge record \(negative hours\)/);
    expect(t).toMatch(/Shut-in time 0 hr elapsed \(gauge clock 36 hr\)/);
    studio.unmount();
  }, 300000);

  test('no gauge data at all: figures state it, nothing is drawn', () => {
    const figs = buildReportFigures({ configSpec: {}, reservoirSpec: {}, prepared: { points: [] }, loglog: [], regimes: [], overview: { pressure: [] } });
    expect(figs.map((f) => !!f.panels)).toEqual([false, false, false, false, false, false]);
    expect(figs.every((f) => f.statement && f.statement.length > 20)).toBe(true);
    expect(buildCrossCheckRows({})).toEqual([]);
    expect(EMPTY_VALUE).toBe('n/a');
  });
});
