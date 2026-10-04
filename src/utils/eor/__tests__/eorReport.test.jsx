/**
 * EOR-U1: the EOR Screening report read back (reviewer lens RL1 to RL12)
 * and its goldens. The PDF is built by the function the Export button
 * calls, from the model the Report tab shows, and read with poppler.
 */
import {
  readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden,
} from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit';
import { engineInputOf, screenAllMethods } from '../../eorScreeningCalculations';
import { CASES, GOLDEN_DIR, UPDATE, pdfOf, reportOf, sampleCase, fieldCase, intakeCase, blankCase } from './eorTestKit';

describe('goldens', () => {
  it.each(Object.keys(CASES))('%s', (name) => {
    const { built } = pdfOf(CASES[name]());
    const { pdf } = checkGolden(built, { dir: GOLDEN_DIR, name, update: UPDATE });
    pdf.close?.();
  });
});

describe('RL1: every input the screening read is on the page, with unit and source', () => {
  it.each(Object.keys(CASES))('completeness guard, %s', (name) => {
    const inputs = CASES[name]();
    const { model } = reportOf(inputs);
    expect(missingInputRows(engineInputOf(inputs.form), model.inputs.rows)).toEqual([]);
    for (const r of model.inputs.rows) expect(r.source).toBeTruthy();
  });
  it('NEGATIVE CONTROL: an input without its row is named', () => {
    const inputs = fieldCase();
    const rows = reportOf(inputs).model.inputs.rows.filter((r) => r.key !== 'depthFt');
    expect(missingInputRows(engineInputOf(inputs.form), rows)).toEqual(['depthFt']);
  });
  it('sample values print as assumptions; stated sources as stated; intakes with project and method', () => {
    const s = Object.fromEntries(reportOf(sampleCase()).model.inputs.rows.map((r) => [r.key, r]));
    expect(s.gravityApi.source).toMatch(/^Assumed: the built-in sample value/);
    const f = Object.fromEntries(reportOf(fieldCase()).model.inputs.rows.map((r) => [r.key, r]));
    expect(f.gravityApi.source).toMatch(/^Measured \(lab\)\. PVT report 2024-11/);
    expect(f.viscosityCp.source).toBe('Entered, source not stated');
    expect(f.ooipStb.source).toBe('Not provided');
    const t = Object.fromEntries(reportOf(intakeCase()).model.inputs.rows.map((r) => [r.key, r]));
    expect(t.viscosityCp.source).toMatch(/at 3400 psia, the stated reservoir pressure \(undersaturated\).*Good Oil Well No. 4 PVT/);
    expect(t.gravityApi.source).toMatch(/Input of the fluid model, Fluid Systems Studio, project "Good Oil Well No. 4 PVT"/);
    expect(t.permeabilityMd.source).toMatch(/^Horner straight line, window 2 to 20 hr of shut-in time dt.*Well Test Analysis Studio, project "EK-3 buildup", well EK-3/);
    expect(t.ooipStb.source).toMatch(/Havlena-Odeh regression, slope, r2 0.987, Material Balance Studio, case "Ekene E-2000"/);
    expect(t.reservoirPressurePsia.source).toMatch(/Last average pressure of the case/);
  });
  it('RL8: a value edited after the intake says so, in the inputs and the flags', () => {
    const inputs = intakeCase();
    inputs.form.permeabilityMd = '120';
    const { model } = reportOf(inputs);
    expect(model.inputs.rows.find((r) => r.key === 'permeabilityMd').source).toMatch(/^Edited in this app after the intake \(received 182.4\)/);
    expect(model.limits.flags.join(' ')).toMatch(/Average permeability was edited after it was taken from Well Test Analysis Studio/);
  });
});

describe('RL3 and RL12: the report is the screen, criterion by criterion', () => {
  it('ranking rows and per-method verdicts come from the engine result, in its order', () => {
    const inputs = fieldCase();
    const ranked = screenAllMethods(engineInputOf(inputs.form));
    const { model } = reportOf(inputs);
    expect(model.ranking.rows.map((r) => r[1])).toEqual(ranked.map((r) => r.name));
    model.methods.forEach((m, i) => {
      expect(m.rows.map((r) => r[5])).toEqual(ranked[i].verdicts.map((v) => ({ na: 'not screened' }[v.status] || v.status)));
      for (const r of m.rows) expect(r[8]).toMatch(/Part [12]|n\/a/);
    });
  });
  it('the counts close: pass + marginal + fail = screened criteria', () => {
    for (const name of Object.keys(CASES)) {
      const ranked = screenAllMethods(engineInputOf(CASES[name]().form));
      for (const r of ranked) expect(r.passes + r.marginals + r.fails).toBe(r.applicable);
    }
  });
});

describe('the PDF read back', () => {
  it('field case: identification, edition, ranking, reasons, limits, figures with ink and marks', () => {
    const { args, built } = pdfOf(fieldCase());
    const pdf = readPdf(built.doc, { ink: true });
    const t = flat(pdf.text);
    expect(pdf.pages).toBe(built.pages);
    for (const s of ['Lordsway Energy', 'Ekene', 'OML 999', 'E-2000 sand', 'EK-3, EK-7', 'A. Analyst', 'test-build', 'TVDSS']) expect(t).toContain(s);
    expect(t).toMatch(/SPE Reservoir Engineering 12 \(3\), August 1997, 189-198 \(SPE-35385-PA\)/);
    expect(t).toMatch(/SPE-39234-PA/);
    expect(t).toMatch(/Ranking of the methods/);
    expect(t).toMatch(/CO2 miscible: qualified/);
    expect(t).toMatch(/Methods are ranked by outcome/);
    expect(t).toMatch(/> 2,800 ft \(for 32/);
    expect(t).toMatch(/Part 2, Table 3 \(p\. 200\)/);
    expect(t).toMatch(/Limits of this analysis/);
    expect(t).toMatch(/Screening shortlists candidate methods; it does not design/);
    expect(listCaptions(pdf).map((c) => c.title)).toEqual(['Share of screened criteria that pass, by method', 'Oil gravity and depth against the CO2 miscible minimum depth']);
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    const counts = pointCounts(built.figures);
    expect(counts.ranking[0]['Share passing']).toBe(8);
    expect(counts['co2-depth'][0]['This reservoir']).toBe(1);
    expect(args.model.figures).toHaveLength(2);
    expect(t).not.toMatch(/—/);
    pdf.close?.();
  });
  it('SI: depths in m, viscosity in mPa.s, temperature in degC; the criteria compared in oilfield', () => {
    const { built } = pdfOf(fieldCase({ system: 'si' }));
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    expect(t).toMatch(/Depth 2,194.56 m/); // 7,200 ft
    expect(t).toMatch(/> 853.4 m \(for 32/); // 2,800 ft
    expect(t).toMatch(/Reservoir temperature 87.7778 degC/); // 190 F
    expect(t).toMatch(/1.1 mPa.s/);
    expect(t).toMatch(/Criteria are compared in oilfield units, as published/);
    pdf.close?.();
  });
  it('blank: the figures say why they do not apply; nothing is screened', () => {
    const { built } = pdfOf(blankCase());
    const pdf = readPdf(built.doc);
    const t = flat(pdf.text);
    for (const f of built.figures) expectFigureStatement(pdf, f, 'Does not apply');
    expect(t).toMatch(/Not screened/);
    pdf.close?.();
  });
});
