/**
 * ASC-0 part 2: engines #212 made summarise() skip comments on Closed or
 * Cancelled reviews. The register's per-review open count and the
 * dashboard's blocking list ask the same function, so they agree with the
 * tiles.
 */
import fs from 'fs';
import path from 'path';
import { summarise } from '@/lib/peerReview';
import { countsAsBlocking, openCommentsOf } from '../utils/liveComments';

const TODAY = new Date(2026, 8, 18);
const comment = (id, reviewId, severity, status) => ({ id, review_id: reviewId, severity, status });

const REVIEWS = [
  { id: 'live', stage: 'In Review', comments: [comment('l1', 'live', 'Critical', 'Open'), comment('l2', 'live', 'Minor', 'Verified')] },
  { id: 'cancelled', stage: 'Cancelled', comments: [comment('x1', 'cancelled', 'Critical', 'Open')] },
  { id: 'closed', stage: 'Closed', comments: [comment('c1', 'closed', 'Minor', 'Responded')] },
];
const COMMENTS = REVIEWS.flatMap((r) => r.comments);

describe('openCommentsOf', () => {
  it('counts only what summarise counts', () => {
    expect(REVIEWS.map((r) => openCommentsOf(r, TODAY))).toEqual([1, 0, 0]);
    const total = REVIEWS.reduce((n, r) => n + openCommentsOf(r, TODAY), 0);
    expect(total).toBe(summarise(REVIEWS, COMMENTS, TODAY).openComments);
  });
});

describe('countsAsBlocking', () => {
  const byId = new Map(REVIEWS.map((r) => [r.id, r]));

  it('matches the Blocking closure tile', () => {
    const listed = COMMENTS.filter((c) => countsAsBlocking(c, byId, TODAY)).map((c) => c.id);
    expect(listed).toEqual(['l1']);
    expect(listed).toHaveLength(summarise(REVIEWS, COMMENTS, TODAY).blockingComments);
  });

  it('a comment whose review is unknown still counts, as in summarise', () => {
    expect(countsAsBlocking(comment('u', 'gone', 'Major', 'Open'), byId, TODAY)).toBe(true);
  });
});

describe('the pages use them', () => {
  const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

  it('the register column and CSV', () => {
    const src = read('ReviewRegister.jsx');
    expect(src).toMatch(/'Open comments': openCommentsOf\(r, today\)/);
    expect(src).not.toMatch(/filter\(\(c\) => !isResolved\(c\)\)/);
  });

  it('the dashboard blocking list', () => {
    const src = read('Dashboard.jsx');
    expect(src).toMatch(/countsAsBlocking\(c, byId, today\)/);
    expect(src).not.toMatch(/comments\.filter\(isBlocking\)/);
  });
});
