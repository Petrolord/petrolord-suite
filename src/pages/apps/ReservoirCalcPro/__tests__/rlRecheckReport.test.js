/**
 * @jest-environment node
 *
 * ReservoirCalc Pro, reviewer-lens re-check (2026-10-02, the Reservoir round
 * of the app upgrade programme). Both PDF reports are produced by the
 * shipped generator from a real Monte Carlo run of the shipped engine, with
 * the real jsPDF, and read back through the shared Report Kit's test side
 * (pdfinfo, pdftotext, the page content streams).
 *   RL1  every input distribution with type, parameters, unit and source
 *   RL3  in place and recoverable apart; solution gas and condensate printed
 *   RL4  company, licence or block and well control in the identification
 *   RL6  the expectation curve drawn as vectors from the run itself; a
 *        captured chart that is missing is said
 *   RL7  the basis of the volumes named
 *   RL9  the limits of the method printed
 *   RL11 a saved prospect carries its project, reservoir and run, and
 *        Risked Reserves Valuation prints them
 */
import { ReportGenerator, expectationCurvePoints } from '../components/tools/ReportGenerator';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import {
  reviewerLines, distributionRows, deterministicInputRows, limitsLines, basisLine, inputUnit, inputSource,
} from '../services/reportInfo';
import { prospectSourceFromState, sourceForProspect } from '../services/prospectSource';
import { unriskedFromRun } from '../services/prospectVolumes';
import { riskProspect } from '../services/ProspectRiskEngine';
import {
  readPdf, flat, listCaptions, expectFigureDrawn, expectFigureStatement, plotMarks,
} from '@/lib/reportKit/testKit';
import { fromRcpProspect, engineInput } from '@/pages/apps/riskedreserves/services/rrvStore';
import { valueOrProblem } from '@/pages/apps/riskedreserves/services/rrvMath';
import { rrvUnits } from '@/pages/apps/riskedreserves/services/rrvUnits';
import { buildRrvReportModel } from '@/pages/apps/riskedreserves/services/rrvReportModel';
import { buildRrvReport } from '@/pages/apps/riskedreserves/services/rrvReportExport';

jest.setTimeout(180000);

// the real jsPDF; save() hands the document back instead of writing a file
jest.mock('jspdf', () => {
  const actual = jest.requireActual('jspdf');
  const Real = actual.jsPDF || actual.default;
  function Wrapped(...args) {
    const d = new Real(...args);
    d.save = () => d;
    return d;
  }
  Object.assign(Wrapped, Real);
  Wrapped.API = Real.API;
  return { __esModule: true, ...actual, default: Wrapped, jsPDF: Wrapped };
});
beforeAll(() => { global.fetch = () => Promise.reject(new Error('no network in jest')); });

const now = new Date('2026-10-02T12:00:00Z');
const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const dists = {
  area: tri(800, 1000, 1300), thickness: tri(40, 50, 70), porosity: { type: 'normal', mean: 0.2, stdDev: 0.02, min: 0, max: 1 },
  sw: tri(0.2, 0.3, 0.4), ntg: tri(0.8, 0.8, 0.8), fvf: { type: 'uniform', min: 1.15, max: 1.3 }, recovery: tri(18, 25, 32),
};
const config = { fluidType: 'oil', unitSystem: 'field', iterations: 4000, grvMode: 'analytic', recovery: 25, seed: 42, signature: 'sig-42', correlations: [{ a: 'porosity', b: 'sw', rho: -0.6 }] };
const report = { field: 'Keta', analyst: 'A. Analyst', company: 'Lordsway Energy', licence: 'OML 143', well: 'Keta-1, Keta-2', sources: { petrophysics: 'Keta-1 log analysis, Petrophysics Studio, 2026-08', fluids: 'PVT report 1147, Standing' } };
const inputs = { area: 1000, thickness: 50, ntg: 0.8, porosity: 0.2, sw: 0.3, fvf: 1.2, fluidType: 'oil', recovery: 25, report };

