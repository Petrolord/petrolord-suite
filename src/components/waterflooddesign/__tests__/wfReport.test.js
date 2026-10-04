// Waterflood U1: the report on the kit, read back (RL1 to RL12).
import { readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit/completeness';
import { reviewerPayload, barePayload, reportOf, pdfOf, GOLDEN_DIR, UPDATE } from './wfTestKit';
import { krSeries, recoverySeries, patternSeries } from '@/utils/waterflooddesign/series';

describe('the reviewer case', () => {
  const r = reportOf(reviewerPayload());
  const built = pdfOf(r);
  const pdf = readPdf(built.doc, { ink: true });
  const text = flat(pdf.text);
  afterAll(() => pdf.close && pdf.close());

  it('identification, display units, build', () => {
    for (const s of ['Waterflood Design Report', 'Ekene Energy', 'OML 999', 'E-2000 sand', 'Five-spot P-1', 'A. Engineer', 'Petrolord Suite test (fixture)', 'Oilfield (thickness ft']) expect(text).toContain(s);
    expect(text).toMatch(/Surveillance data 2024-01-01 to 2024-03-30/);
  });

  it('RL1: every input has a value, unit column and a source; kr-1 and pvt-1 are named', () => {
    for (const row of r.model.inputs.rows) {
      expect(row.value).toBeTruthy();
      expect(row.source).toBeTruthy();
    }
    expect(text).toMatch(/SCAL Studio kr-1/);
    expect(text).toMatch(/Ekene E-2000 SCAL/);
    expect(text).toMatch(/Good Oil Well No\. 4 PVT/);
    expect(text).toMatch(/at 2500 psia \(stated reservoir pressure\)/);
    expect(text).toMatch(/Starting value of the app/);
  });

  it('RL1 completeness: every engine input of the displacement and the pattern has a row', () => {
    const keys = r.model.inputs.rows.map((x) => x.key);
    const engine = { ...r.state.displacementSpec.spec.krSpec, muW: 1, muO: 1, ...r.state.patternResult && {} };
    const pattern = { area_acres: 1, h_ft: 1, phi: 1, Bo: 1, Bw: 1, iw_bpd: 1, Sgi: 1, EV: 1, worLimit: 1, maxYears: 1, mobilityBasis: 1 };
    const rows = keys.map((k) => ({ key: k }));
    expect(missingInputRows({ ...engine, ...pattern }, rows, { ignore: ['type'] })).toEqual([]);
    // negative control: drop a row and the guard names it
    expect(missingInputRows({ ...engine, ...pattern }, rows.filter((x) => x.key !== 'EV'), { ignore: ['type'] })).toEqual(['EV']);
  });

  it('RL3: the recovery split closes on Np over the pattern OOIP', () => {
    const sp = r.state.patternResult.summary.recoverySplit;
    expect(sp.product).toBeCloseTo(sp.ER, 12);
    expect(text).toMatch(/Recovery ER = ED x EA x EV/);
    expect(text).toMatch(/Closure: ED x EA x EV = [\d.]+ % against Np \/ OOIP = [\d.]+ %/);
    const m = /Closure: ED x EA x EV = ([\d.]+) % against Np \/ OOIP = ([\d.]+) %/.exec(text);
    expect(m[1]).toBe(m[2]);
  });

  it('RL2: the mobility ratio by its components; Craig M used', () => {
    expect(text).toMatch(/Craig M = \(krw\(Sw avg\) \/ muW\) \/ \(kro\(Swc\) \/ muO\)/);
    expect(r.state.patternResult.summary.mobilityBasis).toBe('craig');
  });

  it('RL5: the forecast year by year sums to Np; the wells of the history total the engine volumes', () => {
    const rows = r.model.forecastTable.rows;
    expect(rows.length).toBeGreaterThan(1);
    const sumOil = rows.reduce((a, x) => a + Number(x[2].replace(/,/g, '')), 0);
    expect(Math.abs(sumOil - r.state.patternResult.summary.Np_stb)).toBeLessThan(rows.length);
    const t = r.model.surveillance.totals;
    const k = r.state.surveillanceResult.kpis;
    expect(t.oil).toBeCloseTo(k.total_oil_bbl, 6);
    expect(t.inj).toBeCloseTo(k.total_injected_bbl, 6);
  });

  it('RL6: figures drawn from the screen series, the Hall windows shaded, conditional figures say why', () => {
    const caps = listCaptions(pdf).map((c) => c.title);
    expect(caps).toEqual(expect.arrayContaining(['Relative permeability', 'Fractional flow with the Welge tangent', 'Hall plot: INJ-1', 'Voidage replacement ratio']));
    const counts = pointCounts(built.figures);
    expect(counts.kr[0].krw).toBe(krSeries(r.state.displacement).krw.length);
    expect(counts.ed[0].ED).toBe(recoverySeries(r.state.displacement).length);
    expect(counts.rates[0].Oil).toBe(patternSeries(r.state.patternResult).qo.length);
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    const hall = built.figures.find((x) => x.id === 'hall-INJ-1');
    expect(hall.panels[0].bands).toBe(2);
    expectFigureStatement(pdf, built.figures.find((x) => x.id === 'mc'), 'Does not apply: no uncertainty run.');
  });

  it('RL7 and RL9: basis and limits printed; Hall basis named', () => {
    expect(text).toMatch(/reservoir barrels per stock-tank barrel \(RB\/STB\)/);
    expect(text).toMatch(/P90 is the low case/);
    expect(text).toMatch(/Limits of this analysis/);
    expect(text).toMatch(/M 0\.15 to 10/);
    expect(text).toMatch(/Wellhead pressure\. Shaded/);
  });

  it('RL12: headline numbers equal the screen values; full numbers; Latin-1 only', () => {
    const sum = r.state.patternResult.summary;
    expect(text).toContain(Math.round(sum.Np_stb).toLocaleString('en-US'));
    expect(text).not.toMatch(/e\+\d/);
    expect(pdf.text).not.toMatch(/—/);
  });

  it('golden', () => {
    checkGolden(built, { dir: GOLDEN_DIR, name: 'reviewer', update: UPDATE });
  });
});

describe('the bare case and SI', () => {
  it('a bare project prints n/a and assumptions, and statements for the figures that do not apply', () => {
    const r = reportOf(barePayload());
    const built = pdfOf(r);
    const pdf = readPdf(built.doc);
    const text = flat(pdf.text);
    expect(text).toMatch(/Company Org from the profile Field n\/a/);
    expect(text).toMatch(/Does not apply: no surveillance history was loaded/);
    expect(text).toMatch(/No SCAL Studio intake/);
    checkGolden(built, { dir: GOLDEN_DIR, name: 'bare', update: UPDATE });
  });

  it('SI: the same case in SI prints converted values and SI units', () => {
    const r = reportOf(reviewerPayload({ system: 'si' }));
    const built = pdfOf(r);
    const text = flat(readPdf(built.doc).text);
    expect(text).toMatch(/SI \(thickness m/);
    // 25 ft net thickness = 7.62 m
    expect(text).toMatch(/Net thickness 7\.62 m/);
    expect(text).toMatch(/sm3/);
  });
});
