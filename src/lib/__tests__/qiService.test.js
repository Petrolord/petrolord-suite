/**
 * @jest-environment node
 */
// qiService (QI programme Q0): job polling stops once a job finishes, keeps
// going through a transient read error, and stops on demand.
import { watchJob, isActive, friendlyError } from '../qiService';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

describe('watchJob', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const flush = () => new Promise((r) => jest.requireActual('timers').setImmediate(r));

  test('polls until the job leaves queued/running, then stops', async () => {
    const rows = [{ status: 'queued' }, { status: 'running', progress: 0.5 }, { status: 'succeeded' }];
    const get = jest.fn(async () => rows.shift() || { status: 'succeeded' });
    const seen = [];
    watchJob('j1', (job) => seen.push(job.status), { intervalMs: 1000, get });
    await flush();
    jest.advanceTimersByTime(1000); await flush();
    jest.advanceTimersByTime(1000); await flush();
    jest.advanceTimersByTime(5000); await flush();
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
    expect(get).toHaveBeenCalledTimes(3);
  });

  test('a read error is reported and polling continues', async () => {
    const get = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ status: 'failed' });
    const updates = [];
    watchJob('j1', (job, err) => updates.push(err ? `err:${err.message}` : job.status), { intervalMs: 1000, get });
    await flush();
    jest.advanceTimersByTime(1000); await flush();
    expect(updates).toEqual(['err:offline', 'failed']);
  });

  test('stop() ends polling', async () => {
    const get = jest.fn(async () => ({ status: 'running' }));
    const stop = watchJob('j1', () => {}, { intervalMs: 1000, get });
    await flush();
    stop();
    jest.advanceTimersByTime(10000); await flush();
    expect(get).toHaveBeenCalledTimes(1);
  });
});

test('isActive and friendlyError', () => {
  expect(isActive({ status: 'queued' })).toBe(true);
  expect(isActive({ status: 'cancelled' })).toBe(false);
  expect(friendlyError({ code: '42P01', message: 'relation "qi_jobs" does not exist' })).toMatch(/not set up/);
  expect(friendlyError(new Error('You already have 4 worker jobs queued'))).toMatch(/4 worker jobs/);
});
