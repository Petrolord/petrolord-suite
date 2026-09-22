// Message handler of the slice worker, kept apart from the worker file so
// jest can run it in-process against the real client.
//
// Wire protocol (main -> worker):
//   init        { budgetBytes?, deviceMemory? }
//   openLocal   { id, sourceId, file, mapping, name }
//   openBricks  { id, sourceId, manifest, storagePath, supabaseUrl, persistent, fetchTimeoutMs }
//   slice       { id, sourceId, orientation, index, level?, step?, prefetch? }
//   brick       { id, sourceId, i, j, k }
//   trace       { id, sourceId, il, xl }
//   cancel      { id }
//   close       { sourceId }
//   stats       { id }
//   token       { id, token?, error? }   answer to a token-request
// worker -> main:
//   result { id, value } | partial { id, slice } | progress { id, done, total, phase }
//   error { id, code, message } | token-request { id, sourceId, force }

import { SliceEngine } from './sliceEngine';
import { fileReader } from '../engine/reader';
import { storageBrickFetcher, ABORTED as BRICK_ABORTED } from '../engine/brickCache';
import { cacheBudgetBytes } from './memoryBudget';
import { SOURCE_ERRORS, errorCode, sourceError } from './sliceSource';

/** Per-brick fetch timeout. The shared fetch-timeout module
 *  (lib/fetchWithTimeout.js, another stream) can replace this wrapper. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30000;

/** Wrap a fetcher with a timeout that reports TIMEOUT (a user abort stays
 *  an abort). */
