/**
 * AS13 hardening: an ISO audit's clause scope is fixed once the audit is
 * Reported. It used to lock only at Closed and Cancelled, so clauses
 * could be added to or removed from a report already issued.
 */
import fs from 'fs';
import path from 'path';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import { useIsoCompliance } from '../hooks/useIsoCompliance';
import { scopeLockReason } from '../utils/isoPayload';

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

const mount = async () => {
  mockDb = makeFakeSupabase({
    iso_standards: [{ id: 's1', org_id: ORG, code: 'ISO 9001', cycle_years: 3 }],
    iso_clauses: [
      { id: 'c1', org_id: ORG, standard_id: 's1', clause_ref: '7.1.5', title: 'Monitoring', status: 'Conformant', applicability: 'Applicable' },
      { id: 'c2', org_id: ORG, standard_id: 's1', clause_ref: '8.5', title: 'Production', status: 'Not assessed', applicability: 'Applicable' },
    ],
    iso_audits: [
      { id: 'a1', org_id: ORG, audit_code: 'IA-2026-001', title: 'Q3', audit_type: 'Internal', status: 'Planned', standard_id: 's1', lead_auditor_name: 'Ada' },
      { id: 'a2', org_id: ORG, audit_code: 'IA-2026-002', title: 'Q4', audit_type: 'Internal', status: 'Reported', standard_id: 's1', lead_auditor_name: 'Ada' },
    ],
    iso_audit_clauses: [
      { id: 'ac-rep', org_id: ORG, audit_id: 'a2', clause_id: 'c1', result: 'Conformant' },
      { id: 'ac-plan', org_id: ORG, audit_id: 'a1', clause_id: 'c2', result: 'Not examined' },
    ],
    iso_findings: [],
    iso_actions: [],
    iso_activity_log: [],
  });
  const view = renderHook(() => useIsoCompliance());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('an ISO audit scope is fixed once Reported', () => {
  it('names the lock for Reported, Closed and Cancelled, and nothing earlier', () => {
    ['Reported', 'Closed', 'Cancelled'].forEach((status) => {
      expect(scopeLockReason({ status })).toMatch(/can no longer be added to or removed from/);
    });
    ['Planned', 'In progress', 'Fieldwork complete'].forEach((status) => {
      expect(scopeLockReason({ status })).toBeNull();
    });
  });

  it('refuses adding a clause to a Reported audit, judged on the stored row, and writes nothing', async () => {
    const { result } = await mount();
    const stale = { ...result.current.audits.find((a) => a.id === 'a2'), status: 'Fieldwork complete' };
    let out;
    await act(async () => {
      out = await result.current.addToScope(stale, ['c2']);
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/reported/);
    expect(mockDb.writes.filter((w) => w.table === 'iso_audit_clauses')).toEqual([]);
  });

  it('refuses removing a clause from a Reported audit, and still allows it on a live one', async () => {
    const { result } = await mount();
    let refused;
    let allowed;
    await act(async () => {
      refused = await result.current.removeFromScope('ac-rep');
    });
    expect(refused.success).toBe(false);
    expect(mockDb.tables.iso_audit_clauses.map((r) => r.id)).toContain('ac-rep');
    await act(async () => {
      allowed = await result.current.removeFromScope('ac-plan');
    });
    expect(allowed.success).toBe(true);
    expect(mockDb.tables.iso_audit_clauses.map((r) => r.id)).not.toContain('ac-plan');
  });

  it('the audit page hides Add clauses and the remove button behind the same rule', () => {
    const page = fs.readFileSync(path.resolve(__dirname, '../AuditDetail.jsx'), 'utf8');
    expect(page).toMatch(/scopeLockReason\(audit\)/);
    expect(page).toMatch(/\{!scopeLocked \? \(\s*<Button size="sm" variant="outline" onClick=\{\(\) => setPicking/);
    expect(page).toMatch(/\{!scopeLocked \? \(\s*<Button size="sm" variant="ghost"[\s\S]{0,200}removeFromScope/);
  });
});
