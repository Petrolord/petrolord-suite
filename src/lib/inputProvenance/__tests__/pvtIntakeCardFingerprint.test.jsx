/**
 * The PVT intake card's "source changed since" compares content, not save
 * times (the SCAL-U1-023 fix carried to Fluid's card, SCAL U2 batch
 * decision 2026-10-03). Every save of a Fluid Systems project re-stamps its
 * pvt-1 block (autosave too), so a later generated_at alone is no change.
 * What the consumer took is compared: the values at saturation, the inputs
 * of the fluid model, the model, the bubble point source, the tuning and
 * the method behind each property.
 */
import { pvtIntake } from '@/lib/inputProvenance/pvtContract';
import { pvtIntakeCardModel, pvtContentFingerprint } from '@/lib/inputProvenance/pvtIntakeCard';
import { WELLTEST_PVT_FIELDS } from '@/utils/welltest/reportModel';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
const taken = pvtIntake(ws.handoff, WELLTEST_PVT_FIELDS);
const asReceived = { ...taken.patch };
const resaved = (contract, minutes, patch = {}) => ({
  ok: true,
  contract: { ...contract, ...patch, generated_at: new Date(Date.parse(contract.generated_at) + minutes * 60000).toISOString() },
});
const card = (latest, current = asReceived) => pvtIntakeCardModel({ intake: taken.intake, current, fields: WELLTEST_PVT_FIELDS, latest });

describe('source changed since: content, not time', () => {
  it('a later save of the same content is no change (the flaw: it said "changed")', () => {
    const m = card(resaved(ws.contract, 90));
    expect(m.changedSince).toBeNull();
    expect(m.status).toBe('As received');
  });

  it('a changed value at saturation is a change, and the card says which and both values', () => {
    const Bo = ws.contract.at_saturation.Bo;
    const m = card(resaved(ws.contract, 90, { at_saturation: { ...ws.contract.at_saturation, Bo: Bo + 0.05 } }));
    expect(m.status).toBe('Source changed since');
    expect(m.changedSince.text).toMatch(/saved again on 2026-10-02 10:30 UTC and now differs: Bo at saturation/);
    expect(m.changedSince.text).toContain(`(was ${Bo})`);
    expect(m.rows[0].received).toBe(asReceived.B);
  });

  it('a changed method, model, bubble point source or input is a change', () => {
    const methods = { ...ws.contract.methods, bo: { ...ws.contract.methods.bo, method: 'Vasquez-Beggs' } };
    expect(card(resaved(ws.contract, 5, { methods })).changedSince.text).toMatch(/the method of Oil formation volume factor Bo/);
    expect(card(resaved(ws.contract, 5, { model: 'eos' })).changedSince.text).toMatch(/the fluid model/);
    expect(card(resaved(ws.contract, 5, { pb_source: 'entered' })).changedSince.text).toMatch(/the source of the bubble point/);
    expect(card(resaved(ws.contract, 5, { inputs: { ...ws.contract.inputs, oil_gravity: 40 } })).changedSince.text).toMatch(/oil_gravity 40/);
  });

  it('with an edit in the consumer too, both are said', () => {
    const m = card(resaved(ws.contract, 5, { pb_source: 'entered' }), { ...asReceived, mu: '9' });
    expect(m.status).toBe('Source changed since; edited after intake');
  });

  it('the fingerprint ignores the save time, the build, the table and the identification', () => {
    const a = pvtContentFingerprint(ws.contract);
    const b = pvtContentFingerprint({ ...ws.contract, generated_at: '2027-01-01T00:00:00Z', app_build: 'x', table: [], identification: { field: 'y' } });
    expect(b).toEqual(a);
    expect(pvtContentFingerprint(taken.intake.contract)).toEqual(a);
  });
});
