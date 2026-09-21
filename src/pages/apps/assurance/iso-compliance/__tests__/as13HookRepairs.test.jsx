/**
 * AS13 — the ISO Compliance hook, run against an in-memory database,
 * for the repairs that live in the hook.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import { useIsoCompliance } from '../hooks/useIsoCompliance';
import { independenceView, withAssessor } from '../utils/isoPayload';
import { auditIndependence, canSetClauseStatus } from '@/lib/isoCompliance';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-B' } }),
}));

const ORG = 'org-1';
const seed = () => ({
  iso_standards: [{ id: 's1', org_id: ORG, code: 'ISO 9001', cycle_years: 3 }],
  iso_clauses: [
    // Assessed before by user A.
    { id: 'c1', org_id: ORG, standard_id: 's1', clause_ref: '7.1.5', title: 'Monitoring', status: 'Conformant', evidence_reference: 'QMS-9', assessed_date: '2026-01-10', assessed_by: 'user-A', applicability: 'Applicable', owner_name: 'Jane Doe' },
    { id: 'c2', org_id: ORG, standard_id: 's1', clause_ref: '8.5', title: 'Production', status: 'Not assessed', applicability: 'Applicable', owner_id: 'user-X', owner_name: 'Xavier' },
  ],
  iso_audits: [
    { id: 'a1', org_id: ORG, audit_code: 'IA-2026-001', title: 'Q3', audit_type: 'Internal', status: 'Planned', standard_id: 's1', lead_auditor_name: 'jane doe' },
    { id: 'a2', org_id: ORG, audit_code: 'IA-2026-002', title: 'Q4', audit_type: 'Internal', status: 'Reported', standard_id: 's1', lead_auditor_id: 'user-B' },
  ],
  iso_audit_clauses: [],
  iso_findings: [
    { id: 'f-open', org_id: ORG, finding_code: 'IF-2026-001', audit_id: 'a1', standard_id: 's1', title: 'Error', finding_type: 'Observation', status: 'Open', raised_date: '2026-09-01' },
    { id: 'f-major', org_id: ORG, finding_code: 'IF-2026-002', audit_id: 'a1', standard_id: 's1', title: 'Major', finding_type: 'Major nonconformity', status: 'Correction proposed', correction: 'Fixed', raised_date: '2026-09-01' },
    { id: 'f-rep', org_id: ORG, finding_code: 'IF-2026-003', audit_id: 'a2', standard_id: 's1', title: 'On a report', finding_type: 'Observation', status: 'Open', raised_date: '2026-09-01' },
  ],
  iso_actions: [],
  iso_activity_log: [],
});

const setup = async () => {
  mockDb = makeFakeSupabase(seed());
  const view = renderHook(() => useIsoCompliance());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('AS13 repairs in useIsoCompliance', () => {
  it('the raw form is refused by the engine when the assessor is blank, which was the AS8 defect', () => {
    const form = { evidence_reference: 'QMS-9', assessed_date: '2026-09-18', assessor_name: '' };
    expect(canSetClauseStatus({ id: 'new' }, 'Conformant', form).ok).toBe(false);
    expect(canSetClauseStatus({ id: 'new' }, 'Conformant', withAssessor(form, 'user-B')).ok).toBe(true);
  });

  it('a blank assessor records the user, replacing the previous assessor (defect 10)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.assessClause(result.current.clauses[0], 'Conformant', {
        evidence_reference: 'QMS-9 rev 5', assessed_date: '2026-09-18', assessor_name: null,
      });
    });
    expect(out.success).toBe(true);
    expect(mockDb.tables.iso_clauses[0]).toMatchObject({ assessed_by: 'user-B', assessor_name: null });
  });

  it('a typed assessor is recorded as that person, not the account (defect 10)', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.assessClause(result.current.clauses[1], 'Nonconformant', {
        assessed_date: '2026-09-18', assessor_name: 'External Consultant',
      });
    });
    expect(mockDb.tables.iso_clauses[1]).toMatchObject({
      status: 'Nonconformant', assessed_by: null, assessor_name: 'External Consultant',
    });
  });

  it('refuses a clause into scope whose owner has the lead auditor\'s name (defect 11)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.addToScope(result.current.audits[0], ['c1']); });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/ISO 19011/);
    expect(out.error).toMatch(/7\.1\.5/);
    expect(mockDb.tables.iso_audit_clauses).toHaveLength(0);
    await act(async () => { out = await result.current.addToScope(result.current.audits[0], ['c2']); });
    expect(out.success).toBe(true);
  });

  it('independenceView leaves two different picked members alone, and never matches a blank name', () => {
    const audit = { lead_auditor_id: 'u1', lead_auditor_name: 'Ann' };
    const view = independenceView(audit, [{ clause_ref: '4.1', owner_id: 'u2', owner_name: 'Ann' }]);
    expect(auditIndependence(view.audit, view.clauses).ok).toBe(true);
    const blank = independenceView({ lead_auditor_name: '' }, [{ clause_ref: '4.1', owner_name: '' }]);
    expect(auditIndependence(blank.audit, blank.clauses).ok).toBe(true);
  });

  it('a finding raised from an audit carries the audit\'s standard (defect 13)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.createFinding({
        audit_id: 'a1', standard_id: '', finding_type: 'Major nonconformity', title: 'Records missing',
        description: 'x', objective_evidence: 'y',
      });
    });
    expect(out.success).toBe(true);
    expect(out.data.standard_id).toBe('s1');
  });

  it('deletes only an open finding with nothing recorded, on an unreported audit (defect 15)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.deleteFinding('f-major'); });
    expect(out.success).toBe(false);
    await act(async () => { out = await result.current.deleteFinding('f-rep'); });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/report/);
    await act(async () => { out = await result.current.deleteFinding('f-open'); });
    expect(out.success).toBe(true);
    expect(mockDb.tables.iso_findings.map((f) => f.id)).toEqual(['f-major', 'f-rep']);
  });

  it('moves a finding to Action in progress and then Verification (defect 17)', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.addActions('f-major', [
        { description: 'Retrain', action_type: 'Corrective', due_date: '2026-10-01' },
      ]);
    });
    const finding = () => mockDb.tables.iso_findings.find((f) => f.id === 'f-major');
    expect(finding().status).toBe('Action in progress');
    const action = mockDb.tables.iso_actions[0];
    await act(async () => {
      await result.current.updateAction(action.id, { ...action, status: 'Complete' });
    });
    expect(finding().status).toBe('Verification');
  });
});
