/**
 * AS13 — the Lessons Learned hook, run against an in-memory database,
 * for the repairs that live in the hook.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeFakeSupabase } from '../../shared/__tests__/fakeSupabase';
import { useLessonsLearned } from '../hooks/useLessonsLearned';
import { withAuthor } from '../utils/lessonPayload';
import { canValidate } from '@/lib/lessonsLearned';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({
    organization: { id: 'org-1' },
    user: { id: 'user-1', email: 'me@example.com', user_metadata: { full_name: 'Mo Capturer' } },
  }),
}));

const ORG = 'org-1';
const substance = { description: 'Pump tripped', root_cause: 'Seal wear', recommendation: 'Inspect seals monthly' };
const seed = () => ({
  lesson_records: [
    { id: 'l-pub', org_id: ORG, lesson_code: 'LL-2026-001', title: 'Old', status: 'Published', validated_at: '2026-05-01', validator_name: 'V', published_at: '2026-05-02', ...substance },
    { id: 'l-new', org_id: ORG, lesson_code: 'LL-2026-002', title: 'Replacement', status: 'Draft', ...substance },
    { id: 'l-val', org_id: ORG, lesson_code: 'LL-2026-003', title: 'Validated', status: 'Validated', validated_at: '2026-06-01', validated_by: 'user-9', ...substance },
    { id: 'l-draft', org_id: ORG, lesson_code: 'LL-2026-004', title: 'Captured in error', status: 'Draft' },
  ],
  lesson_applications: [
    { id: 'ap1', lesson_id: 'l-pub', target_type: 'Procedure', reference: 'SOP-1', outcome: 'Adopted', applied_on: '2026-06-01' },
  ],
  lesson_activity_log: [],
  risk_register: [],
  moc_records: [],
});

const setup = async () => {
  mockDb = makeFakeSupabase(seed());
  const view = renderHook(() => useLessonsLearned());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

const row = (id) => mockDb.tables.lesson_records.find((l) => l.id === id);

describe('AS13 repairs in useLessonsLearned', () => {
  it('marks a lesson Superseded once the replacing lesson is named (defect 19)', async () => {
    const { result } = await setup();
    let out;
    const lesson = result.current.lessons.find((l) => l.id === 'l-pub');
    await act(async () => { out = await result.current.advanceLesson(lesson, 'Superseded'); });
    expect(out.success).toBe(false);
    await act(async () => {
      out = await result.current.advanceLesson(lesson, 'Superseded', { superseded_by: 'l-new' });
    });
    expect(out.success).toBe(true);
    expect(row('l-pub')).toMatchObject({ status: 'Superseded', superseded_by: 'l-new' });
  });

  it('a blank author is the user by id and by name (defect 20)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.createLesson({ title: 'New one', description: 'x', author_name: '' });
    });
    expect(out.success).toBe(true);
    expect(out.data).toMatchObject({ author_id: 'user-1', author_name: 'Mo Capturer', created_by: 'user-1' });
  });

  it('a typed author is that person, not the capturing user (defect 20)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.createLesson({ title: 'Told to me', description: 'x', author_name: 'Field Engineer' });
    });
    expect(out.data.author_id ?? null).toBeNull();
    expect(out.data.author_name).toBe('Field Engineer');
  });

  it('a picked member author is guarded by the independence rule (defect 20)', () => {
    const lesson = { ...substance, ...withAuthor({ author_id: 'user-7', author_name: 'Seven' }, 'user-1', 'Mo') };
    expect(canValidate(lesson, 'user-7').ok).toBe(false);
    expect(canValidate(lesson, 'user-2').ok).toBe(true);
  });

  it('refuses to delete a published lesson, and deletes a draft captured in error (defect 22)', async () => {
    const { result } = await setup();
    let out;
    await act(async () => { out = await result.current.deleteLesson('l-pub'); });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Archive it with a reason/);
    expect(mockDb.tables.lesson_applications).toHaveLength(1);
    await act(async () => { out = await result.current.deleteLesson('l-draft'); });
    expect(out.success).toBe(true);
    expect(row('l-draft')).toBeUndefined();
  });

  it('editing a validated lesson sends it back for validation (defect 24)', async () => {
    const { result } = await setup();
    let out;
    const lesson = result.current.lessons.find((l) => l.id === 'l-val');
    await act(async () => {
      out = await result.current.editLesson(lesson, { recommendation: 'Inspect seals weekly' });
    });
    expect(out.success).toBe(true);
    expect(row('l-val')).toMatchObject({
      status: 'Submitted', validated_at: null, validated_by: null, validator_name: null,
      recommendation: 'Inspect seals weekly',
    });
  });

  it('a published lesson is not rewritten in place (defect 24)', async () => {
    const { result } = await setup();
    let out;
    const lesson = result.current.lessons.find((l) => l.id === 'l-pub');
    await act(async () => {
      out = await result.current.editLesson(lesson, { recommendation: 'Something else' });
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Superseded/);
    expect(row('l-pub').recommendation).toBe('Inspect seals monthly');
  });
});
