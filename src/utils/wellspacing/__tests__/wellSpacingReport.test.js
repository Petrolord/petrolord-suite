/**
 * WS-U1: the Well Spacing report read back (reviewer lens RL1 to RL12) and
 * its goldens. The PDF is built by the function the Export button calls,
 * from the model the Report tab shows, and read with poppler.
 */
import {
  readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden,
} from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit';
import { engineInputOf } from '../model';
import { CASES, GOLDEN_DIR, UPDATE, pdfOf, reportOf, sampleCase, fieldCase, intakeCase, blankCase } from './wsTestKit';

jest.setTimeout(120000);

describe('goldens', () => {
  it.each(Object.keys(CASES))('%s', async (name) => {
    const { built } = await pdfOf(CASES[name]());
    const { pdf } = checkGolden(built, { dir: GOLDEN_DIR, name, update: UPDATE });
    pdf.close?.();
  });
});

describe('RL1: every input the study read is on the page, with unit and source', () => {
  it.each(Object.keys(CASES))('completeness guard, %s', async (name) => {
    const inputs = CASES[name]();
    const { model } = await reportOf(inputs);
    expect(missingInputRows(engineInputOf(inputs.form), model.inputs.rows)).toEqual([]);
    for (const r of model.inputs.rows) expect(r.source).toBeTruthy();
  });
  it('NEGATIVE CONTROL: an input without its row is named', async () => {
    const inputs = fieldCase();
    const rows = (await reportOf(inputs)).model.inputs.rows.filter((r) => r.key !== 'permeability');
    expect(missingInputRows(engineInputOf(inputs.form), rows)).toEqual(['permeability']);
  });
  it('sample values print as assumptions; Standing Bo as computed; stated sources as stated', async () => {
    const s = Object.fromEntries((await reportOf(sampleCase())).model.inputs.rows.map((r) => [r.key, r]));
    expect(s.porosity.source).toMatch(/^Assumed: the built-in sample value/);
    expect(s.oilFvf.source).toMatch(/^Computed: Standing \(1947\) correlation.*1\.2845 RB\/STB/);
    expect(s.wellLayout.source).toBe('Assumed default square grid (no value entered)');
    expect(s.ooipStb.value).toBe('n/a');
    const f = Object.fromEntries((await reportOf(fieldCase())).model.inputs.rows.map((r) => [r.key, r]));
    expect(f.porosity.source).toMatch(/^Measured \(lab\)\. Core report CR-17/);
    expect(f.recoveryFactor.source).toMatch(/Analog: E-1000 sand/);
    expect(f.wellLayout.value).toMatch(/Staggered/);
    expect(f.permeability.source).toBe('Entered, source not stated');
  });
  it('intakes print with project, method and time basis', async () => {
    const t = Object.fromEntries((await reportOf(intakeCase())).model.inputs.rows.map((r) => [r.key, r]));
    expect(t.oilFvf.source).toMatch(/at 3985 psia, the stated average reservoir pressure \(undersaturated\).*Good Oil Well No. 4 PVT/);
    expect(t.oilViscosity.source).toMatch(/Read from the project's PVT table/);
    expect(t.permeability.source).toMatch(/^Horner straight line, window 2 to 20 hr of shut-in time dt.*Well Test Analysis Studio, project "EK-3 buildup", well EK-3/);
    expect(t.skin.source).toMatch(/Total skin \(mechanical 1.4, partial penetration 0.7\)/);
    expect(t.reservoirPressure.source).toMatch(/Extrapolated p\* of the Horner straight line/);
    expect(t.ooipStb.source).toMatch(/Havlena-Odeh regression, slope, r2 0.987, Material Balance Studio, case "Ekene E-2000"/);
    expect(t.dcaEurStb.source).toMatch(/EUR of EK-2, oil, hyperbolic fitted 2026-09-30, project "Ekene decline" \(Decline Curve Analysis\)/);
  });
  it('RL8: a value edited after the intake says so, in the inputs and the flags', async () => {
    const inputs = intakeCase();
    inputs.form.permeability = '120';
    const { model } = await reportOf(inputs);
    expect(model.inputs.rows.find((r) => r.key === 'permeability').source).toMatch(/^Edited in this app after the intake \(received 182.4\)/);
    expect(model.limits.flags.join(' ')).toMatch(/Permeability was edited after it was taken from Well Test Analysis Studio/);
  });
});

describe('RL3 and RL12: the report is the screen, split into its parts', () => {
  it('cases come from the engine result in its order; NPV and capex to the screen precision', async () => {
    const { model, results } = await reportOf(sampleCase());
    expect(model.cases.rows.map((r) => r[0])).toEqual(results.spacingResults.map((r) => String(r.spacing)));
    const r40 = model.cases.rows.find((r) => r[0] === '40');
    expect(r40[7]).toBe('1,885.8');
    expect(r40[2]).toBe('1,320');
  });
  it('the economics close: revenue - royalty - opex - capex = the undiscounted net cash', async () => {
    const { results } = await reportOf(sampleCase());
    for (const r of results.spacingResults) {
      const e = r.economics;
      expect(e.totalRevenue - e.totalRoyalty - e.totalOpex - e.totalCapex).toBeCloseTo(r.netCashUndiscounted, 9);
    }
  });
  it('the incremental rows are differences of the case rows', async () => {
    const { results } = await reportOf(sampleCase());
    const a = results.spacingResults.find((r) => r.spacing === 20);
    const b = results.spacingResults.find((r) => r.spacing === 30);
    const inc = results.incremental.find((x) => x.spacing === 20);
    expect(inc.against).toBe(30);
    expect(inc.addedWells).toBe(a.numberOfWells - b.numberOfWells);
    expect(inc.addedNpv).toBeCloseTo(a.npv - b.npv, 12);
  });
});

describe('the PDF read back', () => {
  it('intake case: identification, cases, parts, drainage, cross-checks, limits, four figures with ink and marks', async () => {
    const { args, built } = await pdfOf(intakeCase());
    const pdf = readPdf(built.doc, { ink: true });
    const t = flat(pdf.text);
    expect(pdf.pages).toBe(built.pages);
    for (const s of ['Lordsway Energy', 'Ekene', 'OML 999', 'E-2000 sand', 'A. Analyst', 'test-build', 'Spacing cases', 'Economics of each case, by part', 'Incremental economics: the added wells', 'Inputs and their sources', 'Drainage geometry, timing and deliverability', 'Cross-checks', 'Methods and references', 'Limits of this analysis']) expect(t).toContain(s);
    expect(t).toMatch(/mid-year discounting/);
    expect(t).toMatch(/no optimum is nominated/);
    expect(t).toMatch(/Ahmed and McKinney \(2005\), Eq\. 1\.2\.124/);
    expect(t).toMatch(/volumetric \/ Material Balance \d\.\d\d/);
    expect(t).toMatch(/4 wells; nearest neighbour 1,320 to 1,320 ft/);
    expect(t).toMatch(/Inside the spacing range studied|Outside the spacing range studied/);
    expect(listCaptions(pdf).map((c) => c.title)).toEqual([
      'EUR and oil produced per well against spacing', 'Field NPV against the number of wells', 'Plan initial rate and deliverable rate against spacing', 'Wells taken from the registry',
    ]);
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    const counts = pointCounts(built.figures);
    const n = args.model.cases.rows.length;
    expect(counts.eur[0]['EUR per well']).toBe(n);
    expect(counts.npv[0].NPV).toBe(n);
    expect(counts.map[0]['Registry wells']).toBe(4);
    expect(t).not.toMatch(/—/);
    pdf.close?.();
  });
  it('SI: spacing in ha/well, distances in m, rates in sm3/d; the units line says money stays in US$', async () => {
    const { built } = await pdfOf(fieldCase({ system: 'si' }));
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Spacing \(ha\/well\)/);
    expect(t).toMatch(/Reservoir area \[case\] 2,023.43 ha/); // 5,000 acres
    expect(t).toMatch(/Average net pay \[case\] 18.288 m/); // 60 ft
    expect(t).toMatch(/Money in US\$/);
    pdf.close?.();
  });
  it('blank: no case, the figures say why they do not apply', async () => {
    const { built } = await pdfOf(blankCase());
    const pdf = readPdf(built.doc);
    for (const f of built.figures) expectFigureStatement(pdf, f, 'Does not apply');
    expect(flat(pdf.text)).toMatch(/No case has been computed/);
    pdf.close?.();
  });
  it('NEGATIVE CONTROL: an export with no figure entries throws', async () => {
    const { model } = await reportOf(sampleCase());
    const { buildWellSpacingPdf } = await import('../reportExport');
    expect(() => buildWellSpacingPdf({ model: { ...model, figures: [] } })).toThrow(/figure list is empty/);
  });
});
