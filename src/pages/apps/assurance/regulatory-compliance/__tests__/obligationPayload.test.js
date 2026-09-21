/**
 * AS3 — what actually reaches the database.
 *
 * The AS2 riskPayload test, for the same failure. The risk register's
 * create flow was broken for everyone because the form collected two
 * fields that were not columns and PostgREST rejects an insert naming
 * a column that does not exist. The four "live" risks had been seeded.
 *
 * Regulatory Compliance could not fail that way, because it had no
 * create flow at all. It has one now, and this is what keeps the same
 * class of defect from arriving with the next field somebody adds.
 */
import { STATUS, deriveStatus } from '@/lib/complianceStatus';
import {
  AS3_OBLIGATION_COLUMNS,
  OBLIGATION_WRITABLE_COLUMNS,
  buildAuthorityWrite,
  buildObligationWrite,
  nextCodeFromExisting,
  validateAuthority,
  validateObligation,
} from '../utils/obligationPayload';

const TODAY = new Date(2026, 8, 17);

describe('the obligation write', () => {
  it('writes only real columns', () => {
    const { row } = buildObligationWrite({
      title: 'Annual discharge return',
      due_date: '2026-12-31',
    }, { today: TODAY });
    Object.keys(row).forEach((k) => {
      expect(OBLIGATION_WRITABLE_COLUMNS).toContain(k);
    });
  });

  it('reports a field with no home instead of sending it', () => {
    // This is the tripwire. `tags` on the risk form went straight into
    // the insert and broke every create, silently, for months.
    const { row, dropped } = buildObligationWrite({
      title: 'x', due_date: '2026-12-31', tags: 'HSE',
    }, { today: TODAY });
    expect(row.tags).toBeUndefined();
    expect(dropped).toEqual(['tags']);
  });

  it('does not treat the joined authority or evidence as columns', () => {
    const { row, dropped } = buildObligationWrite({
      title: 'x',
      due_date: '2026-12-31',
      authority: { id: 'a', name: 'NUPRC' },
      evidence: [{ id: 'e' }],
      id: 'row-id',
      org_id: 'org',
    }, { today: TODAY });
    expect(row.authority).toBeUndefined();
    expect(row.evidence).toBeUndefined();
    expect(dropped).toEqual([]);
  });

  it('turns an empty form field into null, not an empty string', () => {
    // '' into a date column is a Postgres error, and into a checked
    // text column it fails the vocabulary constraint.
    const { row } = buildObligationWrite({
      title: 'x', due_date: '2026-12-31', expiry_date: '', regime: '', facility: '',
    }, { today: TODAY });
    expect(row.expiry_date).toBeNull();
    expect(row.regime).toBeNull();
    expect(row.facility).toBeNull();
  });

  it('derives status on save rather than taking it from the form', () => {
    // A user could otherwise type Compliant onto a lapsed permit, which
    // is exactly what the free text column allowed.
    const { row } = buildObligationWrite({
      title: 'x',
      due_date: '2026-01-01',
      status: 'Compliant',
      lifecycle: 'Active',
    }, { today: TODAY });
    expect(row.status).toBe(STATUS.OVERDUE);
  });

  it('keeps the cached status in step with the authority', () => {
    const form = { title: 'x', expiry_date: '2026-08-01', lifecycle: 'Active' };
    const { row } = buildObligationWrite(form, { today: TODAY });
    expect(row.status).toBe(deriveStatus(form, TODAY));
  });

  it('omits the AS3 columns while the migration is unapplied', () => {
    // Production applies are owner-run and held, so this is the state
    // the front end ships in. It has to work against both shapes.
    const form = {
      title: 'x', due_date: '2026-12-31', regime: 'Environmental',
      expiry_date: '2027-01-01', lead_time_days: 60, lifecycle: 'Active',
    };
    const { row } = buildObligationWrite(form, { hasAs3Columns: false, today: TODAY });
    AS3_OBLIGATION_COLUMNS.forEach((c) => expect(row[c]).toBeUndefined());
    expect(row.title).toBe('x');
    expect(row.due_date).toBe('2026-12-31');
    // Status is still derived from the full form, including the dates
    // that are not being written.
    expect(row.status).toBe(deriveStatus(form, TODAY));
  });

  it('normalises a numeric field typed as text', () => {
    const { row } = buildObligationWrite({
      title: 'x', due_date: '2026-12-31', lead_time_days: '45',
    }, { today: TODAY });
    expect(row.lead_time_days).toBe(45);
  });
});

describe('the authority write', () => {
  it('writes only real columns and reports the rest', () => {
    const { row, dropped } = buildAuthorityWrite({ name: 'NUPRC', invented: 'x' });
    expect(row.name).toBe('NUPRC');
    expect(dropped).toEqual(['invented']);
  });

  it('omits the AS3 columns while the migration is unapplied', () => {
    const { row } = buildAuthorityWrite(
      { name: 'NUPRC', website: 'https://x', notes: 'n' },
      { hasAs3Columns: false },
    );
    expect(row.website).toBeUndefined();
    expect(row.notes).toBeUndefined();
  });
});

describe('validation', () => {
  it('requires a title', () => {
    expect(validateObligation({ due_date: '2026-12-31' }).title).toBeTruthy();
    expect(validateObligation({ title: '   ', due_date: '2026-12-31' }).title).toBeTruthy();
  });

  it('requires at least one date, or nothing can ever fall due', () => {
    expect(validateObligation({ title: 'x' }).due_date).toBeTruthy();
    expect(validateObligation({ title: 'x', expiry_date: '2026-12-31' }).due_date).toBeUndefined();
  });

  it('rejects an expiry before the effective date', () => {
    // The database has the same check. Catching it on the form means
    // the user sees which field is wrong instead of a constraint name.
    const errors = validateObligation({
      title: 'x', effective_date: '2026-12-31', expiry_date: '2026-01-01',
    });
    expect(errors.expiry_date).toBeTruthy();
  });

  it('requires a regulator name and checks an email that was typed', () => {
    expect(validateAuthority({}).name).toBeTruthy();
    expect(validateAuthority({ name: 'x', email: 'nope' }).email).toBeTruthy();
    expect(validateAuthority({ name: 'x', email: 'a@b.co' }).email).toBeUndefined();
    expect(validateAuthority({ name: 'x' }).email).toBeUndefined();
  });
});

describe('the fallback obligation code', () => {
  it('starts at REG-1001 on an empty register', () => {
    expect(nextCodeFromExisting([])).toBe('REG-1001');
  });

  it('takes the highest existing code, not the count', () => {
    // A register with a deleted row would otherwise reissue a code
    // somebody has already quoted to a regulator.
    expect(nextCodeFromExisting([
      { obligation_code: 'REG-1001' },
      { obligation_code: 'REG-1007' },
      { obligation_code: null },
    ])).toBe('REG-1008');
  });

  it('ignores codes that are not in the REG- sequence', () => {
    expect(nextCodeFromExisting([{ obligation_code: 'LEGACY-9' }])).toBe('REG-1001');
  });
});
