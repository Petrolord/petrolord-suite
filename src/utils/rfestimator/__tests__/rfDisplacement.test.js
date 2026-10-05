/**
 * RF-U2-009: displacement x sweep. ED comes from the kr-1 oil-water set of a
 * SCAL project through the canonical fractional-flow engine (welgeTangent,
 * recoveryProfile, packages/engines/engines/scal/fractionalFlow.js); the
 * sweep is a stated input. Every gate runs deriveRf, the function the page
 * calls, against closed forms:
 *  - linear Corey curves at unit mobility give a piston displacement:
 *    breakthrough at 1 - Swc - Sor PV with ED = (1 - Swc - Sor)/(1 - Swc);
 *  - before breakthrough every injected pore volume displaces oil:
 *    ED = Qi/(1 - Swc);
 *  - the end point is (1 - Swc - Sor)/(1 - Swc);
 *  - RF = ED x Ev.
 * Negative control: swapping the oil and water viscosities moves ED at
 * breakthrough (the gate sees the mobility ratio).
 */
import { deriveRf } from '../workspace';
import { sampleInputs } from '../model';
import { rfKrIntake, krChangedSince } from '../krIntake';
import { identifiedFitted, stateOf as scalStateOf } from '@/components/scalstudio/__tests__/scalTestKit';
import { reviewerPayload, reportOf, pdfOf } from './rfTestKit';
import { readPdf, flat, listCaptions, expectFigureDrawn } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit/completeness';

const scal = scalStateOf(identifiedFitted()).contract;
const intake = rfKrIntake(scal, { projectId: 'scal-project-1', now: '2026-10-04T10:00:00Z' }).intake;
const kase = (corr = {}, kr = intake) => {
  const inputs = { ...sampleInputs(), origin: 'entered', method: 'displacement_sweep', driveCode: 'water_drive', corr: { ...sampleInputs().corr, muoi: '0.9', muwi: '0.5', sweep: '0.6', qiPv: '', ...corr } };
  return deriveRf(inputs, { krIntake: kr ? { ...kr } : null });
};
const linear = { ...intake, params: { Swc: 0.2, Sor: 0.25, krwMax: 1, kroMax: 1, nw: 1, no: 1 } };

describe('displacement x sweep from kr-1 (RF-U2-009)', () => {
  test('the kr-1 set is taken with its source', () => {
    expect(intake.params.Swc).toBe(Number(scal.oil_water.params.Swc));
    expect(intake.source).toMatch(/SCAL Studio project "Ekene E-2000 SCAL"/);
    expect(krChangedSince(intake, scal)).toBeNull();
    expect(krChangedSince(intake, { ...scal, oil_water: { ...scal.oil_water, params: { ...scal.oil_water.params, Sor: 0.31 } } })).toMatch(/Sor/);
  });

  test('linear curves at unit mobility: a piston displacement (closed form)', () => {
    const d = kase({ muoi: '1', muwi: '1' }, linear).result.detail;
    expect(d.qiBt).toBeCloseTo(1 - 0.2 - 0.25, 2);
    expect(d.edBt).toBeCloseTo((1 - 0.2 - 0.25) / 0.8, 2);
    expect(d.edMax).toBe((1 - 0.2 - 0.25) / 0.8);
  });

  test('before breakthrough ED = Qi/(1 - Swc); at the end point EDmax; RF = ED x Ev', () => {
    const end = kase();
    const d = end.result.detail;
    expect(d.at).toBe('end point');
    expect(d.ed).toBe((1 - intake.params.Swc - intake.params.Sor) / (1 - intake.params.Swc));
    expect(end.result.rf).toBeCloseTo(d.ed * 0.6, 14);
    const early = kase({ qiPv: String(d.qiBt / 2) }).result.detail;
    expect(early.at).toBe('before breakthrough');
    expect(early.ed).toBeCloseTo((d.qiBt / 2) / (1 - intake.params.Swc), 12);
    const later = kase({ qiPv: String(d.qiBt * 2) }).result.detail;
    expect(later.ed).toBeGreaterThan(d.edBt);
    expect(later.ed).toBeLessThan(d.edMax);
  });

  test('negative control: oil and water viscosities swapped move ED at breakthrough', () => {
    expect(kase({ muoi: '0.5', muwi: '0.9' }).result.detail.edBt).not.toBeCloseTo(kase().result.detail.edBt, 3);
  });

  test('without a kr-1 set the method says so and gives no value; Swc against the case Sw is flagged', () => {
    const none = kase({}, null);
    expect(none.result.rf).toBeNull();
    expect(none.result.warnings.join(' ')).toMatch(/No kr-1 set is taken/);
    const off = deriveRf({ ...sampleInputs(), method: 'displacement_sweep', corr: { ...sampleInputs().corr, sweep: '0.6' }, vol: { ...sampleInputs().vol, sw: '0.40' } }, { krIntake: intake });
    expect(off.flags.map((f) => f.text).join(' ')).toMatch(/starts the flood at Swc/);
  });

  test('the report: kr rows with their source, the method by its parts, the ED figure, completeness', () => {
    const p = reviewerPayload();
    p.inputs = { ...p.inputs, method: 'displacement_sweep', corr: { ...p.inputs.corr, sweep: '0.6', qiPv: '1.5' } };
    p.krIntake = intake;
    const r = reportOf(p);
    const rows = Object.fromEntries(r.model.inputs.rows.map((x) => [x.key, x]));
    expect(rows['kr.Sor'].source).toMatch(/Corey fitted to sample/);
    expect(missingInputRows(r.model.engineInput, r.model.inputs.rows)).toEqual([]);
    expect(missingInputRows(r.model.engineInput, r.model.inputs.rows.filter((x) => x.key !== 'kr.nw'))).toEqual(['kr.nw']);
    const ms = r.model.methodSplit.rows;
    expect(ms[ms.length - 1][0]).toBe('Recovery factor ED x Ev');
    const built = pdfOf(r);
    const pdf = readPdf(built.doc, { ink: true });
    expect(listCaptions(pdf).map((c) => c.title)).toContain('Displacement efficiency against pore volumes injected');
    for (const f of built.figures.filter((x) => x.plotted)) expectFigureDrawn(pdf, f, { logo: true });
    expect(flat(pdf.text)).toMatch(/Buckley and Leverett \(1942\) and Welge \(1952\)/);
    if (pdf.close) pdf.close();
  });
});
