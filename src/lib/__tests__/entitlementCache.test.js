// WS6: last-known entitlements per user with a stale fallback and a ceiling.
import { readSnapshot, writeSnapshot, usableSnapshot, isTransientError, clearSnapshot, STALE_LIMIT_MS } from '@/lib/entitlementCache';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('snapshots are per user, stamped, and expire after the ceiling', () => {
  const s = store();
  writeSnapshot('u1', { apps: ['a'] }, s, 1000);
  expect(readSnapshot('u1', s)).toEqual({ stamp: 1000, data: { apps: ['a'] } });
  expect(readSnapshot('u2', s)).toBeNull();
  clearSnapshot('u1', s);
  expect(readSnapshot('u1', s)).toBeNull();
});

test('usableSnapshot reports expiry against the 30 day ceiling', () => {
  const now = Date.now();
  localStorage.setItem('pl_entitlements_v2:u9', JSON.stringify({ stamp: now - 1000, data: { apps: [] } }));
  expect(usableSnapshot('u9', now)).toMatchObject({ expired: false });
  localStorage.setItem('pl_entitlements_v2:u9', JSON.stringify({ stamp: now - STALE_LIMIT_MS - 1, data: { apps: [] } }));
  expect(usableSnapshot('u9', now)).toMatchObject({ expired: true });
  localStorage.removeItem('pl_entitlements_v2:u9');
});

test('only the network is transient; a server answer is not', () => {
  expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true);
  expect(isTransientError({ status: 503 })).toBe(true);
  expect(isTransientError({ status: 0 })).toBe(true);
  expect(isTransientError({ status: 403, message: 'forbidden' })).toBe(false);
  expect(isTransientError({ message: 'row-level security' })).toBe(false);
});
