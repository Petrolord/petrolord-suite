// WF-U1 pvt-1 intake (RL11): viscosities and FVFs from a Fluid Systems
// Studio project read by id, with the shared card's "edited after intake" and
// "source changed since" (content). Source fluid: the Good Oil Co. Well No. 4
// black-oil case of the Fluid test kit.
import { wfPvtIntake, wfPvtCurrent, wfPvtCardFields, wfPvtSourceText, tableAt } from '@/utils/waterflooddesign/pvtIntake';
import { pvtIntakeCardModel } from '@/lib/inputProvenance/pvtIntakeCard';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
const block = { ...ws.contract, project_id: 'fluid-1' };
const AT = '2026-10-04T12:00:00Z';

describe('reading the block', () => {
  it('at the bubble point: the table values there, Bg converted RB/scf to RB/Mscf (x 1000)', () => {
    const r = wfPvtIntake(block, { at: AT });
    expect(r.ok).toBe(true);
    const pb = block.at_saturation.pressure;
    expect(r.intake.pressure_psia).toBe(pb);
    expect(Number(r.patch.pattern.Bo)).toBeCloseTo(tableAt(block.table, 'Bo', pb), 3);
    expect(Number(r.patch.displacement.muO)).toBeCloseTo(tableAt(block.table, 'mu_o', pb), 3);
    expect(Number(r.patch.displacement.muW)).toBeCloseTo(tableAt(block.table, 'mu_w', pb), 3);
    const bgScf = tableAt(block.table, 'Bg', pb);
    expect(Number(r.patch.surveillance.bg)).toBeCloseTo(bgScf * 1000, 1);
    expect(r.patch.surveillance.bo).toBe(r.patch.pattern.Bo);
    expect(r.intake.from).toMatchObject({ recordId: 'fluid-1', recordName: 'Good Oil Well No. 4 PVT' });
    expect(r.intake.methods.Bo).toMatch(/at the bubble point/);
    expect(r.intake.contract.table).toBeUndefined();
  });

  it('a stated pressure inside the table interpolates; outside it is refused, not extrapolated', () => {
    const ps = block.table.map((t) => t.pressure);
    const mid = (Math.min(...ps) + Math.max(...ps)) / 2;
    const r = wfPvtIntake(block, { pressurePsia: mid });
    expect(r.ok).toBe(true);
    expect(r.intake.pressure_from).toBe('stated');
    expect(r.intake.methods.sBo).toMatch(/stated reservoir pressure/);
    const out = wfPvtIntake(block, { pressurePsia: Math.max(...ps) + 5000 });
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/outside the PVT table/);
  });

  it('NEGATIVE CONTROL: no block, no intake', () => {
    expect(wfPvtIntake(null).ok).toBe(false);
  });
});

describe('the shared card and the report words', () => {
  const r = wfPvtIntake(block, { at: AT });
  const state = {
    displacementInputs: { ...r.patch.displacement },
    patternInputs: { ...r.patch.pattern },
    surveillanceConfig: { ...r.patch.surveillance },
  };
  const card = (current, latest = null) => pvtIntakeCardModel({ intake: r.intake, current, fields: wfPvtCardFields(r.intake), latest });

  it('as received, every value with its method', () => {
    const m = card(wfPvtCurrent(state));
    expect(m.status).toBe('As received');
    expect(m.rows.map((x) => x.key)).toEqual(['muO', 'muW', 'Bo', 'Bw', 'sBo', 'sBw', 'sBg', 'sRs']);
    expect(m.rows.find((x) => x.key === 'Bo').method).toBe(r.intake.methods.Bo);
  });

  it('edited after intake: Bo typed over on the Pattern tab', () => {
    const m = card(wfPvtCurrent({ ...state, patternInputs: { ...state.patternInputs, Bo: '1.4' } }));
    expect(m.status).toBe('Edited after intake');
    expect(wfPvtSourceText(r.intake, 'Bo', '1.4')).toMatch(/^Edited in this app after the intake \(received/);
    expect(wfPvtSourceText(r.intake, 'Bo', r.patch.pattern.Bo)).toBe(r.intake.methods.Bo);
  });

  it('source changed since: by content only (a re-save of the same fluid is as received)', () => {
    const resaved = { ok: true, contract: { ...block, generated_at: '2026-10-05T00:00:00Z' } };
    expect(card(wfPvtCurrent(state), resaved).status).toBe('As received');
    const changed = { ok: true, contract: { ...block, at_saturation: { ...block.at_saturation, Bo: block.at_saturation.Bo + 0.05 } } };
    expect(card(wfPvtCurrent(state), changed).status).toBe('Source changed since');
  });
});
