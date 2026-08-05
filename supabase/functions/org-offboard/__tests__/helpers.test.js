import {
  OFFBOARD_BUCKETS,
  chunk,
  confirmNameMatches,
  isUserGoneError,
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

describe('chunk', () => {
  it('splits into fixed-size batches', () => {
    expect(chunk(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
  });
});
