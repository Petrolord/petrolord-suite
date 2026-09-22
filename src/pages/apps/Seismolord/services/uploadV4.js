// Two-stage resumable upload of a spooled manifest v4 brick store
// (large-survey plan, section 5). The successor to the upload half of
// services/ingestService.js for v4 volumes; v1 volumes keep the old path.
//
//   Stage 1  display bricks, coarse to fine (level 3, 2, 1, 0), then the
//            manifest with display.complete, then onStage('display_ready')
//            (the caller flips the row status). From here the survey
//            opens from the server on any machine.
//   Stage 2  float32 bricks, then the manifest with f32.complete, then
//            onStage('ready').
//
// Every object is read from the local spool, never from the SEG-Y.
// - Per-object retry with exponential backoff and jitter; an error that
//   cannot succeed on retry (400, 403, 413) fails at once.
// - Resume skips objects already in Storage: each stage lists its
//   directories first, and an upload that reports "already exists" is
//   counted as done.
// - A dropped connection pauses the job (status 'offline') without
//   spending retries; it continues when the browser is back online.
// - pause() / resume() / cancel() for the user; in-flight uploads finish.
//
// Everything platform-specific is injected, so jest drives the state
// machine against a mocked storage client:
//   storage.upload(path, bytes, {contentType, upsert}) -> 'uploaded'|'exists'
//     (throws an Error with .status on failure)
//   storage.list(dirPath) -> Promise<string[]> object names in that dir
//   spool: services/brickSpool.js
//   network: {isOnline(): boolean, onOnline(cb): unsubscribe}
//   sleep(ms), random()

import { withV4Complete } from '../engine/manifest';

export const UPLOAD_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  OFFLINE: 'offline',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  DONE: 'done',
});

export const UPLOAD_STAGE = Object.freeze({
  DISPLAY: 'display',
  DISPLAY_MANIFEST: 'display_manifest',
  F32: 'f32',
  F32_MANIFEST: 'f32_manifest',
  DONE: 'done',
});

export const DEFAULT_RETRY = Object.freeze({ attempts: 6, baseMs: 1000, maxMs: 30000 });
export const DEFAULT_CONCURRENCY = 4;
/** Poll interval while offline, in case the 'online' event is missed. */
export const OFFLINE_POLL_MS = 5000;

const BRICK_TYPE = 'application/octet-stream';
const JSON_TYPE = 'application/json';

const DISPLAY_KEY = /^v4\/d(\d+)\/(\d+)-(\d+)-(\d+)\.u8z$/;
const F32_KEY = /^v4\/f\/(\d+)-(\d+)-(\d+)\.f32z$/;

const byIjk = (a, b) => a.i - b.i || a.j - b.j || a.k - b.k;

/**
 * Split spool keys into the two stages, in upload order: display coarse
 * to fine (then i, j, k), float32 by i, j, k. Unknown keys are ignored.
 * @param {string[]} keys
 */
export function planUpload(keys) {
  const display = [];
  const f32 = [];
  for (const key of keys) {
    let m = DISPLAY_KEY.exec(key);
    if (m) { display.push({ key, level: +m[1], i: +m[2], j: +m[3], k: +m[4] }); continue; }
    m = F32_KEY.exec(key);
    if (m) f32.push({ key, i: +m[1], j: +m[2], k: +m[3] });
  }
  display.sort((a, b) => b.level - a.level || byIjk(a, b));
  f32.sort(byIjk);
  return { display: display.map((d) => d.key), f32: f32.map((d) => d.key) };
}

/** Directories (relative to the volume dir) each stage lists for resume. */
export function stageDirs(keys) {
  const dirs = new Set();
  for (const k of keys) dirs.add(k.slice(0, k.lastIndexOf('/')));
  return [...dirs];
}

/** Errors that cannot succeed on retry. */
export function isFatalUploadError(err) {
  const s = Number(err?.status ?? err?.statusCode);
  return s === 400 || s === 403 || s === 413;
}

/** A failure with no HTTP status (fetch threw: DNS, reset, offline). */
export function isNetworkError(err) {
  const s = Number(err?.status ?? err?.statusCode);
  return !Number.isFinite(s) || s === 0;
}

/** Backoff before retry number `attempt` (1-based), with jitter in [0.5, 1). */
export function backoffMs(attempt, { baseMs, maxMs }, random = Math.random) {
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * (0.5 + random() / 2);
}

class CancelledError extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'UploadCancelled';
  }
}

