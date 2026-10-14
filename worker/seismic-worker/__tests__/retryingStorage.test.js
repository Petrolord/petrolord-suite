/**
 * @jest-environment node
 */
// The worker's storage retries (2026-10-14): a dropped connection, 5xx, 429
// and 408 are retried with backoff; a 4xx answer is not; the attempts are
// bounded. Negative control: the bare client fails on the first drop.
import { retryingStorage } from '../src/retryingStorage.js';

const drop = () => Object.assign(new Error('Upload failed for p: fetch failed'), {});
const status = (s) => Object.assign(new Error(`status ${s}`), { status: s });
function flaky(errors) {
  let n = 0;
  return { calls: () => n, upload: async () => { n += 1; if (errors.length) throw errors.shift(); return 'uploaded'; }, list: async () => { n += 1; if (errors.length) throw errors.shift(); return ['a']; } };
}
const sleeps = [];
const opts = { sleep: async (ms) => { sleeps.push(ms); }, baseMs: 10 };

test('a dropped connection and server errors are retried with backoff', async () => {
  const s = flaky([drop(), status(503), status(429)]);
  sleeps.length = 0;
  expect(await retryingStorage(s, opts).upload('p', new Uint8Array(1))).toBe('uploaded');
  expect(s.calls()).toBe(4);
  expect(sleeps).toEqual([10, 20, 40]);
  // negative control: the bare client fails on the first drop
  const bare = flaky([drop()]);
  await expect(bare.upload('p')).rejects.toThrow(/fetch failed/);
});
test('a 4xx answer is not retried', async () => {
  const s = flaky([status(403)]);
  await expect(retryingStorage(s, opts).upload('p')).rejects.toMatchObject({ status: 403 });
  expect(s.calls()).toBe(1);
});
test('attempts are bounded, and list retries too', async () => {
  const s = flaky([drop(), drop(), drop(), drop(), drop(), drop()]);
  await expect(retryingStorage(s, opts).upload('p')).rejects.toThrow(/fetch failed/);
  expect(s.calls()).toBe(5);
  const l = flaky([status(502)]);
  expect(await retryingStorage(l, opts).list('d')).toEqual(['a']);
});
