/**
 * AS13 — the Audit & Findings Manager hook, run against an in-memory
 * database, for the repairs that live in the hook rather than a page.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import { useAuditManagement } from '../hooks/useAuditManagement';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1', email: 'me@example.com' } }),
}));

const ORG = 'org-1';
const seed = () => ({
  audit_programmes: [
    { id: 'p1', org_id: ORG, title: 'HSE programme 2026', programme_year: 2026, status: 'Draft' },
  ],
  audit_templates: [{ id: 't1', org_id: ORG, code: 'CL-1', title: 'Contractor', status: 'Active' }],
  audit_template_items: [
    { id: 'i1', template_id: 't1', item_no: '1.1', question: 'Permit displayed?', criticality: 'Critical', sequence: 1 },
    { id: 'i2', template_id: 't1', item_no: '1.2', question: 'Unused question', criticality: 'Minor', sequence: 2 },
  ],
  audit_records: [
    { id: 'a-rep', org_id: ORG, audit_code: 'AUD-2026-001', title: 'Rig 7', status: 'Reported', template_id: 't1', conclusion: 'Done' },
    { id: 'a-open', org_id: ORG, audit_code: 'AUD-2026-002', title: 'Rig 8', status: 'In progress', template_id: null },
  ],
  audit_responses: [
    { id: 'r1', audit_id: 'a-rep', item_id: 'i1', result: 'Conformant', examined_on: '2026-09-01' },
  ],
  audit_findings: [
    { id: 'f-closed', org_id: ORG, finding_code: 'AF-2026-001', audit_id: 'a-open', title: 'Closed one', finding_type: 'Minor nonconformity', status: 'Closed', correction: 'Fixed', raised_date: '2026-09-01' },
    { id: 'f-open', org_id: ORG, finding_code: 'AF-2026-002', audit_id: 'a-open', title: 'Raised in error', finding_type: 'Observation', status: 'Open', raised_date: '2026-09-02' },
    { id: 'f-work', org_id: ORG, finding_code: 'AF-2026-003', audit_id: 'a-open', title: 'Needs work', finding_type: 'Minor nonconformity', status: 'Open', raised_date: '2026-09-02' },
  ],
  audit_actions: [],
  audit_activity_log: [],
});

const setup = async () => {
  mockDb = makeFakeSupabase(seed());
  const view = renderHook(() => useAuditManagement());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('AS13 repairs in useAuditManagement', () => {
  it('approves a programme with the approver left blank, recording the user (defect 2)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.advanceProgramme(
        result.current.programmes[0], 'Approved', { approved_at: '2026-09-18', approver_name: null });
    });
    expect(out.success).toBe(true);
    expect(mockDb.tables.audit_programmes[0]).toMatchObject({
      status: 'Approved', approved_by: 'user-1', approved_at: '2026-09-18',
    });
  });

  it('refuses a plan whose lead auditor and auditee are the same typed name (defect 3)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.createAudit({
        title: 'Self audit', lead_auditor_name: 'Jane Doe', auditee_name: '  jane   DOE ',
      });
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/An auditor may not audit their own area/);
    expect(mockDb.tables.audit_records).toHaveLength(2);
  });

  it('refuses the same picked member on both sides, and never writes a stand-in id (defect 3)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.createAudit({
        title: 'Self audit', lead_auditor_id: 'user-2', lead_auditor_name: 'Ann',
        auditee_id: 'user-2', auditee_name: 'Ann',
      });
    });
    expect(out.success).toBe(false);
    await act(async () => {
      out = await result.current.createAudit({
        title: 'Independent', lead_auditor_id: 'user-2', lead_auditor_name: 'Ann',
        auditee_name: 'Bob External',
      });
    });
    expect(out.success).toBe(true);
    const written = mockDb.tables.audit_records.find((a) => a.title === 'Independent');
    expect(written.lead_auditor_id).toBe('user-2');
    expect(written.auditee_id ?? null).toBeNull();
  });

  it('refuses to delete a question an audit has answered, and keeps its answers (defect 4)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.deleteTemplateItem('i1'); });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/retire this checklist/);
    expect(mockDb.tables.audit_template_items.map((i) => i.id)).toContain('i1');
    expect(mockDb.tables.audit_responses).toHaveLength(1);
    // An unused question still deletes.
    await act(async () => { out = await result.current.deleteTemplateItem('i2'); });
    expect(out.success).toBe(true);
  });

  it('refuses a criticality change on a question a reported audit was held to (defect 4)', async () => {
    const { result } = await setup();
    let out;
    const item = mockDb.tables.audit_template_items[0];
    await act(async () => {
      out = await result.current.updateTemplateItem('i1', { ...item, criticality: 'Minor' });
    });
    expect(out.success).toBe(false);
    expect(mockDb.tables.audit_template_items[0].criticality).toBe('Critical');
  });

  it('refuses an answer change and a new finding on a Reported audit (defect 5)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.recordAnswer(
        mockDb.tables.audit_responses[0], { result: 'Nonconformant', evidence: 'x' });
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/reported/);
    expect(mockDb.tables.audit_responses[0].result).toBe('Conformant');
    await act(async () => {
      out = await result.current.createFinding({
        audit_id: 'a-rep', finding_type: 'Observation', title: 'Late', objective_evidence: 'Seen',
      });
    });
    expect(out.success).toBe(false);
    expect(mockDb.tables.audit_findings).toHaveLength(3);
  });

  it('deletes only an open finding with nothing recorded against it (defect 7)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.deleteFinding('f-closed'); });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Void it with a reason/);
    await act(async () => { out = await result.current.deleteFinding('f-open'); });
    expect(out.success).toBe(true);
    expect(mockDb.tables.audit_findings.map((f) => f.id)).toEqual(['f-closed', 'f-work']);
  });

  it('moves a finding to Action in progress and then Verification (defect 9)', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.addActions('f-work', [
        { description: 'Retrain the crew', action_type: 'Corrective', due_date: '2026-10-01' },
      ]);
    });
    const finding = () => mockDb.tables.audit_findings.find((f) => f.id === 'f-work');
    expect(finding().status).toBe('Action in progress');
    const action = mockDb.tables.audit_actions[0];
    await act(async () => {
      await result.current.updateAction(action.id, { ...action, status: 'Complete' });
    });
    expect(finding().status).toBe('Verification');
  });
});