const defaultNetwork = {
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  onOnline: (cb) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('online', cb);
    return () => window.removeEventListener('online', cb);
  },
};

/**
 * @param {Object} p
 * @param {Object} p.storage mocked or supabaseStorageClient
 * @param {Object} p.spool brickSpool interface
 * @param {string} p.dir volume dir in the bucket ({user}/{volume})
 * @param {Object} p.manifest manifest v4 as converted (both flags false)
 * @param {{display?: {bricks?: number, storedBytes?: number},
 *   f32?: {bricks?: number, storedBytes?: number}}} [p.totals] byte totals for progress
 * @param {(stage: 'display_ready'|'ready', manifest: Object) => Promise<void>} [p.onStage]
 * @param {(state: Object) => void} [p.onProgress]
 * @param {number} [p.concurrency]
 * @param {{attempts:number, baseMs:number, maxMs:number}} [p.retry]
 * @param {{isOnline: () => boolean, onOnline: (cb: Function) => Function}} [p.network]
 * @param {(ms: number) => Promise<void>} [p.sleep]
 * @param {() => number} [p.random]
 * @param {boolean} [p.displayOnly] stop after stage 1 (tests, or a
 *   caller that wants to defer the float32 copy)
 */
export function createTwoStageUpload({
  storage, spool, dir, manifest, totals = {}, onStage = async () => {}, onProgress = () => {},
  concurrency = DEFAULT_CONCURRENCY, retry = DEFAULT_RETRY, network = defaultNetwork,
  sleep = (ms) => new Promise((r) => { setTimeout(r, ms); }), random = Math.random,
  displayOnly = false,
}) {
  const state = {
    status: UPLOAD_STATUS.IDLE,
    stage: null,
    display: { done: 0, total: totals.display?.bricks ?? null, skipped: 0, bytes: 0, totalBytes: totals.display?.storedBytes ?? null },
    f32: { done: 0, total: totals.f32?.bricks ?? null, skipped: 0, bytes: 0, totalBytes: totals.f32?.storedBytes ?? null },
    retries: 0,
    error: null,
    userPaused: false,
  };
  const emit = () => onProgress({ ...state, display: { ...state.display }, f32: { ...state.f32 } });

  // pause / offline gate: every object waits here before it starts
  let wake = null;
  const wakeAll = () => { if (wake) { const w = wake; wake = null; w(); } };
  const parked = () => new Promise((r) => { const prev = wake; wake = () => { if (prev) prev(); r(); }; });

  const unsubscribe = network.onOnline(() => {
    if (state.status === UPLOAD_STATUS.OFFLINE) wakeAll();
  });

  async function gate() {
    for (;;) {
      if (state.status === UPLOAD_STATUS.CANCELLED) throw new CancelledError();
      if (state.userPaused) {
        if (state.status !== UPLOAD_STATUS.PAUSED) { state.status = UPLOAD_STATUS.PAUSED; emit(); }
        // eslint-disable-next-line no-await-in-loop
        await parked();
        continue;
      }
      if (!network.isOnline()) {
        if (state.status !== UPLOAD_STATUS.OFFLINE) { state.status = UPLOAD_STATUS.OFFLINE; emit(); }
        // eslint-disable-next-line no-await-in-loop
        await Promise.race([parked(), sleep(OFFLINE_POLL_MS)]);
        continue;
      }
      if (state.status !== UPLOAD_STATUS.RUNNING) { state.status = UPLOAD_STATUS.RUNNING; emit(); }
      return;
    }
  }

  async function putWithRetry(path, bytes, contentType, upsert) {
    let attempt = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      await gate();
      try {
        // eslint-disable-next-line no-await-in-loop
        return await storage.upload(path, bytes, { contentType, upsert });
      } catch (err) {
        if (state.status === UPLOAD_STATUS.CANCELLED) throw new CancelledError();
        // a dropped connection pauses without spending an attempt
        if (!network.isOnline()) continue;
        if (isFatalUploadError(err)) throw err;
        attempt += 1;
        if (attempt >= retry.attempts) {
          // navigator.onLine often stays true on a dead link: a network
          // error with no HTTP status that outlasts the retries is a
          // dropped connection, so wait and probe instead of failing
          if (!isNetworkError(err)) throw err;
          state.status = UPLOAD_STATUS.OFFLINE;
          emit();
          // eslint-disable-next-line no-await-in-loop
          await Promise.race([parked(), sleep(OFFLINE_POLL_MS)]);
          attempt = 0;
          continue;
        }
        state.retries += 1;
        emit();
        // eslint-disable-next-line no-await-in-loop
        await sleep(backoffMs(attempt, retry, random));
      }
    }
  }

  async function existingNames(keys) {
    const have = new Set();
    for (const d of stageDirs(keys)) {
      // a failed listing only costs re-uploads ("already exists" is done)
      // eslint-disable-next-line no-await-in-loop
      const names = await storage.list(`${dir}/${d}`).catch(() => []);
      for (const n of names) have.add(`${d}/${n}`);
    }
    return have;
  }

  async function runStage(stage, keys) {
    const tally = state[stage];
    tally.total = keys.length;
    tally.done = 0;
    tally.skipped = 0;
    tally.bytes = 0;
    const have = await existingNames(keys);
    const todo = [];
    for (const k of keys) {
      if (have.has(k)) { tally.done += 1; tally.skipped += 1; } else todo.push(k);
    }
    emit();
    let next = 0;
    let failure = null;
    const lane = async () => {
      while (!failure && next < todo.length) {
        const key = todo[next];
        next += 1;
        try {
          // eslint-disable-next-line no-await-in-loop
          await gate();
          // eslint-disable-next-line no-await-in-loop
          const bytes = await spool.get(key);
          // eslint-disable-next-line no-await-in-loop
          const outcome = await putWithRetry(`${dir}/${key}`, bytes, BRICK_TYPE, false);
          if (outcome === 'exists') tally.skipped += 1;
          tally.done += 1;
          tally.bytes += bytes.byteLength;
          emit();
        } catch (err) {
          failure = failure || err;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, lane));
    if (failure) throw failure;
  }

  async function putManifest(m) {
    const bytes = new TextEncoder().encode(JSON.stringify(m, null, 1));
    await putWithRetry(`${dir}/manifest.json`, bytes, JSON_TYPE, true);
  }

  async function run() {
    if (state.status === UPLOAD_STATUS.DONE) return state;
    state.error = null;
    if (state.status === UPLOAD_STATUS.FAILED || state.status === UPLOAD_STATUS.IDLE) {
      state.status = UPLOAD_STATUS.RUNNING;
    }
    try {
      const plan = planUpload(await spool.keys());
      const progress = (await spool.getJson('upload')) || {};

      if (!progress.displayReady) {
        state.stage = UPLOAD_STAGE.DISPLAY;
        await runStage('display', plan.display);
        state.stage = UPLOAD_STAGE.DISPLAY_MANIFEST;
        emit();
        const shown = withV4Complete(manifest, { display: true });
        await putManifest(shown);
        await onStage('display_ready', shown);
        progress.displayReady = true;
        await spool.putJson('upload', progress);
      } else {
        state.display.done = plan.display.length;
        state.display.total = plan.display.length;
      }
      if (displayOnly) {
        state.status = UPLOAD_STATUS.DONE;
        state.stage = UPLOAD_STAGE.DONE;
        emit();
        return state;
      }

      state.stage = UPLOAD_STAGE.F32;
      await runStage('f32', plan.f32);
      state.stage = UPLOAD_STAGE.F32_MANIFEST;
      emit();
      const full = withV4Complete(manifest, { display: true, f32: true });
      await putManifest(full);
      await onStage('ready', full);
      progress.ready = true;
      await spool.putJson('upload', progress);

      state.stage = UPLOAD_STAGE.DONE;
      state.status = UPLOAD_STATUS.DONE;
      emit();
      unsubscribe();
      return state;
    } catch (err) {
      if (err instanceof CancelledError || state.status === UPLOAD_STATUS.CANCELLED) {
        state.status = UPLOAD_STATUS.CANCELLED;
        emit();
        unsubscribe();
        throw new CancelledError();
      }
      state.status = UPLOAD_STATUS.FAILED;
      state.error = err.message || String(err);
      emit();
      throw err;
    }
  }

  return {
    run,
    pause() {
      state.userPaused = true;
      if (state.status === UPLOAD_STATUS.RUNNING || state.status === UPLOAD_STATUS.OFFLINE) {
        state.status = UPLOAD_STATUS.PAUSED;
        emit();
      }
    },
    resume() {
      state.userPaused = false;
      if (state.status === UPLOAD_STATUS.PAUSED) state.status = UPLOAD_STATUS.RUNNING;
      emit();
      wakeAll();
    },
    cancel() {
      state.status = UPLOAD_STATUS.CANCELLED;
      emit();
      wakeAll();
      unsubscribe();
    },
    getState: () => ({ ...state }),
  };
}
