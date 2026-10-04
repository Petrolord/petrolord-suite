/**
 * SCAL-U2-004: a Corey fit to a gas-oil lab table, in the app. The door
 * reads the table (Sg, krg, krog), the pipeline fits it with the engine's
 * fitCoreyGasOilToKrTable at the Swc of the test (stated per sample, else
 * the working gas-oil Swc), the fit can be applied to the Curves tab, and
 * the kr-1 block, the report and the screen then say the gas-oil set was
 * fitted, to which sample.
 */
import { readGoKrTable } from '@/utils/scalstudio/labImport';
import { buildCoreyGasOil, fitCoreyGasOilToKrTable } from '@/utils/scalCalculations';
import { deriveScalState } from '@/utils/scalstudio/workspace';
import { appliedGoFromFit, fittedOrigin, curveOriginStatus, GO_KEYS } from '@/utils/scalstudio/model';
import { krContractSourceText, validateKrContract } from '@/lib/inputProvenance/krContract';
import { buildDemoSamples } from '@/components/scalstudio/demoSamples';
import { openingInputs, stateOf, reportOf, identifiedFitted } from './scalTestKit';

const TRUE_GO = { Swc: 0.2, Sgc: 0.05, Sorg: 0.15, krgMax: 0.6, krogMax: 0.85, ng: 2.0, nog: 2.5 };
const engineRows = (p = TRUE_GO, n = 10) => buildCoreyGasOil(p, { n }).rows.map((r) => ({ Sg: r.Sg, krg: r.krg, krog: r.krog }));

describe('the gas-oil door', () => {
  it('reads Sg in percent, krg and krog by name in any order, and says how', () => {
    const text = 'krog;Sg (%);krg\n0,85;5;0\n0,4;30;0,1\n0;65;0,6\n';
    const res = readGoKrTable(text);
    expect(res.ok).toBe(true);
    expect(res.rows).toEqual([{ Sg: 0.05, krg: 0, krog: 0.85 }, { Sg: 0.3, krg: 0.1, krog: 0.4 }, { Sg: 0.65, krg: 0.6, krog: 0 }]);
    expect(res.summary).toMatch(/Sg read as a percent \(from the header\)/);
    expect(res.columns).toMatchObject({ Sg: 'Sg (%)', krg: 'krg', krog: 'krog' });
  });

  it('negative control: an oil-water table is not taken as gas-oil', () => {
    const res = readGoKrTable('Sw,krw,kro\n0.2,0,0.9\n0.5,0.1,0.3\n0.75,0.35,0\n');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no column for Sg, krg, krog/);
  });
});

describe('the fit in the pipeline', () => {
  const withGo = (goSwc = '') => {
    const inputs = openingInputs();
    inputs.samples = [{ id: 's1', name: 'Plug 7', k_md: '100', phi: '0.2', sigma_dyncm: '72', thetaDeg: '0', krRows: [], pcRows: [], goRows: engineRows(), goSwc }];
    return inputs;
  };

  it('fits each sample with the engine, at the working gas-oil Swc when the sample states none', () => {
    const s = deriveScalState(withGo());
    const fit = s.samplesDerived[0].goFit;
    const direct = fitCoreyGasOilToKrTable(engineRows(), { Swc: 0.2 });
    expect(fit.params).toEqual(direct.params);
    expect(fit.swcFrom).toBe('the working gas-oil set');
    for (const k of ['Sgc', 'Sorg', 'krgMax', 'krogMax']) expect(fit.params[k]).toBeCloseTo(TRUE_GO[k], 10);
    expect(fit.params.ng).toBeCloseTo(2.0, 5);
    expect(fit.params.nog).toBeCloseTo(2.5, 5);
  });

  it('a stated Swc of the test is used, and only Sorg moves with it', () => {
    const s = deriveScalState(withGo('0.1'));
    const fit = s.samplesDerived[0].goFit;
    expect(fit.swcFrom).toBe('stated for the sample');
    expect(fit.params.Swc).toBe(0.1);
    expect(fit.params.Sorg).toBeCloseTo(0.25, 10);
  });

  it('a table the engine refuses carries the reason', () => {
    const inputs = withGo();
    inputs.samples[0].goRows = engineRows().map((r) => ({ Sg: r.Sg, krg: r.krog, krog: r.krg }));
    const x = deriveScalState(inputs).samplesDerived[0];
    expect(x.goFit).toBeNull();
    expect(x.goFitError).toMatch(/krg must be non-decreasing in Sg/);
  });
});

describe('applied to the Curves tab: the block, the report and the status say so', () => {
  const applied = () => {
    const inputs = openingInputs();
    inputs.samples = buildDemoSamples().map((s, i) => ({ ...s, id: `demo-${i}` }));
    const a = deriveScalState(inputs).samplesDerived[0];
    expect(a.goFit).toBeTruthy();
    const values = appliedGoFromFit(a.goFit.params);
    inputs.curves = { ...inputs.curves, go: values, goOrigin: fittedOrigin({ sample: a, fit: a.goFit, applied: values, set: 'gas_oil', at: '2026-10-03T09:00:00Z' }) };
    return { inputs, a };
  };

  it('the demo core A carries a gas-oil table and its fit is close to its generating set', () => {
    const { a } = applied();
    expect(a.goRows.length).toBeGreaterThanOrEqual(10);
    expect(Math.abs(a.goFit.params.ng - 1.8)).toBeLessThan(0.3);
    expect(Math.abs(a.goFit.params.nog - 2.6)).toBeLessThan(0.3);
  });

  it('the kr-1 gas-oil set is "fitted" to the sample, and an edit is said', () => {
    const { inputs } = applied();
    const c = stateOf(inputs).contract;
    expect(validateKrContract(c).ok).toBe(true);
    expect(c.gas_oil.origin).toMatchObject({ kind: 'fitted', sample_id: 'demo-0', sample_name: 'Demo core A (synthetic)' });
    expect(krContractSourceText(c, 'gas_oil')).toMatch(/^Corey fitted to sample "Demo core A \(synthetic\)"/);
    expect(c.samples[0].go_points).toBe(inputs.samples[0].goRows.length);
    const edited = { ...inputs, curves: { ...inputs.curves, go: { ...inputs.curves.go, nog: '3.0' } } };
    expect(curveOriginStatus(edited.curves.go, edited.curves.goOrigin, GO_KEYS)).toMatchObject({ kind: 'edited-after-fit', edited: ['nog'] });
  });

  it('the report names the gas-oil fit in the model, the inputs and a fits table', () => {
    const { inputs } = applied();
    const { model } = reportOf(inputs);
    const src = model.model.find(([k]) => k === 'Source of the gas-oil set')[1];
    expect(src).toMatch(/^Fitted to the lab table of sample "Demo core A \(synthetic\)"/);
    const goInput = model.inputs.rows.find((r) => r.key === 'go.ng');
    expect(goInput.source).toMatch(/^Fitted to the lab table of sample "Demo core A/);
    expect(model.samples.goFits.rows[0][0]).toBe('Demo core A (synthetic)');
    expect(model.headline.rows.find(([k]) => k.startsWith('Gas-oil'))[3]).toMatch(/^Fitted to the lab table/);
  });

  it('negative control: an entered gas-oil set still reads "entered"', () => {
    const { model } = reportOf(identifiedFitted());
    expect(model.model.find(([k]) => k === 'Source of the gas-oil set')[1]).toBe('Entered by the user');
  });
});