describe('the probabilistic report', () => {
  let run; let built; let pdf; let text;
  beforeAll(async () => {
    run = MonteCarloEngine.simulate(config, dists);
    built = await ReportGenerator.generateProbabilisticReport('Keta Project', run, 'field', {}, {
      template: 'technical', fluidType: 'oil', reservoirName: 'Upper Sand', report, inputMethod: 'simple',
      reviewer: reviewerLines({ report, unitSystem: 'field', inputMethod: 'simple', fluidType: 'oil', inputs, probResults: run, now, build: 'Petrolord Suite 4.0.0 (abc1234)' }),
    });
    pdf = readPdf(built.doc, { ink: true });
    text = flat(pdf.text);
  });
  afterAll(() => pdf.close());

  test('the run records what it sampled, and nothing in the sampling reads the record', () => {
    expect(run.meta.inputs.area).toEqual({ type: 'triangular', variable: true, min: 800, mode: 1000, max: 1300 });
    expect(run.meta.inputs.porosity).toEqual({ type: 'normal', variable: true, min: 0, max: 1, mean: 0.2, stdDev: 0.02 });
    expect(run.meta.inputs.ntg).toMatchObject({ type: 'triangular', variable: false, mode: 0.8 });
    expect(run.meta.inputs.fvf).toEqual({ type: 'uniform', variable: true, min: 1.15, max: 1.3 });
    expect(run.meta.constants).toMatchObject({ recovery: 25 });
    // same seed, same realizations, with or without the record being there to read
    const again = MonteCarloEngine.simulate(config, dists);
    expect(again.stats.stooip).toEqual(run.stats.stooip);
  });

  test('RL1: every input distribution is on the page with type, parameters, unit and source', () => {
    const rows = distributionRows(run.meta, report);
    expect(rows.map((r) => r[0])).toEqual(['Area', 'Gross thickness', 'Porosity', 'Water saturation', 'Oil FVF (Bo)', 'Net-to-gross', 'Oil recovery factor']);
    for (const r of rows) { expect(r).toHaveLength(5); for (const c of r) expect(String(c).length).toBeGreaterThan(0); }
    expect(text).toContain('Input Distributions');
    expect(text).toMatch(/Input Distribution Parameters Unit Source/);
    // (a long cell wraps, so each row is read by its leading words, its unit and its source)
    expect(text).toMatch(/Area Triangular min 800, most likely 1000, max acres Entered in the Probabilistic 1300 panel, source not stated/);
    expect(text).toMatch(/Gross thickness Triangular min 40, most likely 50, max 70 ft Entered in the Probabilistic panel, source not stated/);
    expect(text).toMatch(/Porosity Normal mean 0\.2, standard deviation fraction Keta-1 log analysis, 0\.02, truncated to 0 to 1 Petrophysics Studio, 2026-08/);
    expect(text).toMatch(/Oil FVF \(Bo\) Uniform min 1\.15, max 1\.3 rb\/stb PVT report 1147, Standing/);
    expect(text).toMatch(/Net-to-gross Constant \(no 0\.8 fraction Keta-1 log analysis, spread\)/);
    expect(text).toMatch(/Oil recovery factor Triangular min 18, most likely 25, max 32 % Entered in the Probabilistic panel, source not stated/);
    // a source nobody stated is said to be not stated, never left blank
    expect(inputSource('area', report, 'x')).toBe('x');
    expect(inputSource('porosity', report)).toBe('Keta-1 log analysis, Petrophysics Studio, 2026-08');
    expect([inputUnit('area', 'metric'), inputUnit('owc', 'field'), inputUnit('bg', 'field'), inputUnit('grvFactor')]).toEqual(['km2', 'ft', 'rcf/scf', 'multiplier']);
  });

  test('RL1: a run made before the record existed says so and prints no table', async () => {
    const old = { ...run, meta: { ...run.meta, inputs: undefined } };
    expect(distributionRows(old.meta, report)).toBeNull();
    const b = await ReportGenerator.generateProbabilisticReport('Keta Project', old, 'field', {}, { template: 'executive', fluidType: 'oil', report });
    const t = flat(readPdf(b.doc).text);
    expect(t).toContain('Input Distributions Not recorded on this run: it was made before the run kept its input distributions');
    expect(t).not.toMatch(/Input Distribution Parameters Unit Source/);
  });

  test('RL4: field, analyst, date, build, company, licence or block and well control', () => {
    expect(text).toContain('Field: Keta | Analyst: A. Analyst | Date: 2026-10-02 | Petrolord Suite 4.0.0 (abc1234)');
    expect(text).toContain('Company: Lordsway Energy | Licence or block: OML 143 | Well control: Keta-1, Keta-2');
    expect(reviewerLines({ unitSystem: 'field' })[1]).toBe('Company: not given | Licence or block: not given | Well control: not given');
    expect(text).toMatch(/Monte Carlo: 4,000 realizations, area x thickness, run \d{4}-\d\d-\d\d \d\d:\d\d UTC, seed 42/);
    expect(text).toContain('Correlations (Gaussian copula): porosity with sw -0.6');
  });

  test('RL3, RL7: the headline is in place and says so; the recoverable stream is printed beside it', () => {
    expect(text).toContain('Basis: STOIIP is stock-tank oil initially in place at surface conditions (STB). These are IN-PLACE volumes');
    expect(basisLine({ fluidType: 'gas', unitSystem: 'metric' })).toMatch(/GIIP is gas initially in place at standard conditions \(sm3\)/);
    const rec = run.stats.recoverableOil;
    const f = (v) => (v / 1e6).toFixed(2);
    expect(text).toContain(`Recoverable oil ${f(rec.p90)} ${f(rec.p50)} ${f(rec.p10)} ${f(rec.mean)} MMSTB`);
    expect(text).toMatch(/Stream P90 \(low\) P50 \(best\) P10 \(high\) Mean Unit/);
    expect(text).toContain('exceeded with 90, 50 and 10 percent probability');
  });

  test('RL6: the expectation curve is in the report as vectors from the run, whatever the screen showed', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toEqual(['Expectation curve (probability of exceeding each volume)']);
    const fig = built.figures[0];
    expect(fig.plotted).toBe(true);
    expectFigureDrawn(pdf, fig);
    const pts = expectationCurvePoints(run.raw.stooip, 1e6);
    expect(pts).toHaveLength(200);
    expect(Object.values(fig.panels[0].drawn)).toEqual([200]);
    // exceedance falls from 100% at the smallest outcome
    expect(pts[0][1]).toBe(100);
    expect(pts[199][1]).toBeGreaterThan(0);
    for (let i = 1; i < pts.length; i += 1) { expect(pts[i][0]).toBeGreaterThanOrEqual(pts[i - 1][0]); expect(pts[i][1]).toBeLessThan(pts[i - 1][1]); }
    // the P50 of the curve is the P50 of the statistics
    const mid = pts.reduce((a, b) => (Math.abs(b[1] - 50) < Math.abs(a[1] - 50) ? b : a));
    expect(Math.abs(mid[0] - run.stats.stooip.p50 / 1e6) / (run.stats.stooip.p50 / 1e6)).toBeLessThan(0.02);
    // 199 segments of the curve and the three percentile lines
    expect(plotMarks(pdf, fig.page, fig.panels[0].plotArea)).toMatchObject({ segments: 199 + 3, frame: true });
    const page = flat(pdf.pageText[fig.page - 1]);
    for (const s of ['P90', 'P50', 'P10', 'STOIIP in place (MMSTB)', 'Chance of exceeding (%)', 'Exceedance, 200 points of 4,000 realizations']) expect(page).toContain(s);
    // the three captured charts were not handed over: each is said, none skipped silently
    expect(text).toContain('Volume Distribution (MMSTB): not included. The chart was not on screen when the report was made');
    expect(text).toContain('Expectation curve (probability of exceeding each volume): not included.');
    expect(text).toContain('Sensitivity Tornado (P50 swing per parameter): not included.');
  });

  test('RL6: too few realizations is said, with no plot', async () => {
    expect(expectationCurvePoints([1, 2, 3], 1)).toBeNull();
    const thin = { ...run, raw: { ...run.raw, stooip: run.raw.stooip.slice(0, 5) } };
    const b = await ReportGenerator.generateProbabilisticReport('Keta Project', thin, 'field', {}, { template: 'executive', fluidType: 'oil', report });
    expectFigureStatement(readPdf(b.doc), b.figures[0], /Not plotted: the run holds too few saved realizations to draw a curve/);
  });

  test('RL9: the limits of the method are printed on every template', async () => {
    expect(text).toContain('Limits of this analysis');
    for (const s of ['A volumetric estimate: in-place volume is rock volume x net-to-gross x porosity', 'Simple method: area x gross thickness, with no structure',
      'Monte Carlo: each input is sampled from the distribution listed above', 'It is not a reserves or resources booking']) expect(text).toContain(s);
    const exec = await ReportGenerator.generateProbabilisticReport('Keta Project', run, 'field', {}, { template: 'executive', fluidType: 'oil', report });
    expect(flat(readPdf(exec.doc).text)).toContain('Limits of this analysis');
    expect(limitsLines({ probabilistic: false, inputMethod: 'hybrid' }).join(' ')).toMatch(/Structural method: the rock volume is integrated from the mapped surface.*Deterministic: one value per input/);
    expect(pdf.pages).toBe(built.pages);
  });
});

