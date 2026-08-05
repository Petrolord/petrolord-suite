import {
  OFFBOARD_BUCKETS,
  buildCertificateFields,
  chunk,
  confirmNameMatches,
  isUserGoneError,
  makeCertificateNo,
  storagePrefixTargets,
  summarizeReport,
} from '../helpers.js';

describe('confirmNameMatches', () => {
  it('accepts case and whitespace variations of the real name', () => {
    expect(confirmNameMatches('Acme Petroleum Ltd', 'acme  petroleum ltd')).toBe(true);
    expect(confirmNameMatches('Acme Petroleum Ltd', '  ACME Petroleum LTD  ')).toBe(true);
  });

  it('rejects wrong or empty confirmations', () => {
    expect(confirmNameMatches('Acme Petroleum Ltd', 'Acme Petroleum')).toBe(false);
    expect(confirmNameMatches('Acme Petroleum Ltd', '')).toBe(false);
    expect(confirmNameMatches('Acme Petroleum Ltd', undefined)).toBe(false);
  });

  it('never matches an empty organization name', () => {
    expect(confirmNameMatches('', '')).toBe(false);
    expect(confirmNameMatches(null, '')).toBe(false);
  });
});

describe('storagePrefixTargets', () => {
  it('always includes the org export archive, plus per-user data folders', () => {
    const targets = storagePrefixTargets('org-1', ['u1', 'u2']);
    expect(targets[0]).toEqual({ bucket: 'org-exports', prefix: 'org-1' });
    expect(targets).toHaveLength(1 + 2 * OFFBOARD_BUCKETS.length);
    expect(targets).toContainEqual({ bucket: 'seismic', prefix: 'u1' });
    expect(targets).toContainEqual({ bucket: 'surfaces', prefix: 'u2' });
  });

  it('surviving members contribute no targets', () => {
    expect(storagePrefixTargets('org-1', [])).toEqual([{ bucket: 'org-exports', prefix: 'org-1' }]);
  });

  it('riding-along solo orgs contribute their export archives', () => {
    const targets = storagePrefixTargets('org-1', [], ['solo-1', 'solo-2']);
    expect(targets).toEqual([
      { bucket: 'org-exports', prefix: 'org-1' },
      { bucket: 'org-exports', prefix: 'solo-1' },
      { bucket: 'org-exports', prefix: 'solo-2' },
    ]);
  });
});

describe('summarizeReport', () => {
  it('extracts the completion-email numbers', () => {
    const s = summarizeReport({
      rpc: { summary: { total_rows: 120, tables_affected: 14, rows_unshared: 3 } },
      storage: { objects_removed: 42 },
      auth: { deleted: ['a@x.com', 'b@x.com'] },
    });
    expect(s).toEqual({
      totalRows: 120, tablesAffected: 14, rowsUnshared: 3,
      objectsRemoved: 42, accountsDeleted: 2,
    });
  });

  it('degrades to zeros on a missing report', () => {
    expect(summarizeReport(null)).toEqual({
      totalRows: 0, tablesAffected: 0, rowsUnshared: 0, objectsRemoved: 0, accountsDeleted: 0,
    });
  });
});

describe('isUserGoneError', () => {
  it('treats already-deleted users as success on retry', () => {
    expect(isUserGoneError('User not found')).toBe(true);
    expect(isUserGoneError('unexpected 404 from admin api')).toBe(true);
    expect(isUserGoneError('Database error deleting user')).toBe(false);
  });
});

describe('makeCertificateNo', () => {
  it('is deterministic and derived from the request id and purge year', () => {
    expect(makeCertificateNo('ce15b6a5-d44a-4052-a9a2-eb32b83e727c', '2026-08-05T23:00:00Z'))
      .toBe('PLD-DC-2026-CE15B6A5');
    expect(makeCertificateNo('ce15b6a5-d44a-4052-a9a2-eb32b83e727c', '2026-08-05T23:00:00Z'))
      .toBe(makeCertificateNo('ce15b6a5-d44a-4052-a9a2-eb32b83e727c', '2026-08-05T01:00:00Z'));
  });
});

describe('buildCertificateFields', () => {
  const request = {
    id: 'req-1',
    organization_id: 'org-1',
    org_name: 'Acme Petroleum',
    requested_by_email: 'admin@acme.com',
    created_at: '2026-07-01T00:00:00Z',
    effective_at: '2026-07-31T00:00:00Z',
    purged_at: '2026-07-31T09:00:00Z',
    verification_code: 'super-secret-code',
    purge_report: {
      rpc: {
        summary: { total_rows: 42, tables_affected: 7, rows_unshared: 2 },
        extra_orgs: [{ id: 'x', name: 'someone@acme.com' }],
      },
      storage: { objects_removed: 5 },
      auth: { deleted: ['a@acme.com'] },
    },
  };

  it('assembles the attested facts from the surviving audit row', () => {
    const f = buildCertificateFields(request, 'PLD-DC-2026-ABCD1234');
    expect(f.certificate_no).toBe('PLD-DC-2026-ABCD1234');
    expect(f.organization_name).toBe('Acme Petroleum');
    expect(f.summary).toEqual({
      totalRows: 42, tablesAffected: 7, rowsUnshared: 2, objectsRemoved: 5, accountsDeleted: 1,
    });
    expect(f.extra_org_names).toEqual(['someone@acme.com']);
  });

  it('never includes the verification code', () => {
    const f = buildCertificateFields(request, 'PLD-DC-2026-ABCD1234');
    expect(JSON.stringify(f)).not.toContain('super-secret-code');
  });
});

describe('chunk', () => {
  it('splits into fixed-size batches', () => {
    expect(chunk(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
  });
});
