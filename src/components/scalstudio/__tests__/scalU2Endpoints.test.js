/**
 * SCAL-U2-003 in the app: a sample whose lab kr table stops short of an end
 * point is fitted with the Swc and Sor stated for the sample (engine
 * fitCoreyToKrTable with fixedEndpoints). Before, the fit refused the table
 * and the sample had no fit (SCAL-U1-020). The record of the fit says which
 * end points were entered and which kr end point was fitted, on the card,
 * in the kr-1 block and in the report.
 */
import { buildCoreyOilWater, buildCoreyGasOil, fitCoreyToKrTable } from '@/utils/scalCalculations';
import { deriveScalState } from '@/utils/scalstudio/workspace';
import { appliedOwFromFit, fittedOrigin, fitEndpointsText } from '@/utils/scalstudio/model';
import { openingInputs, stateOf, reportOf } from './scalTestKit';

const TRUE_OW = { Swc: 0.2, Sor: 0.25, krwMax: 0.35, kroMax: 0.9, nw: 2.5, no: 2.0 };
const shortTable = () => buildCoreyOilWater(TRUE_OW, { n: 40 }).rows
  .filter((r) => r.Sw <= 0.62 + 1e-12).map((r) => ({ Sw: r.Sw, krw: r.krw, kro: r.kro }));

const inputsWith = (patch = {}) => {
  const inputs = openingInputs();
  inputs.samples = [{ id: 'p1', name: 'Plug 12 (USS)', k_md: '120', phi: '0.21', sigma_dyncm: '30', thetaDeg: '30', krRows: shortTable(), pcRows: [], ...patch }];
  return inputs;
};

describe('a lab table short of residual oil', () => {
  it('without stated end points the sample has no fit and says why (the U1 state)', () => {
    const x = deriveScalState(inputsWith()).samplesDerived[0];
    expect(x.krFit).toBeNull();
    expect(x.krFitError).toMatch(/kro at the highest Sw should be 0/);
  });

  it('with Swc and Sor stated for the sample, the pipeline fits it with the engine and recovers the set', () => {
    const x = deriveScalState(inputsWith({ fitSwc: '0.2', fitSor: '0.25' })).samplesDerived[0];
    const direct = fitCoreyToKrTable(shortTable(), { fixedEndpoints: { Swc: 0.2, Sor: 0.25 } });
    expect(x.krFit.params).toEqual(direct.params);
    expect(x.krFit.endpointSource).toEqual({ Swc: 'entered', Sor: 'entered', krwMax: 'fitted', kroMax: 'table' });
    for (const k of ['nw', 'no', 'krwMax']) expect(x.krFit.params[k]).toBeCloseTo(TRUE_OW[k], 4);
  });

  it('NEGATIVE CONTROL: only one end point stated is not used (both are needed), and the table is still refused', () => {
    const x = deriveScalState(inputsWith({ fitSwc: '0.2', fitSor: '' })).samplesDerived[0];
    expect(x.krFit).toBeNull();
  });

  it('a stated end point that the table crosses is refused with the reason', () => {
    const x = deriveScalState(inputsWith({ fitSwc: '0.25', fitSor: '0.25' })).samplesDerived[0];
    expect(x.krFit).toBeNull();
    expect(x.krFitError).toMatch(/below the stated Swc 0\.25/);
  });

  it('applied, the block and the report say the end points were entered and krw(Sor) fitted', () => {
    const inputs = inputsWith({ fitSwc: '0.2', fitSor: '0.25' });
    const x = deriveScalState(inputs).samplesDerived[0];
    const applied = appliedOwFromFit(x.krFit.params);
    inputs.curves = { ...inputs.curves, ow: applied, owOrigin: fittedOrigin({ sample: x, fit: x.krFit, applied, at: '2026-10-03T09:00:00Z' }) };
    const c = stateOf(inputs).contract;
    expect(c.oil_water.origin.fit.endpoints).toBe('Swc and Sor entered for the fit; krw at Sor fitted; kro at Swc from the table');
    expect(c.oil_water.origin.fit.endpointSource).toEqual({ Swc: 'entered', Sor: 'entered', krwMax: 'fitted', kroMax: 'table' });
    const { model } = reportOf(inputs);
    const row = model.samples.fits.rows[0];
    expect(row[2]).toBe('0.200 / 0.250 (entered)');
    expect(row[3]).toMatch(/^0\.3500 \(fitted\) \/ 0\.9000$/);
  });

  it('a full table keeps the U1 words (no end point stated, nothing fitted but the exponents)', () => {
    const full = buildCoreyOilWater(TRUE_OW, { n: 12 }).rows;
    const fit = fitCoreyToKrTable(full);
    expect(fitEndpointsText(fit)).toBe('Swc and Sor from the first and last Sw of the lab table; krw at Sor and kro at Swc from the end rows of the table');
  });
});

describe('the gas-oil table with stated Sgc and Sorg', () => {
  it('a gas-oil table short of residual oil is fitted with the stated end points', () => {
    const go = { Swc: 0.2, Sgc: 0.05, Sorg: 0.15, krgMax: 0.6, krogMax: 0.85, ng: 2.0, nog: 2.5 };
    const rows = buildCoreyGasOil(go, { n: 40 }).rows.filter((r) => r.Sg <= 0.45).map((r) => ({ Sg: r.Sg, krg: r.krg, krog: r.krog }));
    const inputs = inputsWith({ krRows: [], goRows: rows });
    expect(deriveScalState(inputs).samplesDerived[0].goFit).toBeNull();
    inputs.samples[0] = { ...inputs.samples[0], goSgc: '0.05', goSorg: '0.15' };
    const x = deriveScalState(inputs).samplesDerived[0];
    expect(x.goFit.endpointSource).toMatchObject({ Sgc: 'entered', Sorg: 'entered', krgMax: 'fitted' });
    for (const k of ['krgMax', 'ng', 'nog']) expect(x.goFit.params[k]).toBeCloseTo(go[k], 4);
  });
});
