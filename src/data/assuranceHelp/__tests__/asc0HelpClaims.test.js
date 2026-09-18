/**
 * ASC-0 part 2: the help statements engines #212 changed, each held to the
 * engine behaviour that makes it true.
 */
import { ASSURANCE_HELP } from '..';
import { isOverdue as isMocOverdue } from '@/lib/managementOfChange';
import { isReviewOverdue, RISK_LIVE_STATUSES } from '@/lib/riskScoring';
import { explainStatus } from '@/lib/complianceStatus';
import { summarise as summarisePeer } from '@/lib/peerReview';
import { programmeProgress, summarise as summariseAudits } from '@/lib/auditManagement';
import { planProgress } from '@/lib/qualityAssurance';

const textOf = (g) => [
  g.title, g.summary,
  ...g.sections.flatMap((s) => [s.title, ...(s.paragraphs || []), ...(s.bullets || []), ...(s.steps || [])]),
  ...g.glossary.flatMap((t) => [t.term, t.definition]),
].join('\n');

const TODAY = new Date(2026, 9, 1);

describe('MOC: a change in Implementation is not overdue', () => {
  it('the engine', () => {
    const late = { target_implementation_date: '2026-09-20' };
    expect(isMocOverdue({ ...late, stage: 'Approval' }, TODAY)).toBe(true);
    expect(isMocOverdue({ ...late, stage: 'Implementation' }, TODAY)).toBe(false);
  });

  it('the guides', () => {
    expect(textOf(ASSURANCE_HELP.moc)).not.toMatch(/overdue when it is at Draft to Implementation/);
    expect(textOf(ASSURANCE_HELP.moc)).toMatch(/at Draft, Screening, Review or Approval and its target implementation date has passed/);
    expect(textOf(ASSURANCE_HELP.hub)).toMatch(/A change at Draft, Screening, Review or Approval past its target implementation date/);
  });
});

describe('Risk: only a live risk is review overdue', () => {
  it('the engine', () => {
    RISK_LIVE_STATUSES.forEach((status) => {
      expect(isReviewOverdue({ status, next_review_date: '2026-09-01' }, TODAY)).toBe(true);
    });
    ['Draft', 'Closed'].forEach((status) => {
      expect(isReviewOverdue({ status, next_review_date: '2026-09-01' }, TODAY)).toBe(false);
    });
  });

  it('the guides', () => {
    expect(textOf(ASSURANCE_HELP.risk)).toMatch(/a Draft or Closed risk is never review overdue/);
    expect(textOf(ASSURANCE_HELP.hub)).toMatch(/A live risk, document or lesson review past due/);
  });
});

describe('Regulatory: a filed One-off says nothing further is due', () => {
  it('the engine', () => {
    const { status, reason } = explainStatus({
      frequency: 'One-off', lifecycle: 'Active', due_date: '2026-08-01',
      last_submitted_date: '2026-07-20',
    }, TODAY);
    expect(status).toBe('Compliant');
    expect(reason).toBe('Filed 2026-07-20. A one-off obligation, nothing further is due.');
    expect(reason).not.toMatch(/-\d+ days/);
  });

  it('the guide', () => {
    expect(textOf(ASSURANCE_HELP.regulatory)).toMatch(/nothing further is due/);
  });
});

describe('Peer review: finished reviews hold no open or blocking comments', () => {
  it('the engine', () => {
    const s = summarisePeer([{ id: 'a', stage: 'Cancelled' }],
      [{ review_id: 'a', severity: 'Critical', status: 'Open' }], TODAY);
    expect(s.openComments).toBe(0);
    expect(s.blockingComments).toBe(0);
  });

  it('the guide', () => {
    const t = textOf(ASSURANCE_HELP.peerReview);
    expect(t).not.toMatch(/including cancelled ones/);
    expect(t).toMatch(/Neither counts comments on a Closed or Cancelled review/);
  });
});

describe('Percentages round half up', () => {
  it('the engine: 1 of 8 is 13 and 7 of 8 is 88', () => {
    const plan = (resolved, total) => Array.from({ length: total }, (_, i) => ({
      status: i < resolved ? 'Passed' : 'Pending',
    }));
    expect(planProgress(plan(1, 8)).percent).toBe(13);
    const audits = (reported, total) => Array.from({ length: total }, (_, i) => ({
      id: `a${i}`, status: i < reported ? 'Reported' : 'Planned',
    }));
    expect(programmeProgress(audits(7, 8), TODAY).percent).toBe(88);
  });

  it('the guides', () => {
    expect(textOf(ASSURANCE_HELP.quality)).toMatch(/rounded half up to a whole percent/);
    expect(textOf(ASSURANCE_HELP.audits)).toMatch(/rounded half up to a whole percent/);
  });
});

describe('Audits: an unexplained cancellation is still outstanding', () => {
  it('the engine', () => {
    const s = summariseAudits({ audits: [{ id: 'a', status: 'Cancelled' }] }, TODAY);
    expect(s.auditsOutstanding).toBe(1);
  });

  it('the guide', () => {
    expect(textOf(ASSURANCE_HELP.audits)).toMatch(/a cancellation with no written reason still counts as outstanding/);
  });
});

describe('Peer review: the author never takes a reviewer step (D1)', () => {
  // eslint-disable-next-line global-require
  const { canActOnComment, canAssignPeerReviewer } = require('@/lib/peerReview');
  const review = { author_id: 'a' };

  it('the engine', () => {
    expect(canAssignPeerReviewer(review, { user_id: 'a', role: 'Reviewer' }).ok).toBe(false);
    ['Verified', 'Rejected', 'Withdrawn'].forEach((to) => {
      const c = { status: to === 'Withdrawn' ? 'Open' : 'Responded', response_text: 'x' };
      expect(canActOnComment(c, to, review, 'a').ok).toBe(false);
    });
    expect(canActOnComment({ status: 'Open' }, 'Responded', review, 'a').ok).toBe(true);
  });

  it('the guide', () => {
    const t = textOf(ASSURANCE_HELP.peerReview);
    expect(t).not.toMatch(/does not check who presses a button/);
    expect(t).toMatch(/The author of the work cannot take a reviewer's step/);
    expect(t).toMatch(/The author cannot be a Lead Reviewer or a Reviewer on their own work/);
  });
});
