/**
 * @jest-environment node
 */
// Seismic quota for the worker (QI Q0b-4): the organization tier when the
// tiers migration is applied, the flat function before it, and a clear
// refusal message.
import { seismicQuota, overQuotaMessage } from '../src/quota.js';

const admin = (answers) => ({ rpc: async (fn, args) => answers[fn](args) });

test('uses the per-user tier function when it exists', async () => {
  const q = await seismicQuota(admin({
    seismic_storage_usage_bytes_for: () => ({ data: 5 * 1024 ** 3, error: null }),
    seismic_storage_quota_bytes_for: ({ p_user_id: u }) => ({ data: u === 'u1' ? 500 * 1024 ** 3 : 0, error: null }),
  }), 'u1');
  expect(q).toEqual({ used: 5 * 1024 ** 3, quota: 500 * 1024 ** 3 });
});

test('falls back to the flat 20 GiB function before the tiers migration is applied', async () => {
  const q = await seismicQuota(admin({
    seismic_storage_usage_bytes_for: () => ({ data: 0, error: null }),
    seismic_storage_quota_bytes_for: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }),
    seismic_storage_quota_bytes: () => ({ data: 20 * 1024 ** 3, error: null }),
  }), 'u1');
  expect(q.quota).toBe(20 * 1024 ** 3);
});

test('a failing usage read is an error, never a silent pass (negative control)', async () => {
  await expect(seismicQuota(admin({
    seismic_storage_usage_bytes_for: () => ({ data: null, error: { message: 'down' } }),
    seismic_storage_quota_bytes_for: () => ({ data: 1, error: null }),
  }), 'u1')).rejects.toThrow(/down/);
});

test('the refusal names the need, what is left and the quota', () => {
  expect(overQuotaMessage('The converted volume', 3 * 1024 ** 3, { used: 19 * 1024 ** 3, quota: 20 * 1024 ** 3 }))
    .toBe('The converted volume needs 3.0 GiB and you have 1.0 GiB of your 20.0 GiB seismic storage left. Delete a volume or ask for more space.');
});
