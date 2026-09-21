/**
 * AS3 — the compliance status authority.
 *
 * Same shape as riskScoring.test.js: unit tests, then a guard that
 * fails if a second copy of the derivation appears anywhere in the app
 * again. The risk register had four copies of its thresholds before AS2
 * took them away; Regulatory Compliance started from zero copies
 * because it had no derivation at all, and the guard is what keeps it
 * at one.
 *
 * Every test pins a date. A status test that calls `new Date()` passes
 * today and fails on a Tuesday in March.
 */
import fs from 'fs';
import path from 'path';
import {
  ATTENTION_STATUSES,
  DEFAULT_LEAD_TIME_DAYS,
  STATUS,
  STATUS_SEVERITY,
  STATUS_TOKENS,
  byUrgency,
  countBy,
  daysUntil,
  deriveStatus,
  explainStatus,
  nextActionDate,
  parseDateOnly,
  rollForward,
  summarise,
  toDateOnlyString,
} from '../complianceStatus';

const TODAY = new Date(2026, 8, 17); // 17 September 2026, local midnight

const obligation = (over = {}) => ({
  lifecycle: 'Active',
  due_date: '2026-12-31',
  ...over,
});

describe('date handling', () => {
  it('parses a date-only string at LOCAL midnight, not UTC', () => {
    // new Date('2026-09-17') is UTC midnight, which is 16 September in
    // every negative offset. An obligation due today would then read
    // overdue for every user west of Greenwich.
    const d = parseDateOnly('2026-09-17');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(0);
  });

  it('counts whole calendar days, signed', () => {
    expect(daysUntil('2026-09-17', TODAY)).toBe(0);
    expect(daysUntil('2026-09-18', TODAY)).toBe(1);
    expect(daysUntil('2026-09-10', TODAY)).toBe(-7);
  });

  it('returns null rather than NaN for a missing or unparseable date', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly('not a date')).toBeNull();
    expect(daysUntil(undefined, TODAY)).toBeNull();
  });

  it('writes a Date back as a date-only string in local terms', () => {
    expect(toDateOnlyString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateOnlyString('2026-01-05')).toBe('2026-01-05');
    expect(toDateOnlyString(null)).toBeNull();
  });
});

describe('the date an obligation counts down to', () => {
  it('is the earlier of the next submission and the permit expiry', () => {
    const o = obligation({ due_date: '2026-11-30', expiry_date: '2026-10-01' });
    expect(toDateOnlyString(nextActionDate(o))).toBe('2026-10-01');
  });

  it('is whichever one exists when only one does', () => {
    expect(toDateOnlyString(nextActionDate(obligation({ due_date: '2026-11-30', expiry_date: null }))))
      .toBe('2026-11-30');
    expect(toDateOnlyString(nextActionDate(obligation({ due_date: null, expiry_date: '2026-11-30' }))))
      .toBe('2026-11-30');
  });

  it('is null when the obligation carries no dates at all', () => {
    expect(nextActionDate(obligation({ due_date: null }))).toBeNull();
  });
});

