/**
 * Material Balance Studio report, reviewer lens RL1 to RL12 (MBAL-U1).
 *
 * The report is built through the function the Export button calls
 * (buildMbalPdf) from runs made by the canonical engine through the edge
 * function's own row mapping, on three published cases: Ahmed Example 11-3
 * (oil, depletion), Dake Exercise 9.2 (oil with a Carter-Tracy aquifer) and
 * Pletcher SPE 75354 (gas with a pot aquifer). The PDF FILE is then read
 * back with the Report Kit's test side, so what is asserted is what a
 * reviewer opens.
 */
import path from 'path';
import { buildMbalPdf, buildPlotDataCsv, collectMbalReportArgs } from '@/utils/mbalReportExport';
import {
  readPdf, chartLogo, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden,
} from '@/lib/reportKit/testKit';
import { missingInputRows, engineInputKeys } from '@/lib/reportKit';
import { buildPlotModels } from '@/pages/apps/reservoir-balance/lib/plotModels';
import { assessRunStaleness } from '@/pages/apps/reservoir-balance/lib/runStaleness';
import { readStudy, withStudy } from '@/pages/apps/reservoir-balance/lib/studyMeta';
import { createMbalUnits, MBAL_METRIC_VIEW } from '@/pages/apps/reservoir-balance/lib/mbalUnits';
import { shortReference } from '@/pages/apps/reservoir-balance/lib/reportModel';
import {
  runSample, reportArgs, SAMPLE_CASE_IDS, AT, METRIC_UNITS,
} from '@/pages/apps/reservoir-balance/lib/__tests__/mbalTestKit';
import { sampleFluidBlock } from '@/pages/apps/reservoir-balance/harness/sampleCases';
import { tableFromPvtBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import { PVT_TABLE_ORIGIN_KEY, pvtTableCoverage, pvtCoverageWarning } from '@/pages/apps/reservoir-balance/lib/pvtSource';
import { buildEngineInputs } from '../../../../supabase/functions/_shared/mbal-run-mapping.ts';
import { AQUIFER_PARAM_KEYS } from '../../../../packages/engines/engines/mbal/mbalEngine.ts';

const logo = chartLogo();
const GOLDEN_DIR = path.join(__dirname, '__fixtures__', 'reportGolden');
const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';
const build = (state, over = {}, opts = {}) => buildMbalPdf(reportArgs(state, over), { logo, generatedAt: AT, ...opts });

// a study record as an analyst would fill it
const STUDY = {
  v: 1,
  identification: { company: '', licence: 'OML 143', zone: 'E-2000 sand', analyst: 'A. Okafor' },
  datum: { datum_depth_ft: 9200, gauge_depth_ft: 9050, reference: 'TVDSS', basis: 'datum', note: 'Static surveys, corrected with a 0.35 psi/ft oil gradient' },
  inputMeta: {
    initial_pressure_psia: { source: 'lab', note: 'RFT, discovery well, 1979' },
    formation_compressibility_psi: { source: 'correlation', correlation: 'Hall (1953)' },
    initial_water_saturation: { source: 'offset', note: 'Log average of three wells' },
    aquifer: { source: 'assumed', note: 'Geometry from the structure map' },
    production_data: { note: 'Monthly allocation; yearly static surveys' },
  },
};
const withStudyRecord = (state) => ({ ...state, study: readStudy({ pvt_correlations: withStudy({}, STUDY) }) });

const ahmed = runSample(SAMPLE_CASE_IDS.ahmed);
const dake = withStudyRecord(runSample(SAMPLE_CASE_IDS.dake));
const pletcher = runSample(SAMPLE_CASE_IDS.pletcher);
const dakeHm = withStudyRecord(runSample(SAMPLE_CASE_IDS.dake, { mode: 'history_match' }));

describe('RL1: every input is on the page, with unit and source', () => {
  test.each([
    ['oil, no aquifer', ahmed],
    ['oil, Carter-Tracy aquifer', dake],
    ['gas, pot aquifer', pletcher],
    ['oil, history match', dakeHm],
  ])('completeness, %s: every key handed to the engine has a row', (_, state) => {
    const engineInput = buildEngineInputs(state.caseData, state.runConfig, state.caseData.production_data);
    const model = collectMbalReportArgs(reportArgs(state));
    expect(missingInputRows(engineInput, model.inputs)).toEqual([]);
    // the guard is looking at real keys
    expect(engineInputKeys(engineInput)).toEqual(expect.arrayContaining(['initial_pressure_psia', 'pvt_correlations.z_factor', 'production_data', 'excluded_timesteps']));
  });

  test('completeness holds for a Fetkovich config and for a key the engine does not know', () => {
    const fet = runSample(SAMPLE_CASE_IDS.dake, {
      patchDefault: { aquifer_model: 'fetkovich', aquifer_params: { initial_aquifer_water_in_place_rb: 4.5e9, aquifer_pi_rb_d_psi: 116.5, aquifer_encroachment_angle_deg: 140 } },
    });
    const model = collectMbalReportArgs(reportArgs(fet));
    const engineInput = buildEngineInputs(fet.caseData, fet.runConfig, fet.caseData.production_data);
    expect(missingInputRows(engineInput, model.inputs)).toEqual([]);
    const other = model.inputs.find((r) => r.key === 'aquifer_other');
    expect(other.source).toMatch(/Not a parameter the engine knows, so ignored: aquifer_encroachment_angle_deg/);
    expect(model.inputs.find((r) => r.key === 'aquifer_aquifer_total_compressibility_psi').source).toMatch(/^Computed: ct = cf \+ cw/);
  });

  test('negative control: a row taken out of the model is named by the guard', () => {
    const engineInput = buildEngineInputs(dake.caseData, dake.runConfig, dake.caseData.production_data);
    const model = collectMbalReportArgs(reportArgs(dake));
    const without = model.inputs.filter((r) => r.key !== 'formation_compressibility_psi' && r.key !== 'aquifer_theta_degrees');
    expect(missingInputRows(engineInput, without)).toEqual(['formation_compressibility_psi', 'aquifer_params.theta_degrees']);
  });

  test('the model covers every aquifer parameter the engine reads', () => {
    const model = collectMbalReportArgs(reportArgs(dake));
    const covered = new Set(model.inputs.flatMap((r) => r.engineKeys));
    for (const key of AQUIFER_PARAM_KEYS) expect(covered.has(`aquifer_params.${key}`)).toBe(true);
  });

  test('in the PDF each input row has a value, its unit and a source', () => {
    const built = build(dake);
    const text = flat(readPdf(built.doc).text);
    expect(text).toMatch(/Inputs of the analysis Input Value Unit Source and quality/);
    expect(text).toMatch(/Initial reservoir pressure pi 2,740\.0 psia Measured \(lab\)\. RFT, discovery well, 1979/);
    expect(text).toMatch(/Initial water saturation Swi 0\.050 fraction Offset well\. Log average of three wells/);
    expect(text).toMatch(/Formation compressibility cf 4\.00e-6 1\/psi Correlation: Hall \(1953\)/);
    expect(text).toMatch(/Water compressibility cw 3\.00e-6 1\/psi Entered, source not stated/);
    expect(text).toMatch(/Aquifer model Carter-Tracy Assumed\. Geometry from the structure map/);
    expect(text).toMatch(/Aquifer permeability k 200\.0 mD/);
    expect(text).toMatch(/Aquifer thickness h 100\.0 ft/);
    expect(text).toMatch(/Encroachment angle 140 degrees/);
    expect(text).toMatch(/Aquifer to reservoir radius ratio reD 5\.000/);
    expect(text).toMatch(/Reservoir radius at the contact r_R 9,200 ft/);
    expect(text).toMatch(/Aquifer water viscosity 0\.550 cP/);
    expect(text).toMatch(/Aquifer total compressibility ct 7\.00e-6 1\/psi/);
    expect(text).toMatch(/Gas cap ratio m 0 fraction No gas cap on this case/);
    // every row of the model has a source, and a unit unless it is a name or a count
    for (const row of built.model.inputs) {
      expect(row.source).toBeTruthy();
      expect(row.value).toBeTruthy();
    }
  });

  test('a blank prints n/a with "Not provided"; a default the app applied prints as an assumption', () => {
    const state = runSample(SAMPLE_CASE_IDS.ahmed, {
      patchDefault: { water_salinity_ppm: null, oil_gravity_api: null, gas_specific_gravity: null, formation_compressibility_psi: null },
    });
    const text = flat(readPdf(build(state).doc).text);
    expect(text).toMatch(/Formation water salinity n\/a ppm Not provided: fresh water \(0 ppm\)/);
    expect(text).toMatch(/Oil gravity 35 degAPI Assumed default 35 degAPI \(no value entered\)/);
    expect(text).toMatch(/Gas specific gravity 0\.700 air = 1 Assumed default 0\.7 \(no value entered\)/);
    expect(text).toMatch(/Formation compressibility cf 6\.00e-6 1\/psi Assumed default 0\.000006 1\/psi \(no value entered\)/);
  });

  test('the Carter-Tracy defaults of the engine are printed as defaults', () => {
    const state = runSample(SAMPLE_CASE_IDS.dake, {
      patchDefault: { aquifer_params: { aquifer_thickness_ft: 100, aquifer_permeability_md: 200, aquifer_porosity: 0.25 } },
    });
    const text = flat(readPdf(build(state).doc).text);
    expect(text).toMatch(/Encroachment angle 360 degrees Assumed default 360 degrees, a full circle/);
    expect(text).toMatch(/Aquifer to reservoir radius ratio reD infinite Assumed default an infinite-acting aquifer/);
    expect(text).toMatch(/Reservoir radius at the contact r_R 2,980 ft Assumed default 2,980 ft, the radius of a 640 acre cell/);
    expect(text).toMatch(/Aquifer water viscosity 0\.\d+ cP Correlation: McCain \(1991\)/);
  });

  test('the PVT of the run is printed: the table as entered and the values the engine used', () => {
    const text = flat(readPdf(build(pletcher).doc).text);
    expect(text).toMatch(/PVT used by the engine at each timestep/);
    expect(text).toMatch(/0 6,411\.0 0\.6279 1\.1192 1\.0452/);
    expect(text).toMatch(/10 2,638\.0 1\.283 0\.9409 1\.0571/);
    const withTable = runSample(SAMPLE_CASE_IDS.pletcher, {
      patchDefault: { pvt_lab_table: [{ pressure_psia: 2000, z_factor: 0.93, bg_rb_mscf: 1.6 }, { pressure_psia: 6500, z_factor: 1.12, bg_rb_mscf: 0.62 }] },
    });
    const t2 = flat(readPdf(build(withTable).doc).text);
    expect(t2).toMatch(/PVT table of the run p \(psia\) Bg \(RB\/Mscf\) Z 2,000\.0 1\.600 0\.9300 6,500\.0 0\.6200 1\.1200/);
    expect(t2).toMatch(/PVT table 2 rows, 2,000 to 6,500 psia/);
  });
});

describe('RL2: Et is printed with its components', () => {
  test('the terms close on Et for every timestep, oil and gas', () => {
    for (const state of [ahmed, dake, pletcher]) {
      const model = collectMbalReportArgs(reportArgs(state));
      for (const off of model.expansion.closure) if (off != null) expect(Math.abs(off)).toBeLessThan(1e-12);
      expect(model.expansion.formula).toMatch(/^Et = /);
    }
    const text = flat(readPdf(build(dake).doc).text);
    expect(text).toMatch(/Withdrawal and expansion terms Step F \(MMRB\) Eo \(RB\/STB\) Efw \(RB\/STB\) Et \(RB\/STB\)/);
    expect(text).toMatch(/Et = Eo \+ m Eg \+ Efw \(m = 0, so the gas cap term is absent\)/);
  });

  test('negative control: a wrong component breaks the closure', () => {
    const model = collectMbalReportArgs(reportArgs({ ...dake, result: { ...dake.result, plot_data: { ...dake.result.plot_data, Eo: dake.result.plot_data.Eo.map((v) => (v == null ? v : v * 1.01)) } } }));
    expect(Math.max(...model.expansion.closure.filter((v) => v != null).map(Math.abs))).toBeGreaterThan(1e-4);
  });
});

describe('RL3 and RL7: drive indices are split, the convention is named and they close', () => {
  test('the parts close on the printed sum, and the sum on 1 by the stated identity', () => {
    for (const state of [ahmed, dake, pletcher]) {
      const model = collectMbalReportArgs(reportArgs(state));
      expect(model.drive.closes).toBe(true);
      // the identity the report states, from the engine's own terms of the last timestep:
      // sum - 1 = (N Et + We - F) / A, with A the hydrocarbon voidage
      const pd = state.result.plot_data;
      const k = pd.timestep_index.length - 1;
      const isGas = state.caseData.fluid_system === 'gas';
      const inPlace = isGas ? state.result.estimated_ogip_scf : state.result.estimated_ooip_stb;
      const wpBw = pd.cum_water_stb[k] * pd.Bw[k];
      const A = pd.F[k] - wpBw;
      expect(model.drive.sum - 1).toBeCloseTo((inPlace * pd.Et[k] + pd.We[k] - pd.F[k]) / A, 9);
    }
  });

  test('the report prints each index, the energy term, the sum and the denominator', () => {
    const text = flat(readPdf(build(dake).doc).text);
    expect(text).toMatch(/Drive indices at the last timestep Drive Energy term Index Depletion \(DDI\) N Eo 0\.5678 Gas cap \(GDI\) N m Eg 0\.0000 Rock and connate water \(CDI\) N Efw 0\.0114 Water drive \(WDI\) We - Wp Bw 0\.4179 Sum \(N Et \+ We - Wp Bw\) 0\.9972/);
    expect(text).toMatch(/hydrocarbon voidage A = F - Wp Bw/);
    expect(text).toMatch(/The indices sum to 0\.9972\. The departure from 1 is the misfit/);
    // the printed parts add up to the printed sum
    expect(0.5678 + 0.0000 + 0.0114 + 0.4179).toBeCloseTo(0.9972, 3);
    const gas = flat(readPdf(build(pletcher).doc).text);
    expect(gas).toMatch(/Gas expansion \(GDI\) G Eg 0\.9418 Rock and connate water \(CDI\) G Efw 0\.0258 Water drive \(WDI\) We - Wp Bw 0\.0328 Sum \(G Et \+ We - Wp Bw\) 1\.0005/);
    expect(gas).toMatch(/hydrocarbon voidage Gp Bg \(Pletcher, SPE 75354, Eqs\. 8 to 10\)/);
  });

  test('one name for the rock and water term on both fluid systems (it was EDI for oil and CDI for gas)', () => {
    for (const state of [ahmed, pletcher]) {
      const text = flat(readPdf(build(state).doc).text);
      expect(text).toMatch(/Rock and connate water \(CDI\)/);
      expect(text).not.toMatch(/Rock and water \(EDI\)|Segregation/);
    }
  });
});

describe('RL4: the report identifies what was analysed and by whom', () => {
  test('header fields on page 1', () => {
    const pdf = readPdf(build(dake).doc);
    const p1 = flat(pdf.pageText[0]);
    expect(p1).toMatch(/Material Balance Report Petrolord Material Balance Studio/);
    expect(p1).toMatch(/Case Dake Exercise 9\.2 \(water drive\) Company Lordsway Energy/);
    expect(p1).toMatch(/Field Dake Exercise 9\.2 Licence or block OML 143/);
    expect(p1).toMatch(/Reservoir Wedge reservoir Zone or sand E-2000 sand/);
    expect(p1).toMatch(/Fluid system Oil Analysis type Material balance, oil, Havlena-Odeh regression with aquifer influx/);
    expect(p1).toMatch(/Data dates 1980-01-01 to 1990-01-01 Analyst A\. Okafor/);
    expect(p1).toMatch(/Engine run 2026-10-02 08:00 UTC Build Petrolord Suite test/);
    expect(p1).toMatch(/Display units Oilfield \(psia, degF, STB, RB, scf, ft\) Generated 2026-10-02 09:00 UTC/);
    // the footer names the case on every page
    for (const page of pdf.pageText.filter((t) => t.trim())) expect(flat(page)).toMatch(/Material Balance Report, Dake Exercise 9\.2 \(water drive\), Field Dake Exercise 9\.2 Page \d+ of \d+/);
  });

  test('a case from before the study record prints n/a and does not throw; the company falls back to the organisation', () => {
    const p1 = flat(readPdf(build(ahmed).doc).pageText[0]);
    expect(p1).toMatch(/Company Lordsway Energy/);
    expect(p1).toMatch(/Licence or block n\/a/);
    expect(p1).toMatch(/Zone or sand n\/a/);
    expect(p1).toMatch(/Analyst n\/a/);
    expect(p1).toMatch(/Reservoir n\/a/);
    const bare = flat(readPdf(build(ahmed, { organizationName: '' }).doc).pageText[0]);
    expect(bare).toMatch(/Company n\/a/);
  });
});

describe('RL5: the data the analysis used, and what it left out', () => {
  test('one row per timestep, with the date and the reason a point is not in the fit', () => {
    const built = build(pletcher);
    const model = built.model;
    expect(model.data.body).toHaveLength(pletcher.caseData.production_data.length);
    const fitCol = model.data.body.map((r) => r[r.length - 1]);
    expect(fitCol[0]).toBe('Initial state (no production yet)');
    expect(fitCol[1]).toBe('Excluded by the analyst');
    expect(fitCol.filter((v) => v === 'In the fit')).toHaveLength(9);
    // used plus left out equals the table, and equals what the engine reports
    const c = model.data.counts;
    expect(c.fit + c.initial + c.excluded + c.no_expansion).toBe(11);
    expect(c.fit).toBe(pletcher.result.n_data_points);
    const text = flat(readPdf(built.doc).text);
    expect(text).toMatch(/Timesteps in the table 11 In the fit 9 Left out of the fit 2: initial state 1, excluded by the analyst 1, no expansion above zero 0/);
    expect(text).toMatch(/Points the engine reports in the fit 9/);
    expect(text).toMatch(/Data cut-off 2010-01-01/);
    expect(text).toMatch(/Period covered 2000-01-01 to 2010-01-01, 10\.00 years/);
    expect(text).toMatch(/Cumulative gas at the cut-off \(Bscf\) 54\.750/);
    // Wp 378 STB in MSTB, We = (cw + cf) W (pi - p) = 9e-6 x 69.04e6 x 464 = 0.288 MMRB
    expect(text).toMatch(/1 2001-01-01 5,947\.0 5\.475 0\.378 0\.288 Excluded by the analyst/);
    expect(model.inputs.find((r) => r.key === 'excluded_timesteps')).toMatchObject({ value: '1', source: 'Held in the run settings of the case; each one is marked in the data table' });
  });

  test('an undated table says so, and prints n/a for the date', () => {
    const undated = runSample(SAMPLE_CASE_IDS.ahmed, { mutateStore: (db) => { db.rb_production_data = db.rb_production_data.map((r) => ({ ...r, observation_date: null })); } });
    const text = flat(readPdf(build(undated).doc).text);
    expect(text).toMatch(/Data dates Not dated \(timestep order\)/);
    expect(text).toMatch(/Data cut-off Timestep 12 \(no dates\)/);
    expect(text).toMatch(/Period covered Not dated/);
    expect(text).toMatch(/12 n\/a 3,188\.0 2\.575 1\.288 8\.000/);
  });

  test('MBAL-U2-002: injected volumes are in the balance, printed with the terms and indices they add', () => {
    const injected = runSample(SAMPLE_CASE_IDS.ahmed, { mutateStore: (db) => { db.rb_production_data = db.rb_production_data.map((r) => (r.case_id === SAMPLE_CASE_IDS.ahmed ? { ...r, cum_water_inj_stb: r.timestep_index * 100000 } : r)); } });
    const built = build(injected);
    const text = flat(readPdf(built.doc).text);
    expect(built.model.data.head).toContain('Winj (MMSTB)');
    expect(text).toMatch(/Cumulative water injected at the cut-off \(MMSTB\) 1\.200/);
    expect(text).toMatch(/Injected volumes are in this balance: F is the net withdrawal/);
    // the engine reads the column now: less oil in place than the same history without injection
    expect(injected.result.estimated_ooip_stb).toBeLessThan(0.8 * ahmed.result.estimated_ooip_stb);
    // the terms netted out are printed beside F, read back from the PDF
    expect(built.model.expansion.head).toEqual(expect.arrayContaining(['Winj Bw (MMRB)', 'Ginj Bginj (MMRB)']));
    expect(text).toMatch(/- Winj Bw - Ginj Bginj, the net withdrawal/);
    const last = built.model.series.rows[12];
    expect(last.winj_bw_rb).toBeCloseTo(1.2e6 * last.Bw, 3);
    // the drive indices gain the injection index and still close on the printed sum
    expect(built.model.drive.rows.map((x) => x[0])).toEqual(expect.arrayContaining(['Water injection (WIDI)', 'Gas injection (GIDI)']));
    expect(built.model.drive.closes).toBe(true);
    expect(text).toMatch(/WIDI and GIDI; the sum stays an identity/);
    expect(built.model.driveTable.head).toEqual(expect.arrayContaining(['WIDI', 'GIDI']));
    // the tier says what backs it
    expect(built.model.headline.tier.tier).toBe('published_method');
    expect(text).toMatch(/Injection: injected water and gas enter the withdrawal term F/);
  });

  test('MBAL-U2-002: a run stored before the engine read injection is named as leaving it out', () => {
    const injected = runSample(SAMPLE_CASE_IDS.ahmed, { mutateStore: (db) => { db.rb_production_data = db.rb_production_data.map((r) => (r.case_id === SAMPLE_CASE_IDS.ahmed ? { ...r, cum_water_inj_stb: r.timestep_index * 100000 } : r)); } });
    const pd = { ...injected.result.plot_data };
    for (const k of ['winj_bw_rb', 'ginj_bg_rb', 'winj_di', 'ginj_di', 'final_winj_di', 'final_ginj_di']) delete pd[k];
    const legacy = { ...injected, result: { ...injected.result, plot_data: pd } };
    const built = build(legacy);
    const text = flat(readPdf(built.doc).text);
    expect(text).toMatch(/This run was made before the engine read injection/);
    expect(built.model.drive.rows.map((x) => x[0])).not.toContain('Water injection (WIDI)');
  });
});

describe('RL6: every claimed result has its plot, in the report', () => {
  const cases = [['oil, no aquifer', ahmed], ['oil, Carter-Tracy aquifer', dake], ['gas, pot aquifer', pletcher], ['oil, history match', dakeHm]];

  test.each(cases)('%s: the figures are drawn and hold the points of the screen series', (_, state) => {
    const built = build(state);
    const pdf = readPdf(built.doc, { ink: true });
    try {
      const models = buildPlotModels({ series: built.model.series, result: state.result, units: built.model.units });
      // the screen draws these same models (RbDiagnosticPlots): one count per series
      const counts = pointCounts(built.figures);
      for (const m of models.filter((x) => x.applies)) {
        const expected = Object.fromEntries(m.series.filter((s) => s.pts.length).map((s) => [s.name, s.pts.length]));
        expect(counts[m.id][0]).toEqual(expected);
      }
      for (const f of built.figures) {
        if (f.plotted) expectFigureDrawn(pdf, f, { logo: true, minPoints: 2 });
        else expectFigureStatement(pdf, f, /Does not apply|Not plotted/);
      }
      // captions in order
      expect(listCaptions(pdf).map((c) => c.number)).toEqual(built.figures.map((f) => f.number));
      expect(built.figures.map((f) => f.id)).toEqual(['regression', 'campbell', 'cole', 'pz', 'pressure', 'influx', 'drive']);
    } finally { pdf.close(); }
  });

  test('the regression plot is in the space the engine regressed in, with its points and line', () => {
    const fig = (state) => build(state).figures.find((f) => f.id === 'regression');
    // no aquifer: F against Et, 12 points of the fit, the initial state apart, the line of two points
    expect(fig(ahmed).panels[0].drawn).toEqual({ 'In the fit': 12, 'Not in the fit': 1, 'Fitted line': 2 });
    // pot aquifer, gas: 9 in the fit, the excluded year 1 as a square; the initial state has no F/Eg
    expect(fig(pletcher).panels[0].drawn).toEqual({ 'In the fit': 9, 'Not in the fit': 1, 'Fitted line': 2 });
    const t = (state) => flat(readPdf(build(state).doc).text);
    expect(t(ahmed)).toMatch(/Figure 1\. Havlena-Odeh: F against Et/);
    expect(t(dake)).toMatch(/Figure 1\. Havlena-Odeh: F - We against Et/);
    expect(t(pletcher)).toMatch(/Figure 1\. Pot aquifer plot: F\/Eg against dp\/Eg/);
    expect(t(pletcher)).toMatch(/G = 100\.99 Bscf \(intercept\)/);
    expect(t(pletcher)).toMatch(/dp\/Eg \(10\^6 psi per RB\/scf\)/);
    expect(t(dake)).toMatch(/N = 307\.22 MMSTB \(slope\)/);
    expect(t(dake)).toMatch(/r2 = 0\.999975, 10 points/);
  });

  test('the fitted line is the engine line: it passes through the regression of the plotted points', () => {
    // least squares over the plotted in-fit points must give back the engine's in-place volume
    for (const [state, from] of [[ahmed, 'slope'], [dake, 'slope'], [pletcher, 'intercept']]) {
      const model = collectMbalReportArgs(reportArgs(state));
      const pts = model.series.regression.inFit;
      const n = pts.length;
      const mx = pts.reduce((s, p) => s + p[0], 0) / n;
      const my = pts.reduce((s, p) => s + p[1], 0) / n;
      const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
      const intercept = my - slope * mx;
      const isGas = state.caseData.fluid_system === 'gas';
      const engine = isGas ? state.result.estimated_ogip_scf : state.result.estimated_ooip_stb;
      expect((from === 'slope' ? slope : intercept) / engine).toBeCloseTo(1, 9);
      expect(n).toBe(state.result.n_data_points);
    }
  });

  test('negative control: the old screen line (engine slope and intercept on F against Et) misses a pot aquifer run', () => {
    // on the pot plot the intercept is G (1.0e11 scf): drawn on F against Et it is 10,000 times F
    const pd = pletcher.result.plot_data;
    const k = pd.F.length - 1;
    const old = pletcher.result.regression_slope * pd.Et[k] + pletcher.result.regression_intercept;
    expect(old / pd.F[k]).toBeGreaterThan(1000);
  });

  test('conditional figures say why they do not apply', () => {
    const oil = flat(readPdf(build(ahmed).doc).text);
    expect(oil).toMatch(/Figure 3\. Cole plot: F\/Eg against Gp Does not apply: the Cole plot is a gas reservoir diagnostic/);
    expect(oil).toMatch(/Figure 4\. p\/z against cumulative gas Does not apply: p\/z is a gas reservoir plot/);
    expect(oil).toMatch(/Figure 6\. Cumulative water influx against time Does not apply: the run has no aquifer model/);
    expect(oil).toMatch(/Figure 5\. Measured pressure history/);
    expect(oil).toMatch(/This run is a regression: it solves the in-place volume from the measured pressures and simulates none/);
    const gas = flat(readPdf(build(pletcher).doc).text);
    expect(gas).toMatch(/Figure 2\. Campbell plot: F\/Et against F Does not apply: the Campbell plot is an oil reservoir diagnostic/);
    expect(gas).toMatch(/Figure 4\. p\/z against cumulative gas/);
    expect(gas).toMatch(/p\/z line to zero: 107\.75 Bscf \(apparent\)/);
    const hm = flat(readPdf(build(dakeHm).doc).text);
    expect(hm).toMatch(/Figure 5\. Pressure history match: model against measured/);
    expect(hm).toMatch(/Model \(simulated\)/);
  });

  test('drive indices against time are stacked bars on a calendar axis', () => {
    const built = build(dake);
    const fig = built.figures.find((f) => f.id === 'drive');
    expect(fig.panels[0].marks.bars).toBe(10 * 4 - 10); // ten timesteps, four drives, the gas cap bars are zero and not drawn
    expect(fig.panels[0].drawn).toEqual({ 'Depletion (DDI)': 10, 'Gas cap (GDI)': 10, 'Rock and connate water (CDI)': 10, 'Water drive (WDI)': 10 });
    const page = flat(readPdf(built.doc).pageText[fig.page - 1]);
    expect(page).toMatch(/1982/);
    expect(page).toMatch(/1990/);
  });

  test('a report with no result is refused', () => {
    expect(() => buildMbalPdf(reportArgs({ ...dake, result: { plot_data: null } }))).toThrow(/Run the engine first/);
  });
});

describe('RL7: the basis is named wherever a number is printed', () => {
  test('basis lexicon of the oilfield report', () => {
    const text = flat(readPdf(build(dake).doc).text);
    expect(text).toMatch(/Initial reservoir pressure pi 2,740\.0 psia/); // absolute
    expect(text).toMatch(/All pressures are absolute/);
    expect(text).toMatch(/OOIP\) 307\.22 MMSTB/); // stock tank
    expect(text).toMatch(/We at the last timestep 88\.065 MMRB/); // reservoir
    expect(text).toMatch(/Np, Wp and injected water are stock-tank volumes; We is a reservoir volume/);
    expect(text).toMatch(/Bo and Bw are reservoir volume per stock-tank volume/);
    expect(text).toMatch(/Pressure datum depth 9,200\.0 ft TVDSS/);
    expect(text).toMatch(/Gauge or survey depth 9,050\.0 ft TVDSS/);
    expect(text).toMatch(/Pressures on the Data tab are Corrected to the datum before/);
    expect(build(dake).model.datum[2]).toMatchObject({ value: 'Corrected to the datum before entry', source: 'Static surveys, corrected with a 0.35 psi/ft oil gradient' });
    expect(text).toMatch(/This app applies no correction to datum/);
  });

  test('the SI report converts the values and the labels follow (known values, never a round trip)', () => {
    const built = build(dake, { units: METRIC_UNITS });
    const text = flat(readPdf(built.doc).text);
    // 2740 psia x 6.894757 = 18,891.6 kPa
    expect(text).toMatch(/Initial reservoir pressure pi 18,892 kPa abs/);
    // 307.221 MMSTB x 0.1589873 = 48.844 million sm3
    expect(text).toMatch(/OOIP\) 48\.84 10\^6 sm3/);
    // 88.065 MMRB x 0.1589873 = 14.001 million rm3
    expect(text).toMatch(/We at the last timestep 14\.001 10\^6 rm3/);
    // 200 degF = 93.3 degC; 100 ft = 30.5 m; 9200 ft = 2804 m
    expect(text).toMatch(/Reservoir temperature 93\.3 degC/);
    expect(text).toMatch(/Aquifer thickness h 30\.5 m/);
    expect(text).toMatch(/Reservoir radius at the contact r_R 2,804 m/);
    // 4e-6 1/psi / 6.894757 = 5.80e-7 1/kPa
    expect(text).toMatch(/Formation compressibility cf 5\.80e-7 1\/kPa/);
    expect(built.model.units.displayUnits()).toBe('SI / metric (kPa abs, degC, sm3, rm3, m)');
    expect(text).toMatch(/Display units SI \/ metric \(kPa abs, degC, sm3, rm3, m\)/);
    expect(text).toMatch(/Pressure datum depth 2,804\.2 m TVDSS/);
    // the benchmark reference of the engine path quotes its own published units; nothing else is left in oilfield units
    expect(text.replace(/Engine path validation, .*?Regression statement/, '')).not.toMatch(/psia|MMSTB|MMRB| RB\/STB|degF/);
    // drive indices are fractions: unchanged
    expect(text).toMatch(/Depletion \(DDI\) N Eo 0\.5678/);
  });
});

