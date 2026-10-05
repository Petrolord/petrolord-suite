// The eor-screen-1 reader in Recovery Factor Estimator: the EOR screening
// result beside the estimate, by id, as context only, with "source changed
// since"; no RF number moves.
import { buildEorScreenRecord } from '@/lib/eorScreenSource';
import { fieldCase } from '@/utils/eor/__tests__/eorTestKit';
import { eorContextFrom, eorContextChanged, eorContextRows } from '../eorContext';
import { buildRfReportModel } from '../reportModel';
import { stateOf, reviewerPayload } from './rfTestKit';

const NOW = '2026-10-05T10:00:00.000Z';
const record = (inputs = fieldCase()) => buildEorScreenRecord({ inputs, projectId: 'eor-1', projectName: 'Ekene screen', now: NOW });

describe('RF reads eor-screen-1 by id, as context', () => {
  it('keeps each method outcome and the MMP verdict with the fingerprint', () => {
    const r = record();
    const got = eorContextFrom(r, { takenAt: NOW });
    expect(got.ok).toBe(true);
    expect(got.context.methods.map((m) => [m.id, m.outcome])).toEqual(r.methods.map((m) => [m.id, m.outcome]));
    expect(got.context.mmp).toMatchObject({ verdict: 'miscible', withinError: true });
    const rows = eorContextRows(got.context);
    expect(rows.rows.find((x) => x[0] === 'CO2 miscible')[1]).toBe('Qualified');
    expect(rows.rows.at(-1)[1]).toMatch(/^miscible/);
    expect(rows.note).toMatch(/changes no recovery factor/);
  });
  it('source changed since: a changed screening is flagged, the same one is not', () => {
    const { context } = eorContextFrom(record(), { takenAt: NOW });
    expect(eorContextChanged(context, record())).toBeNull();
    const moved = fieldCase(); moved.form.depthFt = '2000';
    expect(eorContextChanged(context, record(moved))).toMatch(/changed after it was taken/);
    expect(eorContextChanged(context, null)).toMatch(/no longer readable/);
  });
  it('negative controls: a tampered record is refused; the RF report numbers are the same with or without the context', () => {
    const r = record();
    expect(eorContextFrom({ ...r, fingerprint: '00000000' }).ok).toBe(false);
    const base = stateOf(reviewerPayload()).state;
    const without = buildRfReportModel(base);
    const withCtx = buildRfReportModel({ ...base, eorContext: eorContextFrom(r, { takenAt: NOW }).context });
    expect(withCtx.headline).toEqual(without.headline);
    expect(withCtx.methodRows).toEqual(without.methodRows);
    expect(without.eorContext).toBeNull();
    expect(withCtx.eorContext.rows.length).toBe(r.methods.length + 1);
  });
});
