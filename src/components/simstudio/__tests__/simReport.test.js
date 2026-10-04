/**
 * SIM-U1 report gates (RL1 to RL12): the report built from stored runs the
 * worker really produced, through the function the Export button calls, read
 * back with the kit's poppler readers.
 */
import path from 'path';
import {
  readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden,
} from '@/lib/reportKit/testKit';
import { collectSimReportArgs, buildSimPdf } from '@/utils/simstudio/reportExport';
import { NOT_REPORTED, formAppliesToRun } from '@/utils/simstudio/reportModel';
import { fieldRows, pairs } from '@/utils/simstudio/series';
import * as K from './simTestKit';

const GOLDEN = path.join(process.cwd(), 'src', 'components', 'simstudio', '__tests__', '__fixtures__', 'reportGolden');
const UPDATE = process.env.UPDATE_REPORT_GOLDENS === '1';

const spe1Args = (over = {}) => {
  const s = over.summary || K.spe1Summary();
  return collectSimReportArgs({
    caseRow: K.spe1Case(), run: K.runOf(s), summary: s, deckText: K.spe1Deck(),
    system: 'oilfield', organizationName: 'Ekene Energy', build: K.BUILD, ...over,
  });
};
const builderArgs = (over = {}) => {
  const s = K.builtSummary();
  return collectSimReportArgs({
    caseRow: K.builtCase(), run: K.runOf(s, { case_id: 'case-built' }), summary: s, deckText: K.builtDeck(),
    form: K.builtForm(s), system: 'oilfield', build: K.BUILD, ...over,
  });
};
const pdfOf = (a) => buildSimPdf(a, { logo: K.logo, generatedAt: K.AT });

