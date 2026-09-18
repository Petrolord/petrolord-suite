/**
 * AS13 — the review workflow Document Control never had.
 *
 * Nothing in the app inserted into doc_workflows, so the approval queue
 * could never be populated; a decision changed the workflow row and not
 * the document; Publish was offered with no review decision; and a
 * Published document could never be published again, so a revision could
 * not reset its issue and review dates.
 */
import fs from 'fs';
import path from 'path';
import {
  buildWorkflowRows,
  canPublish,
  canStartRevision,
  canSubmitForReview,
  currentRevisionOf,
  documentStatusAfterReview,
  reviewOutcome,
  validateRetirement,
  validateReviewers,
} from '../utils/documentPayload';

const APP = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const code = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const doc = (status, revStatus, extra = {}) => ({
  id: 'd1',
  status,
  current_revision: '02',
  revisions: [
    { id: 'r1', revision_number: '01', status: 'Published', is_current: false },
    { id: 'r2', revision_number: '02', status: revStatus, is_current: true },
  ],
  ...extra,
});

describe('which revision a review acts on', () => {
  it('the flagged current revision', () => {
    expect(currentRevisionOf(doc('Draft', 'Draft')).id).toBe('r2');
  });

  it('before migration 20260917200000 (no is_current), the revision numbered on the document', () => {
    const d = doc('Draft', 'Draft');
    d.revisions = d.revisions.map(({ is_current: _ignored, ...r }) => r);
    d.current_revision = '01';
    expect(currentRevisionOf(d).id).toBe('r1');
  });

  it('none when there are no revisions', () => {
    expect(currentRevisionOf({ revisions: [] })).toBeNull();
  });
});

describe('sending a revision for review', () => {
  it('needs at least one reviewer, each with a role, each once', () => {
    expect(validateReviewers([])).toMatch(/at least one/);
    expect(validateReviewers([{ reviewer_id: '', role: 'Reviewer' }])).toMatch(/at least one/);
    expect(validateReviewers([{ reviewer_id: 'u1', role: ' ' }])).toMatch(/role/);
    expect(validateReviewers([{ reviewer_id: 'u1', role: 'A' }, { reviewer_id: 'u1', role: 'B' }]))
      .toMatch(/once/);
    expect(validateReviewers([{ reviewer_id: 'u1', role: 'Reviewer' }])).toBeNull();
  });

  it('makes one Pending doc_workflows row per reviewer, with the columns that table requires', () => {
    const rows = buildWorkflowRows('r2', [
      { reviewer_id: 'u1', role: 'Reviewer' }, { reviewer_id: 'u2', role: ' Approver ' },
    ], '2026-10-01');
    expect(rows).toEqual([
      { revision_id: 'r2', reviewer_id: 'u1', role: 'Reviewer', status: 'Pending', due_date: '2026-10-01' },
      { revision_id: 'r2', reviewer_id: 'u2', role: 'Approver', status: 'Pending', due_date: '2026-10-01' },
    ]);
  });

  it('is offered for a Draft or Rejected revision with no review pending', () => {
    expect(canSubmitForReview(doc('Draft', 'Draft'))).toBe(true);
    expect(canSubmitForReview(doc('Rejected', 'Rejected'))).toBe(true);
    // A document registered as In Review before AS13 has no review task;
    // it can be sent properly now.
    expect(canSubmitForReview(doc('In Review', 'In Review'), [])).toBe(true);
  });

  it('is not offered while a review is pending, or once approved', () => {
    expect(canSubmitForReview(doc('In Review', 'In Review'), [{ revision_id: 'r2', status: 'Pending' }]))
      .toBe(false);
    expect(canSubmitForReview(doc('Approved', 'Approved'))).toBe(false);
    expect(canSubmitForReview(doc('Obsolete', 'Draft'))).toBe(false);
  });

  it('a new revision cannot start while the current one is out for review', () => {
    expect(canStartRevision(doc('In Review', 'In Review'), [{ revision_id: 'r2', status: 'Pending' }]))
      .toBe(false);
    expect(canStartRevision(doc('Published', 'Published'), [])).toBe(true);
  });
});