describe('the deterministic report', () => {
  test('RL1, RL3, RL6, RL7, RL9: inputs with unit and source, the other hydrocarbons, the basis, the limits, and why there is no plot', async () => {
    const det = { ...inputs, rs: 550, owc: -8000 };
    const r = VolumeCalculationEngine.calculateDeterministic(det, 'field', 'simple');
    const b = await ReportGenerator.generateDeterministicReport('Keta Project', r, 'field', {
      fluidType: 'oil', inputs: r.inputs, reservoirName: 'Upper Sand', report, inputMethod: 'simple',
      reviewer: reviewerLines({ report, unitSystem: 'field', inputMethod: 'simple', fluidType: 'oil', inputs: det, results: r, now, build: 'Petrolord Suite test' }),
    });
    const pdf = readPdf(b.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Input Value Unit Source/);
    expect(t).toMatch(/Area 1,000\.0 acres Entered, source not stated/);
    expect(t).toMatch(/Gross thickness 50\.0 ft Entered, source not stated/);
    expect(t).toMatch(/Porosity \(phi\) 0\.200 fraction Keta-1 log analysis, Petrophysics/);
    expect(t).toMatch(/Oil FVF \(Bo\) 1\.200 rb\/stb PVT report 1147, Standing/);
    expect(t).toMatch(/Oil recovery factor 25\.00 % Entered, source not stated/);
    const rows = deterministicInputRows({ inputs: r.inputs, fluidType: 'oil', unitSystem: 'field', inputMethod: 'simple', report });
    for (const row of rows) { expect(row).toHaveLength(4); expect(row[3].length).toBeGreaterThan(5); }
    // a blank input prints n/a and "Not provided"
    expect(deterministicInputRows({ inputs: { ...r.inputs, owc: '' }, fluidType: 'oil', report }).find((x) => x[0].startsWith('Oil-water'))).toEqual(['Oil-water contact (OWC), TVDSS', 'n/a', '', 'Not provided']);
    // RL3: solution gas, which the screen showed and the page did not
    expect(Number.isFinite(r.solutionGas)).toBe(true);
    expect(t).toContain(`Solution gas in place (Rs 550) ${(r.solutionGas / 1e9).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} Bscf`);
    expect(t).toContain('Company: Lordsway Energy | Licence or block: OML 143 | Well control: Keta-1, Keta-2');
    expect(t).toContain('Basis: STOIIP is stock-tank oil initially in place at surface conditions (STB)');
    expect(t).toContain('Limits of this analysis');
    expect(t).toContain('Deterministic: one value per input, so the result carries no range');
    expectFigureStatement(pdf, b.figures[0], /Not plotted in this report: a deterministic estimate is one value per input/);
    expect(t).not.toMatch(/[φ−—•]/);
  });
});