describe('SIM-U1 report: SPE1 template run (material balance and convergence from the PRT)', () => {
  let built; let pdf; let text;
  beforeAll(() => {
    built = pdfOf(spe1Args());
    pdf = readPdf(built.doc, { ink: true });
    text = flat(pdf.text);
  });
  afterAll(() => pdf.close());

  test('identification, provenance and units on the page (RL4, RL7)', () => {
    expect(text).toMatch(/Case SPE1 benchmark/);
    expect(text).toMatch(/Company Ekene Energy/);
    expect(text).toMatch(/Model period 2015-01-01 to 2024-12-29/);
    expect(text).toMatch(/OPM Flow 2026\.04/);
    expect(text).toContain(K.spe1Summary().deck_sha256);
    expect(text).toMatch(/Worker vps-sim-worker-1/);
    expect(text).toMatch(/Exit code 0/);
    expect(text).toMatch(/Report steps, simulator time steps 120, 123/);
    expect(text).toMatch(/Deck unit system FIELD/);
    expect(text).toMatch(/Display units Oilfield/);
  });

  test('the material balance is the PRT closure per component, with its verdict (RL8)', () => {
    expect(text).toMatch(/Material balance \(from the simulator's PRT\)/);
    expect(text).toMatch(/Oil \(STB\) 284,630,659 238,732,120 45,898,400 0 139 4\.9e-7 no/);
    expect(text).toMatch(/Gas \(Mscf\) 361,480,937 371,485,785 355,000,000 365,000,000 -4,848 -1\.3e-5 yes/);
    expect(text).toMatch(/The balance closes at report step 120/);
    expect(text).not.toMatch(/does not close/);
  });

  test('convergence statistics from the PRT', () => {
    expect(text).toMatch(/Newton iterations 313 \(wasted 0\)/);
    expect(text).toMatch(/Linear iterations 442 \(wasted 0\)/);
    expect(text).toMatch(/Time steps chopped \(convergence failures\) 0/);
    expect(text).toMatch(/No time step was cut/);
  });

  test('headline results: cumulatives from the PRT well totals when the summary lacks FOPT, recovery factor', () => {
    expect(text).toMatch(/Cumulative oil produced 45,898,400 STB FOPT is not in the summary; the simulator's well totals in the PRT at report step 120/);
    expect(text).toMatch(/Oil originally in place 284,630,659 STB/);
    expect(text).toMatch(/Recovery factor to the end 16\.13 percent/);
  });

  test('what the deck holds (RL5): grid, schedule, EQUIL, wells', () => {
    expect(text).toMatch(/10 x 10 x 3 = 300 cells, block-centred \(DX\/DY\/DZ\/TOPS\); active cells 300/);
    expect(text).toMatch(/120 TSTEP steps, 3,650\.0 days/);
    expect(text).toMatch(/datum 8,400 ft at 4,800 psia; OWC 8,450 ft; GOC 8,300 ft/);
    expect(text).toMatch(/PROD producer OIL 10, 10 8,400/);
    expect(text).toMatch(/INJ injector GAS 1, 1 8,335/);
  });

  test('figures: plotted from the screen series, conditional ones say why (RL6, RL12)', () => {
    const caps = listCaptions(pdf).map((c) => c.title);
    expect(caps).toEqual(['Field production rates', 'Field cumulative volumes', 'Reservoir and bottomhole pressure',
      'Water cut and gas-oil ratio', 'Field injection rates', 'History match: observed against simulated',
      // SIM-U2-001: the bottomhole pressure match, stated as not applying for a deck without one
      'Bottomhole pressure match']);
    const rates = built.figures.find((f) => f.id === 'rates');
    expectFigureDrawn(pdf, rates, { logo: true });
    const screen = pairs(fieldRows(K.spe1Summary(), 'FOPR', { deckSystem: 'FIELD', system: 'oilfield' }), 'value');
    expect(pointCounts(built.figures).rates[0]['Oil (FOPR)']).toBe(screen.length);
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'cumulative'), /FOPT, FWIT, FGIT/);
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'history'), /no observed rates/);
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'bhp-match'), /no observed bottomhole pressure/);
  });

  test('limits of this analysis are printed', () => {
    expect(text).toMatch(/Limits of this analysis/);
    expect(text).toMatch(/Grid resolution: 300 cells/);
    expect(text).toMatch(/No aquifer is modelled in the main deck/);
  });

  test('golden', () => {
    checkGolden(built, { dir: GOLDEN, name: 'spe1-template', update: UPDATE });
  });
});

describe('SIM-U1 report: a run by a worker build that did not read the PRT says so', () => {
  test('"not reported by this build", no balance table, no closure claimed', () => {
    const legacy = K.legacySummary();
    const built = pdfOf(spe1Args({ summary: legacy, run: K.runOf(legacy, { active_cells: null }) }));
    const pdf = readPdf(built.doc);
    const text = flat(pdf.text);
    expect(text).toContain(`Material balance: ${NOT_REPORTED}`);
    expect(text).toContain(`Convergence: ${NOT_REPORTED}`);
    expect(text).toContain(`active cells ${NOT_REPORTED}`);
    expect(text).not.toMatch(/balance closes/);
    expect(text).not.toMatch(/Newton iterations/);
    expect(text).toMatch(/Run the case again once the worker is redeployed/);
    // unit system: read from the deck in the app, said so
    expect(text).toMatch(/deck numbers read as FIELD: read from the case deck in the app/);
  });

  test('a balance that does not close is flagged and never called closing (negative control)', () => {
    const s = K.spe1Summary();
    s.diagnostics.material_balance.phases.oil.error = 5e5;
    s.diagnostics.material_balance.phases.oil.relative_error = 5e5 / 284630659;
    s.diagnostics.material_balance.phases.oil.within_rounding = false;
    s.diagnostics.material_balance.phases.oil.closes = false;
    s.diagnostics.material_balance.closes = false;
    const text = flat(readPdf(pdfOf(spe1Args({ summary: s })).doc).text);
    expect(text).toMatch(/The balance does not close at report step 120/);
    expect(text).toMatch(/Flags on this run - The balance does not close/);
    expect(text).not.toMatch(/The balance closes/);
  });

  test('chopped time steps are reported with their reason', () => {
    const s = K.spe1Summary();
    s.diagnostics.chops = { count: 30, listed: [{ to_days: 0.1, reason: 'Solver convergence failure - Iteration limit reached', report_step: 0 }] };
    s.diagnostics.newton_iterations = { total: 510, wasted: 90 };
    const text = flat(readPdf(pdfOf(spe1Args({ summary: s })).doc).text);
    expect(text).toMatch(/The simulator cut 30 time steps after a convergence failure/);
    expect(text).toMatch(/chopped to 0\.1 days at report step 0: Solver convergence failure - Iteration limit reached/);
    expect(text).toMatch(/30 time steps were cut after convergence failures/);
  });
});