describe('a decision moves the revision and the document', () => {
  it('any rejection rejects; approval needs every reviewer', () => {
    expect(reviewOutcome([{ status: 'Approved' }, { status: 'Pending' }])).toBe('In Review');
    expect(reviewOutcome([{ status: 'Approved' }, { status: 'Rejected' }])).toBe('Rejected');
    expect(reviewOutcome([{ status: 'Approved' }, { status: 'Approved' }])).toBe('Approved');
    expect(reviewOutcome([])).toBe('In Review');
  });

  it('an unpublished document follows its revision', () => {
    expect(documentStatusAfterReview({ status: 'In Review' }, 'Approved')).toBe('Approved');
    expect(documentStatusAfterReview({ status: 'In Review' }, 'Rejected')).toBe('Rejected');
  });

  it('a Published document stays Published while its next revision is reviewed', () => {
    expect(documentStatusAfterReview({ status: 'Published' }, 'In Review')).toBe('Published');
    expect(documentStatusAfterReview({ status: 'Published' }, 'Approved')).toBe('Published');
  });
});

describe('publishing needs a review decision, and can re-issue', () => {
  it('is not offered on a Draft, In Review or Rejected revision', () => {
    expect(canPublish(doc('Draft', 'Draft'))).toBe(false);
    expect(canPublish(doc('In Review', 'In Review'))).toBe(false);
    expect(canPublish(doc('Rejected', 'Rejected'))).toBe(false);
  });

  it('is offered for an approved revision', () => {
    expect(canPublish(doc('Approved', 'Approved'))).toBe(true);
  });

  it('is offered again on a Published document once its new revision is approved', () => {
    // Publish was hidden whenever status was Published, so a revised
    // document could never reset its issue and review dates.
    expect(canPublish(doc('Published', 'Approved'))).toBe(true);
    expect(canPublish(doc('Published', 'Published'))).toBe(false);
  });

  it('is not offered on a withdrawn document', () => {
    expect(canPublish(doc('Obsolete', 'Approved'))).toBe(false);
  });

  it('the hook refuses to publish an unapproved revision and resets the dates when it does', () => {
    const hook = code('hooks/useDocumentControl.js');
    const issue = /const issueDocument = async[\s\S]*?\n  };/.exec(hook)[0];
    expect(issue).toMatch(/Only an approved revision can be published/);
    expect(issue).toMatch(/issue_date: issued/);
    expect(issue).toMatch(/next_review_date: review/);
  });
});

describe('withdrawing a document', () => {
  it('Superseded needs the document that replaced it, and not itself', () => {
    expect(validateRetirement({ status: 'Superseded' }, { id: 'd1' })).toMatch(/Choose the document/);
    expect(validateRetirement({ status: 'Superseded', superseded_by: 'd1' }, { id: 'd1' })).toMatch(/itself/);
    expect(validateRetirement({ status: 'Superseded', superseded_by: 'd2' }, { id: 'd1' })).toBeNull();
    expect(validateRetirement({ status: 'Obsolete' }, { id: 'd1' })).toBeNull();
    expect(validateRetirement({ status: 'Published' }, { id: 'd1' })).toMatch(/Superseded or Obsolete/);
  });
});

describe('the app wires the workflow end to end', () => {
  const hook = code('hooks/useDocumentControl.js');

  it('something inserts into doc_workflows', () => {
    expect(hook).toMatch(/from\('doc_workflows'\)\.insert\(/);
  });

  it('a decision updates the revision and the document, not only the workflow row', () => {
    const decide = /const decideWorkflow = async[\s\S]*?\n  };/.exec(hook)[0];
    expect(decide).toMatch(/reviewOutcome\(/);
    expect(decide).toMatch(/from\('doc_revisions'\)\.update\(/);
    expect(decide).toMatch(/updateDocument\(/);
  });

  it('Submit for review on the New document page creates the review tasks', () => {
    const page = code('NewDocument.jsx');
    expect(page).toMatch(/await submitForReview\(/);
    expect(page).toMatch(/validateReviewers\(review\.reviewers\)/);
    expect(page).not.toMatch(/status: submitForReview \? 'In Review' : 'Draft'/);
  });

  it('the document page gates Publish on a review decision', () => {
    const page = code('DocumentDetail.jsx');
    expect(page).toMatch(/canPublish\(doc\)/);
    expect(page).not.toMatch(/doc\.status !== 'Published' && !issuing/);
  });

  it('the Activity tab reads the document\'s whole history, not the library-wide capped list', () => {
    const page = code('DocumentDetail.jsx');
    expect(page).toMatch(/activityForDocument\(id\)/);
    expect(page).not.toMatch(/activity\.filter\(\(a\) => a\.document_id === doc\.id\)/);
    const fn = /const activityForDocument = useCallback[\s\S]*?\}, \[\]\);/.exec(hook)[0];
    expect(fn).not.toMatch(/\.limit\(/);
  });
});