describe('RL11: a saved prospect says where its volumes came from, and the valuation report prints it', () => {
  const run = MonteCarloEngine.simulate(config, dists);
  const state = {
    project: { id: 'p-1', name: 'Keta Project' }, currentProjectMeta: { name: 'Keta Project' }, activeReservoirId: 'r-1', reservoirName: 'Upper Sand',
    inputMethod: 'simple', unitSystem: 'field', inputs, probResults: run,
  };
  test('the source block: project, reservoir, method, the run, the in-place volumes and the recovery factor', () => {
    const s = prospectSourceFromState(state, { build: 'test build' });
    expect(s).toMatchObject({
      schema: 'rcp-source-1', app: 'ReservoirCalc Pro', build: 'test build', projectId: 'p-1', projectName: 'Keta Project', reservoirId: 'r-1', reservoirName: 'Upper Sand',
      method: 'Simple (area x gross thickness)', fluidType: 'oil', unitSystem: 'field',
      run: { seed: 42, iterations: 4000, grvMode: 'analytic', signature: 'sig-42', correlations: [{ a: 'porosity', b: 'sw', rho: -0.6 }] },
      inPlace: { stream: 'STOIIP', unit: 'MMbbl' }, recovery: { input: 25, distributed: true },
    });
    expect(s.inPlace.mean).toBeCloseTo(run.stats.stooip.mean / 1e6, 3);
    // the effective recovery factor is recoverable over in place, from the run's own statistics
    expect(s.recovery.effectiveMean).toBeCloseTo(run.stats.recoverableOil.mean / run.stats.stooip.mean, 5);
    expect(s.recovery.effectiveMean).toBeGreaterThan(0.2);
    expect(s.recovery.effectiveMean).toBeLessThan(0.3);
    // no run in the workspace: the project and reservoir still travel
    expect(prospectSourceFromState({ ...state, probResults: null })).toMatchObject({ projectName: 'Keta Project', run: null, inPlace: null });
  });
  test('volumes taken from the run, edited after it, or typed are told apart', () => {
    const s = prospectSourceFromState(state);
    const seeded = { mean: '41.2', p90: '25.1', p50: '40', p10: '58.3' };
    expect(sourceForProspect(s, { seeded, vol: { ...seeded } })).toMatchObject({ volumesFrom: 'monte-carlo', volumesEdited: false });
    expect(sourceForProspect(s, { seeded, vol: { ...seeded, p10: '70' } })).toMatchObject({ volumesFrom: 'monte-carlo', volumesEdited: true });
    expect(sourceForProspect(s, { seeded: null, vol: seeded })).toMatchObject({ volumesFrom: 'entered', run: null, inPlace: null });
    expect(sourceForProspect(null, { seeded, vol: seeded })).toBeNull();
  });
  test('the chain: Monte Carlo run, prospect row, Risked Reserves Valuation report with the run on the page', () => {
    const unrisked = unriskedFromRun(run, 'oil', 'field');
    const factors = { trap: 0.6, reservoir: 0.7, charge: 0.8, seal: 0.7 };
    const risked = riskProspect({ name: 'Keta North', factors, unrisked });
    const r4 = (v) => String(Number(v.toPrecision(4)));
    const seeded = { mean: r4(unrisked.mean), p90: r4(unrisked.p90), p50: r4(unrisked.p50), p10: r4(unrisked.p10) };
    const row = {
      id: '7f3c1a52-9d1e-4b7a-8c55-2f6a0b9e1d11', name: 'Keta North', updated_at: '2026-10-02T14:05:00.000Z', pg_factors: factors,
      inputs: { mean: unrisked.mean, p90: unrisked.p90, p50: unrisked.p50, p10: unrisked.p10, unit: unrisked.unit, basis: unrisked.basis, source: sourceForProspect(prospectSourceFromState(state), { seeded, vol: seeded }) },
      risked: { pg: risked.pg, risked_mean: risked.riskedMean, success: risked.successCase },
    };
    const p = fromRcpProspect(row, { now });
    expect(p.basis).toBe('recoverable');
    expect(p.handoff.source).toMatchObject({ projectName: 'Keta Project', reservoirName: 'Upper Sand', volumesFrom: 'monte-carlo', run: { seed: 42 } });
    const { v } = valueOrProblem(engineInput(p));
    const built = buildRrvReport(buildRrvReportModel({ p, v, units: rrvUnits('MMbbl'), upstream: { state: 'current', row }, savedWhere: 'Petrolord account', build: 'test' }), { generatedAt: now });
    const t = flat(readPdf(built.doc).text);
    expect(t).toContain('Source project and reservoir Project "Keta Project", reservoir "Upper Sand"');
    expect(t).toMatch(/Monte Carlo run \d{4}-\d\d-\d\d \d\d:\d\d UTC, seed 42, 4,000 realizations, area x thickness/);
    expect(t).toContain('Volumes method Monte Carlo in ReservoirCalc Pro');
    expect(t).toContain('In-place volume STOIIP P90 / P50 / P10 /');
    // the four in-place figures are the run's own statistics
    const model = buildRrvReportModel({ p, v, units: rrvUnits('MMbbl'), upstream: { state: 'current', row }, savedWhere: 'x', build: 'test' });
    const ip = model.inputs.rows.find((x) => x.key === 'inPlace');
    expect(ip.value.split(' / ').map(Number)[3]).toBeCloseTo(run.stats.stooip.mean / 1e6, 3);
    expect(ip.unit).toBe('MMSTB');
    expect(t).toMatch(/MMSTB ReservoirCalc Pro project "Keta Project", reservoir "Upper/);
    expect(t).toMatch(/Monte Carlo run of \d{4}-\d\d-\d\d \d\d:\d\d UTC, seed 42, 4,000 realizations\. Recorded for the reader/);
    expect(t).toMatch(/Recovery factor 2\d(\.\d+)? % ReservoirCalc Pro: recoverable mean over in-place mean of the run \(base input 25%, sampled as a distribution\)/);
    expect(t).toContain('Volumetric method and fluid Simple (area x gross thickness), oil');
  });
});
