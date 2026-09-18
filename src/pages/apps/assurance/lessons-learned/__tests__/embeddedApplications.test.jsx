/**
 * AS13 hardening: an Embedded lesson keeps at least one Adopted or
 * Adapted application. The database checks this only when the status
 * changes, so removing the last one afterwards used to leave the lesson
 * Embedded with nothing behind it.
 */
import fs from 'fs';
import path from 'path';
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import { useLessonsLearned } from '../hooks/useLessonsLearned';
import { canRemoveApplication } from '../utils/lessonPayload';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1' } }),
}));

const ORG = 'org-1';
const substance = { description: 'Pump tripped', root_cause: 'Seal wear', recommendation: 'Inspect seals monthly' };

const mount = async () => {
  mockDb = makeFakeSupabase({
    lesson_records: [
      { id: 'l-emb', org_id: ORG, lesson_code: 'LL-2026-001', title: 'Seals', status: 'Embedded', validated_at: '2026-05-01', validator_name: 'V', ...substance },
      { id: 'l-pub', org_id: ORG, lesson_code: 'LL-2026-002', title: 'Valves', status: 'Published', validated_at: '2026-05-01', validator_name: 'V', ...substance },
    ],
    lesson_applications: [
      { id: 'ap-only', lesson_id: 'l-emb', target_type: 'Procedure', reference: 'SOP-1', outcome: 'Adopted', applied_on: '2026-06-01' },
      { id: 'ap-rej', lesson_id: 'l-emb', target_type: 'Design', reference: 'DB-2', outcome: 'Rejected', applied_on: '2026-06-02' },
      { id: 'ap-pub', lesson_id: 'l-pub', target_type: 'Procedure', reference: 'SOP-3', outcome: 'Adopted', applied_on: '2026-06-03' },
    ],
    lesson_activity_log: [],
    risk_register: [],
    moc_records: [],
  });
  const view = renderHook(() => useLessonsLearned());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

const ids = () => mockDb.tables.lesson_applications.map((a) => a.id);

describe('canRemoveApplication', () => {
  const embedded = { lesson_code: 'LL-1', status: 'Embedded' };
  const adopted = { id: 'a', outcome: 'Adopted' };
  const adapted = { id: 'b', outcome: 'Adapted' };
  const rejected = { id: 'c', outcome: 'Rejected' };

  it('refuses the last Adopted or Adapted application of an Embedded lesson, with a reason', () => {
    const verdict = canRemoveApplication(embedded, adopted, [adopted, rejected]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/only Adopted or Adapted application/);
  });

  it('allows it while another embedding application remains', () => {
    expect(canRemoveApplication(embedded, adopted, [adopted, adapted]).ok).toBe(true);
  });

  it('allows a Rejected one, and any application of a lesson that is not Embedded', () => {
    expect(canRemoveApplication(embedded, rejected, [adopted, rejected]).ok).toBe(true);
    expect(canRemoveApplication({ status: 'Published' }, adopted, [adopted]).ok).toBe(true);
  });
});

describe('the hook refuses it too', () => {
  it('keeps the last embedding application of an Embedded lesson and writes nothing', async () => {
    const { result } = await mount();
    let out;
    await act(async () => { out = await result.current.deleteApplication('ap-only'); });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/LL-2026-001 is Embedded/);
    expect(ids()).toContain('ap-only');
    expect(mockDb.writes.filter((w) => w.op === 'delete')).toEqual([]);
  });

  it('still removes a Rejected application, and one on a Published lesson', async () => {
    const { result } = await mount();
    let a;
    let b;
    await act(async () => { a = await result.current.deleteApplication('ap-rej'); });
    await act(async () => { b = await result.current.deleteApplication('ap-pub'); });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(ids()).toEqual(['ap-only']);
  });
});

it('the lesson page asks the same rule before offering removal', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../LessonDetail.jsx'), 'utf8');
  expect(page).toMatch(/canRemoveApplication\(lesson, a, applications\)/);
  expect(page).toMatch(/setFailure\(removal\.reason\)/);
});
