/**
 * SCAL-U2-005: the saturation-height fluid inputs from a Fluid Systems
 * Studio project (pvt-1, read by id), with provenance and edits marked.
 * The Good Oil Co. Well No. 4 fluid of the Fluid test kit is the source.
 */
import { reservoirFluidGravities } from '@/utils/scalCalculations';
import { gravitiesFromPvt, scalPvtIntake, scalPvtSourceText, SCAL_PVT_FIELDS, IFT_NOT_IN_PVT } from '@/utils/scalstudio/pvtGravities';
import { pvtIntakeCardModel } from '@/lib/inputProvenance/pvtIntakeCard';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';
import { openingInputs, stateOf, reportOf } from './scalTestKit';

const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
const block = { ...ws.contract, project_id: 'fluid-1' };

describe('the densities from the pvt-1 block', () => {
  it('at the bubble point: the engine call on the block\'s Bo, Rs, Bw and inputs', () => {
    const r = gravitiesFromPvt(block);
    expect(r.ok).toBe(true);
    expect(r.pressure).toBe(block.at_saturation.pressure);
    const sat = block.at_saturation;
    const direct = reservoirFluidGravities({ api: block.inputs.oil_gravity, gasGravity: block.inputs.gas_gravity, Rs_scf_stb: sat.Rs, Bo: sat.Bo, Bw: sat.Bw, salinity_ppm: block.inputs.salinity });
    expect(r.result).toEqual(direct);
  });

  it('CROSS-CHECK: the matched black-oil fluid gives the study\'s measured bubble point oil density (0.6562 g/cc) within 1 percent', () => {
    const r = gravitiesFromPvt(block);
    expect(Math.abs(r.result.rhoOil_lbft3 / 62.428 / 0.6562 - 1)).toBeLessThan(0.01);
  });

  it('at a stated pressure inside the table: Bo, Rs, Bw interpolated; outside it: refused, not extrapolated', () => {
    const ps = block.table.map((t) => t.pressure);
    const p = (Math.min(...ps) + Math.max(...ps)) / 2;
    const r = gravitiesFromPvt(block, { pressurePsia: p });
    expect(r.ok).toBe(true);
    expect(r.pressureFrom).toBe('stated');
    expect(r.components.Bo).toBeGreaterThan(1);
    const out = gravitiesFromPvt(block, { pressurePsia: Math.max(...ps) + 5000 });
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/outside the PVT table of the project/);
  });

  it('NEGATIVE CONTROL: no block, no densities', () => {
    expect(gravitiesFromPvt(null).ok).toBe(false);
  });
});

describe('taken into SCAL Studio', () => {
  const taken = scalPvtIntake(block, { at: '2026-10-03T12:00:00Z' });
  const withIntake = (patch = {}) => {
    const inputs = openingInputs();
    inputs.height = { ...inputs.height, ...taken.patch, ...patch };
    inputs.pvtIntake = taken.intake;
    return inputs;
  };

  it('patches both gravities and keeps the record, the IFT stays as entered', () => {
    expect(taken.ok).toBe(true);
    expect(Number(taken.patch.gammaHc)).toBeCloseTo(gravitiesFromPvt(block).result.gammaOil, 3);
    expect(taken.intake.from).toMatchObject({ recordId: 'fluid-1', recordName: 'Good Oil Well No. 4 PVT' });
    expect(taken.intake.ift).toBe(IFT_NOT_IN_PVT);
  });

  it('the shared card: as received, then edited after intake, then source changed since (by content)', () => {
    const fields = SCAL_PVT_FIELDS;
    const asReceived = pvtIntakeCardModel({ intake: taken.intake, current: taken.patch, fields });
    expect(asReceived.status).toBe('As received');
    expect(asReceived.rows[0].method).toMatch(/^Mass balance on a stock-tank barrel/);
    const edited = pvtIntakeCardModel({ intake: taken.intake, current: { ...taken.patch, gammaHc: '0.7' }, fields });
    expect(edited.status).toBe('Edited after intake');
    const resaved = { ok: true, contract: { ...block, generated_at: '2026-10-05T00:00:00Z' } };
    expect(pvtIntakeCardModel({ intake: taken.intake, current: taken.patch, fields, latest: resaved }).status).toBe('As received');
    const moved = { ok: true, contract: { ...block, at_saturation: { ...block.at_saturation, Bo: block.at_saturation.Bo + 0.02 } } };
    expect(pvtIntakeCardModel({ intake: taken.intake, current: taken.patch, fields, latest: moved }).status).toBe('Source changed since');
  });

  it('the report prints the gravities as computed from the Fluid project; an edit is said', () => {
    const { model } = reportOf(withIntake());
    const row = model.inputs.rows.find((r) => r.key === 'height.gammaHc');
    expect(row.source).toBe(scalPvtSourceText(taken.intake, 'gammaHc'));
    expect(row.source).toMatch(/^Computed at \d+(\.\d+)? psia \(the bubble point of the block\): oil density .* from Fluid Systems Studio project "Good Oil Well No\. 4 PVT"/);
    const ed = reportOf(withIntake({ gammaHc: '0.7' })).model.inputs.rows.find((r) => r.key === 'height.gammaHc');
    expect(ed.source).toMatch(/^Edited in this app after the handoff \(received /);
    const ift = model.inputs.rows.find((r) => r.key === 'reservoir.sigma_dyncm');
    expect(ift.source).not.toMatch(/Fluid Systems Studio/);
  });

  it('the kr-1 height block names where the gravities came from', () => {
    const c = stateOf(withIntake()).contract;
    expect(c.capillary.height.gravities_from).toMatch(/^Fluid Systems Studio project "Good Oil Well No\. 4 PVT"/);
    expect(stateOf(openingInputs()).contract.capillary.height.gravities_from).toBeUndefined();
  });

  it('the intake is saved with the project and read back', () => {
    const s = stateOf(withIntake());
    expect(s.pvtIntake.values).toEqual(taken.patch);
    // eslint-disable-next-line global-require
    const { inputsFromPayload } = require('@/utils/scalstudio/workspace');
    expect(inputsFromPayload(JSON.parse(JSON.stringify({ ...withIntake() }))).pvtIntake).toEqual(taken.intake);
    expect(inputsFromPayload({}).pvtIntake).toBeNull();
  });
});
