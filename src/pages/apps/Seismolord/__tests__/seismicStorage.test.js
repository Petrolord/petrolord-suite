/**
 * Quota accounting (manual-findings fix pack): one shared usage sum over
 * OWN volumes + 2D lines, and the friendly assertQuota built on it.
 */

let mockUser = { id: 'me' };
let mockRows = {};
let mockErrors = {};

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table) => ({
      select: () => ({
        eq: (col, val) => {
          if (mockErrors[table]) return { data: null, error: { message: 'boom' } };
          const rows = (mockRows[table] || []).filter((r) => r[col] === val);
          return { data: rows, error: null };
        },
      }),
    }),
  },
}));

import {
  getStorageUsage, assertQuota, STORAGE_QUOTA_BYTES,
} from '@/pages/apps/Seismolord/services/seismicStorage';

const GIB = 1024 ** 3;
const vol = (userId, bytes) => ({ user_id: userId, survey_meta: { storage_bytes: bytes } });

beforeEach(() => {
  mockUser = { id: 'me' };
  mockErrors = {};
  mockRows = {
    seismic_volumes: [vol('me', 2 * GIB), vol('teammate', 500 * GIB)],
    seismic_lines: [vol('me', GIB / 2)],
  };
});

test('usage sums own volumes and lines; shared-in rows never count', async () => {
  const u = await getStorageUsage();
  expect(u.known).toBe(true);
  expect(u.usedBytes).toBe(2.5 * GIB);
  expect(u.quotaBytes).toBe(STORAGE_QUOTA_BYTES);
});

test('assertQuota passes under the limit and throws over it', async () => {
  await expect(assertQuota(GIB)).resolves.toBeUndefined();
  await expect(assertQuota(18 * GIB)).rejects.toThrow(/Storage quota exceeded/);
});

test('a read hiccup or missing user disables the check instead of blocking', async () => {
  mockErrors.seismic_lines = true;
  expect((await getStorageUsage()).known).toBe(false);
  await expect(assertQuota(100 * GIB)).resolves.toBeUndefined();

  mockErrors = {};
  mockUser = null;
  expect((await getStorageUsage()).known).toBe(false);
});
