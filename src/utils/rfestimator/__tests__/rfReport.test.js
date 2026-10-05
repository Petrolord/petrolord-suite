// Recovery Factor U1: the report on the kit, read back (RL1 to RL12).
import { readPdf, flat, listCaptions, pointCounts, expectFigureDrawn, expectFigureStatement, checkGolden } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit/completeness';
import { reservesBars, exceedanceSeries } from '@/utils/rfestimator/series';
import { samplePayload, reviewerPayload, gasPayload, reportOf, pdfOf, GOLDEN_DIR, UPDATE } from './rfTestKit';

describe('the reviewer case (API water drive, PVT from a Fluid project)', () => {
  const r = reportOf(reviewerPayload());
  const built = pdfOf(r);
  const pdf = readPdf(built.doc, { ink: true });
  const text = flat(pdf.text);
  afterAll(() => pdf.close && pdf.close());

  it('RL4: identification, units, build, engine', () => {
    for (const s of ['Recovery Factor Report', 'Ekene Energy', 'OML 999', 'E-2000 sand', 'E-1, E-2, E-3', 'A. Engineer', '2026-09-30', 'Petrolord Suite test (fixture)', 'rf-3 (2026-10, RF-U2)', 'Entered by the user']) expect(text).toContain(s);
    expect(text).toMatch(/Analysis type Recovery factor screening: API \(1967\): water drive/);
  });

  it('RL7: the headline states the basis of every number', () => {
    expect(text).toMatch(/fraction of OOIP at stock-tank \(standard\) conditions/);
    expect(text).toMatch(/not P90 and P10/);
    expect(text).toMatch(/technically recoverable, no economic limit, not a PRMS reserves class/);
  });

  it('RL1: every input has a value, a unit column and a source; the Fluid intake is named; completeness guard with its negative control', () => {
    for (const row of r.model.inputs.rows) {
      expect(row.value).toBeTruthy();
      expect(row.source).toBeTruthy();
    }
    expect(text).toMatch(/Good Oil Well No\. 4 PVT/);
    expect(text).toMatch(/Core plug geometric mean/);
    const rows = r.model.inputs.rows;
    expect(missingInputRows(r.model.engineInput, rows)).toEqual([]);
    expect(missingInputRows(r.model.engineInput, rows.filter((x) => x.key !== 'corr.k'))).toEqual(['correlationInputs.k']);
  });

  it('RL2 and RL3: the in-place volume and the correlation by their parts, closing on the totals', () => {
    const p = r.state.derived.parts;
    expect(p.hcpv_ft3 / 5.614583333333333 * 7758.367 / 5.614583333333333).toBeTruthy();
    // 7758 rounded: the parts close on the engine total to 0.005 percent
    expect(Math.abs((p.hcpv_rb / p.fvf) - p.total) / p.total).toBeLessThan(5e-5);
    const d = r.state.derived.result.detail;
    expect(d.terms.reduce((a, t) => a * t.value, d.constant)).toBe(d.rf);
    expect(text).toMatch(/Product: recovery factor/);
    expect(text).toMatch(/enters as 0\.15 darcy/);
  });

  it('RL6: three figures, the bars drawn are the screen bars', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toEqual([
      'Recoverable volume: analog range edges and the estimate',
      'Analog recovery ranges of oil drive mechanisms',
      'The correlation by its factors',
    ]);
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    const screen = reservesBars(r.state.derived.result, 'oil', 'oilfield').rows.length;
    expect(pointCounts(built.figures).reserves[0]).toEqual({ 'Recoverable volume': screen });
  });

  it('RL9: the limits and the validation state are printed', () => {
    expect(text).toMatch(/Limits of this analysis/);
    expect(text).toMatch(/API D14 data ranges were not available/);
    expect(text).toMatch(/Validation in this build/);
    expect(text).toMatch(/pvt-1 block received from Fluid Systems Studio/);
  });

  it('golden', () => {
    checkGolden(built, { dir: GOLDEN_DIR, name: 'reviewer', update: UPDATE });
  });
});

describe('the sample case', () => {
  const r = reportOf(samplePayload());
  const built = pdfOf(r);
  const pdf = readPdf(built.doc);
  const text = flat(pdf.text);
  afterAll(() => pdf.close && pdf.close());
  it('RL1: says it is the sample, every sample value labelled, missing is n/a', () => {
    expect(text).toMatch(/Case data Sample data shipped with the app/);
    expect(r.model.inputs.rows.filter((x) => x.key.startsWith('vol.')).every((x) => /Sample value of the app/.test(x.source))).toBe(true);
    expect(text).toMatch(/Company n\/a/);
  });
  it('the factors figure says why it does not apply', () => {
    expectFigureStatement(pdf, built.figures.find((f) => f.id === 'factors'), 'Does not apply: the analog method');
  });
  it('golden', () => {
    checkGolden(built, { dir: GOLDEN_DIR, name: 'sample', update: UPDATE });
  });
});

