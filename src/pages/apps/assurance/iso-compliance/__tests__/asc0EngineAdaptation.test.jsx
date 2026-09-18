/**
 * ASC-0 part 2: the ISO app against engines #212.
 *
 * canSetClauseStatus takes the register's standard as a fourth argument
 * and cites that standard, so the hook and the clause register pass it.
 * certificateExpiring no longer covers a lapsed certificate, so the
 * Standards page flags the date on either state.
 */
import fs from 'fs';
import path from 'path';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import { useIsoCompliance } from '../hooks/useIsoCompliance';
import { certificateDaysText, certificateFlagged, certificateState } from '../utils/isoPayload';
import { certificationReadiness } from '@/lib/isoCompliance';

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
  iso_standards: [
    { id: 's9', org_id: ORG, code: 'ISO 9001', cycle_years: 3 },
    { id: 's14', org_id: ORG, code: 'ISO 14001', cycle_years: 3 },
  ],
  iso_clauses: [
    { id: 'c9', org_id: ORG, standard_id: 's9', clause_ref: '8.3', title: 'Design', status: 'Not assessed', applicability: 'Applicable' },
    { id: 'c14', org_id: ORG, standard_id: 's14', clause_ref: '6.1', title: 'Risk', status: 'Not assessed', applicability: 'Applicable' },
  ],
  iso_audits: [], iso_audit_clauses: [], iso_findings: [], iso_actions: [], iso_activity_log: [],
});

const setup = async () => {
  mockDb = makeFakeSupabase(seed());
  const view = renderHook(() => useIsoCompliance());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

const excludeWithoutReason = async (result, clauseId) => {
  let out;
  await act(async () => {
    out = await result.current.assessClause(
      result.current.clauses.find((c) => c.id === clauseId), 'Not applicable',
      { applicability: 'Not applicable' });
  });
  return out;
};

describe('the clause gate names the register\'s standard', () => {
  it('an ISO 9001 clause cites ISO 9001 §4.3', async () => {
    const { result } = await setup();
    const out = await excludeWithoutReason(result, 'c9');
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/ISO 9001 §4\.3/);
  });

  it('an ISO 14001 clause names ISO 14001 and cites no 9001 clause', async () => {
    const { result } = await setup();
    const out = await excludeWithoutReason(result, 'c14');
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/ISO 14001/);
    expect(out.error).not.toMatch(/4\.3/);
  });

  it('the clause register passes the standard to its preview gate too', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../ClauseRegister.jsx'), 'utf8');
    expect(src).toMatch(/canSetClauseStatus\(assessing, assessment\.status, patch,\s*standards\.find/);
  });
});

describe('certificate display', () => {
  const today = new Date(2026, 8, 18);
  const readiness = (expires) => certificationReadiness(
    { id: 's', code: 'ISO 9001', certificate_expires: expires, cycle_years: 3 },
    { clauses: [], findings: [], actions: [], audits: [], auditClauses: [] }, today);

  it('a lapsed certificate is expired only, and still flagged', () => {
    const { counts } = readiness('2026-09-01');
    expect(counts.certificateExpiring).toBe(false);
    expect(counts.certificateExpired).toBe(true);
    expect(certificateFlagged(counts)).toBe(true);
    expect(certificateState(counts)).toBe('Expired');
  });

  it('a certificate inside 90 days is expiring and flagged', () => {
    const { counts } = readiness('2026-10-01');
    expect(certificateFlagged(counts)).toBe(true);
    expect(certificateState(counts)).toBe('Expiring soon');
  });

  it('one far off is neither', () => {
    expect(certificateFlagged(readiness('2027-09-01').counts)).toBe(false);
  });

  it('the day count reads today, singular and plural', () => {
    expect(certificateDaysText(0)).toBe(' (today)');
    expect(certificateDaysText(1)).toBe(' (in 1 day)');
    expect(certificateDaysText(-3)).toBe(' (3 days ago)');
    expect(certificateDaysText(null)).toBe('');
  });

  it('the Standards page flags on either state', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../Standards.jsx'), 'utf8');
    expect(src).toMatch(/certificateFlagged\(readiness\.counts\)/);
    expect(src).not.toMatch(/className=\{readiness\.counts\.certificateExpiring/);
  });
});
