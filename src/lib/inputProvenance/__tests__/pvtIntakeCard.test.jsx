/**
 * FLUID-U2-005: the shared PVT intake card, and Well Test as its first user.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { pvtIntake } from '@/lib/inputProvenance/pvtContract';
import { pvtIntakeCardModel } from '@/lib/inputProvenance/pvtIntakeCard';
import PvtIntakeCard from '@/lib/inputProvenance/PvtIntakeCard';
import { WELLTEST_PVT_FIELDS } from '@/utils/welltest/reportModel';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
const taken = pvtIntake(ws.handoff, WELLTEST_PVT_FIELDS);
const asReceived = { ...taken.patch };
// a re-save that changed what the block says (a re-save alone is no change: pvtIntakeCardFingerprint.test.jsx)
const later = (contract, minutes) => ({ ok: true, contract: { ...contract, at_saturation: { ...contract.at_saturation, Bo: contract.at_saturation.Bo + 0.05 }, generated_at: new Date(Date.parse(contract.generated_at) + minutes * 60000).toISOString() } });

describe('the card model', () => {
  it('names the source, the time, the model, the bubble point and the tuning, and each value with its method', () => {
    const m = pvtIntakeCardModel({ intake: taken.intake, current: asReceived, fields: WELLTEST_PVT_FIELDS });
    expect(m.source).toBe('Fluid Systems Studio, project "Good Oil Well No. 4 PVT"');
    expect(m.at).toBe('2026-10-02 09:00 UTC');
    expect(m.model).toBe('Black-oil correlations');
    expect(m.tuning).toBe('correlations matched to lab data');
    expect(m.bubblePoint).toMatch(/^2635 psia, measured \(lab\)$/);
    expect(m.rows.map((r) => r.key)).toEqual(['B', 'mu', 'apiGravity', 'gor', 'gasGravity', 'temperature']);
    expect(m.rows[0].method).toMatch(/^Standing, multiplied by/);
    expect(m.rows[2].method).toBe('Input of the fluid model');
    expect(m.status).toBe('As received');
    expect(m.changedSince).toBeNull();
    expect(m.edited).toEqual([]);
  });
  it('edited after intake: a value changed in the consumer', () => {
    const m = pvtIntakeCardModel({ intake: taken.intake, current: { ...asReceived, B: '1.5' }, fields: WELLTEST_PVT_FIELDS });
    expect(m.status).toBe('Edited after intake');
    expect(m.rows.find((r) => r.key === 'B').edited).toBe(true);
    expect(m.edited).toEqual(['Bo']);
  });
  it('source changed since: the project was saved again with other content after the intake; the values stay as received', () => {
    const m = pvtIntakeCardModel({ intake: taken.intake, current: asReceived, fields: WELLTEST_PVT_FIELDS, latest: later(ws.contract, 90) });
    expect(m.status).toBe('Source changed since');
    expect(m.changedSince.text).toMatch(/saved again on 2026-10-02 10:30 UTC and now differs: Bo at saturation .*the ones received \(2026-10-02 09:00 UTC\)/);
    expect(m.rows[0].received).toBe(asReceived.B);
    // negative control: the same block read again is no change
    expect(pvtIntakeCardModel({ intake: taken.intake, current: asReceived, fields: WELLTEST_PVT_FIELDS, latest: { ok: true, contract: ws.contract } }).changedSince).toBeNull();
    const both = pvtIntakeCardModel({ intake: taken.intake, current: { ...asReceived, mu: '9' }, fields: WELLTEST_PVT_FIELDS, latest: later(ws.contract, 5) });
    expect(both.status).toBe('Source changed since; edited after intake');
  });
  it('range flags travel; nothing taken gives no card', () => {
    const flagged = { ...taken.intake, contract: { ...taken.intake.contract, range_flags: [{ text: 'Standing: solution GOR 1600 is outside its published range.' }] } };
    expect(pvtIntakeCardModel({ intake: flagged, fields: WELLTEST_PVT_FIELDS }).rangeFlags).toEqual(['Standing: solution GOR 1600 is outside its published range.']);
    expect(pvtIntakeCardModel({ intake: null, fields: WELLTEST_PVT_FIELDS })).toBeNull();
  });
});

describe('the card on the page', () => {
  it('reads the source again by id and shows the change', async () => {
    const intake = { ...taken.intake, from: { ...taken.intake.from, recordId: 'fluid-project-1' } };
    const readLatest = jest.fn(() => Promise.resolve(later(ws.contract, 60)));
    render(<PvtIntakeCard intake={intake} current={asReceived} fields={WELLTEST_PVT_FIELDS} readLatest={readLatest} />);
    expect(screen.getByTestId('pvt-intake-source').textContent).toMatch(/Good Oil Well No\. 4 PVT/);
    await waitFor(() => expect(screen.getByTestId('pvt-intake-status').textContent).toBe('Source changed since'), { timeout: 15000 });
    expect(readLatest).toHaveBeenCalledWith('fluid-project-1');
    expect(screen.getByTestId('pvt-intake-changed').textContent).toMatch(/now differs: Bo at saturation/);
  });
});