describe('SIM-U1 report: a Model Builder run carries its inputs with sources (RL1)', () => {
  test('the inputs table applies only when the form made the deck that ran', () => {
    const s = K.builtSummary();
    const f = K.builtForm(s);
    expect(formAppliesToRun(f, K.runOf(s), K.builtCase()).applies).toBe(true);
    expect(formAppliesToRun(f, K.runOf(s, { deck_sha256: 'edited' }), K.builtCase()).reason).toMatch(/differs from the last deck the builder generated/);
    expect(formAppliesToRun(f, K.runOf(s), K.spe1Case()).applies).toBe(false);
    expect(formAppliesToRun({ ...f, lastGenerated: null }, K.runOf(s), K.builtCase()).reason).toMatch(/does not record the deck/);
  });

  test('every input row has a value, a unit where dimensional and a source; SI on an SI case (RL1, RL7)', () => {
    const a = builderArgs({ system: 'si' });
    const rows = a.model.inputs.rows;
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) {
      expect(r.value).not.toBe('');
      expect(r.source).toMatch(/\w/);
    }
    const built = pdfOf(a);
    const pdf = readPdf(built.doc);
    const text = flat(pdf.text);
    expect(text).toMatch(/Model Builder inputs and their sources/);
    // one known value per conversion (FIELD form, SI display): 500 ft = 152.4 m; 4,200 psia = 28,958 kPa
    expect(text).toMatch(/Cell size DX 152\.4 m Entered in the Model Builder/);
    expect(text).toMatch(/Pressure at datum 28958 kPa/);
    expect(text).toMatch(/Wellbore radius 0\.0762 m Assumed by the builder/);
    expect(text).toMatch(/Display units SI/);
    expect(text).toMatch(/Company Ekene Energy/);
    expect(text).toMatch(/Field Obodo/);
  });

  test('golden (oilfield)', () => {
    checkGolden(pdfOf(builderArgs()), { dir: GOLDEN, name: 'builder-default', update: UPDATE });
  });

  test('an edited deck withdraws the inputs table and says why', () => {
    const s = K.builtSummary();
    const text = flat(readPdf(pdfOf(builderArgs({ run: K.runOf(s, { deck_sha256: 'something-else' }) })).doc).text);
    expect(text).toMatch(/Model Builder inputs Not shown: The deck that ran differs from the last deck the builder generated/);
    expect(text).not.toMatch(/Model Builder inputs and their sources/);
  });
});

describe('SIM-U1 report: a history deck draws the match', () => {
  test('observed against simulated with the history phase shaded', () => {
    const s = K.builtS4Summary();
    const built = pdfOf(collectSimReportArgs({ caseRow: K.builtCase(), run: K.runOf(s), summary: s, deckText: K.builtS4Deck(), system: 'oilfield', build: K.BUILD }));
    const pdf = readPdf(built.doc, { ink: true });
    const fig = built.figures.find((f) => f.id === 'history');
    expect(fig.plotted).toBe(true);
    expectFigureDrawn(pdf, fig, { logo: true });
    expect(flat(pdf.text)).toMatch(/the history phase \(to 2025-04-01\) is shaded/);
    pdf.close();
  });
});
