/**
 * AS4 — the document control authority.
 *
 * Same shape as riskScoring (AS2) and complianceStatus (AS3): unit
 * tests, then a guard that fails if a second copy of the derivation
 * appears in the app again.
 *
 * Every test pins a date. A review-due test that calls new Date()
 * passes today and fails in three weeks.
 */
import fs from 'fs';
import path from 'path';
import {
  CONFIDENTIALITY_LEVELS,
  DOC_STATUSES,
  REVIEW,
  REVIEW_LEAD_DAYS,
  STATUS_CHART_COLORS,
  STATUS_TOKENS,
  atLeastConfidential,
  byReviewUrgency,
  countBy,
  daysUntil,
  documentPrefix,
  isReviewOverdue,
  nextReviewDate,
  nextRevisionNumber,
  parseDateOnly,
  reviewState,
  summarise,
  toDateOnlyString,
} from '../documentControl';

const TODAY = new Date(2026, 8, 17); // 17 September 2026, local midnight

const doc = (over = {}) => ({ status: 'Published', next_review_date: '2027-01-01', ...over });

describe('dates', () => {
  it('parses a date-only string at LOCAL midnight, not UTC', () => {
    const d = parseDateOnly('2026-09-17');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()])
      .toEqual([2026, 8, 17, 0]);
  });

  it('counts whole calendar days, signed', () => {
    expect(daysUntil('2026-09-17', TODAY)).toBe(0);
    expect(daysUntil('2026-09-10', TODAY)).toBe(-7);
  });

  it('returns null rather than NaN for a missing date', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(toDateOnlyString('nonsense')).toBeNull();
  });
});

describe('review state', () => {
  it('is overdue the day after the review date and not before', () => {
    expect(reviewState(doc({ next_review_date: '2026-09-17' }), TODAY)).not.toBe(REVIEW.OVERDUE);
    expect(reviewState(doc({ next_review_date: '2026-09-16' }), TODAY)).toBe(REVIEW.OVERDUE);
  });

  it('warns inside the lead time', () => {
    expect(REVIEW_LEAD_DAYS).toBe(30);
    expect(reviewState(doc({ next_review_date: '2026-10-10' }), TODAY)).toBe(REVIEW.DUE_SOON);
    expect(reviewState(doc({ next_review_date: '2026-12-01' }), TODAY)).toBe(REVIEW.SCHEDULED);
  });

  it('does not chase a document that is no longer in force', () => {
    // A superseded procedure from 2019 is not work for anybody.
    // Counting it is how a review queue fills with noise nobody can
    // close, which is the same call complianceStatus makes in AS3.
    ['Superseded', 'Obsolete', 'Rejected', 'Draft'].forEach((status) => {
      expect(reviewState(doc({ status, next_review_date: '2019-01-01' }), TODAY))
        .toBe(REVIEW.NOT_APPLICABLE);
      expect(isReviewOverdue(doc({ status, next_review_date: '2019-01-01' }), TODAY)).toBe(false);
    });
  });

  it('says so when a published document has no review scheduled', () => {
    // Silently treating this as fine is how a controlled document goes
    // years without one.
    expect(reviewState(doc({ next_review_date: null }), TODAY)).toBe(REVIEW.NOT_SCHEDULED);
  });

  it('counts an approved document as in force, not only a published one', () => {
    expect(reviewState(doc({ status: 'Approved', next_review_date: '2026-01-01' }), TODAY))
      .toBe(REVIEW.OVERDUE);
  });
});

describe('the review date a document earns when issued', () => {
  it('counts from the ISSUE date, not from today', () => {
    // Re-publishing a correction to a document issued last month must
    // not push its review a further two years out from the correction.
    expect(toDateOnlyString(nextReviewDate('2026-08-15', 24))).toBe('2028-08-15');
  });

  it('pulls a month-end back instead of overflowing', () => {
    expect(toDateOnlyString(nextReviewDate('2026-08-31', 6))).toBe('2027-02-28');
  });

  it('returns null where it cannot be computed', () => {
    expect(nextReviewDate(null, 24)).toBeNull();
    expect(nextReviewDate('2026-08-15', 0)).toBeNull();
    expect(nextReviewDate('2026-08-15', null)).toBeNull();
  });
});

describe('revision numbers', () => {
  it('increments and keeps the width, because a revision is cited as written', () => {
    expect(nextRevisionNumber('01')).toBe('02');
    expect(nextRevisionNumber('09')).toBe('10');
    expect(nextRevisionNumber('099')).toBe('100');
  });

  it('starts a chain at 01 rather than producing NaN', () => {
    expect(nextRevisionNumber(null)).toBe('01');
    expect(nextRevisionNumber('')).toBe('01');
    expect(nextRevisionNumber('Rev A')).toBe('01');
  });
});

describe('confidentiality', () => {
  it('is ordered, so "at least Confidential" means something', () => {
    expect(atLeastConfidential('Restricted')).toBe(true);
    expect(atLeastConfidential('Confidential')).toBe(true);
    expect(atLeastConfidential('Internal')).toBe(false);
    expect(atLeastConfidential('Public')).toBe(false);
    expect(atLeastConfidential(undefined)).toBe(false);
  });
});