describe('RL8: the strengths are kept, and only what happened is claimed', () => {
  test('the regression statement names the method, the points, the fit and the intercept', () => {
    const text = flat(readPdf(build(ahmed).doc).text);
    expect(text).toMatch(/Regression statement Havlena-Odeh \(1963\): F against Et, ordinary least squares with a free intercept\. The slope is N\. 12 points entered the fit; r2 = 0\.9933\. N = slope = 291\.311 MMSTB\. The fitted intercept is -65,340 RB/);
  });

  test('a history match prints its status, its intervals and both in-place volumes', () => {
    const built = build(dakeHm);
    const text = flat(readPdf(built.doc).text);
    const hm = dakeHm.result.plot_data.history_match;
    expect(hm.converged).toBe(true);
    expect(text).toMatch(new RegExp(`Pressure history match \\(converged in ${hm.iterations} iterations\\)`));
    expect(text).toMatch(/Parameter Start Matched 95% confidence/);
    expect(text).toMatch(/STOIIP N \(MMSTB\)/);
    expect(text).toMatch(/Reservoir radius at the OWC r_R \(ft\)/);
    expect(text).toMatch(/Headline value from The pressure history match \(matched value\)/);
    expect(text).toMatch(/OOIP by the regression of this run/);
    expect(text).toMatch(/Levenberg-Marquardt on the logarithm of each parameter/);
    // not converged: the title says so and no "converged" claim remains
    const stopped = { ...dakeHm, result: { ...dakeHm.result, plot_data: { ...dakeHm.result.plot_data, history_match: { ...hm, converged: false, iterations: 30 } } } };
    const t2 = flat(readPdf(build(stopped).doc).text);
    expect(t2).toMatch(/Pressure history match \(stopped at the iteration cap, 30\)/);
    expect(t2).not.toMatch(/converged in/);
    // a regression run makes no claim about a match
    expect(flat(readPdf(build(dake).doc).text)).not.toMatch(/converged|history match \(/i);
  });

  test('the in-place volume by each method, with the difference against the headline', () => {
    const gas = flat(readPdf(build(pletcher).doc).text);
    expect(gas).toMatch(/In-place volume by each method Method In place Against the/);
    expect(gas).toMatch(/Pot aquifer plot \(intercept\) 100\.99 Bscf headline/);
    expect(gas).toMatch(/p\/z straight line to p\/z = 0 107\.75 Bscf \+6\.7%/);
    expect(gas).toMatch(/Volumetric estimate 100\.80 Bscf -0\.2%/);
    const oil = build(ahmed).model.crossCheck;
    expect(oil.map((r) => r.method)).toEqual(['Havlena-Odeh, F against Et (slope)', 'F/Et at the last timestep (Campbell level)', 'Volumetric estimate']);
    // no volumetric row unless one is entered
    const noVol = runSample(SAMPLE_CASE_IDS.ahmed, { patchCase: { volumetric_ooip_stb: null } });
    expect(build(noVol).model.crossCheck.some((r) => r.method === 'Volumetric estimate')).toBe(false);
  });

  test('a stale run is not exported; an input edit withdraws it and a report-only edit does not', () => {
    // an analysis input changed on the PVT tab after the run
    const edited = { ...dake.defaultCfg, formation_compressibility_psi: 5e-6 };
    const stale = assessRunStaleness({ caseData: dake.caseData, defaultCfg: edited, run: dake.run, runConfig: dake.runConfig, result: dake.result });
    expect(stale.stale).toBe(true);
    expect(() => build(dake, { staleness: stale })).toThrow(/not exported.*earlier run.*formation compressibility/);
    // identification, datum and sources: the run stays current
    const withRecord = { ...dake.defaultCfg, pvt_correlations: withStudy(dake.defaultCfg.pvt_correlations, STUDY) };
    expect(assessRunStaleness({ caseData: dake.caseData, defaultCfg: withRecord, run: dake.run, runConfig: dake.runConfig, result: dake.result })).toEqual({ stale: false, reasons: [] });
  });

  test('the validation tier of the engine path is printed with its benchmark, shortened', () => {
    const text = flat(readPdf(build(dake).doc).text);
    expect(text).toMatch(/Engine path validation Benchmark verified \(1\.53 percent against the reference\)/);
    expect(text).toMatch(/Dake \(1978\) Exercise 9\.2/);
    expect(text).not.toMatch(/RE-MEASURED|Implementation corrections/);
    expect(shortReference('A. B. These figures were moved.')).toBe('A. B.');
    // a result stored by the function as deployed before MBAL-U1 has no tier: the engine's own matrix supplies it
    const old = { ...dake, result: { ...dake.result, plot_data: { ...dake.result.plot_data, validation_tier: undefined, validation_reference: undefined } } };
    expect(build(old).model.headline.tier).toMatchObject({ tier: 'benchmark_verified', from: 'matrix' });
  });
});

describe('RL9: the limits of the method are printed', () => {
  test('the block names the tank model, the aquifer model, the regression and the ranges', () => {
    const text = flat(readPdf(build(dake).doc).text);
    expect(text).toMatch(/Limits of this analysis - Tank model: the reservoir is one cell at one average pressure/);
    expect(text).toMatch(/- Carter-Tracy aquifer: an approximation of the van Everdingen-Hurst unsteady-state solution/);
    expect(text).toMatch(/- Injection: injected water and gas enter the withdrawal term F at the Bw and the reservoir gas Bg of each timestep/);
    expect(text).toMatch(/- Pressure datum: stated in the inputs\. No correction to datum is applied/);
    expect(text).toMatch(/Published ranges of the methods used Correlation Published range, as the engine checks it Standing \(1947\)/);
    expect(text).toMatch(/Inputs outside a published range The engine flagged no input outside the published range/);
  });

  test('an input outside the range of a correlation in use is flagged in the block', () => {
    const out = runSample(SAMPLE_CASE_IDS.ahmed, {
      patchCase: { reservoir_temperature_f: 310 },
      patchDefault: { pvt_source: 'correlated', pvt_correlations: { pb_rs_bo: 'vasquez_beggs', oil_viscosity: 'beggs_robinson', z_factor: 'hall_yarborough', water: 'mccain', gas_viscosity: 'lee_gonzalez_eakin' } },
    });
    const built = build(out);
    expect(built.model.limits.flags.length).toBeGreaterThan(0);
    const text = flat(readPdf(built.doc).text);
    expect(text).toMatch(/Inputs outside a published range - Vasquez-Beggs \(Rs\/Bo\) correlation: reservoir conditions outside the correlation's training range - temperature 310 deg F is outside the 75-294 deg F range/);
    expect(text).toMatch(/Vasquez-Beggs \(1980\), Rs and Bo Pressure to 5,250 psia; 75 to 294 degF/);
    // the flag is in the limits block and is not repeated as a plain warning
    expect(built.model.warnings.some((w) => /Vasquez-Beggs \(Rs\/Bo\)/.test(w))).toBe(false);
  });
});

describe('RL11: PVT taken from a Fluid Systems Studio project keeps its provenance', () => {
  // the Dake case with no per-row PVT, its table taken from the saved fluid project through the pvt-1 contract
  const taken = tableFromPvtBlock(sampleFluidBlock(), { fluidSystem: 'oil', temperatureF: 200, casePressures: [2740, 1460] });
  const noRowPvt = (db) => {
    db.rb_production_data = db.rb_production_data.map((r) => (r.case_id === SAMPLE_CASE_IDS.dake ? { ...r, bo_rb_stb: null, rs_scf_stb: null, bg_rb_mscf: null, bw_rb_stb: null } : r));
  };
  const state = runSample(SAMPLE_CASE_IDS.dake, {
    mutateStore: (db) => {
      noRowPvt(db);
      db.rb_run_configs = db.rb_run_configs.map((c) => (c.case_id === SAMPLE_CASE_IDS.dake
        ? { ...c, pvt_source: 'lab_table', pvt_lab_table: taken.rows, pvt_correlations: { ...c.pvt_correlations, [PVT_TABLE_ORIGIN_KEY]: taken.origin } } : c));
    },
  });

  test('the engine ran on the table of the fluid study', () => {
    const i = state.result.plot_data.pressure.indexOf(2199);
    const lo = taken.rows.filter((r) => r.pressure_psia <= 2199).pop();
    const hi = taken.rows.find((r) => r.pressure_psia >= 2199);
    const f = hi.pressure_psia === lo.pressure_psia ? 0 : (2199 - lo.pressure_psia) / (hi.pressure_psia - lo.pressure_psia);
    expect(state.result.plot_data.Bo[i]).toBeCloseTo(lo.bo_rb_stb + f * (hi.bo_rb_stb - lo.bo_rb_stb), 6);
    expect(state.staleness.stale).toBe(false);
  });

  test('the report names the project, the contract, the method of every property, the basis and the range flags', () => {
    const { doc, model } = build(state);
    const text = flat(readPdf(doc).text);
    expect(model.pvtProvenance).not.toBeNull();
    const rows = Object.fromEntries(model.pvtProvenance);
    expect(rows['PVT contract']).toBe('pvt-1');
    expect(rows.Source).toBe('Fluid Systems Studio, project "Wedge reservoir oil PVT"');
    expect(rows['Method, Bo']).toBe('Standing (Standing (1947))');
    expect(rows['Method, Z']).toMatch(/Papay/);
    expect(rows['Bubble point']).toBe('bubble point entered by the user');
    expect(rows['Pressure range of the table']).toBe('15 to 4,740 psia, 41 rows');
    expect(text).toMatch(/PVT provenance/);
    expect(text).toMatch(/Wedge reservoir oil PVT/);
    expect(text).toMatch(/Standing, scaled to the entered bubble point/);
    expect(text).toMatch(/this app computed none of them/);
    expect(text).toMatch(/the PVT table covers every pressure of the case/);
    // the inputs table states the same source
    expect(JSON.stringify(model.inputs)).toMatch(/Table from Fluid Systems Studio, project \\"Wedge reservoir oil PVT\\"/);
  });

  test('negative control: a table typed by hand prints no provenance table', () => {
    expect(build(ahmed).model.pvtProvenance).toBeNull();
    expect(flat(readPdf(build(ahmed).doc).text)).not.toMatch(/PVT provenance/);
  });

  test('a PVT table that does not cover the pressures of the run is flagged in the Limits block', () => {
    // the table cut at 2,500 psia: the initial state (2,740) and the first survey (2,620) are above it
    const cut = taken.rows.filter((r) => r.pressure_psia <= 2500);
    const short = runSample(SAMPLE_CASE_IDS.dake, {
      mutateStore: (db) => {
        noRowPvt(db);
        db.rb_run_configs = db.rb_run_configs.map((c) => (c.case_id === SAMPLE_CASE_IDS.dake ? { ...c, pvt_source: 'lab_table', pvt_lab_table: cut } : c));
      },
    });
    expect(pvtTableCoverage(short.caseData, short.runConfig).outside.map((o) => o.timestep_index)).toEqual([0, 1]);
    const { doc, model } = build(short);
    expect(model.limits.flags[0]).toMatch(/^PVT table coverage: 2 timesteps \(0, 1\) lie outside the PVT table of the run \(15 to 2,\d{3} psia\)/);
    expect(model.limits.flags[0]).toMatch(/The initial state is one of them/);
    expect(flat(readPdf(doc).text)).toMatch(/PVT table coverage: 2 timesteps/);
    // rows that carry their own PVT need no table: the published case is not flagged
    expect(pvtCoverageWarning(dake.caseData, { ...dake.runConfig, pvt_lab_table: cut })).toBeNull();
    expect(pvtTableCoverage(dake.caseData, dake.runConfig)).toBeNull();
  });
});

describe('RL12: screen, report and file are one model', () => {
  test('the PDF prints in full, never in e-notation, from 1,000 up', () => {
    for (const state of [ahmed, dake, pletcher]) {
      const text = readPdf(build(state).doc).text;
      expect(text).not.toMatch(/\d\.\d+e\+\d/);
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  test('the series CSV names its units and carries the series of the report', () => {
    const csv = buildPlotDataCsv(dake.result, { caseData: dake.caseData, runConfig: dake.runConfig, generatedAt: AT });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('# Material Balance Studio, per-timestep series of one engine run');
    expect(lines[1]).toBe('# Case: Dake Exercise 9.2 (water drive), field Dake Exercise 9.2, reservoir Wedge reservoir');
    expect(lines.find((l) => l.startsWith('# Units'))).toMatch(/Pressures are absolute \(psia\)/);
    const head = lines.find((l) => !l.startsWith('#')).split(',');
    expect(head).toEqual(expect.arrayContaining(['timestep_index', 'observation_date', 'pressure_psia', 'F_rb', 'Et_rb_per_stb', 'We_rb', 'Bo_rb_per_stb', 'cdi', 'in_fit']));
    const rows = lines.filter((l) => !l.startsWith('#')).slice(1);
    expect(rows).toHaveLength(11);
    expect(rows[10].split(',')[head.indexOf('observation_date')]).toBe('1990-01-01');
    expect(Number(rows[10].split(',')[head.indexOf('We_rb')])).toBeCloseTo(dake.result.aquifer_cumulative_we_rb, 3);
    expect(buildPlotDataCsv(pletcher.result, { caseData: pletcher.caseData }).split('\n').find((l) => !l.startsWith('#'))).toMatch(/Et_rb_per_scf/);
  });

  test('golden reports', () => {
    const cases = [
      ['oil-depletion-ahmed', build(ahmed)],
      ['oil-aquifer-dake-identified', build(dake)],
      ['gas-pot-pletcher', build(pletcher)],
      ['oil-history-match-dake-si', build(dakeHm, { units: createMbalUnits(MBAL_METRIC_VIEW) })],
    ];
    for (const [name, built] of cases) checkGolden(built, { dir: GOLDEN_DIR, name, update: UPDATE });
  });
});
