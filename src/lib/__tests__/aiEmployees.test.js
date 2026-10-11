import {
  canTransition, reviewPatch, listingPreview, taskPreview, parseChapters, weeklyScorecard, weekStart,
  toggledEmployeeStatus, autonomyLabel, pct,
} from '../aiEmployees';

const NOW = new Date('2026-10-14T12:00:00Z'); // a Wednesday
const listingTask = {
  id: 't1', employee_id: 'e1', kind: 'youtube_listing', status: 'proposed', title: 'Loading Well Logs',
  payload: {
    video_key: 'lesson-a1',
    title: 'Loading Well Logs',
    description: 'What is inside a LAS file.\n\nPetrolord Suite: https://petrolord.com',
    chapters: '0:00 Introduction\n0:05 Welcome\n0:40 Inside a LAS file',
    tags: ['LAS file', 'well logs'],
    playlist: 'Petrophysics with Petrolord',
    privacy: 'private',
    scheduled_at: '2026-10-20T09:00:00Z',
    captions_file: null,
  },
};

describe('status transitions', () => {
  test('proposed goes to approved or rejected, approved to done or failed', () => {
    expect(canTransition('proposed', 'approved')).toBe(true);
    expect(canTransition('proposed', 'rejected')).toBe(true);
    expect(canTransition('approved', 'done')).toBe(true);
    expect(canTransition('approved', 'failed')).toBe(true);
  });
  test('negative controls: no skipping review, final states stay final', () => {
    expect(canTransition('proposed', 'done')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
    expect(canTransition('done', 'approved')).toBe(false);
    expect(canTransition('failed', 'approved')).toBe(false);
    expect(canTransition('nonsense', 'approved')).toBe(false);
  });
  test('pause switch: active and paused swap, retired stays retired', () => {
    expect(toggledEmployeeStatus('active')).toBe('paused');
    expect(toggledEmployeeStatus('paused')).toBe('active');
    expect(toggledEmployeeStatus('retired')).toBe('retired');
  });
});

describe('reviewPatch', () => {
  test('approve sets reviewer, time and note, without touching the payload when not edited', () => {
    const p = reviewPatch(listingTask, { decision: 'approve', note: ' Looks right ', reviewerEmail: 'AyoAsaolu@lordswayenergy.com', now: NOW });
    expect(p).toEqual({ status: 'approved', reviewer_email: 'ayoasaolu@lordswayenergy.com', review_note: 'Looks right', reviewed_at: NOW.toISOString() });
  });
  test('approve with edits replaces title and description and marks the payload edited', () => {
    const p = reviewPatch(listingTask, { decision: 'approve', reviewerEmail: 'a@b.co', edits: { title: 'New title', description: 'New body  \n' }, now: NOW });
    expect(p.payload.title).toBe('New title');
    expect(p.payload.description).toBe('New body');
    expect(p.payload.edited_by_reviewer).toBe(true);
    expect(p.payload.chapters).toBe(listingTask.payload.chapters);
    expect(p.title).toBe('New title');
    expect(listingTask.payload.title).toBe('Loading Well Logs'); // input not mutated
  });
  test('unchanged edits do not write a payload', () => {
    const p = reviewPatch(listingTask, { decision: 'approve', reviewerEmail: 'a@b.co', edits: { title: 'Loading Well Logs' }, now: NOW });
    expect(p.payload).toBeUndefined();
  });
  test('reject records the note and ignores edits', () => {
    const p = reviewPatch(listingTask, { decision: 'reject', note: 'Wrong thumbnail', reviewerEmail: 'a@b.co', edits: { title: 'x' }, now: NOW });
    expect(p.status).toBe('rejected');
    expect(p.review_note).toBe('Wrong thumbnail');
    expect(p.payload).toBeUndefined();
  });
  test('negative controls: refuses re-review, missing reviewer, bad decision, empty or long title', () => {
    expect(() => reviewPatch({ ...listingTask, status: 'approved' }, { decision: 'approve', reviewerEmail: 'a@b.co' })).toThrow(/cannot be approved/);
    expect(() => reviewPatch({ ...listingTask, status: 'done' }, { decision: 'reject', reviewerEmail: 'a@b.co' })).toThrow();
    expect(() => reviewPatch(listingTask, { decision: 'approve', reviewerEmail: '' })).toThrow(/email/);
    expect(() => reviewPatch(listingTask, { decision: 'maybe', reviewerEmail: 'a@b.co' })).toThrow();
    expect(() => reviewPatch(listingTask, { decision: 'approve', reviewerEmail: 'a@b.co', edits: { title: '  ' } })).toThrow(/empty/);
    expect(() => reviewPatch(listingTask, { decision: 'approve', reviewerEmail: 'a@b.co', edits: { title: 'x'.repeat(101) } })).toThrow(/100/);
  });
});

describe('payload rendering', () => {
  test('a youtube_listing shows title, description, chapters, tags, playlist, privacy and schedule', () => {
    const pv = taskPreview(listingTask);
    expect(pv.kind).toBe('youtube_listing');
    const l = pv.listing;
    expect(l.title).toBe('Loading Well Logs');
    expect(l.description).toMatch(/petrolord\.com/);
    expect(l.chapters).toEqual([{ t: '0:00', label: 'Introduction' }, { t: '0:05', label: 'Welcome' }, { t: '0:40', label: 'Inside a LAS file' }]);
    expect(l.tags).toEqual(['LAS file', 'well logs']);
    expect(l.playlist).toBe('Petrophysics with Petrolord');
    expect(l.privacy).toBe('private');
    expect(l.scheduledLabel).toBe('2026-10-20 09:00 UTC');
    expect(l.videoKey).toBe('lesson-a1');
  });
  test('missing fields fall back safely: private, not scheduled, comma tags', () => {
    const l = listingPreview({ tags: 'a, b,,c' });
    expect(l.title).toBe('(no title)');
    expect(l.privacy).toBe('private');
    expect(l.scheduledLabel).toBe('Not scheduled');
    expect(l.tags).toEqual(['a', 'b', 'c']);
    expect(l.chapters).toEqual([]);
  });
  test('chapters accept objects and skip junk lines', () => {
    expect(parseChapters([{ t: '1:02:03', label: 'Late' }, 'not a chapter', '12:30 Mid'])).toEqual([{ t: '1:02:03', label: 'Late' }, { t: '12:30', label: 'Mid' }]);
  });
  test('other kinds render as key and value fields', () => {
    const pv = taskPreview({ kind: 'comment_reply', payload: { comment_id: 'c1', reply_text: 'Thanks', meta: { a: 1 } } });
    expect(pv.kind).toBe('generic');
    expect(pv.fields[0]).toEqual(['comment id', 'c1']);
    expect(pv.fields[2][1]).toMatch(/"a": 1/);
  });
});

describe('weekly scorecard', () => {
  test('week starts on Monday UTC', () => {
    expect(weekStart(NOW).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(weekStart(new Date('2026-10-18T23:59:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(weekStart(new Date('2026-10-19T00:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });
  test('counts this week only, and the rejection rate is rejected over reviewed', () => {
    const tasks = [
      { status: 'proposed', created_at: '2026-10-13T10:00:00Z' },
      { status: 'approved', created_at: '2026-10-12T10:00:00Z', reviewed_at: '2026-10-13T10:00:00Z' },
      { status: 'done', created_at: '2026-10-05T10:00:00Z', reviewed_at: '2026-10-12T08:00:00Z', result: { completed_at: '2026-10-13T08:00:00Z' } },
      { status: 'rejected', created_at: '2026-10-12T10:00:00Z', reviewed_at: '2026-10-14T10:00:00Z' },
      { status: 'rejected', created_at: '2026-10-01T10:00:00Z', reviewed_at: '2026-10-02T10:00:00Z' }, // last week
    ];
    const s = weeklyScorecard(tasks, NOW);
    expect(s).toMatchObject({ weekStart: '2026-10-12', proposed: 3, approved: 2, rejected: 1, done: 1 });
    expect(s.rejectionRate).toBeCloseTo(1 / 3);
    expect(pct(s.rejectionRate)).toBe('33%');
  });
  test('no reviews gives no rate', () => {
    const s = weeklyScorecard([], NOW);
    expect(s.rejectionRate).toBeNull();
    expect(pct(s.rejectionRate)).toBe('None reviewed');
  });
  test('autonomy labels', () => {
    expect(autonomyLabel(1)).toBe('Step 1: Shadow');
    expect(autonomyLabel(4)).toBe('Step 4: Autonomous within limits');
  });
});