export function withFetchTimeout(fetcher, ms) {
  return async (path, signal) => {
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, ms);
    const relay = () => ac.abort();
    if (signal) {
      if (signal.aborted) ac.abort();
      else signal.addEventListener('abort', relay, { once: true });
    }
    try {
      return await fetcher(path, ac.signal);
    } catch (e) {
      if (timedOut) {
        throw sourceError(SOURCE_ERRORS.TIMEOUT,
          `A survey brick took longer than ${Math.round(ms / 1000)} seconds to arrive.`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', relay);
    }
  };
}

/** Copy a cache-owned slice for transfer (the cache keeps its copy). */
function transferableSlice(s) {
  const out = {
    data: s.data.slice(),
    width: s.width,
    height: s.height,
    traceRms: s.traceRms ? s.traceRms.slice() : null,
    absSample: s.absSample ? s.absSample.slice() : null,
    nullValue: s.nullValue,
    level: s.level ?? 0,
    final: s.final !== false,
    codec: s.codec || 'f32',
  };
  const transfer = [out.data.buffer];
  if (out.traceRms) transfer.push(out.traceRms.buffer);
  if (out.absSample) transfer.push(out.absSample.buffer);
  return { out, transfer };
}

/**
 * @param {(msg: Object, transfer?: Transferable[]) => void} post
 * @param {{deviceMemory?: number, makeFetcher?: Function, makeReader?: Function,
 *   wrapPersistent?: Function}} [env]
 *   makeFetcher(cfg) -> (path, signal) => ArrayBuffer (defaults to Storage),
 *   makeReader(file) -> ByteReader, wrapPersistent(fetcher) -> fetcher (IndexedDB)
 * @returns {{onMessage: (data: Object) => void, engine: () => SliceEngine}}
 */
export function createSliceWorkerHandler(post, env = {}) {
  let engine = null;
  const controllers = new Map();       // request id -> AbortController
  const tokenWaiters = new Map();
  let tokenSeq = 0;
  const makeReader = env.makeReader || fileReader;
  const makeFetcher = env.makeFetcher || ((cfg) => storageBrickFetcher(cfg));

  const ensureEngine = (budgetBytes) => {
    if (!engine) {
      engine = new SliceEngine({ budgetBytes: budgetBytes || cacheBudgetBytes(env.deviceMemory) });
    } else if (budgetBytes) {
      engine.setBudget(budgetBytes);
    }
    return engine;
  };

  const tokenFor = (sourceId) => (force) => new Promise((resolve, reject) => {
    tokenSeq += 1;
    tokenWaiters.set(tokenSeq, { resolve, reject });
    post({ type: 'token-request', id: tokenSeq, sourceId, force: Boolean(force) });
  });

  const fail = (id, e) => {
    const code = e?.message === BRICK_ABORTED ? SOURCE_ERRORS.ABORTED : errorCode(e);
    post({ type: 'error', id, code, message: e?.message || String(e) });
  };

  const run = async (id, fn) => {
    const ac = new AbortController();
    controllers.set(id, ac);
    try {
      await fn(ac.signal);
    } catch (e) {
      fail(id, e);
    } finally {
      controllers.delete(id);
    }
  };

  const handlers = {
    init(m) {
      ensureEngine(m.budgetBytes || cacheBudgetBytes(m.deviceMemory ?? env.deviceMemory));
    },

    openLocal(m) {
      return run(m.id, async (signal) => {
        const eng = ensureEngine();
        let last = 0;
        const res = await eng.openLocal(m.sourceId, makeReader(m.file), {
          mapping: m.mapping,
          name: m.name ?? m.file?.name,
          fileSize: m.file?.size,
          signal,
          onProgress: (done, total, phase) => {
            const now = Date.now();
            if (done === total || now - last > 100) {
              last = now;
              post({
                type: 'progress', id: m.id, done, total, phase,
              });
            }
          },
        });
        post({ type: 'result', id: m.id, value: res });
      });
    },

    openBricks(m) {
      return run(m.id, async () => {
        const eng = ensureEngine();
        let fetcher = makeFetcher({ supabaseUrl: m.supabaseUrl, getToken: tokenFor(m.sourceId) });
        if (m.persistent && env.wrapPersistent) fetcher = env.wrapPersistent(fetcher);
        fetcher = withFetchTimeout(fetcher, m.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
        const res = eng.openBricks(m.sourceId, {
          manifest: m.manifest, storagePath: m.storagePath, fetcher,
        });
        post({ type: 'result', id: m.id, value: res });
      });
    },

    slice(m) {
      return run(m.id, async (signal) => {
        const eng = ensureEngine();
        const req = {
          orientation: m.orientation, index: m.index, level: m.level, step: m.step,
        };
        const s = await eng.getSlice(m.sourceId, req, {
          signal,
          onPartial: (p) => {
            const { out, transfer } = transferableSlice(p);
            post({ type: 'partial', id: m.id, slice: out }, transfer);
          },
        });
        const { out, transfer } = transferableSlice(s);
        post({ type: 'result', id: m.id, value: out }, transfer);
        if (m.prefetch) eng.prefetch(m.sourceId, { ...req, step: m.step || 1 });
      });
    },

    brick(m) {
      return run(m.id, async () => {
        const b = await ensureEngine().getBrick(m.sourceId, m.i, m.j, m.k);
        const copy = b.slice();
        post({ type: 'result', id: m.id, value: copy }, [copy.buffer]);
      });
    },

    trace(m) {
      return run(m.id, async () => {
        const t = await ensureEngine().getTrace(m.sourceId, m.il, m.xl);
        const copy = t.slice();
        post({ type: 'result', id: m.id, value: copy }, [copy.buffer]);
      });
    },

    cancel(m) {
      const ac = controllers.get(m.id);
      if (ac) ac.abort();
    },

    close(m) {
      if (engine) engine.close(m.sourceId);
    },

    stats(m) {
      post({ type: 'result', id: m.id, value: engine ? engine.stats() : null });
    },

    token(m) {
      const w = tokenWaiters.get(m.id);
      if (!w) return;
      tokenWaiters.delete(m.id);
      if (m.error) w.reject(new Error(m.error));
      else w.resolve(m.token);
    },
  };

  return {
    onMessage(data) {
      const h = data && handlers[data.type];
      if (!h) return;
      try {
        const p = h(data);
        if (p && p.catch) p.catch((e) => fail(data.id, e));
      } catch (e) {
        fail(data.id, e);
      }
    },
    engine: () => engine,
  };
}