describe('status derivation', () => {
  it('lets a non-Active lifecycle answer for itself', () => {
    // A superseded obligation with a due date last year is superseded,
    // not overdue. Reporting it as overdue is how a register fills with
    // noise nobody can close.
    const stale = { due_date: '2025-01-01', expiry_date: '2025-01-01' };
    expect(deriveStatus({ ...stale, lifecycle: 'Superseded' }, TODAY)).toBe(STATUS.SUPERSEDED);
    expect(deriveStatus({ ...stale, lifecycle: 'Draft' }, TODAY)).toBe(STATUS.DRAFT);
    expect(deriveStatus({ ...stale, lifecycle: 'Not applicable' }, TODAY)).toBe(STATUS.NOT_APPLICABLE);
  });

  it('treats a missing lifecycle as Active', () => {
    expect(deriveStatus({ due_date: '2025-01-01' }, TODAY)).toBe(STATUS.OVERDUE);
  });

  it('ranks an expired permit above an overdue return', () => {
    // Both are late. If the licence itself has lapsed, when the next
    // report was due is no longer the headline.
    const o = obligation({ due_date: '2026-09-01', expiry_date: '2026-08-01' });
    expect(deriveStatus(o, TODAY)).toBe(STATUS.EXPIRED);
  });

  it('is Overdue the day after the due date and not before', () => {
    expect(deriveStatus(obligation({ due_date: '2026-09-17' }), TODAY)).not.toBe(STATUS.OVERDUE);
    expect(deriveStatus(obligation({ due_date: '2026-09-16' }), TODAY)).toBe(STATUS.OVERDUE);
  });

  it('does not let an old filing clear a currently overdue obligation', () => {
    // The filing that is late is this period's. Evidence from March
    // does not make a September return on time.
    const o = obligation({ due_date: '2026-09-01', last_submitted_date: '2026-03-01' });
    expect(deriveStatus(o, TODAY)).toBe(STATUS.OVERDUE);
  });

  it('is Due soon inside the obligation\'s own lead time', () => {
    const o = obligation({ due_date: '2026-10-01', lead_time_days: 30 });
    expect(deriveStatus(o, TODAY)).toBe(STATUS.DUE_SOON);
  });

  it('honours a per-obligation lead time in both directions', () => {
    // A 7-day incident notification and a 90-day permit renewal are
    // not the same warning, which is why the column exists.
    const due = '2026-10-01'; // 14 days out
    expect(deriveStatus(obligation({ due_date: due, lead_time_days: 7 }), TODAY))
      .not.toBe(STATUS.DUE_SOON);
    expect(deriveStatus(obligation({ due_date: due, lead_time_days: 90 }), TODAY))
      .toBe(STATUS.DUE_SOON);
  });

  it('falls back to the default lead time when the column is absent or junk', () => {
    const due = '2026-10-10'; // 23 days out, inside the 30 day default
    expect(DEFAULT_LEAD_TIME_DAYS).toBe(30);
    expect(deriveStatus(obligation({ due_date: due }), TODAY)).toBe(STATUS.DUE_SOON);
    expect(deriveStatus(obligation({ due_date: due, lead_time_days: null }), TODAY)).toBe(STATUS.DUE_SOON);
    expect(deriveStatus(obligation({ due_date: due, lead_time_days: 'soon' }), TODAY)).toBe(STATUS.DUE_SOON);
  });

  it('warns on an approaching EXPIRY even when the next return is far off', () => {
    // The whole point of carrying two dates. A permit lapsing in three
    // weeks must not hide behind an annual return due in December.
    const o = obligation({ due_date: '2026-12-31', expiry_date: '2026-10-05' });
    expect(deriveStatus(o, TODAY)).toBe(STATUS.DUE_SOON);
  });

  it('never claims Compliant for an obligation with no evidence', () => {
    // "On track" means we are on schedule. "Compliant" means we have
    // actually filed. Collapsing the two is how a register reports a
    // clean bill of health for work nobody has done.
    const o = obligation({ due_date: '2026-12-31' });
    expect(deriveStatus(o, TODAY)).toBe(STATUS.ON_TRACK);
    expect(deriveStatus({ ...o, last_submitted_date: '2026-01-31' }, TODAY)).toBe(STATUS.COMPLIANT);
  });

  it('says so when nothing can fall due', () => {
    expect(deriveStatus(obligation({ due_date: null, expiry_date: null }), TODAY))
      .toBe(STATUS.NO_DATE);
  });

  it('gives every status a reason a user can check', () => {
    const cases = [
      obligation({ due_date: '2026-09-16' }),
      obligation({ expiry_date: '2026-08-01' }),
      obligation({ due_date: '2026-10-01' }),
      obligation({ due_date: '2026-12-31' }),
      obligation({ due_date: '2026-12-31', last_submitted_date: '2026-01-31' }),
      obligation({ due_date: null }),
      obligation({ lifecycle: 'Draft' }),
    ];
    cases.forEach((o) => {
      const { status, reason } = explainStatus(o, TODAY);
      expect(STATUS_SEVERITY).toContain(status);
      expect(reason).toMatch(/\S/);
      expect(reason).not.toMatch(/NaN|undefined|null/);
    });
  });
});

describe('ordering and rollup', () => {
  const register = [
    obligation({ id: 'on-track', due_date: '2027-01-01' }),
    obligation({ id: 'expired', expiry_date: '2026-01-01' }),
    obligation({ id: 'due-soon', due_date: '2026-09-20' }),
    obligation({ id: 'overdue', due_date: '2026-09-01' }),
    obligation({ id: 'draft', lifecycle: 'Draft' }),
  ];

  it('sorts worst first', () => {
    const order = [...register].sort(byUrgency(TODAY)).map((o) => o.id);
    expect(order).toEqual(['expired', 'overdue', 'due-soon', 'on-track', 'draft']);
  });

  it('breaks a tie on the nearer date', () => {
    const a = obligation({ id: 'later', due_date: '2026-09-25' });
    const b = obligation({ id: 'sooner', due_date: '2026-09-19' });
    expect([a, b].sort(byUrgency(TODAY)).map((o) => o.id)).toEqual(['sooner', 'later']);
  });

  it('counts every obligation exactly once', () => {
    const s = summarise(register, TODAY);
    expect(s.total).toBe(register.length);
    expect(Object.values(s.byStatus).reduce((a, b) => a + b, 0)).toBe(register.length);
  });

  it('counts attention as exactly the three statuses that need action', () => {
    expect(summarise(register, TODAY).attention).toBe(3);
    expect(ATTENTION_STATUSES).toEqual([STATUS.EXPIRED, STATUS.OVERDUE, STATUS.DUE_SOON]);
  });

  it('groups by a field and labels the rows that do not say', () => {
    const rows = countBy(
      [{ regime: 'Environmental' }, { regime: 'Environmental' }, { regime: null }],
      'regime',
    );
    expect(rows).toEqual([
      { name: 'Environmental', count: 2 },
      { name: 'Unspecified', count: 1 },
    ]);
  });

  it('gives every status a colour token, so a badge and a slice cannot disagree', () => {
    STATUS_SEVERITY.forEach((s) => expect(STATUS_TOKENS[s]).toMatch(/^--/));
  });
});

