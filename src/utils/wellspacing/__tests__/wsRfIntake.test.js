/**
 * WS-U2-005: the rf-1 intake. A Recovery Factor Estimator project's record,
 * built by the estimator's own functions (deriveRf, rfRecordOf), read by id,
 * gives the oil recovery factor of the case with its method and source;
 * the report prints it; an edit after the intake says so; a gas estimate is
 * refused. The case moves with it through the engine.
 */
import { rfRecordOf } from '@/utils/rfestimator/rfRecord';
import { deriveRf } from '@/utils/rfestimator/workspace';
import { readRfProject } from '@/lib/rfEstimateSource';
import { reviewerPayload, gasPayload } from '@/utils/rfestimator/__tests__/rfTestKit';
import { runSpacingCases } from '@/utils/wellSpacingCalculations';
import { wsRfIntake, rfFingerprint } from '../intakes';
import { buildWellSpacingReportModel } from '../reportModel';
import { defaultInputs } from '../model';

const NOW = '2026-10-05T10:00:00.000Z';
const stateOf = (p) => ({ inputs: p.inputs, derived: deriveRf(p.inputs, { inPlaceIntake: p.inPlaceIntake, pvtIntake: p.pvtIntake }), identification: p.identification, inPlaceIntake: p.inPlaceIntake });
const record = () => rfRecordOf(stateOf(reviewerPayload()), { projectId: 'rf-9', projectName: 'Ekene E-2000 RF', now: NOW });

describe('WS-U2-005: the rf-1 intake', () => {
  it('takes the oil recovery factor as the percent of the case, with the method and source', () => {
    const rec = record();
    const res = wsRfIntake(rec, { projectId: 'rf-9', projectName: 'Ekene E-2000 RF', at: NOW });
    expect(res.ok).toBe(true);
    expect(Number(res.patch.recoveryFactor)).toBeCloseTo(rec.recovery_factor.value * 100, 6);
    expect(res.intake.kind).toBe('rf');
    expect(res.intake.from).toMatchObject({ app: 'Recovery Factor Estimator', recordId: 'rf-9', schema: 'rf-1' });
    expect(res.intake.methods.recoveryFactor).toMatch(new RegExp(`^${rec.recovery_factor.method_label.replace(/[()]/g, '.')}, Recovery Factor Estimator, project "Ekene E-2000 RF"`));
    expect(res.intake.methods.recoveryFactor).toMatch(/given here to each well over its drained area/);
    expect(res.intake.fingerprint).toEqual(rfFingerprint(rec));
  });

  it('the case runs on it, the report prints it, and an edit after the intake is flagged', () => {
    const rec = record();
    const res = wsRfIntake(rec, { projectId: 'rf-9', projectName: 'Ekene E-2000 RF', at: NOW });
    const inputs = defaultInputs('oilfield', { sample: true });
    inputs.sampleNote = null;
    inputs.form = { ...inputs.form, ...res.patch };
    inputs.intakes = { ...inputs.intakes, rf: res.intake };
    const results = runSpacingCases(inputs.form);
    expect(results.parameters.recoveryFactor).toBeCloseTo(rec.recovery_factor.value, 7);
    const m = buildWellSpacingReportModel(inputs, { results });
    expect(m.inputs.rows.find((r) => r.key === 'recoveryFactor').source).toMatch(/Recovery Factor Estimator, project "Ekene E-2000 RF"/);
    inputs.form.recoveryFactor = '20';
    const m2 = buildWellSpacingReportModel(inputs, { results: runSpacingCases(inputs.form) });
    expect(m2.inputs.rows.find((r) => r.key === 'recoveryFactor').source).toMatch(/^Edited in this app after the intake/);
    expect(m2.limits.flags.join(' ')).toMatch(/was edited after it was taken from Recovery Factor Estimator/);
  });

  it('refuses a gas estimate and a non-record', () => {
    const gas = rfRecordOf(stateOf(gasPayload()), { now: NOW });
    expect(wsRfIntake(gas).errors[0]).toMatch(/for gas/);
    expect(wsRfIntake({ contract: 'mbal-1' }).ok).toBe(false);
  });

  it('is read by id from the saved project (the estimator\'s reader)', async () => {
    const payload = { ...reviewerPayload(), rf: record() };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: 'rf-9', project_name: 'Ekene E-2000 RF', inputs_data: payload, updated_at: NOW }, error: null }) };
    const read = await readRfProject({ from: () => q }, 'rf-9');
    expect(read.ok).toBe(true);
    expect(wsRfIntake(read.contract, { projectId: 'rf-9' }).ok).toBe(true);
  });
});
