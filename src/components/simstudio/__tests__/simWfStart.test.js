/**
 * SIM-U2-007: a starting deck from a Waterflood Design Studio pattern, read
 * by id (wf-forecast-1 with the saved project), with the kr-1 and pvt-1
 * projects the pattern holds. Gates call the shipped functions: the quarter
 * five-spot element's size and rates from the contract; the deck the
 * builder writes from it (checked in against the worker fixture BUILT_WF.DATA,
 * which OPM Flow runs in the isolated gate); what the pattern does not hold
 * is listed.
 * Negative controls: a line drive is refused; a pattern without its
 * Fluid project keeps the builder's correlations and says so.
 */
import fs from 'fs';
import path from 'path';
import { reviewerPayload, BUILDERS, AT } from '@/components/waterflooddesign/__tests__/wfTestKit';
import { buildWfForecastContract } from '@/utils/waterflooddesign/wfForecastContract';
import { formFromWf } from '@/utils/simstudio/wfDeckIntake';
import { buildDeckFromForm, defaultBuilderForm } from '@/utils/simDeckBuilder';
import { identifiedFitted, stateOf as scalStateOf, inputsFromPayload } from '@/components/scalstudio/__tests__/scalTestKit';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

const GEN = path.join(__dirname, '../../../../worker/sim-worker/tests/integration/fixtures/generated');
const payload = () => ({ ...reviewerPayload(), floodStart: '2027-01-01' });
const contract = () => buildWfForecastContract({ projectId: 'wf-1', projectName: 'Ekene P-1 waterflood', payload: payload() }, BUILDERS).contract;
// the SCAL project as it saves now (one connate water, SIM-U2-014)
const krBlock = () => ({ ...scalStateOf(inputsFromPayload(JSON.parse(JSON.stringify(identifiedFitted())))).contract, project_id: 'scal-1', generated_at: AT.toISOString() });
const pvtBlock = () => ({ ...run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' }).contract, project_id: 'fluid-1', generated_at: AT.toISOString() });

describe('SIM-U2-007 a starting deck from a Waterflood pattern', () => {
  it('the quarter five-spot element of the pattern, its rates, kr-1 and pvt-1 by id', () => {
    const k = contract();
    const res = formFromWf({ contract: k, payload: payload(), krBlock: krBlock(), pvtBlock: pvtBlock(), at: AT.toISOString() });
    expect(res.ok).toBe(true);
    const f = res.form;
    const side = Math.sqrt(k.inputs.area_acres * 43560) / 2;
    expect(Number(f.grid.dx) * 11).toBeCloseTo(side, 3);
    expect(f.grid.layers[0]).toMatchObject({ dz: String(k.inputs.h_ft), poro: String(k.inputs.phi) });
    const inj = f.wells.find((w) => w.type === 'water_injector');
    expect(Number(inj.rate)).toBeCloseTo(k.inputs.iw_bpd / 4 / k.inputs.Bw, 4);
    expect([inj.i, inj.j]).toEqual(['1', '1']);
    const prod = f.wells.find((w) => w.type === 'producer');
    expect(prod.mode).toBe('LRAT');
    expect(Number(prod.rate)).toBeCloseTo(k.inputs.iw_bpd / 4 / k.inputs.Bo, 4);
    expect(f.startDate).toBe('2027-01-01');
    expect(f.krSource.mode).toBe('scal');
    expect(f.krSource.intake.goSwcAdjusted).toBeNull();
    expect(f.pvtSource.mode).toBe('fluid');
    expect(f.equil.datumPressure).toBe('2500');
    expect(res.notes.join(' ')).toMatch(/thickness-weighted mean of the pattern's 5 layers/);
    expect(res.kept.join(' ')).toMatch(/top depth 8000 ft/);
    const out = buildDeckFromForm(f);
    expect(out.ok).toBe(true);
    expect(out.deck).toContain('-- Starting model: Waterflood Design Studio project "Ekene P-1 waterflood" (wf-forecast-1), pattern Five-spot P-1');
    expect(out.deck).toContain('-- Not in the pattern, kept from the builder: top depth 8000 ft');
    const file = path.join(GEN, 'BUILT_WF.DATA');
    if (process.env.GEN_SIM_FIXTURE === '1') fs.writeFileSync(file, out.deck);
    expect(fs.readFileSync(file, 'utf8')).toBe(out.deck);
  });

  it('negative controls: a line drive is refused; without its Fluid project the correlations are kept and listed', () => {
    const p = payload();
    p.patternInputs = { ...p.patternInputs, patternType: 'direct-line' };
    const line = buildWfForecastContract({ projectId: 'wf-2', projectName: 'Line', payload: p }, BUILDERS).contract;
    expect(formFromWf({ contract: line, payload: p }).reason).toMatch(/only a five-spot is sent as a starting deck yet/);
    const res = formFromWf({ contract: contract(), payload: payload() });
    expect(res.ok).toBe(true);
    expect(res.form.pvtSource.mode).not.toBe('fluid');
    expect(res.kept.join(' ')).toMatch(/black-oil correlation inputs/);
    expect(res.form.krSource.mode).toBe('typed');
    expect(res.form.scal.ow.Swc).toBe(payload().displacementInputs.Swc);
    expect(formFromWf({ contract: null, payload: {} }).ok).toBe(false);
    expect(defaultBuilderForm().origin).toBeUndefined();
  });
});