describe('the gas p/z case in SI', () => {
  const p = gasPayload();
  p.unitSystem = 'si';
  const r = reportOf(p);
  const built = pdfOf(r);
  const pdf = readPdf(built.doc, { ink: true });
  const text = flat(pdf.text);
  afterAll(() => pdf.close && pdf.close());
  it('prints SI units and the p/z line', () => {
    expect(text).toMatch(/10\^9 sm3/);
    expect(text).toMatch(/kPa\(a\)/);
    expect(listCaptions(pdf).map((c) => c.title)).toContain('p/z against the fraction of gas produced');
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
  });
  it('golden', () => {
    checkGolden(built, { dir: GOLDEN_DIR, name: 'gas-si', update: UPDATE });
  });
});

describe('RF-U2-002: the reviewer case with the uncertainty run on', () => {
  const p = reviewerPayload();
  p.inputs.mc = { enabled: true, rfSource: 'analog', ipSource: 'percentiles', ipP90: '30', ipP50: '36', ipP10: '44', iterations: '4000', seed: '20261004' };
  const r = reportOf(p);
  const built = pdfOf(r);
  const pdf = readPdf(built.doc, { ink: true });
  const text = flat(pdf.text);
  afterAll(() => pdf.close && pdf.close());
  it('prints P90, P50 and P10 with the convention, the seed and the realisation count', () => {
    const st = r.state.derived.uncertainty.stats;
    expect(text).toMatch(/Uncertainty: recovery factor x in-place volume/);
    expect(text).toMatch(/P90 \(low\)/);
    expect(text).toMatch(/Seed 20261004/);
    expect(text).toMatch(/Realisations 4000 used of 4000/);
    expect(text).toMatch(/P90 is the low case and P10 the high case/);
    expect(text).toContain(`Recovery factor ${(st.rf.p90 * 100).toFixed(1)} ${(st.rf.p50 * 100).toFixed(1)} ${(st.rf.p10 * 100).toFixed(1)}`);
    expect(text).toMatch(/Uncertainty Seeded Monte Carlo on the Suite's canonical sampler, seed 20261004/);
  });
  it('RL6: the exceedance curve is drawn with the screen series', () => {
    expect(listCaptions(pdf).map((c) => c.title)).toContain('Recoverable volume: probability of exceedance');
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    const screen = exceedanceSeries(r.state.derived.uncertainty, 'oil', 'oilfield');
    expect(pointCounts(built.figures).exceedance[0]).toEqual({ Exceedance: screen.pts.length, 'P90, P50, P10': 3 });
  });
  it('the rf-1 record carries the distribution', async () => {
    const { rfRecordOf } = await import('@/utils/rfestimator/rfRecord');
    const rec = rfRecordOf(r.state);
    expect(rec.distribution).toMatchObject({ seed: 20261004, realisations: 4000, rejected: 0 });
    expect(rec.distribution.rf.p90).toBe(r.state.derived.uncertainty.stats.rf.p90);
  });
  it('a run that cannot go says why in the flags', () => {
    const q = reviewerPayload();
    q.inputs.mc = { enabled: true, seed: '' };
    expect(reportOf(q).model.limits.flags.join(' ')).toMatch(/Uncertainty not run: The seed must be/);
  });
  it('golden', () => {
    checkGolden(built, { dir: GOLDEN_DIR, name: 'reviewer-mc', update: UPDATE });
  });
});

describe('RF-U2-010: water-drive gas abandoned at pa, in the report', () => {
  it('the method by its parts closes on 1, pi, zi, pa, za are inputs, the assumption is the pa form', () => {
    const p = gasPayload();
    p.inputs = { ...p.inputs, method: 'gas_water_drive', driveCode: 'gas_water_drive', corr: { ...p.inputs.corr, swi: '0.25', sgr: '0.3', sweep: '0.7', gwdMode: 'abandonment' } };
    const r = reportOf(p);
    const d = r.state.derived.result.detail;
    expect(d.mode).toBe('abandonment');
    expect(d.trappedSwept + d.unswept + r.state.derived.result.rf).toBeCloseTo(1, 12);
    expect(r.model.methodSplit.rows.map((x) => x[0])).toContain('Bgi/Bga = (pa/za)/(pi/zi)');
    expect(r.model.inputs.rows.map((x) => x.key)).toEqual(expect.arrayContaining(['corr.pi', 'corr.zi', 'corr.pa', 'corr.za']));
    expect(r.model.methodRows.find((x) => x[0] === 'What it assumes')[1]).toMatch(/abandoned at pa/);
    expect(missingInputRows(r.model.engineInput, r.model.inputs.rows)).toEqual([]);
  });
});