describe('rollup', () => {
  const library = [
    doc({ id: 1, status: 'Published', next_review_date: '2025-01-01' }), // overdue
    doc({ id: 2, status: 'Published', next_review_date: '2026-10-01' }), // due soon
    doc({ id: 3, status: 'In Review', next_review_date: null }),
    doc({ id: 4, status: 'Draft', next_review_date: '2019-01-01' }),     // not in force
    doc({ id: 5, status: 'Superseded', next_review_date: '2019-01-01' }),
  ];

  it('counts overdue reviews from the rows, not from a literal', () => {
    // The dashboard tile used to read `overdue: 1`, hardcoded, inside
    // the branch that was otherwise querying the database.
    const s = summarise(library, TODAY);
    expect(s.overdue).toBe(1);
    expect(s.dueSoon).toBe(1);
    expect(s.total).toBe(5);
    expect(s.inReview).toBe(1);
    expect(s.published).toBe(2);
  });

  it('sorts the review queue worst first, and not-in-force last', () => {
    // 3 is In Review and 4 is Draft, so neither is in force and neither
    // is review-due however old its date. The two that ARE in force
    // come first, overdue before due-soon.
    const order = [...library].sort(byReviewUrgency(TODAY)).map((d) => d.id);
    expect(order.slice(0, 2)).toEqual([1, 2]);
    expect(order.slice(2).sort()).toEqual([3, 4, 5]);
  });

  it('groups by a field and labels rows that do not say', () => {
    expect(countBy([{ department: 'HSE' }, { department: null }], 'department'))
      .toEqual([{ name: 'HSE', count: 1 }, { name: 'Unspecified', count: 1 }]);
  });

  it('gives every status a token and a chart colour', () => {
    DOC_STATUSES.forEach((s) => {
      expect(STATUS_TOKENS[s]).toMatch(/^--/);
      expect(STATUS_CHART_COLORS[s]).toMatch(/^#/);
    });
  });
});

describe('document number prefixes', () => {
  it('builds a stable prefix from department and category', () => {
    expect(documentPrefix('HSE', 'Policy')).toBe('HSE-POL');
    expect(documentPrefix('Engineering', 'Drawing')).toBe('ENG-DRA');
  });

  it('falls back rather than emitting an empty segment', () => {
    // '--001' would start a sequence nothing else can ever match.
    expect(documentPrefix('', '')).toBe('GEN-DOC');
    expect(documentPrefix('!!!', 'SOP')).toBe('GEN-SOP');
  });
});

describe('GUARD: there is only one document control authority', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const AUTHORITY = path.join('src', 'lib', 'documentControl.js');

  const codeOf = (file) =>
    fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const walk = (dir, out = []) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '__tests__') return;
        walk(full, out);
      } else if (/\.(js|jsx)$/.test(e.name)) {
        out.push(full);
      }
    });
    return out;
  };

  const APP = path.join(ROOT, 'src', 'pages', 'apps', 'assurance', 'document-control');
  const scanned = [APP, path.join(ROOT, 'src', 'lib')]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d))
    .filter((f) => !f.endsWith(AUTHORITY));

  it('scans a non-empty set of files, or it proves nothing', () => {
    expect(scanned.length).toBeGreaterThan(5);
  });

  it('no file writes its own status or confidentiality colour map', () => {
    // components/StatusBadge.jsx held two of them, each with a silent
    // fall-through to grey for any word it did not recognise. Status
    // was free text, so an unrecognised word was not hypothetical.
    const offenders = scanned.filter((f) => {
      const src = codeOf(f);
      return /case\s+'(published|in review|superseded|confidential|restricted)'/i.test(src);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('no file compares a review date to today on its own', () => {
    const offenders = scanned.filter((f) =>
      /new Date\((?:\w+\.)?next_review_date\)\s*[<>]/.test(codeOf(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('every file in the app that derives a status imports it from here', () => {
    const derives = scanned.filter(
      (f) => f.startsWith(APP) && /reviewState|summarise|nextRevisionNumber|STATUS_TOKENS/.test(codeOf(f)),
    );
    expect(derives.length).toBeGreaterThan(0);
    derives.forEach((f) => expect(codeOf(f)).toMatch(/documentControl/));
  });

  it('the vocabularies match the database constraints added in AS4', () => {
    // If these drift, every insert fails on a check constraint whose
    // name means nothing to the user.
    const migration = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/20260917200000_as4_document_control.sql'), 'utf8');
    DOC_STATUSES.forEach((s) => expect(migration).toContain(`'${s}'`));
    CONFIDENTIALITY_LEVELS.forEach((c) => expect(migration).toContain(`'${c}'`));
  });

  it('the unique constraint the create path relies on is still named', () => {
    // AS4 adds no unique index of its own: it relies on
    // documents_org_id_document_number_key, transcribed from production
    // by AS1. If that is ever dropped, duplicates become possible again
    // and this test is the tripwire.
    const backfill = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/20260916099000_as1_assurance_schema_backfill.sql'), 'utf8');
    expect(backfill).toContain('documents_org_id_document_number_key');
    expect(backfill).toMatch(/UNIQUE \(org_id, document_number\)/);
  });
});
