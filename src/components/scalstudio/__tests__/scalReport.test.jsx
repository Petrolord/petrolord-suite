/**
 * The SCAL Studio report, read back from the PDF (SCAL-U1; reviewer lens
 * RL1 to RL12). Built from the pipeline the page runs, through the function
 * the Export button calls, and read with poppler through the Report Kit's
 * test kit.
 */
import { readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit/completeness';
import { KPA_PER_PSI, M_PER_FT } from '@/lib/units/registry';
import { buildScalPdf } from '@/utils/scalstudio/scalReportExport';
import { SCHEMA_1_MANUAL, SCHEMA_1_SAMPLES } from '@/components/scalstudio/__fixtures__/savedProjects';
import {
  AT, GOLDEN_DIR, UPDATE, logo, openingInputs, identifiedFitted, reportOf, pdfOf, inputsFromPayload,
} from './scalTestKit';

jest.setTimeout(120000);

const CASES = {
  'opening-bare': () => openingInputs(),
  'identified-fitted': () => identifiedFitted(),
  'identified-fitted-si': () => identifiedFitted({ system: 'si' }),
  'schema1-manual': () => inputsFromPayload(SCHEMA_1_MANUAL),
};

describe('goldens: the report as it prints', () => {
  for (const [name, make] of Object.entries(CASES)) {
    it(`${name} matches its golden`, () => {
      const rep = reportOf(make(), { projectName: name === 'schema1-manual' ? SCHEMA_1_MANUAL.name : 'Ekene E-2000 SCAL' });
      const built = pdfOf(rep);
      checkGolden(built, { dir: GOLDEN_DIR, name, update: UPDATE });
    });
  }
});

describe('RL1 every input on the page with unit and source', () => {
  it('the completeness guard finds no engine input without a row, and fails when a row is removed', () => {
    for (const make of Object.values(CASES)) {
      const { model } = reportOf(make());
      expect(missingInputRows(model.engineInput, model.inputs.rows)).toEqual([]);
      const cut = model.inputs.rows.filter((r) => r.key !== 'reservoir.k_md');
      expect(missingInputRows(model.engineInput, cut)).toEqual(['reservoir.k_md']); // negative control
    }
  });

  it('each row has a value and a source; starting values print as assumptions; a blank FWL is n/a, not provided', () => {
    const { model } = reportOf(openingInputs());
    for (const r of model.inputs.rows) {
      expect(r.value).not.toBe('');
      expect(r.source.length).toBeGreaterThan(5);
    }
    const k = model.inputs.rows.find((r) => r.key === 'reservoir.k_md');
    expect(k.source).toMatch(/^Assumed: the starting value of the app/);
    const fwl = model.inputs.rows.find((r) => r.key === 'height.fwl_tvdss');
    expect(fwl.value).toBe('n/a');
    expect(fwl.source).toBe('Not provided');
  });

  it('a fitted set names its sample and fit; stated sources print with their notes', () => {
    const rep = reportOf(identifiedFitted());
    const pdf = readPdf(pdfOf(rep).doc);
    const text = flat(pdf.text);
    expect(text).toMatch(/Oil-water: Water Corey exponent nw 2\.\d+ Fitted to the lab table of sample "Demo core A \(synthetic\)", r2 0\.99\d in log space/);
    expect(text).toMatch(/Reservoir porosity 0\.22 fraction Measured \(lab\)\. Core porosity, E-2000 average/);
    expect(text).toMatch(/Leverett J: Swirr \(shared by all samples\) 0\.12 fraction Entered as the shared Swirr override/);
    pdf.close?.();
  });
});

describe('RL2 the Leverett scaling closes on its components', () => {
  it('Pc at Sw 0.5 = J x Pc per unit J, and height = Pc / gradient, to the printed digits', () => {
    const { model } = reportOf(identifiedFitted());
    const row = (label) => Number(model.scaling.rows.find((r) => r[0] === label)[2]);
    const j = row('J at Sw = 0.5 (working curve)');
    const per = row('Pc per unit J');
    const pc = row('Pc at Sw = 0.5');
    const grad = row('Pressure gradient difference');
    const h = row('Height above FWL at Sw = 0.5');
    expect(Math.abs(j * per - pc) / pc).toBeLessThan(5e-4);
    expect(Math.abs(pc / grad - h) / h).toBeLessThan(5e-4);
    // and the components themselves
    expect(row('sigma cos theta (reservoir)')).toBeCloseTo(26 * Math.cos(Math.PI / 6), 2);
    expect(row('sqrt(k / phi)')).toBeCloseTo(Math.sqrt(150 / 0.22), 2);
  });
});

describe('RL4 identification', () => {
  it('prints every header field on page 1, the build and the units', () => {
    const pdf = readPdf(pdfOf(reportOf(identifiedFitted())).doc);
    const p1 = flat(pdf.pageText[0]);
    for (const s of ['Company Lordsway Energy', 'Field Ekene', 'Licence or block OML 143', 'Well Ekene-7', 'Reservoir or zone E-2000 sand', 'Laboratory Core Lab Lagos', 'Lab report number SCAL-2026-0117', 'Analyst A. Analyst', 'Software build Petrolord Suite test (fixture)', 'Display units Oilfield']) {
      expect(p1).toContain(s);
    }
    expect(p1).toMatch(/Core samples Demo core A \(synthetic\), Demo core B/);
    pdf.close?.();
  });

  it('projects saved before the upgrade open and report n/a, with no throw', () => {
    for (const payload of [SCHEMA_1_MANUAL, SCHEMA_1_SAMPLES]) {
      const rep = reportOf(inputsFromPayload(payload), { projectName: payload.name });
      const pdf = readPdf(pdfOf(rep).doc);
      const p1 = flat(pdf.pageText[0]);
      expect(p1).toContain(`Project ${payload.name}`);
      expect(p1).toMatch(/Company Org from the profile/);
      expect(p1).toMatch(/Field n\/a/);
      pdf.close?.();
    }
  });
});

describe('RL6 every result has its plot', () => {
  it('lists the figures, draws the plotted ones from the screen series, and says why for the rest', () => {
    const rep = reportOf(identifiedFitted());
    const built = pdfOf(rep);
    const pdf = readPdf(built.doc, { ink: true });
    expect(listCaptions(pdf).map((c) => c.title)).toEqual([
      'Oil-water relative permeability (working curves)',
      'Lab relative permeability with the Corey fit: Demo core A (synthetic)',
      'Lab relative permeability with the Corey fit: Demo core B (synthetic)',
      'End-point normalised curves across samples',
      'Gas-oil relative permeability (working curves, at connate water)',
      'Lab gas-oil relative permeability with the Corey fit: Demo core A (synthetic)',
      'Leverett J function',
      'Reservoir capillary pressure against water saturation',
      'Water saturation against height above the free water level',
    ]);
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    const counts = pointCounts(built.figures);
    // the screen series: 102 points per working curve, 62 points of the height profile, the lab rows
    expect(counts['kr-ow'][0]['krw (working Corey)']).toBe(rep.state.owCurves.rows.length);
    expect(counts.height[0]['Sw against height']).toBe(rep.state.heightProfile.length);
    expect(counts['kr-lab-demo-0'][0]['krw lab']).toBe(rep.state.samples[0].krRows.length);
    expect(counts['kr-ow'][0]['krw lab, Demo core A (synthetic)']).toBe(rep.state.samples[0].krRows.length);
    // SCAL-U2-004: the gas-oil lab table of core A with its fit
    expect(counts['kr-go-lab-demo-0'][0]['krg lab']).toBe(rep.state.samples[0].goRows.length);
    expect(flat(pdf.text)).toMatch(/FWL, 8600 ft TVDSS/);
    pdf.close?.();
  });

  it('the opening workspace lists the lab figures with the reason they do not apply', () => {
    const built = pdfOf(reportOf(openingInputs()));
    const pdf = readPdf(built.doc);
    const lab = built.figures.find((f) => f.id === 'kr-lab');
    expectFigureStatement(pdf, lab, /Does not apply: no core sample carries a kr table/);
    expect(flat(pdf.text)).toMatch(/End-point normalised curves across samples\s*Does not apply: no sample carries a usable kr table/);
    pdf.close?.();
  });

  it('an empty figure list is refused by the export (negative control)', () => {
    const rep = reportOf(openingInputs());
    expect(() => buildScalPdf({ ...rep, figures: [] }, { logo, generatedAt: AT })).toThrow(/figure list is empty/);
  });
});

describe('RL7 the basis is named and the units convert', () => {
  it('SI prints kPa, mN/m and m, converted from the same state', () => {
    const field = reportOf(identifiedFitted());
    const si = reportOf(identifiedFitted({ system: 'si' }));
    const v = (rep, label) => Number(rep.model.headline.rows.find((r) => r[0] === label)[1]);
    expect(v(si, 'Pc at Sw = 0.5 (reservoir)') / v(field, 'Pc at Sw = 0.5 (reservoir)')).toBeCloseTo(KPA_PER_PSI, 2);
    expect(v(si, 'Height above FWL at Sw = 0.5') / v(field, 'Height above FWL at Sw = 0.5')).toBeCloseTo(M_PER_FT, 2);
    const pdf = readPdf(pdfOf(si).doc);
    const text = flat(pdf.text);
    expect(text).toMatch(/Display units SI \(Pc kPa, IFT mN\/m, depth and height m/);
    expect(text).toMatch(/Free water level 2,621\.3 m TVDSS/);
    expect(text).toMatch(/Capillary pressure kPa; a pressure difference, neither gauge nor absolute/);
    pdf.close?.();
  });

  it('a known value: 8,600 ft TVDSS is 2,621.28 m', () => {
    const si = reportOf(identifiedFitted({ system: 'si' }));
    expect(si.model.inputs.rows.find((r) => r.key === 'height.fwl_tvdss').value).toBe('2,621.3');
  });
});

describe('RL8 claims follow the state', () => {
  it('a set edited after the fit says so, is flagged, and loses the fitted wording', () => {
    const inputs = identifiedFitted();
    inputs.curves.ow = { ...inputs.curves.ow, nw: '3.1' };
    const { model } = reportOf(inputs);
    const nw = model.inputs.rows.find((r) => r.key === 'ow.nw');
    expect(nw.source).toMatch(/then edited by the user \(nw\)/);
    expect(model.limits.flags.join(' ')).toMatch(/edited after it was fitted \(nw\)/);
    expect(model.headline.rows[0][3]).not.toMatch(/^Fitted to the lab table/);
  });

  it('keeps the fit statistics and confidence intervals of each sample', () => {
    const { model } = reportOf(identifiedFitted());
    const a = model.samples.fits.rows[0];
    expect(a[0]).toBe('Demo core A (synthetic)');
    expect(a[4]).toMatch(/^2\.\d\d \(2\.\d\d to 2\.\d\d\)$/);
    expect(a[8]).toMatch(/^Converged in \d+ iterations$/);
  });
});

describe('RL9 limits', () => {
  it('names the Corey form and the thin-real scope, and flags the analog samples', () => {
    const { model } = reportOf(identifiedFitted());
    const text = model.limits.assumptions.join(' ');
    expect(text).toMatch(/Corey power-law curves only/);
    expect(text).toMatch(/No hysteresis/);
    expect(text).toMatch(/no three-phase model/);
    expect(model.limits.flags.join(' ')).toMatch(/Sample "Demo core A \(synthetic\)" is an analog \(synthetic demo core generated by the app/);
  });

  it('flags a sample whose drainage or imbibition is not stated', () => {
    const inputs = identifiedFitted();
    inputs.samples[1] = { ...inputs.samples[1], krProcess: '' };
    expect(reportOf(inputs).model.limits.flags.join(' ')).toMatch(/Sample "Demo core B \(synthetic\)": the kr test is not stated as drainage or imbibition/);
  });
});

describe('RL11 the kr-1 block is printed', () => {
  it('prints the block other apps receive', () => {
    const pdf = readPdf(pdfOf(reportOf(identifiedFitted())).doc);
    const text = flat(pdf.text);
    expect(text).toMatch(/kr-1 block handed to other apps/);
    expect(text).toMatch(/Contract kr-1/);
    expect(text).toMatch(/Oil-water set Corey fitted to sample "Demo core A \(synthetic\)" \(analog, imbibition, unsteady-state\)/);
    pdf.close?.();
  });
});

describe('RL12 one model', () => {
  it('the headline numbers in the PDF are the model rows (the Report tab prints the same rows)', () => {
    const rep = reportOf(identifiedFitted());
    const text = flat(readPdf(pdfOf(rep).doc).text);
    for (const r of rep.model.headline.rows) expect(text).toContain(`${r[0]} ${r[1]}`.replace(/\s+/g, ' '));
  });
});