describe('rolling the next due date forward after a submission', () => {
  it('rolls from the date that WAS due, never from the filing date', () => {
    // An annual return filed three weeks late is still due on the same
    // day next year. Rolling from the filing date walks the schedule
    // later every single year.
    expect(toDateOnlyString(rollForward('2026-03-31', 'Annual'))).toBe('2027-03-31');
  });

  it('handles every periodic frequency', () => {
    expect(toDateOnlyString(rollForward('2026-01-15', 'Monthly'))).toBe('2026-02-15');
    expect(toDateOnlyString(rollForward('2026-01-15', 'Quarterly'))).toBe('2026-04-15');
    expect(toDateOnlyString(rollForward('2026-01-15', 'Semi-annual'))).toBe('2026-07-15');
    expect(toDateOnlyString(rollForward('2026-01-15', 'Biennial'))).toBe('2028-01-15');
  });

  it('pulls a month-end back instead of overflowing into the next month', () => {
    // Naively, 31 January plus one month is 3 March in a non-leap year.
    expect(toDateOnlyString(rollForward('2026-01-31', 'Monthly'))).toBe('2026-02-28');
    expect(toDateOnlyString(rollForward('2026-05-31', 'Monthly'))).toBe('2026-06-30');
  });

  it('returns null where there is no next occurrence to compute', () => {
    expect(rollForward('2026-01-15', 'One-off')).toBeNull();
    expect(rollForward('2026-01-15', 'Other')).toBeNull();
    expect(rollForward(null, 'Annual')).toBeNull();
  });
});

describe('GUARD: there is only one compliance status authority', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const AUTHORITY = path.join('src', 'lib', 'complianceStatus.js');

  // Scan code, not prose. Without this the guard reads its own
  // explanatory comments as offenders, and worse, it would let a real
  // one hide inside a commented-out block.
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

  const APP = path.join(ROOT, 'src', 'pages', 'apps', 'assurance', 'regulatory-compliance');
  const scanned = [APP, path.join(ROOT, 'src', 'lib')]
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d))
    .filter((f) => !f.endsWith(AUTHORITY));

  it('scans a non-empty set of files, or it proves nothing', () => {
    expect(scanned.length).toBeGreaterThan(5);
  });

  it('no file compares a due date to today on its own', () => {
    // The dashboard used to do exactly this in a forEach, which is how
    // the tile count and the table badge came to disagree.
    const offenders = scanned.filter((f) =>
      /new Date\((?:\w+\.)?(?:due_date|expiry_date)\)\s*<|\bdue_date\b[^\n]*<\s*now\b/.test(codeOf(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('no file writes its own status word list', () => {
    const offenders = scanned.filter((f) => {
      const src = codeOf(f);
      // A map or switch keyed on the status words, i.e. a second
      // opinion about what they mean or how they paint.
      return /['"]Overdue['"]\s*:/.test(src) || /case\s+['"]Overdue['"]/.test(src);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('no file trusts the cached status column instead of deriving', () => {
    // `status` in the database is a cache this module rewrites on save.
    // Reading it back to decide anything is how it comes to drift, the
    // same way risk_register.rating did.
    const offenders = scanned.filter((f) =>
      /\.status\s*===\s*['"](Overdue|Compliant|Expired|Due soon)['"]/.test(codeOf(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it('every file in the app that shows a status imports it from here', () => {
    const showsStatus = scanned.filter(
      (f) => f.startsWith(APP) && /STATUS\b|deriveStatus|summarise/.test(codeOf(f)),
    );
    expect(showsStatus.length).toBeGreaterThan(0);
    showsStatus.forEach((f) => {
      expect(codeOf(f)).toMatch(/complianceStatus/);
    });
  });
});
