/**
 * Quota accounting (manual-findings fix pack): one shared usage sum over
 * OWN volumes + 2D lines, and the friendly assertQuota built on it.
 */

let mockUser = { id: 'me' };
let mockRows = {};
let mockErrors = {};
let mockQuota; // undefined: the double has no rpc (an older database)

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    get rpc() { return mockQuota === undefined ? undefined : async () => mockQuota; },
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
  mockQuota = undefined;
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

test('QI Q0b-4: the quota follows the organization tier the server reports', async () => {
  mockQuota = { data: 500 * GIB, error: null };
  expect((await getStorageUsage()).quotaBytes).toBe(500 * GIB);
  await expect(assertQuota(100 * GIB)).resolves.toBeUndefined();
});

test('QI Q0b-4: an error or an implausible answer falls back to the 20 GiB floor', async () => {
  mockQuota = { data: null, error: { message: 'function does not exist' } };
  expect((await getStorageUsage()).quotaBytes).toBe(STORAGE_QUOTA_BYTES);
  mockQuota = { data: 5, error: null };
  expect((await getStorageUsage()).quotaBytes).toBe(STORAGE_QUOTA_BYTES);
});

describe('pooled organisation storage (seismic storage tiers, 2026-10-06)', () => {
  const summary = {
    used_bytes: 300 * GIB, quota_bytes: 1024 * GIB + 3 * 20 * GIB, pooled: true,
    organization_name: 'Breeze Energy', tier_label: 'Survey', members: 3,
  };
  let rpcCalls;
  beforeEach(() => {
    rpcCalls = [];
    mockQuota = undefined;
  });
  const withRpc = (answers) => {
    mockQuota = async () => null; // placeholder so the getter returns a function below
    jest.spyOn(require('@/lib/customSupabaseClient').supabase, 'rpc', 'get').mockReturnValue(async (name) => {
      rpcCalls.push(name);
      return answers[name] ?? { data: null, error: { message: 'missing' } };
    });
  };
  afterEach(() => jest.restoreAllMocks());

  test('uses the pooled summary the bucket policy counts, not the own-rows sum', async () => {
    withRpc({ seismic_storage_summary: { data: summary, error: null } });
    const u = await getStorageUsage();
    expect(u).toMatchObject({ known: true, pooled: true, usedBytes: 300 * GIB, quotaBytes: 1084 * GIB, organizationName: 'Breeze Energy', tierLabel: 'Survey', members: 3 });
    expect(rpcCalls[0]).toBe('seismic_storage_summary');
  });

  test('negative control: without the summary (an older database) it falls back to own rows', async () => {
    withRpc({ seismic_storage_quota_bytes: { data: 20 * GIB, error: null } });
    const u = await getStorageUsage();
    expect(u.pooled).toBe(false);
    expect(u.usedBytes).toBe(2.5 * GIB);
  });

  test('the over-quota message names the shared pool', async () => {
    withRpc({ seismic_storage_summary: { data: { ...summary, used_bytes: 1080 * GIB }, error: null } });
    await expect(assertQuota(10 * GIB)).rejects.toThrow(/your organisation's shared seismic storage \(1084\.0 GiB\).*larger storage tier/);
  });
});
